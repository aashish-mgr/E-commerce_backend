import { Request, Response, NextFunction } from "express";
import { ApiError } from "../services/asyncError";
import { envConfig } from "../config/env";

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

/**
 * Whether `err.message` was written for the caller and can be sent back.
 *
 * An ApiError is the only error type in this codebase whose message is authored
 * for that purpose. Everything else - a Sequelize error carrying column names
 * and constraint text, a pg error, a TypeError with a stack - reaches here with
 * whatever text it was constructed with, and that text describes the inside of
 * the server. Returning it used to hand those strings to any caller.
 *
 * The rule is deliberately "only if explicitly marked safe" rather than "unless
 * it looks internal": guessing from the message is how leaks get reintroduced.
 */
const isCallerSafe = (err: unknown): boolean => err instanceof ApiError;

export const notFound = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // An ApiError so the text survives the caller-safe rule above. The path and
  // method were sent by the client, so this reflects nothing back they did not
  // already know.
  next(new ApiError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
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

  const callerSafe = isCallerSafe(err);

  // Anything whose message is being withheld is logged, whatever the status.
  // A 4xx that reached here unmarked is a mislabelled failure, and a 5xx is
  // always worth a trace even when the text is safe to show.
  if (statusCode >= 500 || !callerSafe) {
    console.error(`${req.method} ${req.originalUrl} -> ${statusCode}`, err);
  }

  const message = callerSafe
    ? err.message
    : dependencyDown
      ? "Service temporarily unavailable, please retry"
      : "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    // `message` is the only field the frontend reads. There is deliberately no
    // longer a second field carrying the raw text: that was a second leak that
    // existed for no consumer, and it sat next to a sanitized message so it
    // read as deliberate.
    message,
    // The stack carries file paths and internals, so it is confined to local
    // development. NODE_ENV comes from the validated config rather than
    // process.env directly, so an unset variable cannot silently expose it.
    ...(envConfig.NODE_ENV === "development" ? { stack: err?.stack } : {}),
  });
};
