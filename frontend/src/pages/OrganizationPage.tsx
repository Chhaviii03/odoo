import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, ApiError } from '../lib/api';
import { PageHeader, StatusBadge, Modal, Field, Spinner, EmptyState } from '../components/ui';
import { toast } from '../lib/toast';
import { humanize } from '../lib/format';
import { useDepartments, useCategories, useEmployees } from '../features/queries';
import type { Role } from '../lib/types';

type Tab = 'departments' | 'categories' | 'employees';

export default function OrganizationPage() {
  const [tab, setTab] = useState<Tab>('departments');
  return (
    <div>
      <PageHeader title="Organization Setup" subtitle="Master data everything else depends on (Admin only)" />
      <div className="mb-5 flex gap-2">
        {(['departments', 'categories', 'employees'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={clsx('tab', tab === t && 'tab-active')}>
            {t === 'departments' ? 'Department Management' : t === 'categories' ? 'Asset Categories' : 'Employee Directory'}
          </button>
        ))}
      </div>
      {tab === 'departments' && <DepartmentsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'employees' && <EmployeesTab />}
    </div>
  );
}

function DepartmentsTab() {
  const qc = useQueryClient();
  const { data: departments, isLoading } = useDepartments();
  const { data: employees = [] } = useEmployees();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [headId, setHeadId] = useState('');
  const [parentId, setParentId] = useState('');

  const create = useMutation({
    mutationFn: () => api('/departments', { method: 'POST', body: { name, headId: headId || null, parentId: parentId || null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setOpen(false); setName(''); setHeadId(''); setParentId(''); toast('Department created', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const toggleStatus = useMutation({
    mutationFn: (d: { id: string; status: 'ACTIVE' | 'INACTIVE' }) => api(`/departments/${d.id}/status`, { method: 'PATCH', body: { status: d.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">Departments</h3>
        <button className="btn-primary" onClick={() => setOpen(true)}>+ Add Department</button>
      </div>
      <table className="w-full">
        <thead className="border-b border-ink-700"><tr><th className="th">Department</th><th className="th">Head</th><th className="th">Parent Dept</th><th className="th">Assets</th><th className="th">Status</th></tr></thead>
        <tbody className="divide-y divide-ink-800">
          {departments?.map((d) => (
            <tr key={d.id}>
              <td className="td font-medium text-white">{d.name}</td>
              <td className="td">{d.head?.name ?? '—'}</td>
              <td className="td">{d.parent?.name ?? '—'}</td>
              <td className="td">{d._count?.assets ?? 0}</td>
              <td className="td"><button onClick={() => toggleStatus.mutate({ id: d.id, status: d.status })}><StatusBadge status={d.status} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={open} onClose={() => setOpen(false)} title="New Department">
        <div className="space-y-4">
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Department Head">
            <select className="input" value={headId} onChange={(e) => setHeadId(e.target.value)}>
              <option value="">— None —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Parent Department (hierarchy)">
            <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— None —</option>
              {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <button className="btn-primary w-full" onClick={() => create.mutate()} disabled={!name || create.isPending}>Create</button>
        </div>
      </Modal>
    </div>
  );
}

function CategoriesTab() {
  const qc = useQueryClient();
  const { data: categories, isLoading } = useCategories();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [warranty, setWarranty] = useState('');

  const create = useMutation({
    mutationFn: () => api('/categories', { method: 'POST', body: { name, customFields: warranty ? { warrantyPeriodMonths: Number(warranty) } : null } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setOpen(false); setName(''); setWarranty(''); toast('Category created', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">Asset Categories</h3>
        <button className="btn-primary" onClick={() => setOpen(true)}>+ Add Category</button>
      </div>
      <table className="w-full">
        <thead className="border-b border-ink-700"><tr><th className="th">Category</th><th className="th">Custom Fields</th><th className="th">Assets</th></tr></thead>
        <tbody className="divide-y divide-ink-800">
          {categories?.map((c) => (
            <tr key={c.id}>
              <td className="td font-medium text-white">{c.name}</td>
              <td className="td text-slate-400">{c.customFields ? JSON.stringify(c.customFields) : '—'}</td>
              <td className="td">{c._count?.assets ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={open} onClose={() => setOpen(false)} title="New Category">
        <div className="space-y-4">
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Electronics" /></Field>
          <Field label="Warranty period (months, optional)"><input className="input" type="number" value={warranty} onChange={(e) => setWarranty(e.target.value)} /></Field>
          <button className="btn-primary w-full" onClick={() => create.mutate()} disabled={!name || create.isPending}>Create</button>
        </div>
      </Modal>
    </div>
  );
}

const ROLES: Role[] = ['EMPLOYEE', 'DEPARTMENT_HEAD', 'ASSET_MANAGER', 'ADMIN'];

function EmployeesTab() {
  const qc = useQueryClient();
  const { data: employees, isLoading } = useEmployees();

  const setRole = useMutation({
    mutationFn: (p: { id: string; role: Role }) => api(`/employees/${p.id}/role`, { method: 'PATCH', body: { role: p.role } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast('Role updated', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });
  const setStatus = useMutation({
    mutationFn: (p: { id: string; status: 'ACTIVE' | 'INACTIVE' }) => api(`/employees/${p.id}/status`, { method: 'PATCH', body: { status: p.status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });

  if (isLoading) return <Spinner />;
  if (!employees?.length) return <EmptyState title="No employees yet" />;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-ink-700 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">Employee Directory</h3>
        <p className="text-xs text-slate-500">The only place roles are assigned — promote employees to Dept Head / Asset Manager here.</p>
      </div>
      <table className="w-full">
        <thead className="border-b border-ink-700"><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Department</th><th className="th">Role</th><th className="th">Status</th></tr></thead>
        <tbody className="divide-y divide-ink-800">
          {employees.map((e) => (
            <tr key={e.id}>
              <td className="td font-medium text-white">{e.name}</td>
              <td className="td text-slate-400">{e.email}</td>
              <td className="td">{e.department?.name ?? '—'}</td>
              <td className="td">
                <select className="input max-w-[180px]" value={e.role} onChange={(ev) => setRole.mutate({ id: e.id, role: ev.target.value as Role })}>
                  {ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
                </select>
              </td>
              <td className="td">
                <button onClick={() => setStatus.mutate({ id: e.id, status: e.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>
                  <StatusBadge status={e.status} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
