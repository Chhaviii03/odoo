export type Role = 'EMPLOYEE' | 'DEPARTMENT_HEAD' | 'ASSET_MANAGER' | 'ADMIN';

export type AssetStatus =
  | 'AVAILABLE'
  | 'ALLOCATED'
  | 'RESERVED'
  | 'UNDER_MAINTENANCE'
  | 'LOST'
  | 'RETIRED'
  | 'DISPOSED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  departmentId: string | null;
  department?: { id: string; name: string } | null;
}

export interface Department {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  headId: string | null;
  parentId: string | null;
  head?: { id: string; name: string } | null;
  parent?: { id: string; name: string } | null;
  _count?: { employees: number; assets: number };
}

export interface Category {
  id: string;
  name: string;
  customFields?: Record<string, unknown> | null;
  _count?: { assets: number };
}

export interface Asset {
  id: string;
  assetTag: string;
  name: string;
  categoryId: string;
  category?: { id: string; name: string };
  departmentId: string | null;
  department?: { id: string; name: string } | null;
  serialNumber?: string | null;
  qrCode?: string | null;
  condition?: string | null;
  location?: string | null;
  acquisitionCost?: string | number | null;
  isBookable: boolean;
  status: AssetStatus;
  photoUrl?: string | null;
  documentUrls?: string[];
  acquisitionDate?: string | null;
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}
