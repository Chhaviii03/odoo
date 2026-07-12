import cron from 'node-cron';
import { prisma } from './prisma.js';
import { notify } from '../shared/notifications.js';

// Send a one-time booking reminder for every UPCOMING booking starting within
// `leadMs`. Deduped per (booking, type) so repeated scans never re-notify.
async function sendBookingReminders(opts: {
  now: Date;
  leadMs: number;
  type: string;
  message: (assetTag: string) => string;
}) {
  const windowEnd = new Date(opts.now.getTime() + opts.leadMs);
  const due = await prisma.booking.findMany({
    where: { status: 'UPCOMING', startTime: { gte: opts.now, lte: windowEnd } },
    include: { asset: { select: { assetTag: true, name: true } } },
  });
  for (const b of due) {
    const alreadyReminded = await prisma.notification.findFirst({
      where: { userId: b.bookedById, type: opts.type, relatedEntityId: b.id },
      select: { id: true },
    });
    if (alreadyReminded) continue;
    await notify({
      userId: b.bookedById,
      type: opts.type,
      message: opts.message(b.asset.assetTag),
      relatedEntityType: 'Booking',
      relatedEntityId: b.id,
    });
  }
}

// 4.7 Overdue detection + booking status transitions. Runs every 5 minutes.
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
  }

  // Booking reminders. Each tier is deduped by its own notification type so a
  // booking gets at most one "starts soon" (~1h) and one "starts in 10 min"
  // reminder, no matter how often this scan runs or how many times the server boots.
  await sendBookingReminders({
    now,
    leadMs: 60 * 60 * 1000,
    type: 'BOOKING_REMINDER',
    message: (tag) => `Reminder: your booking for ${tag} starts soon.`,
  });
  await sendBookingReminders({
    now,
    leadMs: 10 * 60 * 1000,
    type: 'BOOKING_REMINDER_10MIN',
    message: (tag) => `Your booking for ${tag} starts in 10 minutes.`,
  });

  // Booking status transitions.
  await prisma.booking.updateMany({ where: { status: 'UPCOMING', startTime: { lte: now } }, data: { status: 'ONGOING' } });
  await prisma.booking.updateMany({ where: { status: 'ONGOING', endTime: { lte: now } }, data: { status: 'COMPLETED' } });
}

export function startCron() {
  // Every 5 minutes so the 10-minute reminder lands ~5–10 min before start.
  cron.schedule('*/5 * * * *', () => {
    runScheduledScans().catch((err) => console.error('[cron] scan failed', err));
  });
  // Kick off once on boot so the dashboard is fresh immediately.
  runScheduledScans().catch((err) => console.error('[cron] initial scan failed', err));
}
