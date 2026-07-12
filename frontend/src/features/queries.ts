import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
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

export function useAllocationEmployees(enabled = true) {
  return useQuery({
    queryKey: ['employees', 'for-allocation'],
    queryFn: () => api<User[]>('/employees/for-allocation'),
    enabled,
  });
}

export function useAssets(params: Record<string, string | undefined> = {}) {
  const { user } = useAuth();
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v != null && String(v).trim() !== ''),
  ) as Record<string, string>;

  return useQuery({
    // Include user id so role-scoped lists don't leak across logins via cache
    queryKey: ['assets', user?.id, clean],
    queryFn: async () => {
      const qs = new URLSearchParams(clean).toString();
      return api<Asset[]>(`/assets${qs ? `?${qs}` : ''}`);
    },
    enabled: !!user,
  });
}
