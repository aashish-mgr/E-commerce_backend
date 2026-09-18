import crypto from "crypto";
import type { Response } from "express";
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

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: false,
  sameSite: "lax" as const,
  maxAge,
});

export const setAuthCookies = (
  res: Response,
  { accessToken, refreshToken }: { accessToken: string; refreshToken: string }
) => {
  res.cookie(
    "accessToken",
    accessToken,
    cookieOptions(expiryToMs(envConfig.ACCESS_TOKEN_EXPIRES_IN))
  );
  res.cookie(
    "refreshToken",
    refreshToken,
    cookieOptions(expiryToMs(envConfig.REFRESH_TOKEN_EXPIRES_IN))
  );
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
};