import express from 'express'
const router = express.Router();
import productController from '../controllers/productController'
import handleError from '../services/asyncError';
import AuthMiddleware from '../middlewares/authMiddleware';
import { Role } from '../middlewares/authMiddleware'; 

router.route('/create').post(
	AuthMiddleware.isAuthenticated,
	AuthMiddleware.permittedTo(Role.Vendor),
	handleError(productController.createProduct)
);
router.route('/getAll').get(
	AuthMiddleware.isAuthenticated,
	AuthMiddleware.permittedTo(Role.Vendor, Role.Customer),
	handleError(productController.getProducts)
);
router.route('/getSingle/:id').get(
	AuthMiddleware.isAuthenticated,
	AuthMiddleware.permittedTo(Role.Vendor, Role.Customer),
	handleError(productController.getSingleProduct)
);
router.route('/update/:id').patch(
	AuthMiddleware.isAuthenticated,
	AuthMiddleware.permittedTo(Role.Vendor),
	handleError(productController.updateProduct)
);
router.route('/delete/:id').delete(
	AuthMiddleware.isAuthenticated,
	AuthMiddleware.permittedTo(Role.Vendor),
	handleError(productController.deleteProduct)
);

export default router;