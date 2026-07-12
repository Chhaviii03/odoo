import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { transitionAsset } from '../../shared/assetStateMachine.js';
import { logActivity } from '../../shared/activityLog.js';
import { notify } from '../../shared/notifications.js';
import {
  ACTIVE_ALLOC_STATUSES,
  assertCanApproveTransfer,
  transferListWhere,
  type AllocationActor,
} from './allocationAccess.js';

async function findActiveAllocation(tx: any, assetId: string) {
  return tx.allocation.findFirst({
    where: { assetId, status: { in: [...ACTIVE_ALLOC_STATUSES] } },
    include: { employee: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } },
  });
}

async function notifyManagers(message: string, relatedEntityType: string, relatedEntityId: string) {
  const managers = await prisma.employee.findMany({
    where: { role: { in: ['ADMIN', 'ASSET_MANAGER'] }, status: 'ACTIVE' },
    select: { id: true },
  });
  for (const m of managers) {
    await notify({ userId: m.id, type: 'ALERT', message, relatedEntityType, relatedEntityId });
  }
}

export const allocationsService = {
  async allocate(input: any, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id: input.assetId } });
      if (!asset) throw ApiError.notFound('Asset not found');

      const active = await findActiveAllocation(tx, input.assetId);

      if (active) {
        const holder = active.employee?.name ?? active.department?.name ?? 'another party';
        throw ApiError.conflict(`Asset is currently held by ${holder}. Raise a transfer request instead.`, {
          currentHolder: { name: holder, employeeId: active.employeeId, departmentId: active.departmentId },
          allocationId: active.id,
          canTransfer: true,
        });
      }

      const allocation = await tx.allocation.create({
        data: {
          assetId: input.assetId,
          employeeId: input.employeeId ?? null,
          departmentId: input.departmentId ?? null,
          expectedReturnDate: input.expectedReturnDate ?? null,
          status: 'ACTIVE',
        },
      });

      await transitionAsset(tx, { assetId: input.assetId, to: 'ALLOCATED', changedById: actorId, reason: 'Allocated' });
      await logActivity({ userId: actorId, action: 'ASSET_ALLOCATE', entityType: 'Allocation', entityId: allocation.id, metadata: { assetId: input.assetId } });

      if (input.employeeId) {
        await notify({ userId: input.employeeId, type: 'ASSET_ASSIGNED', message: `Asset ${asset.assetTag} (${asset.name}) has been assigned to you.`, relatedEntityType: 'Asset', relatedEntityId: asset.id });
      }
      return allocation;
    });
  },

  async returnAllocation(id: string, note: string | undefined, actor: AllocationActor) {
    return prisma.$transaction(async (tx) => {
      const allocation = await tx.allocation.findUnique({ where: { id } });
      if (!allocation) throw ApiError.notFound('Allocation not found');
      if (allocation.status === 'RETURNED') throw ApiError.badRequest('Allocation already returned');
      if (!['ACTIVE', 'OVERDUE'].includes(allocation.status)) {
        throw ApiError.badRequest('Only active allocations can be returned');
      }

      const isManager = actor.role === 'ADMIN' || actor.role === 'ASSET_MANAGER';
      const isHolder = allocation.employeeId === actor.id;
      if (!isManager && !isHolder) {
        throw ApiError.forbidden('You can only return assets allocated to you');
      }

      const updated = await tx.allocation.update({
        where: { id },
        data: { status: 'RETURNED', returnedAt: new Date(), returnConditionNote: note ?? null },
      });
      await transitionAsset(tx, { assetId: allocation.assetId, to: 'AVAILABLE', changedById: actor.id, reason: `Returned${note ? `: ${note}` : ''}` });
      await logActivity({ userId: actor.id, action: 'ASSET_RETURN', entityType: 'Allocation', entityId: id });
      if (!isManager && isHolder) {
        await notifyManagers(
          `Return initiated for allocation ${id}${note ? `: ${note}` : ''}`,
          'Allocation',
          id,
        );
      }
      return updated;
    });
  },

  listForAsset(assetId: string) {
    return prisma.allocation.findMany({
      where: { assetId },
      orderBy: { allocatedAt: 'desc' },
      include: { employee: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } },
    });
  },

  async createTransfer(input: any, actor: AllocationActor) {
    const active = await prisma.allocation.findFirst({
      where: { assetId: input.assetId, status: { in: [...ACTIVE_ALLOC_STATUSES] } },
    });
    if (!active) throw ApiError.badRequest('Asset has no active allocation to transfer');

    const toEmployeeId = actor.role === 'EMPLOYEE' ? actor.id : input.toEmployeeId;
    if (!toEmployeeId) throw ApiError.badRequest('Transfer target employee is required');
    if (actor.role === 'EMPLOYEE' && toEmployeeId !== actor.id) {
      throw ApiError.forbidden('Employees can only request transfers to themselves');
    }
    if (active.employeeId === toEmployeeId) {
      throw ApiError.badRequest('Asset is already allocated to this employee');
    }

    const existing = await prisma.transferRequest.findFirst({
      where: { assetId: input.assetId, toEmployeeId, status: 'REQUESTED' },
    });
    if (existing) {
      throw ApiError.conflict('A transfer request for this asset is already pending approval');
    }

    const transfer = await prisma.transferRequest.create({
      data: {
        assetId: input.assetId,
        fromEmployeeId: active.employeeId ?? null,
        toEmployeeId,
        requestedById: actor.id,
        reason: input.reason,
        status: 'REQUESTED',
      },
      include: { asset: { select: { assetTag: true, name: true } } },
    });
    await logActivity({ userId: actor.id, action: 'TRANSFER_REQUEST', entityType: 'TransferRequest', entityId: transfer.id });
    if (active.employeeId) {
      await notify({ userId: active.employeeId, type: 'TRANSFER_REQUESTED', message: `A transfer request was raised for ${transfer.asset.assetTag}.`, relatedEntityType: 'TransferRequest', relatedEntityId: transfer.id });
    }
    await notifyManagers(`Transfer requested for ${transfer.asset.assetTag}`, 'TransferRequest', transfer.id);
    return transfer;
  },

  async listTransfers(status: string | undefined, actor: AllocationActor) {
    const scope = await transferListWhere(actor);
    return prisma.transferRequest.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(scope ?? {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        asset: { select: { id: true, assetTag: true, name: true } },
        fromEmployee: { select: { id: true, name: true } },
        toEmployee: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
      },
    });
  },

  async approveTransfer(id: string, actor: AllocationActor) {
    await assertCanApproveTransfer(id, actor);

    return prisma.$transaction(async (tx) => {
      const transfer = await tx.transferRequest.findUnique({ where: { id } });
      if (!transfer) throw ApiError.notFound('Transfer not found');
      if (transfer.status !== 'REQUESTED') throw ApiError.badRequest('Transfer is not in a requestable state');

      await tx.transferRequest.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: actor.id },
      });

      await tx.allocation.updateMany({
        where: { assetId: transfer.assetId, status: { in: [...ACTIVE_ALLOC_STATUSES] } },
        data: { status: 'RETURNED', returnedAt: new Date(), returnConditionNote: 'Transferred' },
      });
      const newAllocation = await tx.allocation.create({
        data: { assetId: transfer.assetId, employeeId: transfer.toEmployeeId, status: 'ACTIVE' },
      });
      await tx.assetStatusHistory.create({
        data: { assetId: transfer.assetId, fromStatus: 'ALLOCATED', toStatus: 'ALLOCATED', changedById: actor.id, reason: 'Re-allocated via transfer' },
      });
      const updated = await tx.transferRequest.update({
        where: { id },
        data: { status: 'COMPLETED', approvedById: actor.id },
      });
      await logActivity({ userId: actor.id, action: 'TRANSFER_APPROVE', entityType: 'TransferRequest', entityId: id, metadata: { newAllocationId: newAllocation.id } });
      if (transfer.toEmployeeId && transfer.toEmployeeId !== actor.id) {
        await notify({ userId: transfer.toEmployeeId, type: 'TRANSFER_APPROVED', message: 'A transfer request in your favor was approved.', relatedEntityType: 'TransferRequest', relatedEntityId: id });
      }
      if (transfer.requestedById && transfer.requestedById !== actor.id && transfer.requestedById !== transfer.toEmployeeId) {
        await notify({ userId: transfer.requestedById, type: 'TRANSFER_APPROVED', message: 'Your transfer request was approved.', relatedEntityType: 'TransferRequest', relatedEntityId: id });
      }
      return updated;
    });
  },

  async rejectTransfer(id: string, actor: AllocationActor) {
    await assertCanApproveTransfer(id, actor);

    const transfer = await prisma.transferRequest.findUnique({ where: { id } });
    if (!transfer) throw ApiError.notFound('Transfer not found');
    if (transfer.status !== 'REQUESTED') throw ApiError.badRequest('Transfer is not in a requestable state');
    const updated = await prisma.transferRequest.update({ where: { id }, data: { status: 'REJECTED', approvedById: actor.id } });
    await logActivity({ userId: actor.id, action: 'TRANSFER_REJECT', entityType: 'TransferRequest', entityId: id });
    // Never notify the approver — only the person who raised the request.
    if (transfer.requestedById && transfer.requestedById !== actor.id) {
      await notify({ userId: transfer.requestedById, type: 'TRANSFER_REJECTED', message: 'Your transfer request was rejected.', relatedEntityType: 'TransferRequest', relatedEntityId: id });
    }
    return updated;
  },
};
