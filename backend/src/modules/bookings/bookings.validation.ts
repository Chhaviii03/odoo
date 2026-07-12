import { z } from 'zod';

export const createBookingSchema = z
  .object({
    assetId: z.string().uuid(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    departmentId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => d.endTime > d.startTime, { message: 'endTime must be after startTime' });

export const rescheduleSchema = z
  .object({
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
  })
  .refine((d) => d.endTime > d.startTime, { message: 'endTime must be after startTime' });
