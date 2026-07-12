import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { PageHeader, StatusBadge, Field, Spinner, EmptyState } from '../components/ui';
import { toast } from '../lib/toast';
import { fmtDate } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useAssets, useEmployees } from '../features/queries';
import type { Asset } from '../lib/types';

export default function AllocationPage() {
  const { can } = useAuth();
  const [selected, setSelected] = useState<Asset | null>(null);
  const { data: assets, isLoading } = useAssets();
  const canManage = can(['ADMIN', 'ASSET_MANAGER']);

  return (
    <div>
      <PageHeader title="Allocation & Transfer" subtitle="Manage who holds what, with explicit conflict rules" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-1">
          <div className="border-b border-ink-700 px-4 py-3 text-sm font-semibold text-white">Assets</div>
          {isLoading ? <Spinner /> : (
            <div className="max-h-[70vh] divide-y divide-ink-800 overflow-y-auto">
              {assets?.map((a) => (
                <button key={a.id} onClick={() => setSelected(a)} className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-ink-800/50 ${selected?.id === a.id ? 'bg-ink-800' : ''}`}>
                  <div>
                    <p className="font-mono text-xs text-accent-soft">{a.assetTag}</p>
                    <p className="text-sm text-slate-200">{a.name}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          {selected ? <AllocationPanel asset={selected} canManage={canManage} /> : <EmptyState title="Select an asset" hint="Pick an asset from the list to allocate, transfer, or return it." />}
        </div>
      </div>

      <TransfersList canApprove={can(['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'])} />
    </div>
  );
}

function AllocationPanel({ asset, canManage }: { asset: Asset; canManage: boolean }) {
  const qc = useQueryClient();
  const { data: employees = [] } = useEmployees();
  const { data: allocations } = useQuery({ queryKey: ['asset-allocations', asset.id], queryFn: () => api<any[]>(`/assets/${asset.id}/allocations`) });
  const [employeeId, setEmployeeId] = useState('');
  const [expected, setExpected] = useState('');
  const [conflict, setConflict] = useState<any | null>(null);
  const [transferReason, setTransferReason] = useState('');

  const activeAlloc = allocations?.find((a) => a.status === 'ACTIVE' || a.status === 'OVERDUE');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['asset-allocations', asset.id] });
    qc.invalidateQueries({ queryKey: ['assets'] });
    qc.invalidateQueries({ queryKey: ['transfers'] });
  };

  const allocate = useMutation({
    mutationFn: () => api('/allocations', { method: 'POST', body: { assetId: asset.id, employeeId, expectedReturnDate: expected || null } }),
    onSuccess: () => { setConflict(null); invalidate(); toast('Asset allocated', 'success'); },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) { setConflict(e.details); toast(e.message, 'error'); }
      else toast(e instanceof ApiError ? e.message : 'Failed', 'error');
    },
  });

  const requestTransfer = useMutation({
    mutationFn: () => api('/transfers', { method: 'POST', body: { assetId: asset.id, toEmployeeId: employeeId, reason: transferReason } }),
    onSuccess: () => { setConflict(null); invalidate(); toast('Transfer request raised', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const doReturn = useMutation({
    mutationFn: (note: string) => api(`/allocations/${activeAlloc.id}/return`, { method: 'POST', body: { returnConditionNote: note } }),
    onSuccess: () => { invalidate(); toast('Asset returned', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs text-accent-soft">{asset.assetTag}</p>
            <h3 className="text-lg font-semibold text-white">{asset.name}</h3>
          </div>
          <StatusBadge status={asset.status} />
        </div>

        {activeAlloc && (
          <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
            <p className="text-blue-200">Currently held by <span className="font-semibold">{activeAlloc.employee?.name ?? activeAlloc.department?.name}</span></p>
            <p className="text-blue-300/70">Expected return: {fmtDate(activeAlloc.expectedReturnDate)}</p>
          </div>
        )}

        {conflict && (
          <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4">
            <p className="text-sm font-semibold text-rose-200">Already allocated to {conflict.currentHolder?.name}</p>
            <p className="mt-1 text-xs text-rose-300/80">You can't double-allocate this asset. Raise a transfer request instead.</p>
            <div className="mt-3 space-y-2">
              <input className="input" placeholder="Reason for transfer" value={transferReason} onChange={(e) => setTransferReason(e.target.value)} />
              <button className="btn-danger w-full" disabled={!employeeId || requestTransfer.isPending} onClick={() => requestTransfer.mutate()}>Raise Transfer Request</button>
            </div>
          </div>
        )}

        {canManage && !activeAlloc && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Allocate to employee">
              <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Select…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Expected return (optional)"><input className="input" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>
            <div className="col-span-2">
              <button className="btn-primary w-full" disabled={!employeeId || allocate.isPending} onClick={() => allocate.mutate()}>Allocate</button>
            </div>
          </div>
        )}

        {canManage && activeAlloc && (
          <div className="mt-4">
            <Field label="Transfer to / Return">
              <select className="input mb-2" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Select employee for transfer…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" disabled={!employeeId} onClick={() => requestTransfer.mutate()}>Request Transfer</button>
              <button className="btn-ghost flex-1" onClick={() => doReturn.mutate('Returned in good condition')}>Mark Returned</button>
            </div>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h4 className="mb-2 text-sm font-semibold text-white">Allocation History</h4>
        <div className="space-y-1">
          {allocations?.length ? allocations.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg bg-ink-800/60 px-3 py-2 text-sm">
              <span className="text-slate-300">{a.employee?.name ?? a.department?.name ?? '—'}</span>
              <span className="text-slate-500"><StatusBadge status={a.status} /> · {fmtDate(a.allocatedAt)}{a.returnedAt ? ` → ${fmtDate(a.returnedAt)}` : ''}</span>
            </div>
          )) : <p className="text-sm text-slate-500">No allocation history.</p>}
        </div>
      </div>
    </div>
  );
}

function TransfersList({ canApprove }: { canApprove: boolean }) {
  const qc = useQueryClient();
  const { data: transfers } = useQuery({ queryKey: ['transfers'], queryFn: () => api<any[]>('/transfers') });
  const act = useMutation({
    mutationFn: (p: { id: string; action: 'approve' | 'reject' }) => api(`/transfers/${p.id}/${p.action}`, { method: 'PATCH' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); qc.invalidateQueries({ queryKey: ['assets'] }); toast('Transfer updated', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const pending = transfers?.filter((t) => t.status === 'REQUESTED') ?? [];

  return (
    <div className="card mt-6 overflow-hidden">
      <div className="border-b border-ink-700 px-4 py-3 text-sm font-semibold text-white">Transfer Requests</div>
      {!transfers?.length ? <p className="p-4 text-sm text-slate-500">No transfer requests.</p> : (
        <table className="w-full">
          <thead className="border-b border-ink-700"><tr><th className="th">Asset</th><th className="th">From</th><th className="th">To</th><th className="th">Reason</th><th className="th">Status</th><th className="th">Action</th></tr></thead>
          <tbody className="divide-y divide-ink-800">
            {transfers.map((t) => (
              <tr key={t.id}>
                <td className="td font-mono text-accent-soft">{t.asset?.assetTag}</td>
                <td className="td">{t.fromEmployee?.name ?? '—'}</td>
                <td className="td">{t.toEmployee?.name ?? '—'}</td>
                <td className="td text-slate-400">{t.reason ?? '—'}</td>
                <td className="td"><StatusBadge status={t.status} /></td>
                <td className="td">
                  {canApprove && t.status === 'REQUESTED' ? (
                    <div className="flex gap-1">
                      <button className="btn-primary px-2 py-1 text-xs" onClick={() => act.mutate({ id: t.id, action: 'approve' })}>Approve</button>
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => act.mutate({ id: t.id, action: 'reject' })}>Reject</button>
                    </div>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pending.length > 0 && <p className="px-4 py-2 text-xs text-amber-300">{pending.length} awaiting approval</p>}
    </div>
  );
}
