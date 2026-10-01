import { createClient } from "redis";
import { envConfig } from "./env";

const CONNECT_TIMEOUT_MS = envConfig.REDIS_CONNECT_TIMEOUT_MS;
const REDIS_LABEL = envConfig.REDIS_URL;

const redis = createClient({
  url: envConfig.REDIS_URL,
  socket: {
    connectTimeout: CONNECT_TIMEOUT_MS,
    // Always return a delay, never an Error. Returning an Error would end the
    // retry loop, so a Redis started after the app would never be picked up
    // without a restart.
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

/**
 * A refused connection surfaces as an AggregateError holding one error per
 * resolved address, and its own `message` is an empty string. Flatten it so
 * logs say "connect ECONNREFUSED 127.0.0.1:6379" instead of a bare
 * "Redis Error: AggregateError".
 *
 * Duck-typed rather than `instanceof AggregateError` because the compiler lib
 * here predates it.
 */
const describeError = (err: unknown): string => {
  if (typeof err === "object" && err !== null && Array.isArray((err as any).errors)) {
    const parts = (err as any).errors.map(describeError);
    if (parts.length > 0) return parts.join("; ");
  }
  if (err instanceof Error) {
    return err.message || err.name;
  }
  return String(err);
};

let errorCount = 0;
let loggedUnavailable = false;

redis.on("error", (err) => {
  // The reconnect strategy retries forever, so an absent Redis would otherwise
  // emit the same stack trace every few seconds and bury real errors.
  errorCount += 1;
  if (errorCount <= 3 || errorCount % 30 === 0) {
    console.error(`Redis error (${errorCount}):`, describeError(err));
  }
});

redis.on("ready", () => {
  errorCount = 0;
  if (loggedUnavailable) {
    loggedUnavailable = false;
    console.log("Redis became available; caching is enabled.");
  } else {
    console.log("Redis connected.");
  }
});

let connectPromise: Promise<boolean> | null = null;

const attemptConnect = (): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    let settled = false;

    const settle = (connected: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(connected);
    };

    // Without this bound, `connect()` neither resolves nor rejects while the
    // reconnect strategy keeps retrying, so `await connectRedis()` in the
    // startup path would hang and the HTTP server would never bind its port.
    const timer = setTimeout(() => {
      loggedUnavailable = true;
      console.error(
        `Redis at ${REDIS_LABEL} did not respond within ${CONNECT_TIMEOUT_MS}ms. ` +
          `Starting without cache; still retrying in the background.`
      );
      settle(false);
    }, CONNECT_TIMEOUT_MS);

    // The rejection is handled here, so a late failure after the timeout has
    // already resolved `settle` cannot surface as an unhandled rejection.
    redis.connect().then(
      () => settle(true),
      (err) => {
        loggedUnavailable = true;
        console.error(
          `Could not connect to Redis at ${REDIS_LABEL}:`,
          describeError(err)
        );
        settle(false);
      }
    );
  });

/**
 * Connects to Redis if it is reachable, but never throws and never blocks
 * startup for longer than REDIS_CONNECT_TIMEOUT_MS.
 *
 * Resolves true when the cache is usable, false when the caller should carry on
 * without it. Every cache helper in redisHelper.ts is fail-open, so false is a
 * degraded-but-working mode rather than an error.
 */
export const connectRedis = async (): Promise<boolean> => {
  if (redis.isReady) return true;

  // isOpen is true both while the socket is opening and while the reconnect
  // strategy is retrying, so a second connect() here would throw
  // "Socket already opened". The in-flight attempt already keeps retrying, so
  // there is nothing new to start.
  if (redis.isOpen) return false;

  if (!connectPromise) {
    connectPromise = attemptConnect().finally(() => {
      connectPromise = null;
    });
  }

  return connectPromise;
};

export const getRedisStatus = (): "connected" | "reconnecting" | "unavailable" => {
  if (redis.isReady) return "connected";
  if (redis.isOpen) return "reconnecting";
  return "unavailable";
};

export const isRedisAvailable = (): boolean => redis.isReady;

export const disconnectRedis = async (): Promise<void> => {
  if (!redis.isOpen) return;
  await redis.quit();
};

export default redis;
