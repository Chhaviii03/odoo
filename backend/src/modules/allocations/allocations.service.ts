import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { transitionAsset } from '../../shared/assetStateMachine.js';
import { logActivity } from '../../shared/activityLog.js';
import { notify } from '../../shared/notifications.js';

export const allocationsService = {
  // 4.2 Allocation conflict rule (double-allocation block)
  async allocate(input: any, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id: input.assetId } });
      if (!asset) throw ApiError.notFound('Asset not found');

      const active = await tx.allocation.findFirst({
        where: { assetId: input.assetId, status: 'ACTIVE' },
        include: { employee: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } },
      });

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

  async returnAllocation(id: string, note: string | undefined, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const allocation = await tx.allocation.findUnique({ where: { id } });
      if (!allocation) throw ApiError.notFound('Allocation not found');
      if (allocation.status === 'RETURNED') throw ApiError.badRequest('Allocation already returned');

      const updated = await tx.allocation.update({
        where: { id },
        data: { status: 'RETURNED', returnedAt: new Date(), returnConditionNote: note },
      });
      await transitionAsset(tx, { assetId: allocation.assetId, to: 'AVAILABLE', changedById: actorId, reason: `Returned${note ? `: ${note}` : ''}` });
      await logActivity({ userId: actorId, action: 'ASSET_RETURN', entityType: 'Allocation', entityId: id });
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

  // 4.4 Transfer workflow
  async createTransfer(input: any, actorId: string) {
    const active = await prisma.allocation.findFirst({ where: { assetId: input.assetId, status: 'ACTIVE' } });
    const transfer = await prisma.transferRequest.create({
      data: {
        assetId: input.assetId,
        fromEmployeeId: active?.employeeId ?? null,
        toEmployeeId: input.toEmployeeId,
        requestedById: actorId,
        reason: input.reason,
        status: 'REQUESTED',
      },
      include: { asset: { select: { assetTag: true, name: true } } },
    });
    await logActivity({ userId: actorId, action: 'TRANSFER_REQUEST', entityType: 'TransferRequest', entityId: transfer.id });
    if (active?.employeeId) {
      await notify({ userId: active.employeeId, type: 'TRANSFER_REQUESTED', message: `A transfer request was raised for ${transfer.asset.assetTag}.`, relatedEntityType: 'TransferRequest', relatedEntityId: transfer.id });
    }
    return transfer;
  },

  listTransfers(status?: string) {
    return prisma.transferRequest.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        asset: { select: { id: true, assetTag: true, name: true } },
        fromEmployee: { select: { id: true, name: true } },
        toEmployee: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
      },
    });
  },

  async approveTransfer(id: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const transfer = await tx.transferRequest.findUnique({ where: { id } });
      if (!transfer) throw ApiError.notFound('Transfer not found');
      if (transfer.status !== 'REQUESTED') throw ApiError.badRequest('Transfer is not in a requestable state');

      // Close the old active allocation, open a new one for the receiver.
      await tx.allocation.updateMany({
        where: { assetId: transfer.assetId, status: 'ACTIVE' },
        data: { status: 'RETURNED', returnedAt: new Date(), returnConditionNote: 'Transferred' },
      });
      const newAllocation = await tx.allocation.create({
        data: { assetId: transfer.assetId, employeeId: transfer.toEmployeeId, status: 'ACTIVE' },
      });
      // Asset may currently be ALLOCATED — keep it ALLOCATED (record history reason).
      await tx.assetStatusHistory.create({
        data: { assetId: transfer.assetId, fromStatus: 'ALLOCATED', toStatus: 'ALLOCATED', changedById: actorId, reason: 'Re-allocated via transfer' },
      });
      const updated = await tx.transferRequest.update({
        where: { id },
        data: { status: 'COMPLETED', approvedById: actorId },
      });
      await logActivity({ userId: actorId, action: 'TRANSFER_APPROVE', entityType: 'TransferRequest', entityId: id, metadata: { newAllocationId: newAllocation.id } });
      if (transfer.toEmployeeId) {
        await notify({ userId: transfer.toEmployeeId, type: 'TRANSFER_APPROVED', message: 'A transfer request in your favor was approved.', relatedEntityType: 'TransferRequest', relatedEntityId: id });
      }
      return updated;
    });
  },

  async rejectTransfer(id: string, actorId: string) {
    const transfer = await prisma.transferRequest.findUnique({ where: { id } });
    if (!transfer) throw ApiError.notFound('Transfer not found');
    if (transfer.status !== 'REQUESTED') throw ApiError.badRequest('Transfer is not in a requestable state');
    const updated = await prisma.transferRequest.update({ where: { id }, data: { status: 'REJECTED', approvedById: actorId } });
    await logActivity({ userId: actorId, action: 'TRANSFER_REJECT', entityType: 'TransferRequest', entityId: id });
    if (transfer.requestedById) {
      await notify({ userId: transfer.requestedById, type: 'TRANSFER_REJECTED', message: 'Your transfer request was rejected.', relatedEntityType: 'TransferRequest', relatedEntityId: id });
    }
    return updated;
  },
};
