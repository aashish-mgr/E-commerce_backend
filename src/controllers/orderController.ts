import Order from "../model/orderModel";
import { Request, Response } from "express";
import {
  khaltiResponse,
  OrderType,
  PaymentMethod,
  TransactionVerificationResponse,
  TransactionStatus,
  OrderStatus,
} from "../types/orderType";
import { AuthRequest } from "../middlewares/authMiddleware";
import Payment from "../model/paymentModel";
import OrderDetail from "../model/orderDetailModel";
import axios from "axios";
import Product from "../model/productModel";
import User from "../model/userModel";
import { envConfig } from "../config/env";
import { ApiError } from "../services/asyncError";
import { sequelize } from "../config/dbConfig";
import { getPaginationMeta, getPaginationParams } from "../utils/pagination";
import { incrementCacheVersions } from "../utils/redisHelper";
import { isUuid } from "../utils/isUuid";
import { Op } from "sequelize";

// Mirrors the enum on the Order and Payment models. Validating against these
// turns a malformed value into a 400 instead of a database error.
const VALID_ORDER_STATUSES = ["pending", "shipped", "delivered", "cancelled"];
const VALID_PAYMENT_STATUSES = ["paid", "unpaid"];

class OrderController {
  /**
   * An order carries no seller column - the seller is only implied by the
   * products on its line items - so ownership has to be resolved through
   * OrderDetail -> Product.userId, which is the same join the vendor read
   * paths already use. That keeps a vendor's view of an order consistent
   * across reads and writes.
   *
   * Returns the vendor's own line items, since an order may legitimately mix
   * products from several vendors and callers need to know whether the vendor
   * owns *all* of them or only some.
   */
  private async getVendorOwnedItems(
    orderId: string,
    vendorId: string,
  ) {
    return OrderDetail.findAll({
      where: { orderId },
      include: [
        {
          model: Product,
          where: { userId: vendorId },
          attributes: ["id"],
        },
      ],
    });
  }

  /**
   * Guards a vendor write against an order they have no part in. Kept separate
   * from the item query so the 404-vs-403 decision lives in one place.
   */
  private async assertVendorOwnsOrder(
    orderId: string,
    vendorId: string,
    res: Response,
  ): Promise<boolean> {
    const ownedItems = await this.getVendorOwnedItems(orderId, vendorId);

    if (ownedItems.length === 0) {
      // Deliberately the same message as "not found" so this endpoint cannot
      // be used to probe whether an arbitrary order id exists.
      res.status(404).json({
        message: "order not found",
      });
      return false;
    }

    return true;
  }

