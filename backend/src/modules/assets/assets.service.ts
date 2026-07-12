import type { AssetStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { logActivity } from '../../shared/activityLog.js';
import { transitionAsset } from '../../shared/assetStateMachine.js';

const ASSET_STATUSES: AssetStatus[] = [
  'AVAILABLE',
  'ALLOCATED',
  'RESERVED',
  'UNDER_MAINTENANCE',
  'LOST',
  'RETIRED',
  'DISPOSED',
];

/** Caller identity used to scope the asset directory. */
export type AssetViewer = {
  sub: string;
  role: Role;
  departmentId: string | null;
};

/** Match user text like "available", "under maintenance", "UNDER_MAINTENANCE". */
function matchAssetStatuses(query: string): AssetStatus[] {
  const normalized = query.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return [];
  return ASSET_STATUSES.filter((status) => {
    const asEnum = status.toLowerCase();
    const asWords = status.toLowerCase().replace(/_/g, ' ');
    return asEnum.includes(normalized) || asWords.includes(query.trim().toLowerCase()) || normalized.includes(asEnum);
  });
}

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

function splitCsv(value?: string | null): string[] {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

async function departmentIdsForViewer(viewer: AssetViewer): Promise<string[]> {
  const headed = await prisma.department.findMany({
    where: { headId: viewer.sub },
    select: { id: true },
  });
  const ids = new Set(headed.map((d) => d.id));
  if (viewer.departmentId) ids.add(viewer.departmentId);
  return [...ids];
}

/**
 * Role-scoped visibility for Screen 4 (Asset Registration & Directory).
 * - Admin / Asset Manager: full catalog
 * - Department Head: assets owned by their department(s), or actively allocated
 *   to their department as an entity (not every asset held by a team member —
 *   that would leak other departments' assets into this directory)
 * - Employee: assets currently or previously allocated to them
 * When `includeBookables` is true (Resource Booking), shared resources are also visible.
 */
async function visibilityWhere(
  viewer: AssetViewer,
  opts: { includeBookables?: boolean; allocationContext?: boolean } = {},
): Promise<Prisma.AssetWhereInput | undefined> {
  if (viewer.role === 'ADMIN' || viewer.role === 'ASSET_MANAGER') {
    return undefined;
  }

  if (viewer.role === 'DEPARTMENT_HEAD') {
    const deptIds = await departmentIdsForViewer(viewer);
    const deptScope: Prisma.AssetWhereInput = deptIds.length
      ? {
          OR: [
            { departmentId: { in: deptIds } },
            { allocations: { some: { departmentId: { in: deptIds }, status: { in: ['ACTIVE', 'OVERDUE'] } } } },
          ],
        }
      : { id: { in: [] } };

    if (opts.includeBookables) {
      return { OR: [deptScope, { isBookable: true }] };
    }
    return deptScope;
  }

  // EMPLOYEE — directory: own allocations; allocation screen: own + currently held assets for transfer
  const mine: Prisma.AssetWhereInput = {
    allocations: { some: { employeeId: viewer.sub } },
  };
  if (opts.allocationContext) {
    return {
      OR: [
        mine,
        { allocations: { some: { status: { in: ['ACTIVE', 'OVERDUE'] } } } },
      ],
    };
  }
  if (opts.includeBookables) {
    return { OR: [mine, { isBookable: true }] };
  }
  return mine;
}

async function assertCanViewAsset(assetId: string, viewer: AssetViewer, opts: { allocationContext?: boolean } = {}): Promise<void> {
  const scope = await visibilityWhere(viewer, { includeBookables: true, allocationContext: opts.allocationContext });
  if (!scope) {
    const exists = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } });
    if (!exists) throw ApiError.notFound('Asset not found');
    return;
  }
  const visible = await prisma.asset.findFirst({
    where: { AND: [{ id: assetId }, scope] },
    select: { id: true },
  });
  if (!visible) throw ApiError.notFound('Asset not found');
}

function mergeWhere(
  filterWhere: Prisma.AssetWhereInput,
  scope?: Prisma.AssetWhereInput,
): Prisma.AssetWhereInput {
  if (!scope) return filterWhere;
  const parts = [filterWhere, scope].filter((w) => Object.keys(w).length > 0);
  if (parts.length <= 1) return parts[0] ?? {};
  return { AND: parts };
}

