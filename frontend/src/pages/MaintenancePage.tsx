import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { PageHeader, StatusBadge, Modal, Field, Spinner } from '../components/ui';
import { toast } from '../lib/toast';
import { useAuth } from '../lib/auth';
import { useAssets } from '../features/queries';
import { fmtDate } from '../lib/format';

const COLUMNS: { status: string; label: string }[] = [
  { status: 'PENDING', label: 'Pending' },
  { status: 'APPROVED', label: 'Approved' },
  { status: 'TECHNICIAN_ASSIGNED', label: 'Technician assigned' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'RESOLVED', label: 'Resolved' },
];

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api<{ url: string }>('/uploads', { method: 'POST', body: fd });
  return res.url;
}

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
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn-primary flex-1 px-2 py-1.5 text-xs"
              disabled={act.isPending}
              onClick={() => act.mutate({ id, action: 'approve' })}
            >
              Approve
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-500/20"
              disabled={act.isPending}
              onClick={() => act.mutate({ id, action: 'reject' })}
            >
              Reject
            </button>
          </div>
        );
      case 'APPROVED':
        return (
          <button
            type="button"
            className="btn-ghost mt-3 w-full px-2 py-1.5 text-xs"
            disabled={act.isPending}
            onClick={() => {
              const name = prompt('Technician name?');
              if (name) act.mutate({ id, action: 'assign-technician', body: { technicianName: name } });
            }}
          >
            Assign Technician
          </button>
        );
      case 'TECHNICIAN_ASSIGNED':
        return (
          <button
            type="button"
            className="btn-ghost mt-3 w-full px-2 py-1.5 text-xs"
            disabled={act.isPending}
            onClick={() => act.mutate({ id, action: 'start' })}
          >
            Start Work
          </button>
        );
      case 'IN_PROGRESS':
        return (
          <button
            type="button"
            className="btn-primary mt-3 w-full px-2 py-1.5 text-xs"
            disabled={act.isPending}
            onClick={() => act.mutate({ id, action: 'resolve', body: { notes: 'Repaired' } })}
          >
            Resolve
          </button>
        );
      default:
        return null;
    }
  }

  function cardSummary(r: any) {
    const tag = r.asset?.assetTag ?? '—';
    const issue = r.issue ?? '';
    if (r.status === 'TECHNICIAN_ASSIGNED' && r.technicianName) {
      return `${tag} · ${r.asset?.name ?? ''} · tech: ${r.technicianName}`;
    }
    if (r.status === 'RESOLVED') {
      return `${tag} · ${issue}${r.resolvedAt ? ` · resolved ${fmtDate(r.resolvedAt)}` : ''}`;
    }
    return `${tag} · ${issue}`;
  }

  return (
    <div className="-m-6 flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="shrink-0 px-6 pt-6">
        <PageHeader
          title="Maintenance Management"
          subtitle="Route repairs through approval before work starts"
          actions={<button className="btn-primary" onClick={() => setRaiseOpen(true)}>+ Raise Request</button>}
        />
      </div>

      {isLoading ? (
        <div className="px-6"><Spinner /></div>
      ) : (
        <div className="mx-6 mb-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-300 bg-white">
          <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-gray-300 overflow-hidden md:grid-cols-3 md:divide-x md:divide-y-0 xl:grid-cols-5">
            {COLUMNS.map((col) => {
              const items = requests?.filter((r) => r.status === col.status) ?? [];
              return (
                <div key={col.status} className="flex min-h-0 min-w-0 flex-col">
                  <div className="shrink-0 border-b border-gray-300 px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{col.label}</h3>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{items.length}</span>
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
                    {items.map((r) => {
                      const resolved = r.status === 'RESOLVED';
                      return (
                        <div
                          key={r.id}
                          className={`shrink-0 rounded-lg border p-3 ${
                            resolved
                              ? 'border-emerald-500/50 bg-emerald-500/10'
                              : 'border-gray-300 bg-gray-100'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm leading-snug text-gray-900">{cardSummary(r)}</p>
                            <StatusBadge status={r.priority} />
                          </div>
                          {r.photoUrl && (
                            <a href={r.photoUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                              <img
                                src={r.photoUrl}
                                alt="Issue"
                                className="h-16 w-full rounded-md border border-gray-300 object-cover"
                              />
                            </a>
                          )}
                          {r.raisedBy?.name && (
                            <p className="mt-2 text-[11px] text-gray-600">Raised by {r.raisedBy.name}</p>
                          )}
                          {nextAction(r.status, r.id)}
                        </div>
                      );
                    })}
                    {items.length === 0 && (
                      <p className="py-8 text-center text-xs text-gray-700">No requests</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="shrink-0 border-t border-gray-300 px-4 py-3 text-xs text-gray-600">
            Approving a card moves the asset to under maintenance; resolving returns it to available.
            {canApprove && ' Admins and Asset Managers can approve or reject pending requests.'}
          </div>
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
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      api('/maintenance-requests', {
        method: 'POST',
        body: { assetId, issue, priority, photoUrl },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      toast('Maintenance request raised', 'success');
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setPhotoUrl(url);
      toast('Photo attached', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Photo upload failed', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <Modal open onClose={onClose} title="Raise Maintenance Request">
      <div className="space-y-4">
        <Field label="Asset">
          <select className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">Select…</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.assetTag} · {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Issue">
          <textarea className="input h-24" value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Describe the problem…" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Priority">
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Attach Photo">
            <input
              className="input file:mr-3 file:rounded file:border-0 file:bg-gray-200 file:px-2 file:py-1 file:text-xs file:text-gray-800"
              type="file"
              accept="image/*"
              onChange={onPhotoChange}
              disabled={uploading}
            />
          </Field>
        </div>
        {photoUrl && (
          <div className="flex items-center gap-3 rounded-lg border border-gray-300 bg-gray-100 p-2">
            <img src={photoUrl} alt="Issue preview" className="h-16 w-16 rounded-md border border-gray-300 object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-gray-600">{photoUrl}</p>
              <button type="button" className="mt-1 text-xs text-rose-700 hover:underline" onClick={() => setPhotoUrl(undefined)}>
                Remove photo
              </button>
            </div>
          </div>
        )}
        <button
          className="btn-primary w-full"
          disabled={!assetId || !issue || uploading || create.isPending}
          onClick={() => create.mutate()}
        >
          {uploading ? 'Uploading…' : create.isPending ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </Modal>
  );
}