  //customer side
  async createOrder(req: AuthRequest, res: Response) {
    const { shippingAddress, phoneNumber, paymentDetails, items } =
      req.body as OrderType;
    const userId = req.user?.id;
    if (
      !shippingAddress ||
      !phoneNumber ||
      !paymentDetails ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        message: "Please provide all the details",
      });
    }

    const { orderData, paymentData } = await sequelize.transaction(
      async (transaction) => {
        const orderItems: { quantity: number; productId: string }[] = [];
        let totalAmount = 0;

        for (const item of items) {
          const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
          const product = await Product.findByPk(item.productId, {
            transaction,
          });

          if (!product) {
            throw new ApiError(
              `Product ${item.productId} not found`,
              400,
            );
          }

          const price = Number(product.productPrice);
          if (isNaN(price)) {
            throw new ApiError(
              `Product ${product.productName} has an invalid price`,
              400,
            );
          }

          if (Number(product.stock) < quantity) {
            throw new ApiError(
              `Insufficient stock for ${product.productName}`,
              400,
            );
          }

          totalAmount += price * quantity;
          orderItems.push({ productId: product.id, quantity });
        }

        const createdPayment = await Payment.create(
          {
            paymentMethod: paymentDetails.paymentMethod,
          },
          { transaction },
        );

        const createdOrder = await Order.create(
          {
            shippingAddress,
            phoneNumber,
            totalAmount,
            userId,
            paymentId: createdPayment.id,
          },
          { transaction },
        );

        for (const item of orderItems) {
          await OrderDetail.create(
            { ...item, orderId: createdOrder.id },
            { transaction },
          );
          await Product.decrement(
            "stock",
            { by: item.quantity, where: { id: item.productId }, transaction },
          );
        }

        return { orderData: createdOrder, paymentData: createdPayment };
      },
    );

    // The transaction decremented product stock, and stock is part of the
    // cached product payloads, so the product list is now stale.
    await incrementCacheVersions(["product", "order"]);

    if (paymentData.paymentMethod === PaymentMethod.Khalti) {
      const data = {
        return_url: "http://localhost:5173/paymentCallback",
        amount: orderData.totalAmount * 100,
        purchase_order_id: orderData.id,
        purchase_order_name: "order_" + orderData.id,
        website_url: "http://localhost:5173/",
      };
      const response = await axios.post(
        "https://dev.khalti.com/api/v2/epayment/initiate/",
        data,
        {
          headers: {
            Authorization: `key ${envConfig.KHALTI_SECRET_KEY}`,
          },
        },
      );

      const khaltiReturnData: khaltiResponse = response.data;
      paymentData.pidx = khaltiReturnData.pidx;
      await paymentData.save();
      res.status(200).json({
        message: "Order successfully created",
        response: khaltiReturnData.payment_url,
        orderId: orderData.id,
      });
    } else {
      return res.status(200).json({
        message: "Order successfully created",
        orderId: orderData.id,
      });
    }
  }

  async verifyPayment(req: AuthRequest, res: Response) {
    const { pidx } = req.body;
  
    if (!pidx) {
      return res.status(400).json({
        message: "pidx is required",
      });
    }

    const response = await axios.post(
      "https://dev.khalti.com/api/v2/epayment/lookup/",
      { pidx },
      {
        headers: {
          Authorization: `key ${envConfig.KHALTI_SECRET_KEY}`,
        },
      },
    );

    const data: TransactionVerificationResponse = response.data;

    if (data.status === TransactionStatus.Completed) {
      await Payment.update(
        { paymentStatus: "paid" },
        {
          where: {
            pidx: pidx,
          },
        },
      );

      await incrementCacheVersions(["order"]);

      const paymentData = await Payment.findOne({
        where: {
          pidx: pidx,
        },
        include: [
           {
            model: Order,
            attributes: ['id'],
           }
        ]
      });
     console.log("updated")
      return res.status(200).json({
        message: "Payment successfully verified.",
        data: paymentData,
      });
    } else {
      return res.status(400).json({
        message: "Payment not verified",
      });
    }
  }

  async getMyOrders(req: AuthRequest, res: Response) {
    const userId = req.user?.id;
    const { page, limit, skip } = getPaginationParams(
      req.query.page as string | string[] | undefined,
      req.query.limit as string | string[] | undefined,
    );

    const status = typeof req.query.status === "string" ? req.query.status : "";
    const search = typeof req.query.search === "string" ? req.query.search : "";

    const where: Record<string | symbol, unknown> = { userId };

    if (status && status !== "all") {
      where.orderStatus = status;
    }

    if (search) {
      const productOrderRows = await OrderDetail.findAll({
        attributes: ["orderId"],
        include: [
          {
            model: Product,
            attributes: [],
            where: { productName: { [Op.iLike]: `%${search}%` } },
          },
        ],
      });
      const productOrderIds = [
        ...new Set(productOrderRows.map((row) => (row as any).orderId)),
      ];

      // The search box accepts a plain order id, but only a well-formed uuid can
      // be compared against the id column without postgres erroring out.
      const conditions: Record<string, unknown>[] = [];
      if (isUuid(search)) {
        conditions.push({ id: search });
      }
      if (productOrderIds.length > 0) {
        conditions.push({ id: { [Op.in]: productOrderIds } });
      }

      // Nothing matched and the term is not an id, so there is no condition to
      // search on. An empty Op.or would compile to `OR ()`, which postgres
      // rejects, so short-circuit to an empty page instead.
      if (conditions.length === 0) {
        return res.status(200).json({
          message: "Orders fetched successfully",
          data: [],
          pagination: getPaginationMeta(page, limit, 0),
        });
      }

      where[Op.or] = conditions;
    }

    const orders = await Order.findAll({
      where,
      include: [
        {
          model: Payment,
        },
        {
          model: OrderDetail,
          include: [Product]
        }
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset: skip,
    });

    const total = await Order.count({
      where,
      col: "id",
      distinct: true,
    });

    const pagination = getPaginationMeta(page, limit, total);

    return res.status(200).json({
      message: "Orders fetched successfully",
      data: orders,
      pagination,
    });
  }

  async getOrderDetail(req: AuthRequest, res: Response) {
    const { orderId } = req.params;
    const userId = req.user?.id;
    if (!orderId) {
      return res.status(400).json({
        message: "order id is required",
      });
    }

    const orderDetail = await Order.findAll({
      where: {id: orderId ,
        userId: userId
      },
      include: [
        {
          model: OrderDetail,
          include: [Product]
        }
      ],
    });

    if (orderDetail.length > 0) {
      return res.status(200).json({
        message: "order detail sucessfully fetched",
        data: orderDetail,
      });
    } else {
      return res.status(400).json({
        message: "order not found",
      });
    }
  }

  async cancelOrder(req: AuthRequest, res: Response) {
    const userId = req.user?.id;
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({
        message: "order id is required",
      });
    }

    const order = await Order.findOne({
      where: {
        userId,
        id: orderId,
      },
    });

    if (order?.orderStatus == OrderStatus.Shipped) {
      return res.status(400).json({
        message: "You cannot cancel the order. It is already shipped",
      });
    }
    await Order.update(
      { orderStatus: OrderStatus.Cancelled },
      {
        where: {
          userId,
          id: orderId,
        },
      },
    );

    await incrementCacheVersions(["order", "admin-stats"]);

    return res.status(200).json({
      message: "order successfully cancelled",
    });
  }

  //admin side
  async getVendorOrders(req: AuthRequest, res: Response) {
    const userId = req.user?.id;
    const { page, limit, skip } = getPaginationParams(
      req.query.page as string | string[] | undefined,
      req.query.limit as string | string[] | undefined,
    );

    const status = typeof req.query.status === "string" ? req.query.status : "";
    const search = typeof req.query.search === "string" ? req.query.search : "";

    const odWhere: Record<string | symbol, unknown> = {};

    if (search) {
      const searchTerm = `%${search}%`;

      const matchingProductIds = (
        await Product.findAll({
          attributes: ["id"],
          where: { userId, productName: { [Op.iLike]: searchTerm } },
        })
      ).map((p) => p.id);

      const matchingOrderIds = (
        await Order.findAll({
          attributes: ["id"],
          where: {
            [Op.or]: [
              { phoneNumber: { [Op.iLike]: searchTerm } },
              { shippingAddress: { [Op.iLike]: searchTerm } },
            ],
          },
        })
      ).map((o) => o.id);

      const conditions: Record<string, unknown>[] = [];
      if (matchingProductIds.length > 0) {
        conditions.push({ productId: { [Op.in]: matchingProductIds } });
      }
      if (matchingOrderIds.length > 0) {
        conditions.push({ orderId: { [Op.in]: matchingOrderIds } });
      }

      if (conditions.length === 0) {
        return res.status(200).json({
          message: "orders successfully fetched",
          data: [],
          pagination: getPaginationMeta(page, limit, 0),
        });
      }
      odWhere[Op.or] = conditions;
    }

    const orderWhere: Record<string, unknown> = {};
    if (status && status !== "all") {
      orderWhere.orderStatus = status;
    }

    const orderDetails = await OrderDetail.findAll({
      where: odWhere,
      include: [
        {
          model: Product,
          where: { userId },
          attributes: ["id", "productName", "productPrice", "image", "stock"],
        },
        {
          model: Order,
          where: orderWhere,
          include: [Payment, { model: User, attributes: ["id", "userName", "userEmail"] }],
        },
      ],
      order: [[sequelize.col("Order.createdAt"), "DESC"]],
      limit,
      offset: skip,
    });

    const total = await OrderDetail.count({
      where: odWhere,
      include: [
        {
          model: Product,
          where: { userId },
        },
        {
          model: Order,
          where: orderWhere,
        },
      ],
      col: "id",
      distinct: true,
    });

    const pagination = getPaginationMeta(page, limit, total);

    return res.status(200).json({
      message: "orders successfully fetched",
      data: orderDetails,
      pagination,
    });
  }

  async getOrdersForProduct(req: AuthRequest, res: Response) {
    const userId = req.user?.id;
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({
        message: "product id is required",
      });
    }

    // Ownership here is a property of the product, not the order: the product
    // carries the vendor id directly, so a single scoped lookup both proves
    // ownership and 404s for someone else's product.
    const product = await Product.findOne({
      where: { id: productId, userId },
      attributes: ["id"],
    });

    if (!product) {
      return res.status(404).json({
        message: "product not found",
      });
    }

    const { page, limit, skip } = getPaginationParams(
      req.query.page as string | string[] | undefined,
      req.query.limit as string | string[] | undefined,
    );

    const orders = await OrderDetail.findAll({
      where: { productId },
      include: [
        {
          model: Order,
        },
      ],
      order: [[sequelize.col("Order.createdAt"), "DESC"]],
      limit,
      offset: skip,
    });

    const total = await OrderDetail.count({ where: { productId } });

    const pagination = getPaginationMeta(page, limit, total);

    return res.status(200).json({
      message: "orders successfully fetched",
      data: orders,
      pagination,
    });
  }

  async getVendorOrderDetail(req: AuthRequest, res: Response) {
    const userId = req.user?.id;
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        message: "order id is required",
      });
    }

    const orderDetails = await OrderDetail.findAll({
      where: { orderId },
      include: [
        {
          model: Product,
          where: { userId },
          attributes: ["id", "productName", "productPrice", "image", "stock"],
        },
        {
          model: Order,
          include: [
            Payment,
            { model: User, attributes: ["id", "userName", "userEmail"] },
          ],
        },
      ],
    });

    if (orderDetails.length > 0) {
      return res.status(200).json({
        message: "order detail successfully fetched",
        data: orderDetails,
      });
    }
    return res.status(400).json({
      message: "order not found",
    });
  }

  async updateOrderStatus(req: AuthRequest, res: Response) {
    const userId = req.user?.id;
    // Express 5 types a named param as string | string[]; a repeated or
    // array-style param arrives as an array, so narrow rather than trust it.
    const orderId = String(req.params.orderId);
    const {orderStatus} = req.body;

    if(!orderId || !orderStatus){
      return res.status(400).json({
        message: "order id and order status are required"
      })
    }

    // The column is an enum, so an unrecognised value would otherwise surface
    // as a database error rather than a client mistake.
    if (!VALID_ORDER_STATUSES.includes(orderStatus)) {
      return res.status(400).json({
        message: `order status must be one of: ${VALID_ORDER_STATUSES.join(", ")}`
      })
    }

    if(!(await this.assertVendorOwnsOrder(orderId, userId as string, res))) {
      return;
    }

    // Ownership was proven above; the update itself only needs the id because
    // status is an order-level column with no per-vendor variant.
    const [affected] = await Order.update(
      { orderStatus },
      {
        where: {
          id: orderId,
        },
      }
    );

    if (affected === 0) {
      return res.status(404).json({
        message: "order not found"
      })
    }

    await incrementCacheVersions(["order", "admin-stats"]);

    return res.status(200).json({
      message: "order status successfully updated"
    })
  }
  async updatePaymentStatus(req: AuthRequest,res: Response) {
    const userId = req.user?.id;
    const orderId = String(req.params.orderId);
    const {paymentStatus} = req.body;

    if(!orderId || !paymentStatus){
      return res.status(400).json({
        message: "order id and payment status are required"
      })
    }

    if (!VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
      return res.status(400).json({
        message: `payment status must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}`
      })
    }

    if(!(await this.assertVendorOwnsOrder(orderId, userId as string, res))) {
      return;
    }

    const order = await Order.findByPk(orderId, {
      attributes: ["id", "paymentId"],
    });

    if(!order?.paymentId) {
      return res.status(404).json({
        message: "order not found"
      })
    }

    await Payment.update(
      { paymentStatus },
      {
        where: {
          id: order.paymentId,
        }
      }
    )

    await incrementCacheVersions(["order", "admin-stats"]);

    return res.status(200).json({
      message: "payment status successfully updated"
    })
  }

  async deleteOrder(req: AuthRequest,res: Response) {
    const userId = req.user?.id;
    const orderId = String(req.params.orderId);

    if(!orderId){
      return res.status(400).json({
        message: "order id is required"
      })
    }

    // A delete is destructive to every line item on the order, including other
    // vendors' items, so a vendor is only allowed to delete an order they own
    // outright. Deleting one they merely appear on would silently destroy
    // another vendor's sale.
    const ownedItems = await this.getVendorOwnedItems(orderId, userId as string);

    if (ownedItems.length === 0) {
      return res.status(404).json({
        message: "order not found"
      })
    }

    const totalItems = await OrderDetail.count({ where: { orderId } });

    if (ownedItems.length !== totalItems) {
      return res.status(403).json({
        message: "This order contains products from other vendors and cannot be deleted"
      })
    }

    const order = await Order.findByPk(orderId, {
      attributes: ["id", "paymentId"],
    });

    if (!order) {
      return res.status(404).json({
        message: "order not found"
      })
    }

    // Deleting the order before its children violates the orderdetails ->
    // orders foreign key and aborts the whole operation, so children go first.
    // Wrapped in a transaction so a failure part-way cannot leave a payment
    // row orphaned against a missing order.
    await sequelize.transaction(async (transaction) => {
      await OrderDetail.destroy({ where: { orderId }, transaction });
      await Payment.destroy({ where: { id: order.paymentId }, transaction });
      await Order.destroy({ where: { id: orderId }, transaction });
    });

    await incrementCacheVersions(["order", "admin-stats"]);

    return res.status(200).json({
      message: "order successfully deleted"
    })
  }
}

export default new OrderController();

