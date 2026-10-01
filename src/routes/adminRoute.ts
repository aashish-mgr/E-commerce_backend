import express, { Router } from "express";
import AdminController from "../controllers/adminController";
import handleError from "../services/asyncError";
import AuthMiddleware from "../middlewares/authMiddleware";
import { Role } from "../middlewares/authMiddleware";
import validateUuidParam from "../middlewares/validateUuidParam";

const router: Router = express.Router();

router.use(
  AuthMiddleware.isAuthenticated,
  AuthMiddleware.permittedTo(Role.Admin)
);

router.route("/stats").get(handleError(AdminController.getStats));

router.route("/users").get(handleError(AdminController.getUsers));
router
  .route("/users/:userId/role")
  .patch(validateUuidParam("userId"), handleError(AdminController.updateUserRole));
router
  .route("/users/:userId")
  .delete(validateUuidParam("userId"), handleError(AdminController.deleteUser));

router.route("/products").get(handleError(AdminController.getProducts));
router
  .route("/products/:productId")
  .patch(
    validateUuidParam("productId"),
    handleError(AdminController.updateProductStock),
  )
  .delete(validateUuidParam("productId"), handleError(AdminController.deleteProduct));

router.route("/orders").get(handleError(AdminController.getOrders));
router
  .route("/orders/:orderId/status")
  .patch(validateUuidParam("orderId"), handleError(AdminController.updateOrderStatus));
router
  .route("/orders/:orderId/payment")
  .patch(validateUuidParam("orderId"), handleError(AdminController.updatePaymentStatus));
router
  .route("/orders/:orderId")
  .delete(validateUuidParam("orderId"), handleError(AdminController.deleteOrder));

router.route("/categories").post(handleError(AdminController.createCategory));
router
  .route("/categories/:categoryId")
  .patch(validateUuidParam("categoryId"), handleError(AdminController.updateCategory))
  .delete(
    validateUuidParam("categoryId"),
    handleError(AdminController.deleteCategory),
  );

export default router;