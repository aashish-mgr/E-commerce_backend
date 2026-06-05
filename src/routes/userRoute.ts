import express,{Router} from 'express'
import AuthController from '../controllers/userController';
import handleError from '../services/asyncError'
import AuthMiddleware from '../middlewares/authMiddleware';

const router:Router = express.Router();

router.route('/register').post(handleError(AuthController.registerUser));
router.route('/login').post(handleError(AuthController.loginUser));
router.route('/getUserProfile').get(AuthMiddleware.isAuthenticated,handleError(AuthController.getUserProfile));
router.route('/logout').post(AuthMiddleware.isAuthenticated,handleError(AuthController.logoutUser));

export default router;