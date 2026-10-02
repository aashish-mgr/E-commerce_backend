import { randomUUID } from "crypto";
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

    const tokenHash = hashToken(rawToken);

    // Claiming the rotation has to be a single conditional statement. A
    // findOne followed by a separate update is a read-then-write race: two
    // simultaneous requests holding the same cookie both read revoked = false
    // and both proceed to mint a new pair, so a stolen token stays usable
    // forever and the reuse detection never fires. Restricting the update to
    // the row this token occupies means only the request that flips it wins.
    const [claimed] = await RefreshToken.update(
      { revoked: true },
      {
        where: {
          tokenHash,
          revoked: false,
        },
      },
    );

    // An affected count of 0 is ambiguous on its own: the token may not exist,
      // may already be revoked, or may have expired. Reading it back
      // distinguishes the cases so an expired token does not get reported as a
      // reuse, which would wrongly kill the whole family.
    const record = await RefreshToken.findOne({ where: { tokenHash } });

    if (!record) {
      throw new ApiError("Invalid refresh token", 401);
    }

    if (claimed !== 1) {
      if (record.revoked) {
        // Reuse of an already-rotated token: assume the token leaked and revoke
        // the whole family, which is the entire point of tracking familyId.
        await RefreshToken.update(
          { revoked: true },
          { where: { familyId: record.familyId } }
        );
        throw new ApiError("Refresh token has already been used", 401);
      }

      if (record.expiresAt.getTime() < Date.now()) {
        throw new ApiError("Refresh token has expired", 401);
      }

      throw new ApiError("Invalid refresh token", 401);
    }

    if (record.expiresAt.getTime() < Date.now()) {
      // We just claimed it but it expired between the update and this check.
      // Revoking it is harmless.
      await record.update({ revoked: true });
      throw new ApiError("Refresh token has expired", 401);
    }

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

  /**
   * Revokes every refresh token a user holds, across all families.
   *
   * Revoking per family would leave sessions minted on the user's other devices
   * alive, which is the opposite of what a password change is meant to achieve:
   * once the credential is suspect, sessions established with it must all stop
   * being renewable. Narrowing to revoked = false also leaves already-revoked
   * rows untouched, so the affected count reflects real transitions.
   */
  static async revokeAllRefreshTokens(userId: string): Promise<void> {
    await RefreshToken.update(
      { revoked: true },
      { where: { userId, revoked: false } }
    );
  }
}

// Cookie flags are defined once, in tokenUtils. A second copy here previously
// carried its own hardcoded `secure: false`, which meant fixing one copy could
// silently leave the other shipping cookies over plaintext.
export {
  generateAccessToken,
  setAuthCookies,
  clearAuthCookies,
} from "../utils/tokenUtils";

export default TokenService;
