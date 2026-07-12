import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { reportsService } from './reports.service.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole('ADMIN', 'ASSET_MANAGER'));

reportsRouter.get('/utilization', asyncHandler(async (_req, res) => res.json(await reportsService.utilization())));
reportsRouter.get('/maintenance-frequency', asyncHandler(async (_req, res) => res.json(await reportsService.maintenanceFrequency())));
reportsRouter.get('/upcoming-maintenance', asyncHandler(async (_req, res) => res.json(await reportsService.upcomingMaintenance())));
reportsRouter.get('/department-allocation', asyncHandler(async (_req, res) => res.json(await reportsService.byDepartment())));
reportsRouter.get('/booking-heatmap', asyncHandler(async (_req, res) => res.json(await reportsService.bookingHeatmap())));
reportsRouter.get('/export', asyncHandler(async (req, res) => {
  const csv = await reportsService.exportCsv();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="assetflow-assets.csv"');
  res.send(csv);
}));
