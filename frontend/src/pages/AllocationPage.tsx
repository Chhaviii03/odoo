import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { PageHeader, StatusBadge, Field, Spinner, EmptyState } from '../components/ui';
import { toast } from '../lib/toast';
import { fmtDate } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useAssets, useAllocationEmployees, useDepartments } from '../features/queries';
import type { Asset } from '../lib/types';

export default function AllocationPage() {
  const { can, user } = useAuth();
  const [selected, setSelected] = useState<Asset | null>(null);
  const { data: assets, isLoading } = useAssets({ context: 'allocation' });
  const canManage = can(['ADMIN', 'ASSET_MANAGER']);
  const isEmployee = user?.role === 'EMPLOYEE';

  return (
    <div>
      <PageHeader
        title="Allocation & Transfer"
        subtitle={canManage ? 'Manage who holds what, with explicit conflict rules' : isEmployee ? 'Request transfers or return assets allocated to you' : 'Review transfers within your department'}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-1">
          <div className="border-b border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900">Assets</div>
          {isLoading ? <Spinner /> : (
            <div className="max-h-[70vh] divide-y divide-gray-200 overflow-y-auto">
              {assets?.map((a) => (
                <button key={a.id} onClick={() => setSelected(a)} className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-100 ${selected?.id === a.id ? 'bg-gray-100' : ''}`}>
                  <div>
                    <p className="font-mono text-xs text-accent-soft">{a.assetTag}</p>
                    <p className="text-sm text-gray-800">{a.name}</p>
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
  const { user } = useAuth();
  const { data: employees = [] } = useAllocationEmployees(canManage);
  const { data: departments = [] } = useDepartments();
  const { data: allocations } = useQuery({ queryKey: ['asset-allocations', asset.id], queryFn: () => api<any[]>(`/assets/${asset.id}/allocations`) });
  const { data: transfers = [] } = useQuery({ queryKey: ['transfers'], queryFn: () => api<any[]>('/transfers') });
  const [targetType, setTargetType] = useState<'employee' | 'department'>('employee');
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [expected, setExpected] = useState('');
  const [conflict, setConflict] = useState<any | null>(null);
  const [transferReason, setTransferReason] = useState('');
  const [returnNote, setReturnNote] = useState('');

  const activeAlloc = allocations?.find((a) => a.status === 'ACTIVE' || a.status === 'OVERDUE');
  const isHolder = activeAlloc?.employeeId === user?.id;
  const heldByOther = activeAlloc && !isHolder;

  const pendingTransfer = transfers.find(
    (t) => t.assetId === asset.id && t.status === 'REQUESTED',
  );
  const myPendingTransfer = transfers.find(
    (t) => t.assetId === asset.id && t.status === 'REQUESTED' && (t.toEmployeeId === user?.id || t.requestedById === user?.id),
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['asset-allocations', asset.id] });
    qc.invalidateQueries({ queryKey: ['assets'] });
    qc.invalidateQueries({ queryKey: ['transfers'] });
  };

  const allocate = useMutation({
    mutationFn: () => api('/allocations', {
      method: 'POST',
      body: {
        assetId: asset.id,
        employeeId: targetType === 'employee' ? employeeId : null,
        departmentId: targetType === 'department' ? departmentId : null,
        expectedReturnDate: expected || null,
      },
    }),
    onSuccess: () => { setConflict(null); invalidate(); toast('Asset allocated', 'success'); },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) { setConflict(e.details); toast(e.message, 'error'); }
      else toast(e instanceof ApiError ? e.message : 'Failed', 'error');
    },
  });

  const requestTransfer = useMutation({
    mutationFn: (payload?: { toSelf?: boolean }) => api('/transfers', {
      method: 'POST',
      body: {
        assetId: asset.id,
        ...(payload?.toSelf ? {} : { toEmployeeId: employeeId }),
        reason: transferReason,
      },
    }),
    onSuccess: () => {
      setConflict(null);
      setTransferReason('');
      invalidate();
      toast('Transfer request raised', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const doReturn = useMutation({
    mutationFn: () => api(`/allocations/${activeAlloc.id}/return`, { method: 'POST', body: { returnConditionNote: returnNote || undefined } }),
    onSuccess: () => { setReturnNote(''); invalidate(); toast('Asset returned', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs text-accent-soft">{asset.assetTag}</p>
            <h3 className="text-lg font-semibold text-gray-900">{asset.name}</h3>
          </div>
          <StatusBadge status={asset.status} />
        </div>

        {activeAlloc && (
          <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
            <p className="text-blue-800">Currently held by <span className="font-semibold">{activeAlloc.employee?.name ?? activeAlloc.department?.name}</span></p>
            <p className="text-blue-700/70">Expected return: {fmtDate(activeAlloc.expectedReturnDate)}</p>
            {activeAlloc.status === 'OVERDUE' && <p className="mt-1 text-rose-700">This allocation is overdue.</p>}
          </div>
        )}

        {(myPendingTransfer || pendingTransfer) && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium text-amber-800">Transfer request pending approval</p>
            <p className="mt-1 text-amber-800/80">
              {(myPendingTransfer ?? pendingTransfer)?.fromEmployee?.name ?? 'Current holder'}
              {' → '}
              {(myPendingTransfer ?? pendingTransfer)?.toEmployee?.name ?? '—'}
              {(myPendingTransfer ?? pendingTransfer)?.reason
                ? ` · ${(myPendingTransfer ?? pendingTransfer)?.reason}`
                : ''}
            </p>
          </div>
        )}

        {conflict && !pendingTransfer && (
          <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4">
            <p className="text-sm font-semibold text-rose-800">Already allocated to {conflict.currentHolder?.name}</p>
            <p className="mt-1 text-xs text-rose-700/80">You can't double-allocate this asset. Raise a transfer request instead.</p>
            <div className="mt-3 space-y-2">
              <input className="input" placeholder="Reason for transfer" value={transferReason} onChange={(e) => setTransferReason(e.target.value)} />
              {canManage ? (
                <>
                  <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                    <option value="">Transfer to employee…</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <button className="btn-danger w-full" disabled={!employeeId || requestTransfer.isPending} onClick={() => requestTransfer.mutate({})}>Raise Transfer Request</button>
                </>
              ) : (
                <button className="btn-danger w-full" disabled={requestTransfer.isPending} onClick={() => requestTransfer.mutate({ toSelf: true })}>Request Transfer to Me</button>
              )}
            </div>
          </div>
        )}

        {canManage && !activeAlloc && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Allocate to">
              <select className="input mb-2" value={targetType} onChange={(e) => setTargetType(e.target.value as 'employee' | 'department')}>
                <option value="employee">Employee</option>
                <option value="department">Department</option>
              </select>
              {targetType === 'employee' ? (
                <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">Select employee…</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              ) : (
                <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">Select department…</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
            </Field>
            <Field label="Expected return (optional)"><input className="input" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>
            <div className="col-span-2">
              <button
                className="btn-primary w-full"
                disabled={(targetType === 'employee' ? !employeeId : !departmentId) || allocate.isPending}
                onClick={() => allocate.mutate()}
              >
                Allocate
              </button>
            </div>
          </div>
        )}

        {canManage && activeAlloc && !pendingTransfer && (
          <div className="mt-4">
            <Field label="Transfer to">
              <select className="input mb-2" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Select employee for transfer…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <input className="input mb-2" placeholder="Reason for transfer (optional)" value={transferReason} onChange={(e) => setTransferReason(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" disabled={!employeeId || requestTransfer.isPending} onClick={() => requestTransfer.mutate({})}>Request Transfer</button>
              <button className="btn-ghost flex-1" disabled={doReturn.isPending} onClick={() => doReturn.mutate()}>Mark Returned</button>
            </div>
            <input className="input mt-2" placeholder="Return condition note (optional)" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} />
          </div>
        )}

        {canManage && activeAlloc && pendingTransfer && (
          <div className="mt-4">
            <button className="btn-ghost w-full" disabled={doReturn.isPending} onClick={() => doReturn.mutate()}>Mark Returned</button>
            <input className="input mt-2" placeholder="Return condition note (optional)" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} />
          </div>
        )}

        {!canManage && heldByOther && !myPendingTransfer && (
          <div className="mt-4 space-y-2">
            <input className="input" placeholder="Reason for transfer (optional)" value={transferReason} onChange={(e) => setTransferReason(e.target.value)} />
            <button className="btn-primary w-full" disabled={requestTransfer.isPending} onClick={() => requestTransfer.mutate({ toSelf: true })}>
              Request Transfer to Me
            </button>
          </div>
        )}

        {!canManage && isHolder && (
          <div className="mt-4 space-y-2">
            <Field label="Return condition note">
              <input className="input" placeholder="e.g. Returned in good condition" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} />
            </Field>
            <button className="btn-primary w-full" disabled={doReturn.isPending} onClick={() => doReturn.mutate()}>
              Return Asset
            </button>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h4 className="mb-2 text-sm font-semibold text-gray-900">Allocation History</h4>
        <div className="space-y-1">
          {allocations?.length ? allocations.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg bg-gray-100 px-3 py-2 text-sm">
              <span className="text-gray-700">{a.employee?.name ?? a.department?.name ?? '—'}</span>
              <span className="text-gray-600">
                <StatusBadge status={a.status} /> · {fmtDate(a.allocatedAt)}{a.returnedAt ? ` → ${fmtDate(a.returnedAt)}` : ''}
                {a.returnConditionNote ? ` · ${a.returnConditionNote}` : ''}
              </span>
            </div>
          )) : <p className="text-sm text-gray-600">No allocation history.</p>}
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
      <div className="border-b border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900">Transfer Requests</div>
      {!transfers?.length ? <p className="p-4 text-sm text-gray-600">No transfer requests.</p> : (
        <table className="w-full">
          <thead className="border-b border-gray-300"><tr><th className="th">Asset</th><th className="th">From</th><th className="th">To</th><th className="th">Reason</th><th className="th">Status</th><th className="th">Action</th></tr></thead>
          <tbody className="divide-y divide-gray-200">
            {transfers.map((t) => (
              <tr key={t.id}>
                <td className="td font-mono text-accent-soft">{t.asset?.assetTag}</td>
                <td className="td">{t.fromEmployee?.name ?? '—'}</td>
                <td className="td">{t.toEmployee?.name ?? '—'}</td>
                <td className="td text-gray-600">{t.reason ?? '—'}</td>
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
      {pending.length > 0 && <p className="px-4 py-2 text-xs text-amber-700">{pending.length} awaiting approval</p>}
    </div>
  );
}
