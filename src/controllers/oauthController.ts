import { oauth2client,getGoogleAuthUrl } from "../config/oAuth";
import { Request, Response } from "express";
import User from "../model/userModel";
import { envConfig } from "../config/env";
import jwt from "jsonwebtoken";

class oauthController {
   async getAuthUrl(req: Request,res: Response) {
      res.redirect(getGoogleAuthUrl())
   }

   async googleCallback (req: Request,res: Response) {
     const {code} = req.query;
     if(!code) {
        return res.status(400).json({
            message: "Missing authorization code"
        })
     }

     try {
        const {tokens} =await oauth2client.getToken(code as string)
        oauth2client.setCredentials(tokens);

        const ticket = await oauth2client.verifyIdToken({
            idToken: tokens.id_token as string,
            audience: envConfig.GOOGLE_CLIENT_ID
        })

        const payload = ticket.getPayload();

        if(!payload) throw new Error('Invalid token payload');

        let user = await User.findOne({
            where: {userEmail: payload.email}
        })

        if(!user) {
        user = await User.create({
            googleId: payload.sub,
            userName: payload.name,
            userEmail: payload.email,
            provider: "google"
        })
    }
    else if (user.provider === "local" && !user.googleId) {
        user.googleId = payload.sub;
        user.provider = "google";
        await user.save();
    }

     const token = jwt.sign({id: user.id},envConfig.JWT_SECRET_KEY,{
            expiresIn: '20d'
        });
    
        res.cookie('accessToken' ,token, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax' 
        })

        res.redirect("http://localhost:5173/auth/complete");
     }
     catch (error) {
        throw new Error("Error during Google OAuth callback: " + (error as Error).message);
     }
   }

}

export default new oauthController();