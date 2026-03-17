import express, { Router } from 'express'
import cartController from '../controllers/cartController';
import AuthMiddleware from '../middlewares/authMiddleware';
const router:Router = express.Router();

router.route('/addToCart').post(AuthMiddleware.isAuthenticated,cartController.addToCart);
router.route('/getMyCarts').get(AuthMiddleware.isAuthenticated,cartController.getMyCarts);


export default router;