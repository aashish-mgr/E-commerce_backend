import { oauth2client, getGoogleAuthUrl } from "../config/oAuth";
import { Request, Response } from "express";
import User from "../model/userModel";
import { envConfig } from "../config/env";
import TokenService from "../services/tokenService";
import { generateAccessToken, setAuthCookies } from "../utils/tokenUtils";

class oauthController {
  async getAuthUrl(req: Request, res: Response) {
    res.redirect(getGoogleAuthUrl());
  }

  async googleCallback(req: Request, res: Response) {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({
        message: "Missing authorization code",
      });
    }

    try {
      const { tokens } = await oauth2client.getToken(code as string);
      oauth2client.setCredentials(tokens);

      const ticket = await oauth2client.verifyIdToken({
        idToken: tokens.id_token as string,
        audience: envConfig.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) throw new Error("Invalid token payload");

      let user = await User.findOne({
        where: { userEmail: payload.email },
      });

      if (!user) {
        user = await User.create({
          googleId: payload.sub,
          userName: payload.name,
          userEmail: payload.email,
          provider: "google",
        });
      } else if (user.provider === "local" && !user.googleId) {
        user.googleId = payload.sub;
        user.provider = "google";
        await user.save();
      }

      const accessToken = generateAccessToken(user.id);
      const refreshToken = await TokenService.issueRefreshToken(user.id);
      setAuthCookies(res, { accessToken, refreshToken });

      return res.redirect("http://localhost:5173/auth/complete");
    } catch (error) {
      console.error("Error during Google OAuth callback:", error);
      return res.status(500).json({
        message: "Google authentication failed",
      });
    }
  }
}

export default new oauthController();
