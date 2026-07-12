import { z } from 'zod';

export const createAuditCycleSchema = z
  .object({
    name: z.string().min(2),
    scopeDepartmentId: z.string().uuid().nullable().optional(),
    scopeLocation: z.string().nullable().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    auditorIds: z.array(z.string().uuid()).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, { message: 'endDate must be after startDate' });

export const assignAuditorsSchema = z.object({
  auditorIds: z.array(z.string().uuid()).min(1),
});

export const verifyItemSchema = z.object({
  verificationStatus: z.enum(['VERIFIED', 'MISSING', 'DAMAGED']),
  notes: z.string().optional(),
});
