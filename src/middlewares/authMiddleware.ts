 import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { EnumDataType } from "sequelize";
import { getCachedUser } from "../utils/userCache";

 // Mirrors the columns on the User model. The row is served from cache as a
// plain object rather than a Sequelize instance, so this is a plain shape
// rather than the model class.
export type AuthUser = {
    id: string,
    userName: string,
    userEmail: string,
    userPassword: string,
    userRole: string,
    googleId: string,
    provider: string,
    avatar: string,
}

export interface AuthRequest extends Request {
    user?: AuthUser
}

export enum  Role{
    Admin = "admin",
    Vendor = "vendor",
    Customer = "customer"
}

class AuthMiddleware {
 public static isAuthenticated(req: AuthRequest, res: Response, next: NextFunction) {
    const token = req.cookies.accessToken;

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized: access token missing",
      });
    }

   jwt.verify(token, process.env.JWT_SECRET_KEY as string, async (err: jwt.VerifyErrors | null, decoded: any) => {
      if (err) {
        return res.status(401).json({
          message: "Unauthorized: access token is invalid or has expired",
        });
      }

      try {
        const userData = await getCachedUser(decoded.id);
        if (!userData) {
          return res.status(400).json({
            message: "user not found",
          });
        }

        req.user = userData;

        next();
      } catch (err) {
        return res.status(400).json({
          message: "something went wrong",
          err,
        });
      }
    });
  }

  public static permittedTo(...roles:Role[]) {
    return (req:AuthRequest,res:Response,next: NextFunction) => {
     const userRole = req.user?.userRole as Role
     if(!roles.includes(userRole)) {
        res.status(400).json({
            message: "You are not allowed"
        })
        return 
     }
     next();
    }
  }
}

export default AuthMiddleware;


