import express, { Request, Response, NextFunction } from 'express';
import {connectDb} from './config/dbConfig'
import userRoute from './routes/userRoute'
import productRoute from './routes/productRoute'
import categoryRoute from './routes/categoryRoute'
import { adminSeeder } from './adminSeed';
import CategoryController from './controllers/categoryController';
import cartRoute from './routes/cartRoute'
import orderRoute from './routes/orderRoute'
import adminRoute from './routes/adminRoute'
import { notFound, errorHandler } from './middlewares/errorHandler';
import * as dotenv from 'dotenv'
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { generalLimiter,authLimiter } from './middlewares/rateLimiter';
import { connectRedis, getRedisStatus } from './config/redis';
import { envConfig } from './config/env';
import { registerProcessErrorBoundary } from './config/processBoundary';


dotenv.config();

registerProcessErrorBoundary();

const app = express();

connectDb();

app.use(express.json());


adminSeeder();
CategoryController.categorySeeder();

app.use (cors( {
    origin: 'http://localhost:5173',
    credentials: true,
}));
app.use(cookieParser());

app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "src/uploads"))
);
app.use(
  '/auth',
  (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/refresh') return next();
    authLimiter(req, res, next);
  },
  userRoute
);
// Unauthenticated and unthrottled, so a monitor can distinguish "process is up
// but degraded" from "process is down".
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    cache: getRedisStatus(),
  });
});
app.use('/product',generalLimiter,productRoute);
app.use('/category',generalLimiter,categoryRoute);
app.use('/cart',generalLimiter,cartRoute);
app.use('/order',generalLimiter,orderRoute);
app.use('/admin',generalLimiter,adminRoute);

app.use(notFound);
app.use(errorHandler);


const startServer =async () => {
  let cacheEnabled = false;

  try {
    // Bounded by REDIS_CONNECT_TIMEOUT_MS and fail-open: this resolves false
    // rather than hanging or throwing when Redis is down.
    cacheEnabled = await connectRedis();
  } catch (error) {
    // Defence in depth. connectRedis is contractually fail-open, but a bug in
    // it must not be able to stop the API from starting.
    console.error("Redis setup failed, starting without cache:", error);
  }

  if (!cacheEnabled && envConfig.REDIS_REQUIRED) {
    console.error("REDIS_REQUIRED is set but Redis is unavailable. Exiting.");
    process.exit(1);
  }

  app.listen(3000,() => {
    console.log(
      `server is listening on port 3000 (cache: ${cacheEnabled ? "enabled" : "disabled"})`
    );
  })
}

startServer(); 

process.on("SIGINT", () => {
  console.log("Shutting down...");
  process.exit(0);
});


