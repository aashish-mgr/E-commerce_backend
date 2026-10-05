import crypto from "crypto";
import type { CookieOptions, Response } from "express";
import jwt from "jsonwebtoken";
import { envConfig } from "../config/env";

export const generateAccessToken = (userId: string): string =>
  jwt.sign({ id: userId }, envConfig.JWT_SECRET_KEY as jwt.Secret, {
    expiresIn: envConfig.ACCESS_TOKEN_EXPIRES_IN as NonNullable<jwt.SignOptions["expiresIn"]>,
  });

export const generateRefreshToken = (): string =>
  crypto.randomBytes(48).toString("hex");

export const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export const expiryToMs = (expiry: string): number => {
  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(expiry.trim());
  if (!match) return 15 * 60 * 1000;
  const value = parseInt(match[1] as string, 10);
  const unit = (match[2] ?? "m").toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] ?? 60 * 1000);
};

/**
 * Flags shared by every cookie this app sets.
 *
 * `secure` follows the environment rather than being hardcoded, because a
 * session cookie without it is transmitted in cleartext to any plaintext hop.
 * It stays off outside production only so local development over http://
 * works, where the browser would silently drop a Secure cookie and every
 * login would fail.
 *
 * `sameSite` is "none" in production and "lax" on a plaintext local dev
 * origin, and the split is a consequence of where the two are hosted.
 *
 * Deployed, the frontend and the API sit on different registrable domains
 * (a Vercel app and onrender.com), which makes every request between them
 * *cross-site*, not merely cross-origin. A Lax cookie is withheld from
 * cross-site subresource requests, so with "lax" in production the browser
 * never sent the refresh token to /auth/refresh and every silent session
 * restore failed with "Refresh token is missing". "None" is the only value
 * that works across sites, and browsers reject "None" unless Secure is also
 * set — which is why the two flags are derived from one signal rather than
 * chosen independently.
 *
 * The cost is CSRF. Lax blocks cross-site POSTs, "None" does not, so a
 * hostile page could submit a state-changing request to an authenticated
 * endpoint using the visitor's cookies. What still holds it back: the CORS
 * allowlist admits only CLIENT_ORIGINS and never "*" with credentials, so a
 * cross-origin fetch cannot read a response, and express.json() only parses
 * the JSON content type, which a plain HTML form cannot send. That is a
 * thinner margin than Lax, not equivalent to it. The stronger fix is to put
 * the API on the same site as the frontend (api.example.com alongside
 * www.example.com), which restores "lax" and with it the CSRF backstop.
 */
export const baseCookieOptions = (): Pick<
  CookieOptions,
  "httpOnly" | "secure" | "sameSite"
> => ({
  httpOnly: true,
  secure: envConfig.COOKIE_SECURE,
  sameSite: envConfig.COOKIE_SECURE ? "none" : "lax",
});

export const setAuthCookies = (
  res: Response,
  { accessToken, refreshToken }: { accessToken: string; refreshToken: string }
) => {
  res.cookie("accessToken", accessToken, {
    ...baseCookieOptions(),
    maxAge: expiryToMs(envConfig.ACCESS_TOKEN_EXPIRES_IN),
  });
  res.cookie("refreshToken", refreshToken, {
    ...baseCookieOptions(),
    maxAge: expiryToMs(envConfig.REFRESH_TOKEN_EXPIRES_IN),
  });
};

export const clearAuthCookies = (res: Response) => {
  // The same flags are passed so the clearing Set-Cookie describes the same
  // cookie the response previously set; a mismatched Path or Domain produces
  // a second, live cookie that outlives the logout.
  res.clearCookie("accessToken", baseCookieOptions());
  res.clearCookie("refreshToken", baseCookieOptions());
};