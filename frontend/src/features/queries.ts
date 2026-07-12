import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Asset, Category, Department, User } from '../lib/types';

export function useDepartments() {
  return useQuery({ queryKey: ['departments'], queryFn: () => api<Department[]>('/departments') });
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') });
}

export function useEmployees(enabled = true) {
  return useQuery({ queryKey: ['employees'], queryFn: () => api<User[]>('/employees'), enabled });
}

export function useAssets(params: Record<string, string | undefined> = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return useQuery({ queryKey: ['assets', params], queryFn: () => api<Asset[]>(`/assets${qs ? `?${qs}` : ''}`) });
}
