import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { ApiError } from '../lib/errors.js';

/**
 * Route-level role guard. Keep the capability→role mapping in permissions.ts so it
 * stays auditable rather than scattered across route files.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden(`Requires one of role: ${roles.join(', ')}`);
    }
    next();
  };
}
