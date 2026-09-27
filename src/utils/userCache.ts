import User from "../model/userModel";
import type { AuthUser } from "../middlewares/authMiddleware";
import {
  CACHE_TTL,
  generateCacheKey,
  getCacheVersion,
  setOrGetCache,
} from "./redisHelper";

export const USER_CACHE_RESOURCE = "user";

/**
 * Auth runs a User lookup on every authenticated request, which makes it the
 * hottest query in the app. The row is cached under a versioned key so a role
 * or profile change can invalidate every entry at once.
 *
 * Returns a plain object on both hit and miss so callers get one consistent
 * shape rather than a Sequelize instance sometimes and JSON sometimes.
 */
export const getCachedUser = async (
  userId: string,
): Promise<AuthUser | null> => {
  const version = await getCacheVersion(USER_CACHE_RESOURCE);
  const key = generateCacheKey(`user:v${version}:auth`, { id: userId });

  return setOrGetCache<AuthUser | null>(key, CACHE_TTL.user, async () => {
    const user = await User.findByPk(userId);
    return user ? (user.get({ plain: true }) as AuthUser) : null;
  });
};
