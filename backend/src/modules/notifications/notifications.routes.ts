import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { prisma } from '../../lib/prisma.js';

export const notificationsRouter = Router();
export const activityLogsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get('/', asyncHandler(async (req, res) => {
  const items = await prisma.notification.findMany({
    where: { userId: req.user!.sub },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(items);
}));
notificationsRouter.patch('/:id/read', asyncHandler(async (req, res) => {
  const notif = await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.sub }, data: { isRead: true } });
  res.json({ updated: notif.count });
}));
notificationsRouter.patch('/read-all', asyncHandler(async (req, res) => {
  const notif = await prisma.notification.updateMany({ where: { userId: req.user!.sub, isRead: false }, data: { isRead: true } });
  res.json({ updated: notif.count });
}));

activityLogsRouter.use(requireAuth, requireRole('ADMIN', 'ASSET_MANAGER'));
activityLogsRouter.get('/', asyncHandler(async (req, res) => {
  const { userId, entityType, from, to } = req.query as Record<string, string | undefined>;
  const items = await prisma.activityLog.findMany({
    where: {
      userId: userId || undefined,
      entityType: entityType || undefined,
      createdAt: from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { id: true, name: true, role: true } } },
  });
  res.json(items);
}));
