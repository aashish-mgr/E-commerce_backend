import { createOAuth2Client, getGoogleAuthUrl } from "../config/oAuth";
import { Request, Response } from "express";
import User from "../model/userModel";
import { envConfig } from "../config/env";
import TokenService from "../services/tokenService";
import { generateAccessToken, setAuthCookies } from "../utils/tokenUtils";
import { consumeOAuthState, issueOAuthState } from "../utils/oauthState";

class oauthController {
  async getAuthUrl(req: Request, res: Response) {
    const { state, codeChallenge } = await issueOAuthState(res);

    res.redirect(getGoogleAuthUrl({ state, codeChallenge }));
  }

  async googleCallback(req: Request, res: Response) {
    const { code, state } = req.query;

    // Verified before the code is redeemed. A callback whose state does not
    // match the cookie issued to this browser is either a replay or an attempt
    // to bind someone else's Google account to it, and must never reach the
    // token exchange. Consuming state here also covers callbacks that arrive
    // without a code, such as the user declining consent.
    const consumed = consumeOAuthState(req, res, state);
    if (!consumed) {
      return res.status(400).json({
        message: "Invalid or expired OAuth state",
      });
    }

    if (typeof code !== "string" || code.length === 0) {
      return res.status(400).json({
        message: "Missing authorization code",
      });
    }

    try {
      // Scoped to this request on purpose: sharing one client across callbacks
      // lets concurrent sign-ins overwrite each other's credentials.
      const client = createOAuth2Client();
      const { tokens } = await client.getToken({
        code,
        ...(consumed.codeVerifier ? { codeVerifier: consumed.codeVerifier } : {}),
      });

      if (!tokens.id_token) {
        throw new Error("Google returned no id_token");
      }

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: envConfig.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) throw new Error("Invalid token payload");

      // The address is the account identifier here, so an unverified one would
      // let a provider-side account claim ours.
      if (payload.email_verified !== true) {
        throw new Error("Google account email is not verified");
      }

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

      return res.redirect(`${envConfig.CLIENT_URL}/auth/complete`);
    } catch (error) {
      console.error("Error during Google OAuth callback:", error);
      return res.status(500).json({
        message: "Google authentication failed",
      });
    }
  }
}

export default new oauthController();