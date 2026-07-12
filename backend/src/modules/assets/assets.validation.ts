import { z } from 'zod';

const emptyToUndefined = (val: unknown) => {
  if (val === '' || val === null || val === undefined) return undefined;
  if (typeof val === 'string') return val.trim() === '' ? undefined : val.trim();
  return val;
};

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

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
  // Comma-separated values supported for multi-filter chips, e.g. tag=AF-0001,AF-0002
  tag: optionalString,
  serial: optionalString,
  qr: optionalString,
  search: optionalString,
  categoryId: optionalString, // uuid or comma-separated uuids
  status: optionalString, // enum or comma-separated enums
  departmentId: optionalString,
  location: optionalString,
  isBookable: z.preprocess(emptyToUndefined, z.coerce.boolean().optional()),
});

export const retireSchema = z.object({
  action: z.enum(['RETIRE', 'DISPOSE']),
  reason: z.string().optional(),
});
