import express from "express";
import categoryController from "../controllers/categoryController";
import AuthMiddleware from "../middlewares/authMiddleware";
import { Role } from "../middlewares/authMiddleware";

const router = express.Router();

router
  .route("/create")
  .post(
    AuthMiddleware.isAuthenticated,
    AuthMiddleware.permittedTo(Role.Vendor),
    categoryController.createCategory,
  );
router
  .route("/findAll")
  .get(
    AuthMiddleware.isAuthenticated,
    AuthMiddleware.permittedTo(Role.Vendor),
    categoryController.getAllCategory,
  );
router
  .route("/delete/:categoryId")
  .delete(
    AuthMiddleware.isAuthenticated,
    AuthMiddleware.permittedTo(Role.Vendor),
    categoryController.deleteCategory,
  );
router
  .route("/update/:categoryId")
  .patch(
    AuthMiddleware.isAuthenticated,
    AuthMiddleware.permittedTo(Role.Vendor),
    categoryController.updateCategory,
  );

export default router;
