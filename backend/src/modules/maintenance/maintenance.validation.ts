import { z } from 'zod';

export const createMaintenanceSchema = z.object({
  assetId: z.string().uuid(),
  issue: z.string().min(3),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  photoUrl: z.string().optional(),
});

export const assignTechnicianSchema = z.object({
  technicianName: z.string().min(2),
});

export const resolveSchema = z.object({
  notes: z.string().optional(),
});
