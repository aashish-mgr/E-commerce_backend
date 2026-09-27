import { createClient } from "redis";
import { envConfig } from "./env";

const redis = createClient({
  url: envConfig.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

redis.on("error", (err) => {
  console.error("Redis Error:", err);
});

export const connectRedis = async () => {
  if (redis.isOpen) return;
  await redis.connect();
  console.log("Redis connected.");
};

export default redis;
