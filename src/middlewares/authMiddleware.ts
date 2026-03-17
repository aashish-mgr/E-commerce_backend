import jwt from "jsonwebtoken";
import User from "../model/userModel";
import { Request, Response, NextFunction } from "express";
import { EnumDataType } from "sequelize";

 export interface AuthRequest extends Request {
    user?: {
        id: string,
        userName: string,
        userEmail: string,
        userPassword: string,
        userRole: string
    }
}

export enum  Role{
    Vendor = "vendor",
    Customer = "customer"
}

class AuthMiddleware {
 public static isAuthenticated(req: AuthRequest, res: Response, next: NextFunction) {
    const token = req.headers.authorization;

    if (!token) {
      return res.status(400).json({
        message: "Invalid token",
      });
    }

   jwt.verify(token,process.env.JWT_SECRET_KEY as string, async (err, decoded:any) => {
        console.log(token);
      if (err) {
        return res.status(400).json({
          message: "Token couldn't be verified",
        });
      }

      try {
        const userData = await User.findByPk(decoded.id);
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


