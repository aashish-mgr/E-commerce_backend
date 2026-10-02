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
          // The token verified but the account behind it is gone, so it can no
          // longer authenticate anything. 401 is what makes the client discard
          // it and send the user back to the login screen; 400 left the session
          // looking merely malformed.
          return res.status(401).json({
            message: "Unauthorized: user not found",
          });
        }

        req.user = userData;

        next();
      } catch (err) {
        // A failure to look the user up is the server's fault, not the caller's,
        // and `err` stays out of the response because an unexpected exception's
        // message can carry internals.
        console.error("Failed to resolve the authenticated user:", err);
        return res.status(500).json({
          message: "something went wrong",
        });
      }
    });
  }

  public static permittedTo(...roles:Role[]) {
    return (req:AuthRequest,res:Response,next:NextFunction) => {
      // 401 and 403 have to stay distinct here, because the frontend's auth
      // interceptor treats 401 as "access token expired": it spends a refresh
      // and, if that fails, signs the user out. Reporting a wrong-role failure
      // as 401 would therefore log a user out over an authorization mistake,
      // and reporting it as 400 would read as a malformed request that the
      // caller could fix by resending it. Neither is actionable.
      if (!req.user) {
        return res.status(401).json({
          message: "Unauthorized: authentication is required",
        });
      }

      const userRole = req.user.userRole as Role
      if(!roles.includes(userRole)) {
        // The caller is known and the request was well formed; it is the
        // identity that is not permitted, which is what 403 means.
        return res.status(403).json({
          message: "Forbidden: you do not have permission to perform this action",
        })
      }

      next();
    }
  }
}

export default AuthMiddleware;


