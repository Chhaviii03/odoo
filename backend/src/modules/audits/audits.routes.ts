import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditsService } from './audits.service.js';
import { createAuditCycleSchema, assignAuditorsSchema, verifyItemSchema } from './audits.validation.js';

export const auditCyclesRouter = Router();
export const auditItemsRouter = Router();

const manager = requireRole('ADMIN', 'ASSET_MANAGER');

auditCyclesRouter.use(requireAuth);
auditCyclesRouter.get('/', asyncHandler(async (_req, res) => res.json(await auditsService.list())));
auditCyclesRouter.post('/', manager, validate(createAuditCycleSchema), asyncHandler(async (req, res) => res.status(201).json(await auditsService.createCycle(req.body, req.user!.sub))));
auditCyclesRouter.post('/:id/assign-auditors', manager, validate(assignAuditorsSchema), asyncHandler(async (req, res) => res.json(await auditsService.assignAuditors(req.params.id, req.body.auditorIds, req.user!.sub))));
auditCyclesRouter.get('/:id/items', asyncHandler(async (req, res) => res.json(await auditsService.listItems(req.params.id))));
auditCyclesRouter.get('/:id/discrepancies', asyncHandler(async (req, res) => res.json(await auditsService.discrepancies(req.params.id))));
auditCyclesRouter.patch('/:id/close', manager, asyncHandler(async (req, res) => res.json(await auditsService.closeCycle(req.params.id, req.user!.sub))));

auditItemsRouter.use(requireAuth);
// Managers or auditors assigned to the cycle may verify (role checked in service).
auditItemsRouter.patch('/:id/verify', validate(verifyItemSchema), asyncHandler(async (req, res) => res.json(await auditsService.verifyItem(req.params.id, req.body, req.user!.sub, req.user!.role))));