export const assetsService = {
  ensureVisible: assertCanViewAsset,

  async filterOptions(viewer: AssetViewer) {
    const scope = await visibilityWhere(viewer);
    const scoped = (extra: Prisma.AssetWhereInput = {}) => mergeWhere(extra, scope);

    const [tags, serials, qrs, locations, statuses, categories, departments] = await Promise.all([
      prisma.asset.findMany({ where: scoped(), select: { assetTag: true }, distinct: ['assetTag'], orderBy: { assetTag: 'asc' } }),
      prisma.asset.findMany({
        where: scoped({ serialNumber: { not: null } }),
        select: { serialNumber: true },
        distinct: ['serialNumber'],
        orderBy: { serialNumber: 'asc' },
      }),
      prisma.asset.findMany({
        where: scoped({ qrCode: { not: null } }),
        select: { qrCode: true },
        distinct: ['qrCode'],
        orderBy: { qrCode: 'asc' },
      }),
      prisma.asset.findMany({
        where: scoped({ location: { not: null } }),
        select: { location: true },
        distinct: ['location'],
        orderBy: { location: 'asc' },
      }),
      prisma.asset.findMany({ where: scoped(), select: { status: true }, distinct: ['status'], orderBy: { status: 'asc' } }),
      prisma.assetCategory.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, _count: { select: { assets: true } } },
      }),
      prisma.department.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, _count: { select: { assets: true } } },
      }),
    ]);

    return {
      properties: [
        {
          key: 'tag',
          label: 'Asset Tag',
          description: 'Unique asset identifier (e.g. AF-0001).',
          values: tags.map((t) => ({ value: t.assetTag, label: t.assetTag })),
        },
        {
          key: 'serial',
          label: 'Serial Number',
          description: 'Manufacturer or internal serial number.',
          values: serials
            .filter((s) => s.serialNumber)
            .map((s) => ({ value: s.serialNumber!, label: s.serialNumber! })),
        },
        {
          key: 'qr',
          label: 'QR Code',
          description: 'QR / barcode value linked to the asset (defaults to asset tag when unset).',
          values: (() => {
            const fromQr = qrs.filter((q) => q.qrCode).map((q) => ({ value: q.qrCode!, label: q.qrCode! }));
            if (fromQr.length) return fromQr;
            // Fallback: seeded assets often use the asset tag as the scannable code.
            return tags.map((t) => ({ value: t.assetTag, label: t.assetTag }));
          })(),
        },
        {
          key: 'location',
          label: 'Location',
          description: 'Physical location of the asset.',
          values: locations
            .filter((l) => l.location)
            .map((l) => ({ value: l.location!, label: l.location! })),
        },
        {
          key: 'status',
          label: 'Status',
          description: 'Lifecycle status (Available, Allocated, Under Maintenance, …).',
          values: (statuses.length
            ? statuses.map((s) => s.status)
            : ASSET_STATUSES
          ).map((status) => ({
            value: status,
            label: status
              .toLowerCase()
              .split('_')
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' '),
          })),
        },
        {
          key: 'categoryId',
          label: 'Category',
          description: 'Asset category from Organization Setup.',
          values: categories
            .filter((c) => c._count.assets > 0)
            .map((c) => ({ value: c.id, label: c.name })),
        },
        {
          key: 'departmentId',
          label: 'Department',
          description: 'Owning department.',
          values: departments
            .filter((d) => d._count.assets > 0)
            .map((d) => ({ value: d.id, label: d.name })),
        },
      ],
    };
  },

  async list(filter: any, viewer: AssetViewer) {
    const where: Prisma.AssetWhereInput = {};
    const and: Prisma.AssetWhereInput[] = [];

    const tags = splitCsv(filter.tag);
    if (tags.length === 1) where.assetTag = { equals: tags[0], mode: 'insensitive' };
    else if (tags.length > 1) and.push({ OR: tags.map((t) => ({ assetTag: { equals: t, mode: 'insensitive' } })) });

    const serials = splitCsv(filter.serial);
    if (serials.length === 1) where.serialNumber = { equals: serials[0], mode: 'insensitive' };
    else if (serials.length > 1) and.push({ OR: serials.map((s) => ({ serialNumber: { equals: s, mode: 'insensitive' } })) });

    const qrs = splitCsv(filter.qr);
    if (qrs.length) {
      and.push({
        OR: qrs.flatMap((q) => [
          { qrCode: { equals: q, mode: 'insensitive' } },
          { assetTag: { equals: q, mode: 'insensitive' } },
        ]),
      });
    }

    const locations = splitCsv(filter.location);
    if (locations.length === 1) where.location = { equals: locations[0], mode: 'insensitive' };
    else if (locations.length > 1) and.push({ OR: locations.map((l) => ({ location: { equals: l, mode: 'insensitive' } })) });

    const statuses = splitCsv(filter.status).filter((s) =>
      ASSET_STATUSES.includes(s as AssetStatus),
    ) as AssetStatus[];
    if (statuses.length === 1) where.status = statuses[0];
    else if (statuses.length > 1) where.status = { in: statuses };

    const categoryIds = splitCsv(filter.categoryId);
    if (categoryIds.length === 1) where.categoryId = categoryIds[0];
    else if (categoryIds.length > 1) where.categoryId = { in: categoryIds };

    const departmentIds = splitCsv(filter.departmentId);
    if (departmentIds.length === 1) where.departmentId = departmentIds[0];
    else if (departmentIds.length > 1) where.departmentId = { in: departmentIds };

    if (filter.isBookable !== undefined) where.isBookable = filter.isBookable;

    if (filter.search) {
      const q = String(filter.search).trim();
      const statusMatches = matchAssetStatuses(q);
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { assetTag: { contains: q, mode: 'insensitive' } },
          { serialNumber: { contains: q, mode: 'insensitive' } },
          { qrCode: { contains: q, mode: 'insensitive' } },
          { location: { contains: q, mode: 'insensitive' } },
          { category: { name: { contains: q, mode: 'insensitive' } } },
          { department: { name: { contains: q, mode: 'insensitive' } } },
          ...(statusMatches.length ? [{ status: { in: statusMatches } }] : []),
        ],
      });
    }

    if (and.length) where.AND = and;

    const wantsBookables = filter.isBookable === true || filter.isBookable === 'true';
    const allocationContext = filter.context === 'allocation';
    const scope = await visibilityWhere(viewer, { includeBookables: wantsBookables, allocationContext });

    return prisma.asset.findMany({
      where: mergeWhere(where, scope),
      orderBy: { createdAt: 'desc' },
      include: {
        category: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });
  },

  async get(id: string, viewer: AssetViewer) {
    await assertCanViewAsset(id, viewer);
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

  async history(id: string, viewer: AssetViewer) {
    await assertCanViewAsset(id, viewer);
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
          qrCode: data.qrCode || assetTag,
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
