import redis from "../config/redis";


export const getCacheVersion = async (resource: string): Promise<number> => {
    const key = `${resource}:version`;
    const version = await redis.get(key);
    if(!version) {
        await redis.set(key, "1");
        return 1;
    }

    return parseInt(version, 10);
}


export const incrementCacheVersion = async (resource: string): Promise<void> => {
    await redis.incr(`${resource}:version`);
}

export const setOrGetCache = async <T> (key: string,Ex: number, fetchData: () => Promise<T>): Promise<T> => {
    const cachedData = await redis.get(key);

    if(cachedData) {
        return JSON.parse(cachedData)
    }

    const data = await fetchData();
    
    await redis.set(key,JSON.stringify(data), {
        EX: Ex
    });

    return data;

};


export const deleteCache = async (key: string): Promise<void> => {
    await redis.del(key);
}


export const generateCacheKey = (prefix: string,params: Record<string,unknown>) => {
     const queryString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join("&");

  return `${prefix}:${queryString}`;
}