import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { findBookingConflict } from '../../shared/overlapCheck.js';
import { logActivity } from '../../shared/activityLog.js';
import { notify } from '../../shared/notifications.js';

export const bookingsService = {
  listForAsset(assetId: string) {
    return prisma.booking.findMany({
      where: { assetId },
      orderBy: { startTime: 'asc' },
      include: { bookedBy: { select: { id: true, name: true } } },
    });
  },

  listMine(userId: string) {
    return prisma.booking.findMany({
      where: { bookedById: userId },
      orderBy: { startTime: 'asc' },
      include: { asset: { select: { id: true, assetTag: true, name: true } } },
    });
  },

  // 4.3 Booking overlap validation
  async create(input: any, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id: input.assetId } });
      if (!asset) throw ApiError.notFound('Asset not found');
      if (!asset.isBookable) throw ApiError.badRequest('Asset is not bookable');
      if (input.startTime.getTime() < Date.now()) {
        throw ApiError.badRequest('Cannot book a past time slot');
      }

      const conflict = await findBookingConflict(tx, {
        assetId: input.assetId,
        startTime: input.startTime,
        endTime: input.endTime,
      });
      if (conflict) {
        throw ApiError.conflict('This time slot overlaps an existing booking', {
          conflictingBooking: {
            id: conflict.id,
            startTime: conflict.startTime,
            endTime: conflict.endTime,
            bookedBy: conflict.bookedBy?.name,
          },
        });
      }

      const booking = await tx.booking.create({
        data: {
          assetId: input.assetId,
          bookedById: actorId,
          departmentId: input.departmentId ?? null,
          startTime: input.startTime,
          endTime: input.endTime,
          status: 'UPCOMING',
        },
      });
      await logActivity({ userId: actorId, action: 'BOOKING_CREATE', entityType: 'Booking', entityId: booking.id, metadata: { assetId: input.assetId } });
      await notify({ userId: actorId, type: 'BOOKING_CONFIRMED', message: `Booking confirmed for ${asset.assetTag} (${asset.name}).`, relatedEntityType: 'Booking', relatedEntityId: booking.id });
      return booking;
    });
  },

  async cancel(id: string, actorId: string) {
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) throw ApiError.notFound('Booking not found');
    if (['COMPLETED', 'CANCELLED'].includes(booking.status)) throw ApiError.badRequest('Booking cannot be cancelled');
    const updated = await prisma.booking.update({ where: { id }, data: { status: 'CANCELLED' } });
    await logActivity({ userId: actorId, action: 'BOOKING_CANCEL', entityType: 'Booking', entityId: id });
    await notify({ userId: booking.bookedById, type: 'BOOKING_CANCELLED', message: 'Your booking was cancelled.', relatedEntityType: 'Booking', relatedEntityId: id });
    return updated;
  },

  async reschedule(id: string, input: any, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id } });
      if (!booking) throw ApiError.notFound('Booking not found');
      if (['COMPLETED', 'CANCELLED'].includes(booking.status)) throw ApiError.badRequest('Booking cannot be rescheduled');
      if (input.startTime.getTime() < Date.now()) {
        throw ApiError.badRequest('Cannot reschedule to a past time slot');
      }

      const conflict = await findBookingConflict(tx, {
        assetId: booking.assetId,
        startTime: input.startTime,
        endTime: input.endTime,
        excludeBookingId: id,
      });
      if (conflict) throw ApiError.conflict('The new time slot overlaps an existing booking');

      const updated = await tx.booking.update({
        where: { id },
        data: { startTime: input.startTime, endTime: input.endTime, status: 'UPCOMING' },
      });
      await logActivity({ userId: actorId, action: 'BOOKING_RESCHEDULE', entityType: 'Booking', entityId: id });
      return updated;
    });
  },
};
