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
      return res.status(statusCode).json({
        message: "Error occured",
        errorMsg: err.message,
      });
    });
  };
};

export default handleError;