import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../model/userModel";
import bcrypt from "bcryptjs";
import { AuthRequest as AuthRequestType } from "../middlewares/authMiddleware";
import { uploadToCloudinary } from "../utils/uploadToCloudinary";
import TokenService from "../services/tokenService";
import { envConfig } from "../config/env";
import {
  generateAccessToken,
  setAuthCookies,
  clearAuthCookies,
} from "../utils/tokenUtils";

interface AuthRequest extends AuthRequestType {}

const toSafeUser = (user: User) => ({
  id: user.id,
  userName: user.userName,
  userEmail: user.userEmail,
  userRole: user.userRole,
  googleId: user.googleId,
  provider: user.provider,
  avatar: user.avatar,
});

class AuthController {
  public static async registerUser(req: Request, res: Response) {
    const { userName, userEmail, userPassword, userRole } = req.body;

    if (!userName || !userEmail || !userPassword) {
      return res.status(400).json({
        message: "provide all the details",
      });
    }

    const validRoles = ["vendor", "customer"];
    const role = validRoles.includes(userRole) ? userRole : "customer";

    const existingUser = await User.findOne({ where: { userEmail } });
    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    await User.create({
      userName,
      userEmail,
      userRole: role,
      userPassword: bcrypt.hashSync(userPassword, 10),
    });

    return res.status(200).json({
      message: "user registered successfully",
    });
  }

  public static async loginUser(req: Request, res: Response) {
    const { userEmail, userPassword } = req.body;

    if (!userEmail || !userPassword) {
      return res.status(400).json({
        message: "provide all the details",
      });
    }

    const user = await User.findOne({ where: { userEmail } });
    if (!user) {
      return res.status(400).json({
        message: "user not found",
      });
    }

    const isPasswordValid = bcrypt.compareSync(userPassword, user.userPassword);
    if (!isPasswordValid) {
      return res.status(400).json({
        message: "Invalid email or password",
      });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = await TokenService.issueRefreshToken(user.id);
    setAuthCookies(res, { accessToken, refreshToken });

    const safeUser = toSafeUser(user);

    return res.status(200).json({
      data: safeUser,
      message: "user logged in succesaly",
    });
  }

  public static async getProfile(req: AuthRequest, res: Response) {
    const userId = req.user?.id;
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(400).json({
        message: "user not found",
      });
    }
    const safeUser = toSafeUser(user);
    return res.status(200).json({
      data: safeUser,
      message: "user profile fetched successfully",
    });
  }

  public static async updateProfile(req: AuthRequest, res: Response) {
    const userId = req.user?.id;
    const { userName, userEmail } = req.body;

    if (!userName || !userEmail) {
      return res.status(400).json({
        message: "provide all the details",
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(400).json({
        message: "user not found",
      });
    }

    if (userEmail !== user.userEmail) {
      const existingUser = await User.findOne({ where: { userEmail } });
      if (existingUser) {
        return res.status(400).json({
          message: "Email already in use",
        });
      }
    }

    user.userName = userName;
    user.userEmail = userEmail;

    if (req.file) {
      user.avatar = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    }

    await user.save();

    return res.status(200).json({
      data: toSafeUser(user),
      message: "profile updated successfully",
    });
  }

  public static async changePassword(req: AuthRequest, res: Response) {
    const userId = req.user?.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "provide all the details",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(400).json({
        message: "user not found",
      });
    }

    if (!user.userPassword || user.provider === "google") {
      return res.status(400).json({
        message: "Password change is not available for Google accounts",
      });
    }

    const isPasswordValid = bcrypt.compareSync(currentPassword, user.userPassword);
    if (!isPasswordValid) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }

    user.userPassword = bcrypt.hashSync(newPassword, 10);
    await user.save();

    return res.status(200).json({
      message: "password changed successfully",
    });
  }

  public static async logoutUser(req: AuthRequest, res: Response) {
    await TokenService.revokeRefreshToken(req.cookies?.refreshToken);
    clearAuthCookies(res);
    return res.status(200).json({
      message: "user logged out successfully",
    });
  }

  public static async refreshAccessToken(req: Request, res: Response) {
    const { accessToken, refreshToken } =
      await TokenService.rotateRefreshToken(req.cookies?.refreshToken);
    setAuthCookies(res, { accessToken, refreshToken });
    return res.status(200).json({
      message: "tokens refreshed successfully",
    });
  }

  public static async restoreSession(req: Request, res: Response) {
    const accessToken: string | undefined = req.cookies?.accessToken;
    const refreshToken: string | undefined = req.cookies?.refreshToken;

    if (accessToken) {
      try {
        const decoded = jwt.verify(
          accessToken,
          envConfig.JWT_SECRET_KEY
        ) as jwt.JwtPayload;
        const user = decoded?.id ? await User.findByPk(decoded.id) : null;
        if (user) {
          return res.status(200).json({
            data: toSafeUser(user),
            message: "session restored",
          });
        }
      } catch {
        // access token invalid or expired — fall through to refresh rotation
      }
    }

    if (refreshToken) {
      try {
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
          await TokenService.rotateRefreshToken(refreshToken);
        const decoded = jwt.decode(newAccessToken) as jwt.JwtPayload;
        const user = decoded?.id ? await User.findByPk(decoded.id) : null;
        if (user) {
          setAuthCookies(res, {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
          });
          return res.status(200).json({
            data: toSafeUser(user),
            message: "session restored",
          });
        }
      } catch {
        // refresh token invalid or expired — no session
      }
    }

    return res.status(401).json({
      message: "No valid session, please login",
    });
  }
}

export default AuthController;
