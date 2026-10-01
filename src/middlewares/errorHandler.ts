import { Request, Response, NextFunction } from "express";

/**
 * Codes that mean a dependency (Postgres, Redis, an upstream API) was
 * unreachable rather than the request being wrong. These are retryable, so
 * they get a 503 instead of a 500 that clients treat as permanent.
 */
const DEPENDENCY_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
]);

const isDependencyUnavailable = (err: any): boolean => {
  const name = err?.name;
  if (name === "ClientClosedError" || name === "SocketClosedUnexpectedlyError") {
    return true;
  }
  if (typeof err?.code === "string" && DEPENDENCY_ERROR_CODES.has(err.code)) {
    return true;
  }
  // node-redis wraps a refused connection in an AggregateError, whose own
  // `code` is only sometimes set and whose `errors` hold the real codes.
  const nested = err?.errors;
  if (Array.isArray(nested)) {
    return nested.some(
      (inner: any) =>
        typeof inner?.code === "string" && DEPENDENCY_ERROR_CODES.has(inner.code)
    );
  }
  return false;
};

export const notFound = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  (err as any).statusCode = 404;
  next(err);
};

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Once a response has begun streaming there is no way to replace the status
  // line, so hand off to Express to destroy the socket instead of throwing
  // ERR_HTTP_HEADERS_SENT from inside this handler.
  if (res.headersSent) {
    return next(err);
  }

  const dependencyDown = isDependencyUnavailable(err);
  const statusCode = dependencyDown
    ? 503
    : err?.statusCode >= 400
      ? err.statusCode
      : 500;

  if (statusCode >= 500) {
    console.error(`${req.method} ${req.originalUrl} -> ${statusCode}`, err);
  }

  res.status(statusCode).json({
    success: false,
    message:
      err?.message ||
      (dependencyDown
        ? "Service temporarily unavailable, please retry"
        : "Internal Server Error"),
    ...(process.env.NODE_ENV === "development" ? { stack: err?.stack } : {}),
  });
};
