import { Request, Response, NextFunction } from "express";

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

const handleError = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch((err: Error) => {
      const statusCode =
        err instanceof ApiError ? err.statusCode : 500;
      console.error(err);

      // An ApiError carries a message meant for the caller, so it goes in
      // `message` where the frontend reads it. Everything else keeps the generic
      // text and stays in `errorMsg`, since an unexpected exception's message can
      // contain internals that should not be sent to a client.
      const isApiError = err instanceof ApiError;

      return res.status(statusCode).json({
        message: isApiError ? err.message : "Error occured",
        errorMsg: err.message,
      });
    });
  };
};

export default handleError;