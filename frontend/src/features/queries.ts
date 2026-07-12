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
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v != null && String(v).trim() !== ''),
  ) as Record<string, string>;

  return useQuery({
    queryKey: ['assets', clean],
    queryFn: async () => {
      const qs = new URLSearchParams(clean).toString();
      return api<Asset[]>(`/assets${qs ? `?${qs}` : ''}`);
    },
  });
}
