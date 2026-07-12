import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { maintenanceService } from './maintenance.service.js';
import { createMaintenanceSchema, assignTechnicianSchema, resolveSchema } from './maintenance.validation.js';

export const maintenanceRouter = Router();

maintenanceRouter.use(requireAuth);
maintenanceRouter.get('/', asyncHandler(async (req, res) => res.json(await maintenanceService.list(req.query.status as string | undefined))));
maintenanceRouter.post('/', validate(createMaintenanceSchema), asyncHandler(async (req, res) => res.status(201).json(await maintenanceService.create(req.body, req.user!.sub))));

const approver = requireRole('ADMIN', 'ASSET_MANAGER');
maintenanceRouter.patch('/:id/approve', approver, asyncHandler(async (req, res) => res.json(await maintenanceService.approve(req.params.id, req.user!.sub))));
maintenanceRouter.patch('/:id/reject', approver, asyncHandler(async (req, res) => res.json(await maintenanceService.reject(req.params.id, req.user!.sub))));
maintenanceRouter.patch('/:id/assign-technician', approver, validate(assignTechnicianSchema), asyncHandler(async (req, res) => res.json(await maintenanceService.assignTechnician(req.params.id, req.body.technicianName, req.user!.sub))));
maintenanceRouter.patch('/:id/start', approver, asyncHandler(async (req, res) => res.json(await maintenanceService.start(req.params.id, req.user!.sub))));
maintenanceRouter.patch('/:id/resolve', approver, validate(resolveSchema), asyncHandler(async (req, res) => res.json(await maintenanceService.resolve(req.params.id, req.body.notes, req.user!.sub))));
