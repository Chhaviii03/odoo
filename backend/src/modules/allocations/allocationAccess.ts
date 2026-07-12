import type { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';

export const ACTIVE_ALLOC_STATUSES = ['ACTIVE', 'OVERDUE'] as const;

export type AllocationActor = {
  id: string;
  role: Role;
  departmentId: string | null;
};

export async function departmentIdsForActor(actorId: string, departmentId: string | null): Promise<string[]> {
  const headed = await prisma.department.findMany({
    where: { headId: actorId },
    select: { id: true },
  });
  const ids = new Set(headed.map((d) => d.id));
  if (departmentId) ids.add(departmentId);
  return [...ids];
}

export async function assertCanApproveTransfer(transferId: string, actor: AllocationActor) {
  if (actor.role === 'ADMIN' || actor.role === 'ASSET_MANAGER') return;

  if (actor.role === 'DEPARTMENT_HEAD') {
    const deptIds = await departmentIdsForActor(actor.id, actor.departmentId);
    if (!deptIds.length) throw ApiError.forbidden('No department scope for approval');

    const transfer = await prisma.transferRequest.findUnique({
      where: { id: transferId },
      include: {
        asset: { select: { departmentId: true } },
        fromEmployee: { select: { departmentId: true } },
        toEmployee: { select: { departmentId: true } },
      },
    });
    if (!transfer) throw ApiError.notFound('Transfer not found');

    const involved = [
      transfer.asset.departmentId,
      transfer.fromEmployee?.departmentId ?? null,
      transfer.toEmployee?.departmentId ?? null,
    ].filter((id): id is string => !!id);

    if (involved.some((id) => deptIds.includes(id))) return;
    throw ApiError.forbidden('You can only approve transfers within your department');
  }

  throw ApiError.forbidden('Not allowed to approve transfers');
}

export function transferListWhere(actor: AllocationActor) {
  if (actor.role === 'ADMIN' || actor.role === 'ASSET_MANAGER') return undefined;

  if (actor.role === 'DEPARTMENT_HEAD') {
    return prisma.department
      .findMany({ where: { headId: actor.id }, select: { id: true } })
      .then(async (headed) => {
        const deptIds = [...new Set([...headed.map((d) => d.id), ...(actor.departmentId ? [actor.departmentId] : [])])];
        if (!deptIds.length) return { id: { in: [] as string[] } };

        const employees = await prisma.employee.findMany({
          where: { departmentId: { in: deptIds } },
          select: { id: true },
        });
        const employeeIds = employees.map((e) => e.id);

        return {
          OR: [
            { asset: { departmentId: { in: deptIds } } },
            { fromEmployeeId: { in: employeeIds } },
            { toEmployeeId: { in: employeeIds } },
            { requestedById: { in: employeeIds } },
          ],
        };
      });
  }

  return Promise.resolve({
    OR: [
      { requestedById: actor.id },
      { toEmployeeId: actor.id },
      { fromEmployeeId: actor.id },
    ],
  });
}
