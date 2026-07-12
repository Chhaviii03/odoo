import { z } from 'zod';

export const createAssetSchema = z.object({
  name: z.string().min(2),
  categoryId: z.string().uuid(),
  departmentId: z.string().uuid().nullable().optional(),
  serialNumber: z.string().optional(),
  qrCode: z.string().optional(),
  acquisitionDate: z.coerce.date().optional(),
  acquisitionCost: z.coerce.number().nonnegative().optional(),
  condition: z.enum(['Excellent', 'Good', 'Fair', 'Poor']).optional(),
  location: z.string().optional(),
  photoUrl: z.string().optional(),
  documentUrls: z.array(z.string()).optional(),
  isBookable: z.boolean().optional(),
});

export const updateAssetSchema = createAssetSchema.partial();

export const assetFilterSchema = z.object({
  tag: z.string().optional(),
  serial: z.string().optional(),
  qr: z.string().optional(),
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(['AVAILABLE', 'ALLOCATED', 'RESERVED', 'UNDER_MAINTENANCE', 'LOST', 'RETIRED', 'DISPOSED']).optional(),
  departmentId: z.string().uuid().optional(),
  location: z.string().optional(),
  isBookable: z.coerce.boolean().optional(),
});

export const retireSchema = z.object({
  action: z.enum(['RETIRE', 'DISPOSE']),
  reason: z.string().optional(),
});
