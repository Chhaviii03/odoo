import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { PageHeader, StatusBadge, Modal, Field, Spinner } from '../components/ui';
import { toast } from '../lib/toast';
import { useAuth } from '../lib/auth';
import { useAssets } from '../features/queries';

const COLUMNS: { status: string; label: string }[] = [
  { status: 'PENDING', label: 'Pending' },
  { status: 'APPROVED', label: 'Approved' },
  { status: 'TECHNICIAN_ASSIGNED', label: 'Technician Assigned' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'RESOLVED', label: 'Resolved' },
];

export default function MaintenancePage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [raiseOpen, setRaiseOpen] = useState(false);
  const { data: requests, isLoading } = useQuery({ queryKey: ['maintenance'], queryFn: () => api<any[]>('/maintenance-requests') });
  const canApprove = can(['ADMIN', 'ASSET_MANAGER']);

  const act = useMutation({
    mutationFn: (p: { id: string; action: string; body?: any }) => api(`/maintenance-requests/${p.id}/${p.action}`, { method: 'PATCH', body: p.body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); qc.invalidateQueries({ queryKey: ['assets'] }); toast('Updated', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  function nextAction(status: string, id: string) {
    if (!canApprove) return null;
    switch (status) {
      case 'PENDING':
        return (
          <div className="mt-2 flex gap-1">
            <button className="btn-primary px-2 py-1 text-xs" onClick={() => act.mutate({ id, action: 'approve' })}>Approve</button>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => act.mutate({ id, action: 'reject' })}>Reject</button>
          </div>
        );
      case 'APPROVED':
        return <button className="btn-ghost mt-2 px-2 py-1 text-xs" onClick={() => { const name = prompt('Technician name?'); if (name) act.mutate({ id, action: 'assign-technician', body: { technicianName: name } }); }}>Assign Technician</button>;
      case 'TECHNICIAN_ASSIGNED':
        return <button className="btn-ghost mt-2 px-2 py-1 text-xs" onClick={() => act.mutate({ id, action: 'start' })}>Start Work</button>;
      case 'IN_PROGRESS':
        return <button className="btn-primary mt-2 px-2 py-1 text-xs" onClick={() => act.mutate({ id, action: 'resolve', body: { notes: 'Repaired' } })}>Resolve</button>;
      default:
        return null;
    }
  }

  return (
    <div>
      <PageHeader title="Maintenance Management" subtitle="Route repairs through approval before work starts" actions={<button className="btn-primary" onClick={() => setRaiseOpen(true)}>+ Raise Request</button>} />

      {isLoading ? <Spinner /> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = requests?.filter((r) => r.status === col.status) ?? [];
            return (
              <div key={col.status} className="card p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">{col.label}</h3>
                  <span className="rounded-full bg-ink-700 px-2 text-xs text-slate-400">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((r) => (
                    <div key={r.id} className="rounded-lg border border-ink-700 bg-ink-800/60 p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-accent-soft">{r.asset?.assetTag}</span>
                        <StatusBadge status={r.priority} />
                      </div>
                      <p className="mt-1 text-sm text-slate-200">{r.asset?.name}</p>
                      <p className="mt-1 text-xs text-slate-400">{r.issue}</p>
                      {r.technicianName && <p className="mt-1 text-xs text-indigo-300">Tech: {r.technicianName}</p>}
                      {nextAction(r.status, r.id)}
                    </div>
                  ))}
                  {items.length === 0 && <p className="py-4 text-center text-xs text-slate-600">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {raiseOpen && <RaiseModal onClose={() => setRaiseOpen(false)} />}
    </div>
  );
}

function RaiseModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: assets = [] } = useAssets();
  const [assetId, setAssetId] = useState('');
  const [issue, setIssue] = useState('');
  const [priority, setPriority] = useState('MEDIUM');

  const create = useMutation({
    mutationFn: () => api('/maintenance-requests', { method: 'POST', body: { assetId, issue, priority } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); toast('Maintenance request raised', 'success'); onClose(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  return (
    <Modal open onClose={onClose} title="Raise Maintenance Request">
      <div className="space-y-4">
        <Field label="Asset">
          <select className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">Select…</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.assetTag} · {a.name}</option>)}
          </select>
        </Field>
        <Field label="Issue"><textarea className="input h-24" value={issue} onChange={(e) => setIssue(e.target.value)} /></Field>
        <Field label="Priority">
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <button className="btn-primary w-full" disabled={!assetId || !issue || create.isPending} onClick={() => create.mutate()}>Submit</button>
      </div>
    </Modal>
  );
}
