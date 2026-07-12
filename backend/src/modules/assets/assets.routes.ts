import { Router, type Request } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate, validated } from '../../middleware/validate.js';
import { assetsService, type AssetViewer } from './assets.service.js';
import { allocationsService } from '../allocations/allocations.service.js';
import { bookingsService } from '../bookings/bookings.service.js';
import { createAssetSchema, updateAssetSchema, assetFilterSchema, retireSchema } from './assets.validation.js';

export const assetsRouter = Router();

assetsRouter.use(requireAuth);

function viewerFrom(req: Request): AssetViewer {
  const u = req.user!;
  return { sub: u.sub, role: u.role, departmentId: u.departmentId };
}

// List + facets FIRST so they are never swallowed by /:id
assetsRouter.get(
  '/',
  validate(assetFilterSchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await assetsService.list(validated(req, 'query'), viewerFrom(req)));
  }),
);

assetsRouter.get(
  '/filter-options',
  asyncHandler(async (req, res) => {
    res.json(await assetsService.filterOptions(viewerFrom(req)));
  }),
);

assetsRouter.post(
  '/',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate(createAssetSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await assetsService.create(req.body, req.user!.sub));
  }),
);

assetsRouter.get(
  '/:id/allocations',
  asyncHandler(async (req, res) => {
    await assetsService.ensureVisible(req.params.id, viewerFrom(req));
    res.json(await allocationsService.listForAsset(req.params.id));
  }),
);
assetsRouter.get(
  '/:id/bookings',
  asyncHandler(async (req, res) => {
    await assetsService.ensureVisible(req.params.id, viewerFrom(req));
    res.json(await bookingsService.listForAsset(req.params.id));
  }),
);
assetsRouter.get(
  '/:id/history',
  asyncHandler(async (req, res) => res.json(await assetsService.history(req.params.id, viewerFrom(req)))),
);
assetsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => res.json(await assetsService.get(req.params.id, viewerFrom(req)))),
);

assetsRouter.patch(
  '/:id',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate(updateAssetSchema),
  asyncHandler(async (req, res) => res.json(await assetsService.update(req.params.id, req.body, req.user!.sub))),
);

assetsRouter.patch(
  '/:id/retire',
  requireRole('ADMIN', 'ASSET_MANAGER'),
  validate(retireSchema),
  asyncHandler(async (req, res) => res.json(await assetsService.retireOrDispose(req.params.id, req.body.action, req.body.reason, req.user!.sub))),
);
