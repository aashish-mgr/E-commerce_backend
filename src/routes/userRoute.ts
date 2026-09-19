import express,{Router} from 'express'
import AuthController from '../controllers/userController';
import handleError from '../services/asyncError'
import oauthController from '../controllers/oauthController';
import AuthMiddleware from '../middlewares/authMiddleware';
import upload from '../middlewares/multerConfig';
import { refreshLimiter } from '../middlewares/rateLimiter';

const router:Router = express.Router();

router.route('/register').post(handleError(AuthController.registerUser));
router.route('/login').post(handleError(AuthController.loginUser));
router.route('/getUserProfile').get(AuthMiddleware.isAuthenticated,handleError(AuthController.getProfile));
router.route('/updateProfile').patch(AuthMiddleware.isAuthenticated,upload.single('avatar'),handleError(AuthController.updateProfile));
router.route('/changePassword').patch(AuthMiddleware.isAuthenticated,handleError(AuthController.changePassword));
router.route('/logout').post(AuthMiddleware.isAuthenticated,handleError(AuthController.logoutUser));
router.route('/refresh').post(refreshLimiter, handleError(AuthController.refreshAccessToken));
router.route('/session').get(handleError(AuthController.restoreSession));

router.route('/google').get(handleError(oauthController.getAuthUrl));
router.route('/google/callback').get(handleError(oauthController.googleCallback));

export default router;
