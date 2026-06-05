import orderController from "../controllers/orderController";
import express from 'express'
import AuthMiddleware from "../middlewares/authMiddleware";
import { Role } from "../middlewares/authMiddleware";
import handleError from "../services/asyncError";
const router = express.Router();
//customer side
router.route('/create').post(AuthMiddleware.isAuthenticated,AuthMiddleware.permittedTo(Role.Customer),handleError(orderController.createOrder));
router.route('/verify').post(AuthMiddleware.isAuthenticated,AuthMiddleware.permittedTo(Role.Customer),handleError(orderController.verifyPayment));
router.route('/getMyOrders').get(AuthMiddleware.isAuthenticated,AuthMiddleware.permittedTo(Role.Customer),handleError(orderController.getMyOrders));
router.route('/getOrderDetail/:orderId').get(AuthMiddleware.isAuthenticated,AuthMiddleware.permittedTo(Role.Customer),handleError(orderController.getOrderDetail))
router.route('/cancelOrder/:orderId').patch(AuthMiddleware.isAuthenticated,AuthMiddleware.permittedTo(Role.Customer),handleError(orderController.cancelOrder))

//vendor side
router.route('/getOrdersForProduct/:productId').get(AuthMiddleware.isAuthenticated,AuthMiddleware.permittedTo(Role.Vendor),handleError(orderController.getOrdersForProduct))
router.route('/updateOrderStatus/:orderId').patch(AuthMiddleware.isAuthenticated,AuthMiddleware.permittedTo(Role.Vendor),handleError(orderController.updateOrderStatus))
router.route('/deleteOrder/:orderId').delete(AuthMiddleware.isAuthenticated,AuthMiddleware.permittedTo(Role.Vendor),handleError(orderController.deleteOrder))
router.route('/updatePaymentStatus/:orderId').patch(AuthMiddleware.isAuthenticated,AuthMiddleware.permittedTo(Role.Vendor),handleError(orderController.updatePaymentStatus))
export default router;