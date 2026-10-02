import { NextFunction, Request, Response } from "express";

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

/**
 * `any` for req and res on purpose: handlers are declared against their own
 * request subtypes (AuthRequest and friends), and a narrower parameter type here
 * would reject all of them under strictFunctionTypes for no runtime benefit.
 * The wrapper forwards without ever inspecting either value.
 */
type AsyncController = (req: any, res: any, next: NextFunction) => unknown;

/**
 * Hands a rejected controller to the shared errorHandler instead of answering
 * the request itself.
 *
 * This used to catch, then respond inline with a status code derived only from
 * whether the error was an ApiError. That put two error paths in the codebase:
 * this one, and errorHandler. They disagreed on status codes - a database or
 * cache that was unreachable was reported here as a 500 even though
 * errorHandler already knows to call that a retryable 503 - and it skipped
 * errorHandler's development-only stack and its 5xx logging entirely. Errors
 * now take one route.
 *
 * Awaiting rather than attaching .catch also covers a handler that throws
 * synchronously before returning a promise, which the old form let escape the
 * wrapper.
 */
const handleError = (fn: AsyncController) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };

export default handleError;
