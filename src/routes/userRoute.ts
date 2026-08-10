import express,{Router} from 'express'
import AuthController from '../controllers/userController';
import handleError from '../services/asyncError'
import oauthController from '../controllers/oauthController';
import AuthMiddleware from '../middlewares/authMiddleware';

const router:Router = express.Router();

router.route('/register').post(handleError(AuthController.registerUser));
router.route('/login').post(handleError(AuthController.loginUser));
router.route('/getUserProfile').get(AuthMiddleware.isAuthenticated,handleError(AuthController.getUserProfile));
router.route('/logout').post(AuthMiddleware.isAuthenticated,handleError(AuthController.logoutUser));

router.route('/google').get(handleError(oauthController.getAuthUrl));
router.route('/google/callback').get(handleError(oauthController.googleCallback));

export default router;