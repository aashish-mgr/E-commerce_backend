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

/**
 * Money is accumulated as integer minor units (paisa) and only formatted at the
 * edges. Summing productPrice as a JS float drifts - 0.1 + 0.2 !== 0.3 - and the
 * drift is then multiplied by 100 when the amount is sent to Khalti, which
 * rejects a total that is off by a paisa. Keeping the running total an integer
 * makes the sum exact and the Khalti conversion a plain division.
 */
const toMinorUnits = (amount: number): number => Math.round(amount * 100);

const fromMinorUnits = (minor: number): string => (minor / 100).toFixed(2);

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

    const { orderData, paymentData, totalMinorUnits, orderItems } =
      await sequelize.transaction(async (transaction) => {
        const orderItems: { quantity: number; productId: string }[] = [];
        let totalMinorUnits = 0;

        // Rows are locked in a stable productId order. Locking in request order
        // lets two concurrent orders covering the same pair of products deadlock
        // against each other, and a deterministic order gives them both the same
        // first waiter.
        const sortedItems = [...items].sort((a, b) =>
          String(a.productId).localeCompare(String(b.productId)),
        );

        for (const item of sortedItems) {
          const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
          const product = await Product.findByPk(item.productId, {
            transaction,
            // Serializes concurrent checkouts on this product. Without it the
            // stock read below and the later decrement are two independent
            // statements, so both transactions can observe the same pre-sale
            // stock and both pass the check.
            lock: transaction.LOCK.UPDATE,
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

          // productPrice is a DECIMAL column, so it arrives as a string and
          // Number() on it is already an approximation. Rounding to whole
          // paisa immediately bounds that error to half a paisa per line rather
          // than letting it accumulate across the running total.
          totalMinorUnits += toMinorUnits(price) * quantity;
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
            totalAmount: fromMinorUnits(totalMinorUnits),
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

          // The conditional where is the real guard. The row lock above makes
          // concurrent checkouts queue up, but the stock was already read and
          // validated before the order row existed, so the decrement still has
          // to re-assert the precondition in the same statement it updates. A
          // decrement that matches no row is not an error, it just reports zero
          // affected rows, which is what would let stock silently go negative.
          //
          // `returning: true` is required to get a count back: without it
          // decrement resolves to a single-element array and the affected count
          // at index 1 is undefined, so this guard would reject every order.
          const affected = await Product.decrement("stock", {
            by: item.quantity,
            where: {
              id: item.productId,
              stock: { [Op.gte]: item.quantity },
            },
            transaction,
          });

          const affectedCount = Array.isArray(affected)
            ? (affected[1] ?? affected[0]?.length ?? 0)
            : 0;

          if (affectedCount !== 1) {
            throw new ApiError(
              "Insufficient stock for one or more items. Please try again.",
              409,
            );
          }
        }

        return {
          orderData: createdOrder,
          paymentData: createdPayment,
          totalMinorUnits,
          orderItems,
        };
      },
    );

    if (paymentData.paymentMethod !== PaymentMethod.Khalti) {
      // The transaction decremented product stock, and stock is part of the
      // cached product payloads, so the product list is now stale.
      await incrementCacheVersions(["product", "order"]);

      return res.status(200).json({
        message: "Order successfully created",
        orderId: orderData.id,
      });
    }

    // Khalti is an external call made after the transaction has already
    // committed, so it cannot participate in it. If it fails the order is
    // committed with stock already decremented and no payment URL, which
    // strands the inventory. Compensating here rather than hoping the caller
    // retries: the order never became payable, so the only correct end state is
    // for it not to exist.
    let khaltiReturnData: khaltiResponse;
    try {
      const response = await axios.post(
        "https://dev.khalti.com/api/v2/epayment/initiate/",
        {
          return_url: "http://localhost:5173/paymentCallback",
          // Khalti expects the amount in paisa as a whole number. Multiplying
          // the stored total by 100 would reintroduce the float drift the minor
          // unit accounting exists to avoid.
          amount: totalMinorUnits,
          purchase_order_id: orderData.id,
          purchase_order_name: "order_" + orderData.id,
          website_url: "http://localhost:5173/",
        },
        {
          headers: {
            Authorization: `key ${envConfig.KHALTI_SECRET_KEY}`,
          },
        },
      );

      khaltiReturnData = response.data;
    } catch (err) {
      console.error("Khalti initiate failed, compensating order", err);
      await this.compensateFailedOrder(orderData.id, orderItems);

      throw new ApiError(
        "Could not reach the payment provider. Your order was not placed and no stock was reserved.",
        502,
      );
    }

    paymentData.pidx = khaltiReturnData.pidx;
    await paymentData.save();

    await incrementCacheVersions(["product", "order"]);

    return res.status(200).json({
      message: "Order successfully created",
      response: khaltiReturnData.payment_url,
      orderId: orderData.id,
    });
  }

  /**
   * Undoes a committed order whose payment could not be initiated: puts the
   * reserved stock back, then removes the order and its payment row. Deleting
   * children before the order row is required by the orderdetails -> orders
   * foreign key, and the whole thing runs in one transaction so a failure part
   * way cannot leave the order deleted with the stock still held.
   */
  private async compensateFailedOrder(
    orderId: string,
    orderItems: { productId: string; quantity: number }[],
  ) {
    await sequelize.transaction(async (transaction) => {
      for (const item of orderItems) {
        await Product.increment("stock", {
          by: item.quantity,
          where: { id: item.productId },
          transaction,
        });
      }

      const order = await Order.findByPk(orderId, {
        attributes: ["id", "paymentId"],
        transaction,
      });

      await OrderDetail.destroy({ where: { orderId }, transaction });

      if (order?.paymentId) {
        await Payment.destroy({ where: { id: order.paymentId }, transaction });
      }

      await Order.destroy({ where: { id: orderId }, transaction });
    });

    await incrementCacheVersions(["product", "order", "admin-stats"]);
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

    // Restocking and the status flip have to be atomic with each other, and the
    // status change is also what makes the restock idempotent: it is claimed with
    // a conditional update rather than a read-then-write, so two concurrent
    // cancels of the same order cannot both see the old status and each add the
    // quantities back.
    await sequelize.transaction(async (transaction) => {
      const order = await Order.findOne({
        where: {
          userId,
          id: orderId,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!order) {
        throw new ApiError("order not found", 404);
      }

      if (order.orderStatus === OrderStatus.Shipped) {
        throw new ApiError(
          "You cannot cancel the order. It is already shipped",
          400,
        );
      }

      if (order.orderStatus === OrderStatus.Cancelled) {
        throw new ApiError("order is already cancelled", 400);
      }

      // Claim the cancellation first. If this update matches no row the order
      // left a cancellable state underneath us and the restock must not run.
      const [cancelled] = await Order.update(
        { orderStatus: OrderStatus.Cancelled },
        {
          where: {
            userId,
            id: orderId,
            orderStatus: { [Op.ne]: OrderStatus.Cancelled },
          },
          transaction,
        },
      );

      if (cancelled !== 1) {
        throw new ApiError("order is already cancelled", 400);
      }

      // createOrder decremented stock per line item, so cancelling gives exactly
      // those quantities back. Without this the inventory drifts down by every
      // cancelled order.
      const orderDetails = await OrderDetail.findAll({
        where: { orderId },
        transaction,
      });

      for (const detail of orderDetails) {
        // productId comes from the OrderDetail -> Order association rather than a
        // declared column, so the model does not expose it on the instance type.
        const productId = (detail as unknown as { productId: string }).productId;

        await Product.increment("stock", {
          by: detail.quantity,
          where: { id: productId },
          transaction,
        });
      }
    });

    await incrementCacheVersions(["order", "product", "admin-stats"]);

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

