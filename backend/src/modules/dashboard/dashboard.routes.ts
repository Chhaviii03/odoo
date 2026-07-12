import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

// Single aggregate endpoint for Screen 2's KPI cards + recent activity.
dashboardRouter.get('/kpis', asyncHandler(async (_req, res) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const [available, allocated, maintenanceToday, activeBookings, pendingTransfers, upcomingReturns, overdue, recentActivity] =
    await Promise.all([
      prisma.asset.count({ where: { status: 'AVAILABLE' } }),
      prisma.asset.count({ where: { status: 'ALLOCATED' } }),
      prisma.maintenanceRequest.count({ where: { createdAt: { gte: startOfDay, lt: endOfDay } } }),
      prisma.booking.count({ where: { status: { in: ['UPCOMING', 'ONGOING'] } } }),
      prisma.transferRequest.count({ where: { status: 'REQUESTED' } }),
      prisma.allocation.count({ where: { status: 'ACTIVE', expectedReturnDate: { gte: now } } }),
      prisma.allocation.findMany({
        where: { status: { in: ['ACTIVE', 'OVERDUE'] }, expectedReturnDate: { lt: now } },
        include: { asset: { select: { assetTag: true, name: true } }, employee: { select: { name: true } } },
        take: 20,
      }),
      prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { name: true } } },
      }),
    ]);

  res.json({
    kpis: { available, allocated, maintenanceToday, activeBookings, pendingTransfers, upcomingReturns, overdue: overdue.length },
    overdueReturns: overdue,
    recentActivity,
  });
}));
