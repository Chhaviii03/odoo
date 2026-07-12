import { z } from 'zod';

const futureSlot = <T extends { startTime: Date; endTime: Date }>(schema: z.ZodType<T>) =>
  schema
    .refine((d) => d.endTime > d.startTime, { message: 'endTime must be after startTime' })
    .refine((d) => d.startTime.getTime() >= Date.now(), {
      message: 'Cannot book a past time slot',
      path: ['startTime'],
    });

export const createBookingSchema = futureSlot(
  z.object({
    assetId: z.string().uuid(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    departmentId: z.string().uuid().nullable().optional(),
  }),
);

export const rescheduleSchema = futureSlot(
  z.object({
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
  }),
);