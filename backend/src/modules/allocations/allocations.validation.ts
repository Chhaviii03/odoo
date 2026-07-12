import { z } from 'zod';

export const createAllocationSchema = z
  .object({
    assetId: z.string().uuid(),
    employeeId: z.string().uuid().nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    expectedReturnDate: z.coerce.date().nullable().optional(),
  })
  .refine((d) => d.employeeId || d.departmentId, {
    message: 'Allocation must target an employee or a department',
  });

export const returnAllocationSchema = z.object({
  returnConditionNote: z.string().optional(),
});

export const createTransferSchema = z.object({
  assetId: z.string().uuid(),
  toEmployeeId: z.string().uuid().optional(),
  reason: z.string().optional(),
});
