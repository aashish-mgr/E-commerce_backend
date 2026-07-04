import { Request, Response, NextFunction } from "express";

const handleError = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch((err: Error) => {
      console.error(err);
      return res.status(500).json({
        
        message: "Error occured",
        errorMsg: err.message,
      });
    });
  };
};

export default handleError;
