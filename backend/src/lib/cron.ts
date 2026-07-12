import cron from 'node-cron';
import { prisma } from './prisma.js';
import { notify } from '../shared/notifications.js';

// 4.7 Overdue detection + booking status transitions. Runs every 15 minutes.
export async function runScheduledScans() {
  const now = new Date();

  // Allocations past their expected return date → OVERDUE + notify holder.
  const overdue = await prisma.allocation.findMany({
    where: { status: 'ACTIVE', expectedReturnDate: { lt: now } },
    include: { asset: { select: { assetTag: true, name: true } } },
  });
  for (const alloc of overdue) {
    await prisma.allocation.update({ where: { id: alloc.id }, data: { status: 'OVERDUE' } });
    if (alloc.employeeId) {
      await notify({
        userId: alloc.employeeId,
        type: 'OVERDUE_RETURN',
        message: `Return overdue: ${alloc.asset.assetTag} (${alloc.asset.name}).`,
        relatedEntityType: 'Allocation',
        relatedEntityId: alloc.id,
      });
    }
    const managers = await prisma.employee.findMany({
      where: { role: { in: ['ADMIN', 'ASSET_MANAGER'] }, status: 'ACTIVE' },
      select: { id: true },
    });
    for (const m of managers) {
      await notify({
        userId: m.id,
        type: 'OVERDUE_RETURN',
        message: `Overdue return: ${alloc.asset.assetTag} held by ${alloc.employeeId ? 'employee' : 'department'}.`,
        relatedEntityType: 'Allocation',
        relatedEntityId: alloc.id,
      });
    }
  }

  // Booking reminders: starting within the next hour.
  const reminderWindow = new Date(now.getTime() + 60 * 60 * 1000);
  const soon = await prisma.booking.findMany({
    where: { status: 'UPCOMING', startTime: { gte: now, lte: reminderWindow } },
    include: { asset: { select: { assetTag: true, name: true } } },
  });
  for (const b of soon) {
    await notify({
      userId: b.bookedById,
      type: 'BOOKING_REMINDER',
      message: `Reminder: your booking for ${b.asset.assetTag} starts soon.`,
      relatedEntityType: 'Booking',
      relatedEntityId: b.id,
    });
  }

  // Booking status transitions.
  await prisma.booking.updateMany({ where: { status: 'UPCOMING', startTime: { lte: now } }, data: { status: 'ONGOING' } });
  await prisma.booking.updateMany({ where: { status: 'ONGOING', endTime: { lte: now } }, data: { status: 'COMPLETED' } });
}

export function startCron() {
  cron.schedule('*/15 * * * *', () => {
    runScheduledScans().catch((err) => console.error('[cron] scan failed', err));
  });
  // Kick off once on boot so the dashboard is fresh immediately.
  runScheduledScans().catch((err) => console.error('[cron] initial scan failed', err));
}
