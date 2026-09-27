import redis from "../config/redis";

export const CACHE_TTL = {
  productList: 60,
  productSingle: 300,
  category: 600,
  user: 30,
  adminStats: 30,
} as const;

const isRedisReady = (): boolean => redis.isReady;

export const getCacheVersion = async (resource: string): Promise<number> => {
  if (!isRedisReady()) return 1;

  const key = `${resource}:version`;

  try {
    const version = await redis.get(key);
    if (version) return parseInt(version, 10);

    // NX so a concurrent INCR between the GET and the SET is never
    // clobbered back to 1, which would silently drop invalidations.
    await redis.set(key, "1", { NX: true });
    const current = await redis.get(key);

    return current ? parseInt(current, 10) : 1;
  } catch (error) {
    console.error(`Failed to read cache version for ${resource}:`, error);
    return 1;
  }
};

export const incrementCacheVersion = async (
  resource: string,
): Promise<void> => {
  if (!isRedisReady()) return;

  try {
    await redis.incr(`${resource}:version`);
  } catch (error) {
    console.error(`Failed to increment cache version for ${resource}:`, error);
  }
};

export const incrementCacheVersions = async (
  resources: string[],
): Promise<void> => {
  await Promise.all(resources.map((resource) => incrementCacheVersion(resource)));
};

export const setOrGetCache = async <T>(
  key: string,
  Ex: number,
  fetchData: () => Promise<T>,
): Promise<T> => {
  if (isRedisReady()) {
    try {
      const cachedData = await redis.get(key);
      if (cachedData) return JSON.parse(cachedData) as T;
    } catch (error) {
      console.error(`Cache read failed for ${key}:`, error);
    }
  }

  // Deliberately outside the try/catch: a fetch failure must surface to the
  // caller rather than be swallowed and returned as a cache miss.
  const data = await fetchData();

  if (isRedisReady()) {
    try {
      await redis.set(key, JSON.stringify(data), { EX: Ex });
    } catch (error) {
      console.error(`Cache write failed for ${key}:`, error);
    }
  }

  return data;
};

export const deleteCache = async (key: string): Promise<void> => {
  if (!isRedisReady()) return;

  try {
    await redis.del(key);
  } catch (error) {
    console.error(`Cache delete failed for ${key}:`, error);
  }
};

export const generateCacheKey = (
  prefix: string,
  params: Record<string, unknown> = {},
): string => {
  const queryString = Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key];
      // String(["1","2"]) === "1,2" would collide with the scalar "1,2",
      // so encode each entry and re-join with an unambiguous separator.
      const entries = (Array.isArray(value) ? value : [value]).map((entry) =>
        encodeURIComponent(String(entry)),
      );
      return `${key}=${entries.join(",")}`;
    })
    .join("&");

  return queryString ? `${prefix}:${queryString}` : prefix;
};
