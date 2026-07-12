import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';

export const EXPORT_TYPES = [
  'assets',
  'utilization',
  'maintenance',
  'upcoming',
  'department',
  'heatmap',
] as const;

export type ExportType = (typeof EXPORT_TYPES)[number];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HEATMAP_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

const EXPORT_FILENAMES: Record<ExportType, string> = {
  assets: 'assetflow-assets.csv',
  utilization: 'assetflow-utilization.csv',
  maintenance: 'assetflow-maintenance-frequency.csv',
  upcoming: 'assetflow-due-nearing-retirement.csv',
  department: 'assetflow-department-allocation.csv',
  heatmap: 'assetflow-booking-heatmap.csv',
};

function toCsv(header: string[], rows: (string | number)[][]) {
  return [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function isExportType(value: string): value is ExportType {
  return (EXPORT_TYPES as readonly string[]).includes(value);
}

export const reportsService = {
  // Utilization: allocation + booking counts per asset.
  async utilization() {
    const assets = await prisma.asset.findMany({
      select: {
        id: true, assetTag: true, name: true, status: true,
        _count: {
          select: {
            allocations: true,
            bookings: { where: { status: { not: 'CANCELLED' } } },
          },
        },
      },
    });
    const ranked = assets
      .map((a) => ({
        id: a.id,
        assetTag: a.assetTag,
        name: a.name,
        status: a.status,
        allocations: a._count.allocations,
        bookings: a._count.bookings,
        usage: a._count.allocations + a._count.bookings,
      }))
      .sort((x, y) => y.usage - x.usage);

    return {
      mostUsed: ranked.filter((a) => a.usage > 0).slice(0, 10),
      idle: ranked.filter(
        (a) => a.usage === 0 && !['RETIRED', 'DISPOSED'].includes(a.status),
      ),
      all: ranked,
    };
  },

  // Department-wise allocation summary: owned assets + allocations
  // (direct department target OR employee's department).
  async byDepartment() {
    const departments = await prisma.department.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { assets: true } },
      },
      orderBy: { name: 'asc' },
    });

    const allocations = await prisma.allocation.findMany({
      where: { status: { in: ['ACTIVE', 'OVERDUE'] } },
      select: {
        departmentId: true,
        employee: { select: { departmentId: true } },
      },
    });

    const allocationCounts = new Map<string, number>();
    for (const a of allocations) {
      const deptId = a.departmentId ?? a.employee?.departmentId;
      if (!deptId) continue;
      allocationCounts.set(deptId, (allocationCounts.get(deptId) ?? 0) + 1);
    }

    return departments.map((d) => ({
      id: d.id,
      name: d.name,
      assets: d._count.assets,
      allocations: allocationCounts.get(d.id) ?? 0,
    }));
  },

  async maintenanceFrequency() {
    const grouped = await prisma.maintenanceRequest.groupBy({ by: ['assetId'], _count: { _all: true } });
    const assets = await prisma.asset.findMany({
      where: { id: { in: grouped.map((g) => g.assetId) } },
      select: { id: true, assetTag: true, name: true, category: { select: { name: true } } },
    });
    const byId = new Map(assets.map((a) => [a.id, a]));
    return grouped
      .map((g) => ({ asset: byId.get(g.assetId), count: g._count._all }))
      .filter((r) => r.asset)
      .sort((a, b) => b.count - a.count);
  },

  // Assets due for maintenance (recurring issues) or nearing retirement heuristics.
  async upcomingMaintenance() {
    const underMaintenance = await prisma.asset.findMany({
      where: { status: 'UNDER_MAINTENANCE' },
      select: { id: true, assetTag: true, name: true, condition: true, status: true, acquisitionDate: true },
    });
    const poor = await prisma.asset.findMany({
      where: { condition: { in: ['Poor', 'Fair'] }, status: { notIn: ['RETIRED', 'DISPOSED'] } },
      select: { id: true, assetTag: true, name: true, condition: true, status: true, acquisitionDate: true },
    });
    return { underMaintenance, nearingRetirement: poor };
  },

  // Booking heatmap: bookings bucketed by day-of-week and hour.
  async bookingHeatmap() {
    const bookings = await prisma.booking.findMany({
      where: { status: { in: ['UPCOMING', 'ONGOING', 'COMPLETED'] } },
      select: { startTime: true },
    });
    const heat: Record<string, number> = {};
    for (const b of bookings) {
      const d = b.startTime;
      const key = `${d.getDay()}-${d.getHours()}`;
      heat[key] = (heat[key] ?? 0) + 1;
    }
    return Object.entries(heat).map(([key, count]) => {
      const [day, hour] = key.split('-').map(Number);
      return { day, hour, count };
    });
  },

  async exportCsv(typeRaw = 'assets') {
    const type = typeRaw.trim().toLowerCase();
    if (!isExportType(type)) {
      throw ApiError.badRequest(`Invalid export type. Use one of: ${EXPORT_TYPES.join(', ')}`);
    }

    switch (type) {
      case 'assets': {
        const assets = await prisma.asset.findMany({
          include: { category: { select: { name: true } }, department: { select: { name: true } } },
          orderBy: { assetTag: 'asc' },
        });
        return {
          filename: EXPORT_FILENAMES.assets,
          csv: toCsv(
            ['Asset Tag', 'Name', 'Category', 'Department', 'Status', 'Condition', 'Location', 'Bookable'],
            assets.map((a) => [
              a.assetTag, a.name, a.category?.name ?? '', a.department?.name ?? '',
              a.status, a.condition ?? '', a.location ?? '', a.isBookable ? 'Yes' : 'No',
            ]),
          ),
        };
      }

      case 'utilization': {
        const { all } = await this.utilization();
        return {
          filename: EXPORT_FILENAMES.utilization,
          csv: toCsv(
            ['Asset Tag', 'Name', 'Status', 'Allocations', 'Bookings', 'Total Usage', 'Bucket'],
            all
              .filter((a) => !['RETIRED', 'DISPOSED'].includes(a.status) || a.usage > 0)
              .map((a) => [
                a.assetTag,
                a.name,
                a.status,
                a.allocations,
                a.bookings,
                a.usage,
                a.usage > 0 ? 'Most Used' : 'Idle',
              ]),
          ),
        };
      }

      case 'maintenance': {
        const rows = await this.maintenanceFrequency();
        return {
          filename: EXPORT_FILENAMES.maintenance,
          csv: toCsv(
            ['Asset Tag', 'Name', 'Category', 'Maintenance Request Count'],
            rows.map((r) => [
              r.asset!.assetTag,
              r.asset!.name,
              r.asset!.category?.name ?? '',
              r.count,
            ]),
          ),
        };
      }

      case 'upcoming': {
        const { underMaintenance, nearingRetirement } = await this.upcomingMaintenance();
        const underIds = new Set(underMaintenance.map((a) => a.id));
        const rows: (string | number)[][] = [
          ...underMaintenance.map((a) => [
            a.assetTag,
            a.name,
            a.condition ?? '',
            a.status,
            a.acquisitionDate ? a.acquisitionDate.toISOString().slice(0, 10) : '',
            'Under Maintenance',
          ]),
          ...nearingRetirement
            .filter((a) => !underIds.has(a.id))
            .map((a) => [
              a.assetTag,
              a.name,
              a.condition ?? '',
              a.status,
              a.acquisitionDate ? a.acquisitionDate.toISOString().slice(0, 10) : '',
              'Nearing Retirement',
            ]),
        ];
        return {
          filename: EXPORT_FILENAMES.upcoming,
          csv: toCsv(
            ['Asset Tag', 'Name', 'Condition', 'Status', 'Acquisition Date', 'Flag'],
            rows,
          ),
        };
      }

      case 'department': {
        const departments = await this.byDepartment();
        return {
          filename: EXPORT_FILENAMES.department,
          csv: toCsv(
            ['Department', 'Owned Assets', 'Active Allocations'],
            departments.map((d) => [d.name, d.assets, d.allocations]),
          ),
        };
      }

      case 'heatmap': {
        const cells = await this.bookingHeatmap();
        const byKey = new Map(cells.map((c) => [`${c.day}-${c.hour}`, c.count]));
        const rows: (string | number)[][] = [];
        for (let day = 0; day < 7; day++) {
          for (const hour of HEATMAP_HOURS) {
            rows.push([DAY_LABELS[day], `${hour}:00`, byKey.get(`${day}-${hour}`) ?? 0]);
          }
        }
        return {
          filename: EXPORT_FILENAMES.heatmap,
          csv: toCsv(['Day', 'Hour', 'Booking Count'], rows),
        };
      }
    }
  },
};
