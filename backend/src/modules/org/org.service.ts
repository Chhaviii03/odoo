import type { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { logActivity } from '../../shared/activityLog.js';
import { notify } from '../../shared/notifications.js';

export const orgService = {
  // ---- Departments ----
  listDepartments() {
    return prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: {
        head: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true } },
        _count: { select: { employees: true, assets: true } },
      },
    });
  },

  async createDepartment(data: any, actorId: string) {
    const dept = await prisma.department.create({ data });
    await logActivity({ userId: actorId, action: 'DEPARTMENT_CREATE', entityType: 'Department', entityId: dept.id, metadata: { name: dept.name } });
    return dept;
  },

  async updateDepartment(id: string, data: any, actorId: string) {
    const dept = await prisma.department.update({ where: { id }, data });
    await logActivity({ userId: actorId, action: 'DEPARTMENT_UPDATE', entityType: 'Department', entityId: id });
    return dept;
  },

  async setDepartmentStatus(id: string, status: 'ACTIVE' | 'INACTIVE', actorId: string) {
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('Department not found');
    const dept = await prisma.department.update({ where: { id }, data: { status } });
    await logActivity({ userId: actorId, action: 'DEPARTMENT_STATUS', entityType: 'Department', entityId: id, metadata: { status } });
    return dept;
  },

  // ---- Categories ----
  listCategories() {
    return prisma.assetCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { assets: true } } },
    });
  },

  async createCategory(data: any, actorId: string) {
    const cat = await prisma.assetCategory.create({ data });
    await logActivity({ userId: actorId, action: 'CATEGORY_CREATE', entityType: 'AssetCategory', entityId: cat.id, metadata: { name: cat.name } });
    return cat;
  },

  async updateCategory(id: string, data: any, actorId: string) {
    const cat = await prisma.assetCategory.update({ where: { id }, data });
    await logActivity({ userId: actorId, action: 'CATEGORY_UPDATE', entityType: 'AssetCategory', entityId: id });
    return cat;
  },

  // ---- Employees ----
  listEmployees(search?: string) {
    return prisma.employee.findMany({
      where: search
        ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }
        : undefined,
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, email: true, role: true, status: true, createdAt: true,
        department: { select: { id: true, name: true } },
      },
    });
  },

  // The ONLY place a role is assigned. Restricted to Admin at the route level.
  async updateRole(id: string, role: Role, actorId: string) {
    if (id === actorId && role !== 'ADMIN') {
      throw ApiError.badRequest('You cannot downgrade your own admin role');
    }
    const user = await prisma.employee.update({ where: { id }, data: { role } });
    await logActivity({ userId: actorId, action: 'EMPLOYEE_ROLE_CHANGE', entityType: 'Employee', entityId: id, metadata: { role } });
    await notify({ userId: id, type: 'ROLE_CHANGED', message: `Your role was updated to ${role.replace('_', ' ')}.`, relatedEntityType: 'Employee', relatedEntityId: id });
    const { passwordHash, ...rest } = user;
    return rest;
  },

  async setEmployeeStatus(id: string, status: 'ACTIVE' | 'INACTIVE', actorId: string) {
    const user = await prisma.employee.update({ where: { id }, data: { status } });
    await logActivity({ userId: actorId, action: 'EMPLOYEE_STATUS', entityType: 'Employee', entityId: id, metadata: { status } });
    const { passwordHash, ...rest } = user;
    return rest;
  },

  async updateEmployee(id: string, data: any, actorId: string) {
    const user = await prisma.employee.update({ where: { id }, data });
    await logActivity({ userId: actorId, action: 'EMPLOYEE_UPDATE', entityType: 'Employee', entityId: id });
    const { passwordHash, ...rest } = user;
    return rest;
  },
};
