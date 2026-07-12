import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { signAccessToken, signRefreshToken, type JwtPayload } from '../../lib/jwt.js';
import { env } from '../../config/env.js';
import { isSmtpConfigured, sendPasswordResetEmail } from '../../lib/mailer.js';
import { logActivity } from '../../shared/activityLog.js';
import type { SignupInput, LoginInput } from './auth.validation.js';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function toPayload(user: { id: string; email: string; role: any; departmentId: string | null }): JwtPayload {
  return { sub: user.id, email: user.email, role: user.role, departmentId: user.departmentId };
}

function publicUser(user: any) {
  const { passwordHash, ...rest } = user;
  return rest;
}

function hashResetToken(rawToken: string) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export const authService = {
  // Signup ALWAYS creates an EMPLOYEE. Roles are only assigned by an Admin later.
  async signup(input: SignupInput) {
    const existing = await prisma.employee.findUnique({ where: { email: input.email } });
    if (existing) throw ApiError.conflict('An account with this email already exists');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.employee.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: 'EMPLOYEE',
        departmentId: input.departmentId ?? null,
      },
    });

    await logActivity({ userId: user.id, action: 'AUTH_SIGNUP', entityType: 'Employee', entityId: user.id });
    return this.issueTokens(user);
  },

  async login(input: LoginInput) {
    const user = await prisma.employee.findUnique({ where: { email: input.email } });
    if (!user) throw ApiError.unauthorized('Invalid credentials');
    if (user.status === 'INACTIVE') throw ApiError.forbidden('Account is inactive');

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw ApiError.unauthorized('Invalid credentials');

    await logActivity({ userId: user.id, action: 'AUTH_LOGIN', entityType: 'Employee', entityId: user.id });
    return this.issueTokens(user);
  },

  issueTokens(user: any) {
    const payload = toPayload(user);
    return {
      user: publicUser(user),
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
    };
  },

  async me(userId: string) {
    const user = await prisma.employee.findUnique({
      where: { id: userId },
      include: { department: true },
    });
    if (!user) throw ApiError.notFound('User not found');
    return publicUser(user);
  },

  /**
   * Always returns a generic payload to the client (no account enumeration).
   * Creates a one-time token and emails a reset link when the account exists.
   */
  async forgotPassword(email: string) {
    const generic = { ok: true as const, message: 'If an account exists, a reset link has been sent.' };
    const user = await prisma.employee.findUnique({ where: { email } });
    if (!user || user.status === 'INACTIVE') return generic;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const resetUrl = `${env.frontendUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;

    try {
      if (isSmtpConfigured()) {
        await sendPasswordResetEmail(user.email, resetUrl);
      } else if (env.smtpDevReturnLink) {
        console.warn('[auth] SMTP not configured — returning reset link for local testing');
        return { ...generic, resetUrl };
      } else {
        console.warn('[auth] SMTP not configured — password reset email was not sent. Set SMTP_USER/SMTP_PASS or SMTP_DEV_RETURN_LINK=true');
      }
    } catch (err) {
      console.error('[auth] Failed to send password reset email', err);
    }

    return generic;
  },

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = hashResetToken(token);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw ApiError.badRequest('Invalid or expired reset link');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.employee.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null, id: { not: record.id } },
        data: { usedAt: new Date() },
      }),
    ]);

    await logActivity({
      userId: record.userId,
      action: 'AUTH_RESET_PASSWORD',
      entityType: 'Employee',
      entityId: record.userId,
    });

    return { ok: true, message: 'Password updated. You can log in with your new password.' };
  },
};
