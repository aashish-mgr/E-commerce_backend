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
class OrderController {
  //customer side
  async createOrder(req: AuthRequest, res: Response) {
    const {
      shippingAddress,
      phoneNumber,
      totalAmount,
      paymentDetails,
      items,
    }: OrderType = req.body;
    const userId = req.user?.id;
    if (
      !shippingAddress ||
      !phoneNumber ||
      !totalAmount ||
      !paymentDetails ||
      items.length == 0
    ) {
      return res.status(400).json({
        message: "Please provide all the details",
      });
    }
    const paymentData = await Payment.create({
      paymentMethod: paymentDetails.paymentMethod,
    });
    const orderData = await Order.create({
      shippingAddress,
      phoneNumber,
      totalAmount,
      userId,
      paymentId: paymentData.id,
    });

    for (let i = 0; i < items.length; i++) {
      await OrderDetail.create({
        quantity: items[i]?.quantity,
        productId: items[i]?.productId,
        orderId: orderData.id,
      });
    }

    if (paymentData.paymentMethod === PaymentMethod.Khalti) {
      const data = {
        return_url: "http://localhost:3000/",
        amount: orderData.totalAmount * 100,
        purchase_order_id: orderData.id,
        purchase_order_name: "order_" + orderData.id,
        website_url: "http://localhost:3000/",
      };
      const response = await axios.post(
        "https://dev.khalti.com/api/v2/epayment/initiate/",
        data,
        {
          headers: {
            Authorization: "key 36ccc627f6274cbcb2fd4f09630563d2",
          },
        },
      );

      const khaltiResponse: khaltiResponse = response.data;
      ((paymentData.pidx = khaltiResponse.pidx), await paymentData.save());
      res.status(200).json({
        message: "Order successfully created",
        response: khaltiResponse.payment_url,
      });
    } else {
      return res.status(200).json({
        message: "Order successfully created",
      });
    }
  }

  async verifyPayment(req: AuthRequest, res: Response) {
    const { pidx } = req.body;
    const userId = req.user?.id;
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
          Authorization: "key 36ccc627f6274cbcb2fd4f09630563d2",
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

      res.status(200).json({
        message: "Payment successfully verified",
      });
    } else {
      return res.status(200).json({
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

    const orderDetail = await OrderDetail.findAll({
      where: { orderId },
      include: [
        {
          model: Product,
        },
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
