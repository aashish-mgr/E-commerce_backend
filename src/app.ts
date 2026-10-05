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
import helmet from 'helmet';
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

// Security headers. Helmet's defaults are on, with two deliberate overrides:
// 'unsafe-inline' in style-src because React inline styles and Tailwind both
// set style attributes, and a wildcard on connect-src so the browser can reach
// the API wherever it is deployed. script-src stays 'self', which is what
// actually blocks injected inline script. Tighten connect-src to the API origin
// once the deployment domain is fixed.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", "https:"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    // HSTS is only honoured over HTTPS and is ignored over plain HTTP, which is
    // what local development runs on, so leaving it on does not break dev.
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    crossOriginEmbedderPolicy: false,
  }),
);

app.use (cors( {
    // Derived from CLIENT_URL so the deployed domain is not served a hardcoded
    // localhost allowlist. Compared without a trailing slash because that is
    // the form a browser sends in Origin.
    origin: (origin, callback) => {
      // No Origin header means a non-browser client (curl, health check,
      // server-to-server). Those carry no ambient cookies, so CORS is not the
      // control that protects them.
      if (!origin) return callback(null, true);
      callback(null, envConfig.CLIENT_ORIGINS.includes(origin));
    },
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

  const port = envConfig.PORT;

  // Transport settings only, never a secret. These four decide whether auth
  // cookies work at all and nothing about them is visible in a failed request:
  // a cookie silently withheld by SameSite or Secure looks identical on the
  // server to a user who simply never logged in. Logging the resolved values
  // makes that failure readable from the deploy log.
  console.log(
    `transport: nodeEnv=${envConfig.NODE_ENV} cookieSecure=${envConfig.COOKIE_SECURE} ` +
      `sameSite=${envConfig.COOKIE_SECURE ? "none" : "lax"} ` +
      `clientOrigins=${envConfig.CLIENT_ORIGINS.join(",")} ` +
      `dbSsl=${envConfig.DB_SSL_MODE}`,
  );

  app.listen(port,() => {
    console.log(
      `server is listening on port ${port} (cache: ${cacheEnabled ? "enabled" : "disabled"})`
    );
  })
}

startServer(); 

process.on("SIGINT", () => {
  console.log("Shutting down...");
  process.exit(0);
});


