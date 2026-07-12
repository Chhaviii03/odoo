import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { logActivity } from '../../shared/activityLog.js';
import { transitionAsset } from '../../shared/assetStateMachine.js';

// Auto-generate the next asset tag: AF-0001, AF-0002, ...
async function nextAssetTag(tx: Prisma.TransactionClient): Promise<string> {
  const last = await tx.asset.findFirst({
    where: { assetTag: { startsWith: 'AF-' } },
    orderBy: { assetTag: 'desc' },
    select: { assetTag: true },
  });
  const lastNum = last ? parseInt(last.assetTag.replace('AF-', ''), 10) : 0;
  const next = Number.isNaN(lastNum) ? 1 : lastNum + 1;
  return `AF-${String(next).padStart(4, '0')}`;
}

export const assetsService = {
  async list(filter: any) {
    const where: Prisma.AssetWhereInput = {};
    if (filter.tag) where.assetTag = { contains: filter.tag, mode: 'insensitive' };
    if (filter.serial) where.serialNumber = { contains: filter.serial, mode: 'insensitive' };
    if (filter.qr) where.qrCode = filter.qr;
    if (filter.categoryId) where.categoryId = filter.categoryId;
    if (filter.status) where.status = filter.status;
    if (filter.departmentId) where.departmentId = filter.departmentId;
    if (filter.location) where.location = { contains: filter.location, mode: 'insensitive' };
    if (filter.isBookable !== undefined) where.isBookable = filter.isBookable;
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { assetTag: { contains: filter.search, mode: 'insensitive' } },
        { serialNumber: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    return prisma.asset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        category: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });
  },

  async get(id: string) {
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        category: true,
        department: { select: { id: true, name: true } },
        allocations: {
          orderBy: { allocatedAt: 'desc' },
          include: { employee: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } },
        },
        maintenance: {
          orderBy: { createdAt: 'desc' },
          include: { raisedBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!asset) throw ApiError.notFound('Asset not found');
    return asset;
  },

  async history(id: string) {
    const [statusHistory, allocations, maintenance] = await Promise.all([
      prisma.assetStatusHistory.findMany({
        where: { assetId: id },
        orderBy: { changedAt: 'desc' },
        include: { changedBy: { select: { id: true, name: true } } },
      }),
      prisma.allocation.findMany({
        where: { assetId: id },
        orderBy: { allocatedAt: 'desc' },
        include: { employee: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } },
      }),
      prisma.maintenanceRequest.findMany({
        where: { assetId: id },
        orderBy: { createdAt: 'desc' },
        include: { raisedBy: { select: { id: true, name: true } } },
      }),
    ]);
    return { statusHistory, allocations, maintenance };
  },

  async create(data: any, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const assetTag = await nextAssetTag(tx);
      const asset = await tx.asset.create({
        data: {
          ...data,
          assetTag,
          documentUrls: data.documentUrls ?? [],
          acquisitionCost: data.acquisitionCost ?? undefined,
        },
      });
      await tx.assetStatusHistory.create({
        data: { assetId: asset.id, toStatus: 'AVAILABLE', changedById: actorId, reason: 'Asset registered' },
      });
      await logActivity({ userId: actorId, action: 'ASSET_REGISTER', entityType: 'Asset', entityId: asset.id, metadata: { assetTag } });
      return asset;
    });
  },

  async update(id: string, data: any, actorId: string) {
    const asset = await prisma.asset.update({ where: { id }, data });
    await logActivity({ userId: actorId, action: 'ASSET_UPDATE', entityType: 'Asset', entityId: id });
    return asset;
  },

  async retireOrDispose(id: string, action: 'RETIRE' | 'DISPOSE', reason: string | undefined, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const asset = await transitionAsset(tx, {
        assetId: id,
        to: action === 'RETIRE' ? 'RETIRED' : 'DISPOSED',
        changedById: actorId,
        reason: reason ?? action,
      });
      await logActivity({ userId: actorId, action: `ASSET_${action}`, entityType: 'Asset', entityId: id });
      return asset;
    });
  },
};
