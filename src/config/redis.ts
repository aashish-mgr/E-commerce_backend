import { createClient } from "redis";

const redis = createClient({
    url: "redis://localhost:6379"
})

redis.on("error",(err) => {
   console.error("Redis Error:",err);
})

export const connectRedis =async () => {
    await redis.connect();
    console.log("Redis connected.")
}

export default redis;