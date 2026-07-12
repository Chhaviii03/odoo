import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { signAccessToken, signRefreshToken, type JwtPayload } from '../../lib/jwt.js';
import { logActivity } from '../../shared/activityLog.js';
import type { SignupInput, LoginInput } from './auth.validation.js';

function toPayload(user: { id: string; email: string; role: any; departmentId: string | null }): JwtPayload {
  return { sub: user.id, email: user.email, role: user.role, departmentId: user.departmentId };
}

function publicUser(user: any) {
  const { passwordHash, ...rest } = user;
  return rest;
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

  // Demo-grade reset (no email delivery). Rate-limited at the route level.
  async resetPassword(email: string, newPassword: string) {
    const user = await prisma.employee.findUnique({ where: { email } });
    if (!user) throw ApiError.notFound('No account with that email');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.employee.update({ where: { id: user.id }, data: { passwordHash } });
    await logActivity({ userId: user.id, action: 'AUTH_RESET_PASSWORD', entityType: 'Employee', entityId: user.id });
    return { ok: true };
  },
};
