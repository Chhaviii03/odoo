import type { Prisma } from '@prisma/client';

/**
 * Half-open interval overlap: [start, end).
 *
 *   conflict = existing.start < new.end AND existing.end > new.start
 *
 * A 10:00–11:00 request immediately after a 9:00–10:00 booking does NOT conflict
 * (strict inequality), matching the spec example exactly.
 */
export async function findBookingConflict(
  tx: Prisma.TransactionClient,
  params: { assetId: string; startTime: Date; endTime: Date; excludeBookingId?: string },
) {
  return tx.booking.findFirst({
    where: {
      assetId: params.assetId,
      id: params.excludeBookingId ? { not: params.excludeBookingId } : undefined,
      status: { in: ['UPCOMING', 'ONGOING'] },
      startTime: { lt: params.endTime },
      endTime: { gt: params.startTime },
    },
    include: { bookedBy: { select: { id: true, name: true } } },
  });
}
