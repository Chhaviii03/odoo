import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding AssetFlow demo data...');

  // Clean slate (order matters for FKs).
  await prisma.$transaction([
    prisma.auditItem.deleteMany(),
    prisma.auditAssignment.deleteMany(),
    prisma.auditCycle.deleteMany(),
    prisma.maintenanceRequest.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.transferRequest.deleteMany(),
    prisma.allocation.deleteMany(),
    prisma.assetStatusHistory.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.asset.deleteMany(),
    prisma.assetCategory.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.department.deleteMany(),
  ]);

  const password = await bcrypt.hash('password123', 10);

  const engineering = await prisma.department.create({ data: { name: 'Engineering' } });
  const facilities = await prisma.department.create({ data: { name: 'Facilities' } });
  const operations = await prisma.department.create({ data: { name: 'Operations' } });

  const admin = await prisma.employee.create({
    data: { name: 'Ava Admin', email: 'admin@assetflow.dev', passwordHash: password, role: 'ADMIN', departmentId: operations.id },
  });
  const manager = await prisma.employee.create({
    data: { name: 'Marcus Manager', email: 'manager@assetflow.dev', passwordHash: password, role: 'ASSET_MANAGER', departmentId: operations.id },
  });
  const head = await prisma.employee.create({
    data: { name: 'Dana Head', email: 'head@assetflow.dev', passwordHash: password, role: 'DEPARTMENT_HEAD', departmentId: engineering.id },
  });
  const priya = await prisma.employee.create({
    data: { name: 'Priya Sharma', email: 'priya@assetflow.dev', passwordHash: password, role: 'EMPLOYEE', departmentId: engineering.id },
  });
  const raj = await prisma.employee.create({
    data: { name: 'Raj Patel', email: 'raj@assetflow.dev', passwordHash: password, role: 'EMPLOYEE', departmentId: engineering.id },
  });

  await prisma.department.update({ where: { id: engineering.id }, data: { headId: head.id } });

  const electronics = await prisma.assetCategory.create({ data: { name: 'Electronics', customFields: { warrantyPeriodMonths: 24 } } });
  const furniture = await prisma.assetCategory.create({ data: { name: 'Furniture' } });
  const vehicles = await prisma.assetCategory.create({ data: { name: 'Vehicles' } });
  const spaces = await prisma.assetCategory.create({ data: { name: 'Rooms & Spaces' } });

  let tagCounter = 0;
  const tag = () => `AF-${String(++tagCounter).padStart(4, '0')}`;

  const laptop = await prisma.asset.create({
    data: { assetTag: tag(), name: 'Dell XPS 15 Laptop', categoryId: electronics.id, departmentId: engineering.id, serialNumber: 'SN-XPS-001', qrCode: 'AF-0001', condition: 'Excellent', location: 'Bangalore HQ', acquisitionCost: 1800, isBookable: false, status: 'AVAILABLE' },
  });
  const projector = await prisma.asset.create({
    data: { assetTag: tag(), name: 'Epson Projector', categoryId: electronics.id, departmentId: facilities.id, serialNumber: 'SN-EPS-114', qrCode: 'AF-0002', condition: 'Good', location: 'Floor 3', acquisitionCost: 650, isBookable: false, status: 'AVAILABLE' },
  });
  const chair = await prisma.asset.create({
    data: { assetTag: tag(), name: 'Ergonomic Office Chair', categoryId: furniture.id, departmentId: engineering.id, qrCode: 'AF-0003', condition: 'Good', location: 'Floor 2', acquisitionCost: 300, isBookable: false, status: 'AVAILABLE' },
  });
  const van = await prisma.asset.create({
    data: { assetTag: tag(), name: 'Delivery Van', categoryId: vehicles.id, departmentId: operations.id, serialNumber: 'VIN-778', qrCode: 'AF-0004', condition: 'Fair', location: 'Warehouse', acquisitionCost: 24000, isBookable: true, status: 'AVAILABLE' },
  });
  const roomB2 = await prisma.asset.create({
    data: { assetTag: tag(), name: 'Conference Room B2', categoryId: spaces.id, departmentId: facilities.id, qrCode: 'AF-0005', condition: 'Excellent', location: 'Floor 1', isBookable: true, status: 'AVAILABLE' },
  });
  const monitor = await prisma.asset.create({
    data: { assetTag: tag(), name: 'LG 27" Monitor', categoryId: electronics.id, departmentId: engineering.id, serialNumber: 'SN-LG-27', qrCode: 'AF-0006', condition: 'Poor', location: 'Floor 2', acquisitionCost: 250, isBookable: false, status: 'AVAILABLE' },
  });

  for (const a of [laptop, projector, chair, van, roomB2, monitor]) {
    await prisma.assetStatusHistory.create({ data: { assetId: a.id, toStatus: 'AVAILABLE', changedById: manager.id, reason: 'Asset registered' } });
  }

  // Priya holds the laptop (sets up the Screen 5 conflict demo when Raj tries to take it).
  await prisma.allocation.create({ data: { assetId: laptop.id, employeeId: priya.id, status: 'ACTIVE', expectedReturnDate: new Date(Date.now() + 7 * 86400000) } });
  await prisma.asset.update({ where: { id: laptop.id }, data: { status: 'ALLOCATED' } });
  await prisma.assetStatusHistory.create({ data: { assetId: laptop.id, fromStatus: 'AVAILABLE', toStatus: 'ALLOCATED', changedById: manager.id, reason: 'Allocated to Priya' } });

  // An overdue allocation to light up the dashboard.
  await prisma.allocation.create({ data: { assetId: chair.id, employeeId: raj.id, status: 'ACTIVE', expectedReturnDate: new Date(Date.now() - 2 * 86400000) } });
  await prisma.asset.update({ where: { id: chair.id }, data: { status: 'ALLOCATED' } });

  // Bookings for overlap validation + heatmap peak windows.
  const today = new Date();
  const at = (dayOffset: number, hour: number, durationHrs = 1) => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset, hour, 0, 0);
    const end = new Date(start.getTime() + durationHrs * 3600000);
    return { start, end };
  };
  const bookingSeeds: { assetId: string; bookedById: string; dayOffset: number; hour: number; status: 'UPCOMING' | 'COMPLETED' }[] = [
    { assetId: roomB2.id, bookedById: head.id, dayOffset: 0, hour: 9, status: 'UPCOMING' },
    { assetId: roomB2.id, bookedById: priya.id, dayOffset: -1, hour: 10, status: 'COMPLETED' },
    { assetId: roomB2.id, bookedById: raj.id, dayOffset: -1, hour: 14, status: 'COMPLETED' },
    { assetId: roomB2.id, bookedById: head.id, dayOffset: -2, hour: 9, status: 'COMPLETED' },
    { assetId: roomB2.id, bookedById: manager.id, dayOffset: -3, hour: 11, status: 'COMPLETED' },
    { assetId: van.id, bookedById: manager.id, dayOffset: -2, hour: 8, status: 'COMPLETED' },
    { assetId: van.id, bookedById: raj.id, dayOffset: -4, hour: 15, status: 'COMPLETED' },
    { assetId: van.id, bookedById: priya.id, dayOffset: 1, hour: 9, status: 'UPCOMING' },
  ];
  for (const b of bookingSeeds) {
    const { start, end } = at(b.dayOffset, b.hour);
    await prisma.booking.create({
      data: { assetId: b.assetId, bookedById: b.bookedById, startTime: start, endTime: end, status: b.status },
    });
  }

  // A pending maintenance request.
  await prisma.maintenanceRequest.create({ data: { assetId: monitor.id, raisedById: priya.id, issue: 'Screen flickering intermittently', priority: 'HIGH', status: 'PENDING' } });

  await prisma.notification.create({ data: { userId: admin.id, type: 'WELCOME', message: 'Welcome to AssetFlow. Demo data is loaded.' } });

  console.log('\nSeed complete. Demo accounts (password: password123):');
  console.table([
    { role: 'Admin', email: 'admin@assetflow.dev' },
    { role: 'Asset Manager', email: 'manager@assetflow.dev' },
    { role: 'Department Head', email: 'head@assetflow.dev' },
    { role: 'Employee (Priya)', email: 'priya@assetflow.dev' },
    { role: 'Employee (Raj)', email: 'raj@assetflow.dev' },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
