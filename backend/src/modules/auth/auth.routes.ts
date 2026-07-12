import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { verifyRefreshToken, signAccessToken, signRefreshToken } from '../../lib/jwt.js';
import { ApiError } from '../../lib/errors.js';
import { authService } from './auth.service.js';
import {
  signupSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validation.js';

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

export const authRouter = Router();

authRouter.post(
  '/signup',
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.signup(req.body);
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.json(result);
  }),
);

authRouter.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    try {
      const payload = verifyRefreshToken(req.body.refreshToken);
      const fresh = { sub: payload.sub, email: payload.email, role: payload.role, departmentId: payload.departmentId };
      res.json({ accessToken: signAccessToken(fresh), refreshToken: signRefreshToken(fresh) });
    } catch {
      throw ApiError.unauthorized('Invalid refresh token');
    }
  }),
);

authRouter.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(async (_req, res) => {
    // Always 200 to avoid account enumeration.
    res.json({ ok: true, message: 'If an account exists, a reset link has been sent.' });
  }),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(req.body.email, req.body.newPassword);
    res.json(result);
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await authService.me(req.user!.sub));
  }),
);
