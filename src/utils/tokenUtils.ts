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
 * `sameSite: "lax"` is deliberate rather than "strict": the OAuth callback is
 * a top-level cross-site GET navigation back from Google, and a Strict cookie
 * would not be sent there, breaking sign-in. Lax still blocks the CSRF that
 * matters here (cross-site POSTs and subresource requests).
 */
export const baseCookieOptions = (): Pick<
  CookieOptions,
  "httpOnly" | "secure" | "sameSite"
> => ({
  httpOnly: true,
  secure: envConfig.COOKIE_SECURE,
  sameSite: "lax",
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