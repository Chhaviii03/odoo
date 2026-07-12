import { prisma } from '../../lib/prisma.js';

export const reportsService = {
  // Utilization: allocation count per asset + currently allocated share.
  async utilization() {
    const assets = await prisma.asset.findMany({
      select: {
        id: true, assetTag: true, name: true, status: true,
        _count: { select: { allocations: true, bookings: true } },
      },
    });
    const ranked = assets
      .map((a) => ({ ...a, usage: a._count.allocations + a._count.bookings }))
      .sort((x, y) => y.usage - x.usage);
    return {
      mostUsed: ranked.slice(0, 10),
      idle: ranked.filter((a) => a.usage === 0),
    };
  },

  async byDepartment() {
    const departments = await prisma.department.findMany({
      select: { id: true, name: true, _count: { select: { assets: true, allocations: true } } },
    });
    return departments.map((d) => ({ id: d.id, name: d.name, assets: d._count.assets, allocations: d._count.allocations }));
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
      select: { id: true, assetTag: true, name: true, condition: true },
    });
    const poor = await prisma.asset.findMany({
      where: { condition: { in: ['Poor', 'Fair'] }, status: { notIn: ['RETIRED', 'DISPOSED'] } },
      select: { id: true, assetTag: true, name: true, condition: true, acquisitionDate: true },
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

  async exportCsv() {
    const assets = await prisma.asset.findMany({
      include: { category: { select: { name: true } }, department: { select: { name: true } } },
      orderBy: { assetTag: 'asc' },
    });
    const header = ['Asset Tag', 'Name', 'Category', 'Department', 'Status', 'Condition', 'Location', 'Bookable'];
    const rows = assets.map((a) => [
      a.assetTag, a.name, a.category?.name ?? '', a.department?.name ?? '',
      a.status, a.condition ?? '', a.location ?? '', a.isBookable ? 'Yes' : 'No',
    ]);
    return [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  },
};
