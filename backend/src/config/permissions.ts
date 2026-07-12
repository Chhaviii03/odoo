import type { Role } from '@prisma/client';

/**
 * Single source of truth for capability → allowed roles.
 * Mirrors the RBAC table in the architecture plan (section 5).
 */
export type Capability =
  | 'org.manage'
  | 'employee.promote'
  | 'asset.register'
  | 'asset.viewAll'
  | 'asset.allocate'
  | 'transfer.approve'
  | 'transfer.initiate'
  | 'booking.create'
  | 'maintenance.raise'
  | 'maintenance.approve'
  | 'audit.manage'
  | 'audit.verify'
  | 'reports.viewAll';

export const PERMISSIONS: Record<Capability, Role[]> = {
  'org.manage': ['ADMIN'],
  'employee.promote': ['ADMIN'],
  'asset.register': ['ADMIN', 'ASSET_MANAGER'],
  'asset.viewAll': ['ADMIN', 'ASSET_MANAGER'],
  'asset.allocate': ['ADMIN', 'ASSET_MANAGER'],
  'transfer.approve': ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'],
  'transfer.initiate': ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD', 'EMPLOYEE'],
  'booking.create': ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD', 'EMPLOYEE'],
  'maintenance.raise': ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD', 'EMPLOYEE'],
  'maintenance.approve': ['ADMIN', 'ASSET_MANAGER'],
  'audit.manage': ['ADMIN', 'ASSET_MANAGER'],
  'audit.verify': ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD', 'EMPLOYEE'],
  'reports.viewAll': ['ADMIN', 'ASSET_MANAGER'],
};

export function can(role: Role, capability: Capability): boolean {
  return PERMISSIONS[capability].includes(role);
}
