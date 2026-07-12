import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { allocationsService } from './allocations.service.js';
import { createAllocationSchema, returnAllocationSchema, createTransferSchema } from './allocations.validation.js';
import type { AllocationActor } from './allocationAccess.js';

export const allocationsRouter = Router();
export const transfersRouter = Router();

function actorFrom(req: { user?: { sub: string; role: AllocationActor['role']; departmentId: string | null } }): AllocationActor {
  return { id: req.user!.sub, role: req.user!.role, departmentId: req.user!.departmentId };
}

allocationsRouter.use(requireAuth);
allocationsRouter.post('/', requireRole('ADMIN', 'ASSET_MANAGER'), validate(createAllocationSchema), asyncHandler(async (req, res) => res.status(201).json(await allocationsService.allocate(req.body, req.user!.sub))));
allocationsRouter.post('/:id/return', validate(returnAllocationSchema), asyncHandler(async (req, res) => res.json(await allocationsService.returnAllocation(req.params.id, req.body.returnConditionNote, actorFrom(req)))));

transfersRouter.use(requireAuth);
transfersRouter.get('/', asyncHandler(async (req, res) => res.json(await allocationsService.listTransfers(req.query.status as string | undefined, actorFrom(req)))));
transfersRouter.post('/', validate(createTransferSchema), asyncHandler(async (req, res) => res.status(201).json(await allocationsService.createTransfer(req.body, actorFrom(req)))));
transfersRouter.patch('/:id/approve', requireRole('ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'), asyncHandler(async (req, res) => res.json(await allocationsService.approveTransfer(req.params.id, actorFrom(req)))));
transfersRouter.patch('/:id/reject', requireRole('ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'), asyncHandler(async (req, res) => res.json(await allocationsService.rejectTransfer(req.params.id, actorFrom(req)))));
