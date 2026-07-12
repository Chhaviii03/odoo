import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { transitionAsset } from '../../shared/assetStateMachine.js';
import { logActivity } from '../../shared/activityLog.js';
import { notify } from '../../shared/notifications.js';

export const maintenanceService = {
  list(status?: string) {
    return prisma.maintenanceRequest.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        asset: { select: { id: true, assetTag: true, name: true } },
        raisedBy: { select: { id: true, name: true } },
      },
    });
  },

  async create(input: any, actorId: string) {
    const asset = await prisma.asset.findUnique({ where: { id: input.assetId } });
    if (!asset) throw ApiError.notFound('Asset not found');
    const req = await prisma.maintenanceRequest.create({
      data: {
        assetId: input.assetId,
        raisedById: actorId,
        issue: input.issue,
        priority: input.priority ?? 'MEDIUM',
        photoUrl: input.photoUrl,
        status: 'PENDING',
      },
    });
    await logActivity({ userId: actorId, action: 'MAINTENANCE_RAISE', entityType: 'MaintenanceRequest', entityId: req.id, metadata: { assetId: input.assetId } });
    return req;
  },

  // 4.5 Maintenance workflow. Asset flips to UNDER_MAINTENANCE only on approval.
  async approve(id: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const req = await tx.maintenanceRequest.findUnique({ where: { id } });
      if (!req) throw ApiError.notFound('Maintenance request not found');
      if (req.status !== 'PENDING') throw ApiError.badRequest('Only pending requests can be approved');

      const updated = await tx.maintenanceRequest.update({ where: { id }, data: { status: 'APPROVED', approvedById: actorId } });
      await transitionAsset(tx, { assetId: req.assetId, to: 'UNDER_MAINTENANCE', changedById: actorId, reason: 'Maintenance approved' });
      await logActivity({ userId: actorId, action: 'MAINTENANCE_APPROVE', entityType: 'MaintenanceRequest', entityId: id });
      await notify({ userId: req.raisedById, type: 'MAINTENANCE_APPROVED', message: 'Your maintenance request was approved.', relatedEntityType: 'MaintenanceRequest', relatedEntityId: id });
      return updated;
    });
  },

  async reject(id: string, actorId: string) {
    const req = await prisma.maintenanceRequest.findUnique({ where: { id } });
    if (!req) throw ApiError.notFound('Maintenance request not found');
    if (req.status !== 'PENDING') throw ApiError.badRequest('Only pending requests can be rejected');
    const updated = await prisma.maintenanceRequest.update({ where: { id }, data: { status: 'REJECTED', approvedById: actorId } });
    await logActivity({ userId: actorId, action: 'MAINTENANCE_REJECT', entityType: 'MaintenanceRequest', entityId: id });
    await notify({ userId: req.raisedById, type: 'MAINTENANCE_REJECTED', message: 'Your maintenance request was rejected.', relatedEntityType: 'MaintenanceRequest', relatedEntityId: id });
    return updated;
  },

  async assignTechnician(id: string, technicianName: string, actorId: string) {
    const req = await prisma.maintenanceRequest.findUnique({ where: { id } });
    if (!req) throw ApiError.notFound('Maintenance request not found');
    if (req.status !== 'APPROVED') throw ApiError.badRequest('Request must be approved before assigning a technician');
    const updated = await prisma.maintenanceRequest.update({ where: { id }, data: { status: 'TECHNICIAN_ASSIGNED', technicianName } });
    await logActivity({ userId: actorId, action: 'MAINTENANCE_ASSIGN', entityType: 'MaintenanceRequest', entityId: id, metadata: { technicianName } });
    return updated;
  },

  async start(id: string, actorId: string) {
    const req = await prisma.maintenanceRequest.findUnique({ where: { id } });
    if (!req) throw ApiError.notFound('Maintenance request not found');
    if (req.status !== 'TECHNICIAN_ASSIGNED') throw ApiError.badRequest('A technician must be assigned before work starts');
    const updated = await prisma.maintenanceRequest.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
    await logActivity({ userId: actorId, action: 'MAINTENANCE_START', entityType: 'MaintenanceRequest', entityId: id });
    return updated;
  },

  async resolve(id: string, notes: string | undefined, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const req = await tx.maintenanceRequest.findUnique({ where: { id } });
      if (!req) throw ApiError.notFound('Maintenance request not found');
      if (!['IN_PROGRESS', 'TECHNICIAN_ASSIGNED', 'APPROVED'].includes(req.status)) {
        throw ApiError.badRequest('Request is not in a resolvable state');
      }
      const updated = await tx.maintenanceRequest.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
      await transitionAsset(tx, { assetId: req.assetId, to: 'AVAILABLE', changedById: actorId, reason: `Maintenance resolved${notes ? `: ${notes}` : ''}` });
      await logActivity({ userId: actorId, action: 'MAINTENANCE_RESOLVE', entityType: 'MaintenanceRequest', entityId: id });
      await notify({ userId: req.raisedById, type: 'MAINTENANCE_RESOLVED', message: 'Your maintenance request was resolved.', relatedEntityType: 'MaintenanceRequest', relatedEntityId: id });
      return updated;
    });
  },
};
