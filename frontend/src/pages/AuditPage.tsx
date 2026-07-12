import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { PageHeader, StatusBadge, Modal, Field, Spinner, EmptyState } from '../components/ui';
import { toast } from '../lib/toast';
import { fmtDate } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useDepartments, useEmployees } from '../features/queries';

export default function AuditPage() {
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: cycles, isLoading } = useQuery({ queryKey: ['audit-cycles'], queryFn: () => api<any[]>('/audit-cycles') });
  const canManage = can(['ADMIN', 'ASSET_MANAGER']);

  return (
    <div>
      <PageHeader title="Asset Audit" subtitle="Structured verification cycles with auto-generated discrepancy reports" actions={canManage && <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ New Audit Cycle</button>} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden">
          <div className="border-b border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900">Audit Cycles</div>
          {isLoading ? <Spinner /> : !cycles?.length ? <EmptyState title="No audit cycles" /> : (
            <div className="divide-y divide-gray-200">
              {cycles.map((c) => {
                const auditors = (c.assignments ?? []).map((a: any) => a.auditor?.name).filter(Boolean);
                return (
                  <button key={c.id} onClick={() => setSelectedId(c.id)} className={`flex w-full items-start justify-between gap-2 px-4 py-3 text-left hover:bg-gray-100 ${selectedId === c.id ? 'bg-gray-100' : ''}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-600">{fmtDate(c.startDate)} – {fmtDate(c.endDate)} · {c._count?.items ?? 0} items</p>
                      <p className="mt-0.5 truncate text-xs text-gray-600">
                        {auditors.length ? `Auditors: ${auditors.join(', ')}` : 'No auditors assigned'}
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="lg:col-span-2">
          {selectedId ? <CycleDetail cycleId={selectedId} canManage={canManage} /> : <EmptyState title="Select an audit cycle" hint="Pick a cycle to verify items and view discrepancies." />}
        </div>
      </div>
      {createOpen && <CreateCycleModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function CycleDetail({ cycleId, canManage }: { cycleId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: items, isLoading } = useQuery({ queryKey: ['audit-items', cycleId], queryFn: () => api<any[]>(`/audit-cycles/${cycleId}/items`) });
  const { data: cycles } = useQuery({ queryKey: ['audit-cycles'], queryFn: () => api<any[]>('/audit-cycles') });
  const cycle = cycles?.find((c) => c.id === cycleId);
  const closed = cycle?.status === 'CLOSED';
  const auditors = (cycle?.assignments ?? []).map((a: any) => a.auditor).filter(Boolean);
  const isAssigned = auditors.some((a: any) => a.id === user?.id);
  const canVerify = canManage || isAssigned;

  const verify = useMutation({
    mutationFn: (p: { id: string; status: string }) => api(`/audit-items/${p.id}/verify`, { method: 'PATCH', body: { verificationStatus: p.status } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-items', cycleId] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const close = useMutation({
    mutationFn: () => api(`/audit-cycles/${cycleId}/close`, { method: 'PATCH' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-cycles'] }); qc.invalidateQueries({ queryKey: ['assets'] }); toast('Cycle closed — missing assets marked Lost', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const discrepancies = items?.filter((i) => ['MISSING', 'DAMAGED'].includes(i.verificationStatus)) ?? [];

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      {cycle && (
        <div className="card flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{cycle.name}</p>
            <p className="mt-0.5 text-xs text-gray-600">
              Auditors: {auditors.length ? auditors.map((a: any) => a.name).join(', ') : <span className="text-gray-600">none assigned</span>}
            </p>
          </div>
          {!closed && !canVerify && (
            <span className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-1 text-xs text-gray-600">
              View only — you are not an assigned auditor
            </span>
          )}
        </div>
      )}

      {discrepancies.length > 0 && (
        <div className="card border-orange-500/40 bg-orange-500/10 p-4">
          <p className="text-sm font-semibold text-orange-800">Discrepancy report — {discrepancies.length} flagged item{discrepancies.length > 1 ? 's' : ''} (auto-generated)</p>
          <div className="mt-2 space-y-1">
            {discrepancies.map((d) => (
              <p key={d.id} className="text-xs text-orange-800/80">{d.asset?.assetTag} · {d.asset?.name} — {d.verificationStatus}</p>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-300 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Audit Items</h3>
          {canManage && !closed && <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => close.mutate()}>Close Cycle</button>}
        </div>
        <table className="w-full">
          <thead className="border-b border-gray-300"><tr><th className="th">Asset</th><th className="th">Expected Location</th><th className="th">Verification</th><th className="th">Action</th></tr></thead>
          <tbody className="divide-y divide-gray-200">
            {items?.map((i) => (
              <tr key={i.id}>
                <td className="td"><span className="font-mono text-accent-soft">{i.asset?.assetTag}</span> · {i.asset?.name}</td>
                <td className="td text-gray-600">{i.expectedLocation ?? '—'}</td>
                <td className="td"><StatusBadge status={i.verificationStatus} /></td>
                <td className="td">
                  {!closed && canVerify ? (
                    <div className="flex gap-1">
                      {['VERIFIED', 'MISSING', 'DAMAGED'].map((s) => (
                        <button key={s} className="btn-ghost px-2 py-1 text-xs" onClick={() => verify.mutate({ id: i.id, status: s })}>{s[0] + s.slice(1).toLowerCase()}</button>
                      ))}
                    </div>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateCycleModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: departments = [] } = useDepartments();
  const { data: employees = [] } = useEmployees();
  const [form, setForm] = useState<Record<string, any>>({ startDate: new Date().toISOString().slice(0, 10), endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), auditorIds: [] });

  const create = useMutation({
    mutationFn: () => api('/audit-cycles', { method: 'POST', body: {
      name: form.name,
      scopeDepartmentId: form.scopeDepartmentId || null,
      scopeLocation: form.scopeLocation || null,
      startDate: form.startDate,
      endDate: form.endDate,
      auditorIds: form.auditorIds,
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-cycles'] }); toast('Audit cycle created', 'success'); onClose(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const toggleAuditor = (id: string) => setForm((f) => ({ ...f, auditorIds: f.auditorIds.includes(id) ? f.auditorIds.filter((x: string) => x !== id) : [...f.auditorIds, id] }));

  return (
    <Modal open onClose={onClose} title="New Audit Cycle" wide>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Cycle Name"><input className="input" onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Scope: Department">
          <select className="input" onChange={(e) => set('scopeDepartmentId', e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Start Date"><input className="input" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="End Date"><input className="input" type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
      </div>
      <div className="mt-4">
        <span className="label">Assign Auditors</span>
        <div className="flex flex-wrap gap-2">
          {employees.map((e) => (
            <button key={e.id} onClick={() => toggleAuditor(e.id)} className={`rounded-lg border px-3 py-1.5 text-xs ${form.auditorIds.includes(e.id) ? 'border-accent bg-accent/15 text-accent-soft' : 'border-gray-300 bg-gray-100 text-gray-700'}`}>{e.name}</button>
          ))}
        </div>
      </div>
      <button className="btn-primary mt-5 w-full" disabled={!form.name || create.isPending} onClick={() => create.mutate()}>Create Cycle</button>
    </Modal>
  );
}
