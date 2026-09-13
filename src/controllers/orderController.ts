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
import { envConfig } from "../config/env";
import { ApiError } from "../services/asyncError";
import { sequelize } from "../config/dbConfig";
class OrderController {
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
        }

        return { orderData: createdOrder, paymentData: createdPayment };
      },
    );

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
            Authorization: "key ${envConfig.KHALTI_SECRET_KEY}",
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
          Authorization: "key ${envConfig.KHALTI_SECRET_KEY}",
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
    const orders = await Order.findAll({
      where: {
        userId,
      },
      include: [
        {
          model: Payment,
        },
        {
          model: OrderDetail,
          include: [Product]
        }
      ],
    });
    if (orders.length > 0) {
      return res.status(200).json({
        message: "Orders fetched successfully",
        data: orders,
      });
    } else {
      return res.status(400).json({
        message: "orders not found",
      });
    }
  }

  async getOrderDetail(req: AuthRequest, res: Response) {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({
        message: "order id is required",
      });
    }

    const orderDetail = await Order.findAll({
      where: {id: orderId },
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

    return res.status(200).json({
      message: "order successfully cancelled",
    });
  }

  //admin side
  async getOrdersForProduct(req: AuthRequest, res: Response) {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({
        message: "product id is required",
      });
    }

    const orders = await OrderDetail.findAll({
      where: { productId },
      include: [
        {
          model: Order,
        },
      ],
    });

    if (orders.length > 0) {
      return res.status(200).json({
        message: "orders successfully fetched",
        data: orders,
      });
    } else {
      return res.status(400).json({
        message: "orders not found for this product",
      });
    }
  }

  async updateOrderStatus(req: AuthRequest, res: Response) {
    const {orderId} = req.params;
    const {orderStatus} = req.body;

    if(!orderId || !orderStatus){
      return res.status(400).json({
        message: "order id and order status are required"
      })
    }

    const order = await Order.findOne({
      where: {id: orderId}
    })

    if(!order) {
      return res.status(400).json({
        message: "order not found"
      })
    }

    await Order.update({
      orderStatus
    },{
      where: {id: orderId}
    })

    return res.status(200).json({
      message: "order status successfully updated"
    })
  }
  async updatePaymentStatus(req: AuthRequest,res: Response) {
    const {orderId} = req.params;
    const {paymentStatus} = req.body;

    if(!orderId || !paymentStatus){
      return res.status(400).json({
        message: "order id and payment status are required"
      })
    }

    const order = await Order.findOne({
      where: {id: orderId}
    })

    if(!order) {
      return res.status(400).json({
        message: "order not found"
      })
    }

    const paymentId = (order as any).paymentId;

    await Payment.update({
      paymentStatus
    },{
      where: {id: paymentId}
    })
    return res.status(200).json({
      message: "payment status successfully updated"
    })
  }

  async deleteOrder(req: AuthRequest,res: Response) {
    const {orderId} = req.params;
    const order = await Order.findOne({
      where: {id: orderId}
    })
    if(!orderId){
      return res.status(400).json({
        message: "order id is required"
      })
    }
    if(order) {
    await Order.destroy({
      where: {id: orderId}
    })

    await OrderDetail.destroy({
      where: {orderId}
    })

    await Payment.destroy({
      where: {id: (order as any).paymentId}
    })

    return res.status(200).json({
      message: "order successfully deleted"
    })
  }
  else {
    return res.status(400).json({
      message: "order not found"
    })
  }
}
}

export default new OrderController();
