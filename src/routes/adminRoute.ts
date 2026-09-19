import express, { Router } from "express";
import AdminController from "../controllers/adminController";
import handleError from "../services/asyncError";
import AuthMiddleware from "../middlewares/authMiddleware";
import { Role } from "../middlewares/authMiddleware";

const router: Router = express.Router();

router.use(
  AuthMiddleware.isAuthenticated,
  AuthMiddleware.permittedTo(Role.Admin)
);

router.route("/stats").get(handleError(AdminController.getStats));

router.route("/users").get(handleError(AdminController.getUsers));
router
  .route("/users/:userId/role")
  .patch(handleError(AdminController.updateUserRole));
router.route("/users/:userId").delete(handleError(AdminController.deleteUser));

router.route("/products").get(handleError(AdminController.getProducts));
router
  .route("/products/:productId")
  .patch(handleError(AdminController.updateProductStock))
  .delete(handleError(AdminController.deleteProduct));

router.route("/orders").get(handleError(AdminController.getOrders));
router
  .route("/orders/:orderId/status")
  .patch(handleError(AdminController.updateOrderStatus));
router
  .route("/orders/:orderId/payment")
  .patch(handleError(AdminController.updatePaymentStatus));
router.route("/orders/:orderId").delete(handleError(AdminController.deleteOrder));

router.route("/categories").post(handleError(AdminController.createCategory));
router
  .route("/categories/:categoryId")
  .patch(handleError(AdminController.updateCategory))
  .delete(handleError(AdminController.deleteCategory));

export default router;