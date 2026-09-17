import express,{Router} from 'express'
import AuthController from '../controllers/userController';
import handleError from '../services/asyncError'
import oauthController from '../controllers/oauthController';
import AuthMiddleware from '../middlewares/authMiddleware';
import upload from '../middlewares/multerConfig';

const router:Router = express.Router();

router.route('/register').post(handleError(AuthController.registerUser));
router.route('/login').post(handleError(AuthController.loginUser));
router.route('/getUserProfile').get(AuthMiddleware.isAuthenticated,handleError(AuthController.getUserProfile));
router.route('/updateProfile').patch(AuthMiddleware.isAuthenticated,upload.single('avatar'),handleError(AuthController.updateUserProfile));
router.route('/changePassword').patch(AuthMiddleware.isAuthenticated,handleError(AuthController.changePassword));
router.route('/logout').post(AuthMiddleware.isAuthenticated,handleError(AuthController.logoutUser));

router.route('/google').get(handleError(oauthController.getAuthUrl));
router.route('/google/callback').get(handleError(oauthController.googleCallback));

export default router;