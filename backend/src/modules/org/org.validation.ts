import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().min(2),
  headId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export const statusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });

export const createCategorySchema = z.object({
  name: z.string().min(2),
  customFields: z.record(z.any()).nullable().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const updateRoleSchema = z.object({
  role: z.enum(['EMPLOYEE', 'DEPARTMENT_HEAD', 'ASSET_MANAGER', 'ADMIN']),
});

export const updateEmployeeSchema = z.object({
  name: z.string().min(2).optional(),
  departmentId: z.string().uuid().nullable().optional(),
});
