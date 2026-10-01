import { Request, Response, NextFunction } from "express";
import { isUuid } from "../utils/isUuid";

// Every primary key here is a uuid column, so a non-uuid path segment reaches
// postgres as `invalid input syntax for type uuid` and surfaces as a 500. The
// controllers' own `if (!id)` checks cannot catch this, since a garbage string is
// still truthy. Validating at the route keeps that detail in one place and stops
// the request before any query is built.
const validateUuidParam =
  (...paramNames: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    for (const name of paramNames) {
      if (!isUuid(req.params[name])) {
        return res.status(400).json({
          message: `invalid ${name}: must be a valid uuid`,
        });
      }
    }

    next();
  };

export default validateUuidParam;
