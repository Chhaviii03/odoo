import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { PageHeader, StatusBadge, Modal, Field, Spinner, EmptyState } from '../components/ui';
import { toast } from '../lib/toast';
import { fmtDate, humanize } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useAssets, useCategories, useDepartments } from '../features/queries';
import type { Asset } from '../lib/types';

const STATUSES = ['AVAILABLE', 'ALLOCATED', 'RESERVED', 'UNDER_MAINTENANCE', 'LOST', 'RETIRED', 'DISPOSED'];

export default function AssetsPage() {
  const { can } = useAuth();
  const [filters, setFilters] = useState<{ search?: string; status?: string; categoryId?: string; departmentId?: string }>({});
  const [registerOpen, setRegisterOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: assets, isLoading } = useAssets(filters);
  const { data: categories = [] } = useCategories();
  const { data: departments = [] } = useDepartments();
  const canManage = can(['ADMIN', 'ASSET_MANAGER']);

  return (
    <div>
      <PageHeader
        title="Assets"
        subtitle="Register, search, and track assets across their lifecycle"
        actions={canManage && <button className="btn-primary" onClick={() => setRegisterOpen(true)}>+ Register Asset</button>}
      />

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <input className="input max-w-xs" placeholder="Search by tag, name, or serial…" value={filters.search ?? ''} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        <select className="input max-w-[180px]" value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
        <select className="input max-w-[180px]" value={filters.categoryId ?? ''} onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value || undefined }))}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input max-w-[180px]" value={filters.departmentId ?? ''} onChange={(e) => setFilters((f) => ({ ...f, departmentId: e.target.value || undefined }))}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !assets?.length ? (
        <EmptyState title="No assets match your filters" hint="Try clearing the search or register a new asset." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-ink-700"><tr><th className="th">Tag</th><th className="th">Name</th><th className="th">Category</th><th className="th">Status</th><th className="th">Location</th><th className="th">Bookable</th></tr></thead>
            <tbody className="divide-y divide-ink-800">
              {assets.map((a) => (
                <tr key={a.id} className="cursor-pointer hover:bg-ink-800/50" onClick={() => setDetailId(a.id)}>
                  <td className="td font-mono text-accent-soft">{a.assetTag}</td>
                  <td className="td font-medium text-white">{a.name}</td>
                  <td className="td text-slate-400">{a.category?.name}</td>
                  <td className="td"><StatusBadge status={a.status} /></td>
                  <td className="td text-slate-400">{a.location ?? '—'}</td>
                  <td className="td">{a.isBookable ? 'Yes' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {registerOpen && <RegisterModal onClose={() => setRegisterOpen(false)} />}
      {detailId && <AssetDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function RegisterModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: categories = [] } = useCategories();
  const { data: departments = [] } = useDepartments();
  const [form, setForm] = useState<Record<string, any>>({ isBookable: false, condition: 'Good' });

  const create = useMutation({
    mutationFn: () => api('/assets', { method: 'POST', body: {
      name: form.name,
      categoryId: form.categoryId,
      departmentId: form.departmentId || null,
      serialNumber: form.serialNumber || undefined,
      location: form.location || undefined,
      condition: form.condition,
      acquisitionCost: form.acquisitionCost ? Number(form.acquisitionCost) : undefined,
      acquisitionDate: form.acquisitionDate || undefined,
      isBookable: form.isBookable,
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); toast('Asset registered — tag auto-generated', 'success'); onClose(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open onClose={onClose} title="Register Asset" wide>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name"><input className="input" onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Category">
          <select className="input" onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">Select…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Serial Number"><input className="input" onChange={(e) => set('serialNumber', e.target.value)} /></Field>
        <Field label="Owning Department">
          <select className="input" onChange={(e) => set('departmentId', e.target.value)}>
            <option value="">— None —</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Acquisition Date"><input className="input" type="date" onChange={(e) => set('acquisitionDate', e.target.value)} /></Field>
        <Field label="Acquisition Cost"><input className="input" type="number" onChange={(e) => set('acquisitionCost', e.target.value)} /></Field>
        <Field label="Condition">
          <select className="input" value={form.condition} onChange={(e) => set('condition', e.target.value)}>
            {['Excellent', 'Good', 'Fair', 'Poor'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Location"><input className="input" onChange={(e) => set('location', e.target.value)} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.isBookable} onChange={(e) => set('isBookable', e.target.checked)} />
          Shared / bookable resource
        </label>
      </div>
      <button className="btn-primary mt-5 w-full" disabled={!form.name || !form.categoryId || create.isPending} onClick={() => create.mutate()}>Register</button>
    </Modal>
  );
}

function AssetDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: asset } = useQuery({ queryKey: ['asset', id], queryFn: () => api<Asset>(`/assets/${id}`) });
  const { data: history } = useQuery({ queryKey: ['asset-history', id], queryFn: () => api<any>(`/assets/${id}/history`) });

  return (
    <Modal open onClose={onClose} title={asset ? `${asset.assetTag} · ${asset.name}` : 'Asset'} wide>
      {!asset ? <Spinner /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Status"><StatusBadge status={asset.status} /></Info>
            <Info label="Category">{asset.category?.name}</Info>
            <Info label="Department">{asset.department?.name ?? '—'}</Info>
            <Info label="Serial">{asset.serialNumber ?? '—'}</Info>
            <Info label="Condition">{asset.condition ?? '—'}</Info>
            <Info label="Location">{asset.location ?? '—'}</Info>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Status History</h4>
            <div className="space-y-1">
              {history?.statusHistory?.length ? history.statusHistory.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between rounded-lg bg-ink-800/60 px-3 py-2 text-sm">
                  <span className="text-slate-300">{humanize(h.fromStatus) || 'New'} → {humanize(h.toStatus)}</span>
                  <span className="text-slate-500">{h.reason} · {fmtDate(h.changedAt)}</span>
                </div>
              )) : <p className="text-sm text-slate-500">No history.</p>}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Allocation History</h4>
            <div className="space-y-1">
              {history?.allocations?.length ? history.allocations.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg bg-ink-800/60 px-3 py-2 text-sm">
                  <span className="text-slate-300">{a.employee?.name ?? a.department?.name ?? 'Unknown'}</span>
                  <span className="text-slate-500"><StatusBadge status={a.status} /> · {fmtDate(a.allocatedAt)}</span>
                </div>
              )) : <p className="text-sm text-slate-500">No allocations.</p>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-ink-800/60 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-0.5 text-slate-200">{children}</div>
    </div>
  );
}
