import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { ApiError } from '../lib/errors.js';

type Source = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      // Store parsed/coerced values without reassigning read-only req.query.
      (req as any)[`validated_${source}`] = parsed;
      if (source === 'body') req.body = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        throw ApiError.badRequest('Validation failed', err.flatten());
      }
      throw err;
    }
  };
}

export function validated<T>(req: Request, source: Source = 'body'): T {
  return (req as any)[`validated_${source}`] as T;
}
