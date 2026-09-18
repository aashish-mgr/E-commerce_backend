import { randomUUID } from "crypto";
import type { Response } from "express";
import RefreshToken from "../model/refreshTokenModel";
import { envConfig } from "../config/env";
import { ApiError } from "./asyncError";
import {
  expiryToMs,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "../utils/tokenUtils";

class TokenService {
  static async issueRefreshToken(userId: string): Promise<string> {
    const rawToken = generateRefreshToken();
    await RefreshToken.create({
      tokenHash: hashToken(rawToken),
      familyId: randomUUID(),
      userId,
      expiresAt: new Date(
        Date.now() + expiryToMs(envConfig.REFRESH_TOKEN_EXPIRES_IN)
      ),
    });
    return rawToken;
  }

  static async rotateRefreshToken(rawToken?: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    if (!rawToken) {
      throw new ApiError("Refresh token is missing", 401);
    }

    const record = await RefreshToken.findOne({
      where: { tokenHash: hashToken(rawToken) },
    });

    if (!record) {
      throw new ApiError("Invalid refresh token", 401);
    }

    if (record.revoked) {
      await RefreshToken.update(
        { revoked: true },
        { where: { familyId: record.familyId } }
      );
      throw new ApiError("Refresh token has already been used", 401);
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new ApiError("Refresh token has expired", 401);
    }

    await record.update({ revoked: true });

    const newRawToken = generateRefreshToken();
    await RefreshToken.create({
      tokenHash: hashToken(newRawToken),
      familyId: record.familyId,
      userId: record.userId,
      expiresAt: new Date(
        Date.now() + expiryToMs(envConfig.REFRESH_TOKEN_EXPIRES_IN)
      ),
    });

    return {
      accessToken: generateAccessToken(record.userId),
      refreshToken: newRawToken,
    };
  }

  static async revokeRefreshToken(rawToken?: string): Promise<void> {
    if (!rawToken) return;
    await RefreshToken.update(
      { revoked: true },
      { where: { tokenHash: hashToken(rawToken) } }
    );
  }
}

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

export { generateAccessToken };

export default TokenService;
