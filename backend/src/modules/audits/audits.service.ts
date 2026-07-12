import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { transitionAsset } from '../../shared/assetStateMachine.js';
import { logActivity } from '../../shared/activityLog.js';
import { notifyMany } from '../../shared/notifications.js';
import type { JwtPayload } from '../../lib/jwt.js';

function isManager(actor: JwtPayload) {
  return actor.role === 'ADMIN' || actor.role === 'ASSET_MANAGER';
}

// Non-managers (department heads, employees) can only see audit cycles scoped to
// their own department, company-wide cycles (no department scope), or cycles they
// are personally assigned to audit. Managers/admins see everything.
function visibilityFilter(actor: JwtPayload): Prisma.AuditCycleWhereInput {
  if (isManager(actor)) return {};
  const or: Prisma.AuditCycleWhereInput[] = [
    { scopeDepartmentId: null },
    { assignments: { some: { auditorEmployeeId: actor.sub } } },
  ];
  if (actor.departmentId) or.push({ scopeDepartmentId: actor.departmentId });
  return { OR: or };
}

export const auditsService = {
  list(actor: JwtPayload) {
    return prisma.auditCycle.findMany({
      where: visibilityFilter(actor),
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
        assignments: { include: { auditor: { select: { id: true, name: true } } } },
        _count: { select: { items: true } },
      },
    });
  },

  // Guards direct-by-id access to a cycle's items/discrepancies for non-managers.
  async assertCanViewCycle(cycleId: string, actor: JwtPayload) {
    if (isManager(actor)) return;
    const cycle = await prisma.auditCycle.findUnique({
      where: { id: cycleId },
      select: {
        scopeDepartmentId: true,
        assignments: { where: { auditorEmployeeId: actor.sub }, select: { id: true } },
      },
    });
    if (!cycle) throw ApiError.notFound('Audit cycle not found');
    const inScope =
      cycle.scopeDepartmentId === null ||
      (actor.departmentId != null && cycle.scopeDepartmentId === actor.departmentId);
    if (!inScope && cycle.assignments.length === 0) {
      throw ApiError.forbidden('You do not have access to this audit cycle');
    }
  },

  // Create a cycle, snapshot matching assets into audit_items, assign auditors.
  async createCycle(input: any, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const cycle = await tx.auditCycle.create({
        data: {
          name: input.name,
          scopeDepartmentId: input.scopeDepartmentId ?? null,
          scopeLocation: input.scopeLocation ?? null,
          startDate: input.startDate,
          endDate: input.endDate,
          createdById: actorId,
        },
      });

      const assetWhere: Prisma.AssetWhereInput = { status: { notIn: ['RETIRED', 'DISPOSED'] } };
      if (input.scopeDepartmentId) assetWhere.departmentId = input.scopeDepartmentId;
      if (input.scopeLocation) assetWhere.location = { contains: input.scopeLocation, mode: 'insensitive' };
      const assets = await tx.asset.findMany({ where: assetWhere, select: { id: true, location: true } });

      if (assets.length) {
        await tx.auditItem.createMany({
          data: assets.map((a) => ({ auditCycleId: cycle.id, assetId: a.id, expectedLocation: a.location ?? null })),
        });
      }

      if (input.auditorIds?.length) {
        await tx.auditAssignment.createMany({
          data: input.auditorIds.map((auditorEmployeeId: string) => ({ auditCycleId: cycle.id, auditorEmployeeId })),
          skipDuplicates: true,
        });
      }

      await logActivity({ userId: actorId, action: 'AUDIT_CREATE', entityType: 'AuditCycle', entityId: cycle.id, metadata: { items: assets.length } });
      return cycle;
    });
  },

  async assignAuditors(cycleId: string, auditorIds: string[], actorId: string) {
    await prisma.auditAssignment.createMany({
      data: auditorIds.map((auditorEmployeeId) => ({ auditCycleId: cycleId, auditorEmployeeId })),
      skipDuplicates: true,
    });
    await notifyMany(auditorIds, { type: 'AUDIT_ASSIGNED', message: 'You have been assigned to an audit cycle.', relatedEntityType: 'AuditCycle', relatedEntityId: cycleId });
    await logActivity({ userId: actorId, action: 'AUDIT_ASSIGN', entityType: 'AuditCycle', entityId: cycleId });
    return prisma.auditAssignment.findMany({ where: { auditCycleId: cycleId }, include: { auditor: { select: { id: true, name: true } } } });
  },

  async listItems(cycleId: string, actor: JwtPayload) {
    await this.assertCanViewCycle(cycleId, actor);
    return prisma.auditItem.findMany({
      where: { auditCycleId: cycleId },
      include: {
        asset: { select: { id: true, assetTag: true, name: true, location: true } },
        verifiedBy: { select: { id: true, name: true } },
      },
    });
  },

  async verifyItem(itemId: string, input: any, actorId: string, actorRole?: string) {
    const item = await prisma.auditItem.findUnique({ where: { id: itemId }, include: { auditCycle: true } });
    if (!item) throw ApiError.notFound('Audit item not found');
    if (item.auditCycle.status === 'CLOSED') throw ApiError.badRequest('Audit cycle is closed');

    // Only managers or auditors assigned to this cycle may verify items.
    const isManager = actorRole === 'ADMIN' || actorRole === 'ASSET_MANAGER';
    if (!isManager) {
      const assignment = await prisma.auditAssignment.findFirst({
        where: { auditCycleId: item.auditCycleId, auditorEmployeeId: actorId },
      });
      if (!assignment) throw ApiError.forbidden('Only assigned auditors or managers can verify items in this cycle');
    }

    const updated = await prisma.auditItem.update({
      where: { id: itemId },
      data: { verificationStatus: input.verificationStatus, notes: input.notes, verifiedById: actorId, verifiedAt: new Date() },
    });
    await logActivity({ userId: actorId, action: 'AUDIT_VERIFY', entityType: 'AuditItem', entityId: itemId, metadata: { status: input.verificationStatus } });
    return updated;
  },

  // Discrepancy report = a filtered query, not a stored report.
  async discrepancies(cycleId: string, actor: JwtPayload) {
    await this.assertCanViewCycle(cycleId, actor);
    return prisma.auditItem.findMany({
      where: { auditCycleId: cycleId, verificationStatus: { in: ['MISSING', 'DAMAGED'] } },
      include: { asset: { select: { id: true, assetTag: true, name: true, location: true } }, verifiedBy: { select: { id: true, name: true } } },
    });
  },

  // 4.6 Closing the cycle: single transaction, MISSING items → asset LOST.
  async closeCycle(cycleId: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const cycle = await tx.auditCycle.findUnique({ where: { id: cycleId } });
      if (!cycle) throw ApiError.notFound('Audit cycle not found');
      if (cycle.status === 'CLOSED') throw ApiError.badRequest('Audit cycle already closed');

      const missing = await tx.auditItem.findMany({ where: { auditCycleId: cycleId, verificationStatus: 'MISSING' } });
      for (const item of missing) {
        await transitionAsset(tx, { assetId: item.assetId, to: 'LOST', changedById: actorId, reason: `Missing in audit "${cycle.name}"` });
      }

      const closed = await tx.auditCycle.update({ where: { id: cycleId }, data: { status: 'CLOSED' } });
      await logActivity({ userId: actorId, action: 'AUDIT_CLOSE', entityType: 'AuditCycle', entityId: cycleId, metadata: { lost: missing.length } });
      return closed;
    });
  },
};
