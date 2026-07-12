import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { PageHeader, StatusBadge, Modal, Field, Spinner, EmptyState } from '../components/ui';
import { AssetFilterBar, activeFiltersToParams, type ActiveFilter } from '../components/AssetFilterBar';
import { toast } from '../lib/toast';
import { fmtDate, humanize } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useAssets, useCategories, useDepartments } from '../features/queries';
import type { Asset } from '../lib/types';

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api<{ url: string }>('/uploads', { method: 'POST', body: fd });
  return res.url;
}

export default function AssetsPage() {
  const { can, user } = useAuth();
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const queryParams = useMemo(() => activeFiltersToParams(search, activeFilters), [search, activeFilters]);
  const { data: assets, isLoading, isError, error, isFetching } = useAssets(queryParams);
  const canManage = can(['ADMIN', 'ASSET_MANAGER']);
  const hasFilters = search.trim().length > 0 || activeFilters.length > 0;

  const subtitle = canManage
    ? 'Register, search, and track assets across their lifecycle'
    : can(['DEPARTMENT_HEAD'])
      ? 'Assets owned by your department (or allocated to it)'
      : 'Assets allocated to you (current and past)';

  const emptyTitle = hasFilters
    ? 'No assets match your filters'
    : canManage
      ? 'No assets yet'
      : can(['DEPARTMENT_HEAD'])
        ? 'No assets in your department'
        : 'No assets allocated to you';

  const emptyHint = hasFilters
    ? 'Try clearing search/filters.'
    : canManage
      ? 'Register a new asset to get started.'
      : can(['DEPARTMENT_HEAD'])
        ? 'Assets appear here when they belong to your department, or are allocated to your department.'
        : 'Assets appear here after an Asset Manager allocates them to you. Book shared resources from Bookings.';

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Assets"
        subtitle={subtitle}
        actions={canManage && <button className="btn-primary" onClick={() => setRegisterOpen(true)}>+ Register Asset</button>}
      />

      <AssetFilterBar
        search={search}
        onSearchChange={setSearch}
        filters={activeFilters}
        onFiltersChange={setActiveFilters}
        resultCount={assets?.length}
        isFetching={isFetching}
      />

      {isError ? (
        <EmptyState title="Could not load assets" hint={error instanceof Error ? error.message : 'Check that the API is running.'} />
      ) : isLoading ? (
        <Spinner />
      ) : !assets?.length ? (
        <EmptyState title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-gray-300 bg-gray-100">
                  <th className="th">Tag</th>
                  <th className="th">Name</th>
                  <th className="th">Category</th>
                  <th className="th">Status</th>
                  <th className="th">Location</th>
                  <th className="th">Bookable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {assets.map((a) => (
                  <tr
                    key={a.id}
                    className="cursor-pointer transition-colors hover:bg-gray-100"
                    onClick={() => setDetailId(a.id)}
                  >
                    <td className="td font-mono text-sm font-medium text-primary">{a.assetTag}</td>
                    <td className="td font-medium text-gray-900">{a.name}</td>
                    <td className="td text-gray-700">{a.category?.name}</td>
                    <td className="td"><StatusBadge status={a.status} /></td>
                    <td className="td text-gray-700">{a.location ?? '—'}</td>
                    <td className="td text-gray-700">{a.isBookable ? 'Yes' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-gray-300 bg-gray-100 px-4 py-2.5 text-xs text-gray-600">
            Click a row to view allocation & maintenance history.
            {!canManage && user?.role === 'EMPLOYEE' && ' Showing assets allocated to you and bookable resources.'}
            {!canManage && user?.role === 'DEPARTMENT_HEAD' && " Showing only your department's assets."}
          </p>
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
  const [form, setForm] = useState<Record<string, any>>({ isBookable: false, condition: 'Good', documentUrls: [] as string[] });
  const [uploading, setUploading] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      api('/assets', {
        method: 'POST',
        body: {
          name: form.name,
          categoryId: form.categoryId,
          departmentId: form.departmentId || null,
          serialNumber: form.serialNumber || undefined,
          qrCode: form.qrCode || undefined,
          location: form.location || undefined,
          condition: form.condition,
          acquisitionCost: form.acquisitionCost ? Number(form.acquisitionCost) : undefined,
          acquisitionDate: form.acquisitionDate || undefined,
          isBookable: form.isBookable,
          photoUrl: form.photoUrl || undefined,
          documentUrls: form.documentUrls?.length ? form.documentUrls : undefined,
        },
      }),
    onSuccess: (asset: Asset) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['asset-filter-options'] });
      toast(`Asset registered as ${asset.assetTag}`, 'success');
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      set('photoUrl', url);
      toast('Photo uploaded', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Photo upload failed', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function onDocumentsChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files) urls.push(await uploadFile(file));
      set('documentUrls', [...(form.documentUrls ?? []), ...urls]);
      toast(`${urls.length} document(s) uploaded`, 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Document upload failed', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function removeDocument(url: string) {
    set(
      'documentUrls',
      (form.documentUrls as string[]).filter((u) => u !== url),
    );
  }

  return (
    <Modal open onClose={onClose} title="Register Asset" wide>
      <p className="mb-4 text-xs text-gray-600">Asset Tag is auto-generated (e.g. AF-0008). QR defaults to the same tag if left blank.</p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name"><input className="input" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Category">
          <select className="input" value={form.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Serial Number"><input className="input" value={form.serialNumber ?? ''} onChange={(e) => set('serialNumber', e.target.value)} /></Field>
        <Field label="QR Code (optional)"><input className="input" placeholder="Auto = asset tag" value={form.qrCode ?? ''} onChange={(e) => set('qrCode', e.target.value)} /></Field>
        <Field label="Owning Department">
          <select className="input" value={form.departmentId ?? ''} onChange={(e) => set('departmentId', e.target.value)}>
            <option value="">— None —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Location"><input className="input" value={form.location ?? ''} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="Acquisition Date"><input className="input" type="date" value={form.acquisitionDate ?? ''} onChange={(e) => set('acquisitionDate', e.target.value)} /></Field>
        <Field label="Acquisition Cost"><input className="input" type="number" min={0} step="0.01" value={form.acquisitionCost ?? ''} onChange={(e) => set('acquisitionCost', e.target.value)} /></Field>
        <Field label="Condition">
          <select className="input" value={form.condition} onChange={(e) => set('condition', e.target.value)}>
            {['Excellent', 'Good', 'Fair', 'Poor'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
          <input type="checkbox" checked={!!form.isBookable} onChange={(e) => set('isBookable', e.target.checked)} />
          Shared / bookable resource
        </label>

        <div className="col-span-2 grid grid-cols-2 gap-4 border-t border-gray-300 pt-4">
          <Field label="Photo">
            <input className="input file:mr-3 file:rounded file:border-0 file:bg-gray-200 file:px-2 file:py-1 file:text-xs file:text-gray-800" type="file" accept="image/*" onChange={onPhotoChange} disabled={uploading} />
            {form.photoUrl && (
              <div className="mt-2 flex items-center gap-3">
                <img src={form.photoUrl} alt="Asset preview" className="h-16 w-16 rounded-lg border border-gray-300 object-cover" />
                <button type="button" className="text-xs text-rose-700 hover:underline" onClick={() => set('photoUrl', undefined)}>Remove</button>
              </div>
            )}
          </Field>
          <Field label="Documents">
            <input className="input file:mr-3 file:rounded file:border-0 file:bg-gray-200 file:px-2 file:py-1 file:text-xs file:text-gray-800" type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt" onChange={onDocumentsChange} disabled={uploading} />
            {(form.documentUrls as string[])?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {(form.documentUrls as string[]).map((url) => (
                  <li key={url} className="flex items-center justify-between rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-700">
                    <a href={url} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">{url.split('/').pop()}</a>
                    <button type="button" className="ml-2 text-rose-700" onClick={() => removeDocument(url)}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </div>
      </div>
      <button
        className="btn-primary mt-5 w-full"
        disabled={!form.name || !form.categoryId || create.isPending || uploading}
        onClick={() => create.mutate()}
      >
        {uploading ? 'Uploading…' : create.isPending ? 'Registering…' : 'Register'}
      </button>
    </Modal>
  );
}

function AssetDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: asset } = useQuery({ queryKey: ['asset', id], queryFn: () => api<Asset>(`/assets/${id}`) });
  const { data: history } = useQuery({ queryKey: ['asset-history', id], queryFn: () => api<any>(`/assets/${id}/history`) });

  return (
    <Modal open onClose={onClose} title={asset ? `${asset.assetTag} · ${asset.name}` : 'Asset'} wide>
      {!asset ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Info label="Status"><StatusBadge status={asset.status} /></Info>
            <Info label="Category">{asset.category?.name}</Info>
            <Info label="Department">{asset.department?.name ?? '—'}</Info>
            <Info label="Serial">{asset.serialNumber ?? '—'}</Info>
            <Info label="QR Code">{asset.qrCode ?? '—'}</Info>
            <Info label="Condition">{asset.condition ?? '—'}</Info>
            <Info label="Location">{asset.location ?? '—'}</Info>
            <Info label="Acquisition">{asset.acquisitionDate ? fmtDate(asset.acquisitionDate) : '—'}</Info>
            <Info label="Cost">{asset.acquisitionCost != null ? `₹${asset.acquisitionCost}` : '—'}</Info>
            <Info label="Bookable">{asset.isBookable ? 'Yes' : 'No'}</Info>
          </div>

          {(asset.photoUrl || (asset.documentUrls?.length ?? 0) > 0) && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Photo & Documents</h4>
              <div className="flex flex-wrap gap-3">
                {asset.photoUrl && (
                  <a href={asset.photoUrl} target="_blank" rel="noreferrer">
                    <img src={asset.photoUrl} alt={asset.name} className="h-24 w-24 rounded-lg border border-gray-300 object-cover" />
                  </a>
                )}
                {asset.documentUrls?.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-xs font-medium text-primary hover:underline">
                    {url.split('/').pop()}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Lifecycle Status History</h4>
            <div className="space-y-1">
              {history?.statusHistory?.length ? history.statusHistory.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm">
                  <span className="font-medium text-gray-900">{humanize(h.fromStatus) || 'New'} → {humanize(h.toStatus)}</span>
                  <span className="text-gray-600">{h.reason} · {fmtDate(h.changedAt)}</span>
                </div>
              )) : <p className="text-sm text-gray-600">No status history.</p>}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Allocation History</h4>
            <div className="space-y-1">
              {history?.allocations?.length ? history.allocations.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm">
                  <span className="font-medium text-gray-900">{a.employee?.name ?? a.department?.name ?? 'Unknown'}</span>
                  <span className="flex items-center gap-2 text-gray-600">
                    <StatusBadge status={a.status} />
                    {fmtDate(a.allocatedAt)}
                    {a.returnedAt ? ` → ${fmtDate(a.returnedAt)}` : ''}
                  </span>
                </div>
              )) : <p className="text-sm text-gray-600">No allocations.</p>}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Maintenance History</h4>
            <div className="space-y-1">
              {history?.maintenance?.length ? history.maintenance.map((m: any) => (
                <div key={m.id} className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{m.issue}</span>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    Raised by {m.raisedBy?.name ?? '—'} · {humanize(m.priority)} · {fmtDate(m.createdAt)}
                    {m.resolvedAt ? ` · resolved ${fmtDate(m.resolvedAt)}` : ''}
                  </p>
                </div>
              )) : <p className="text-sm text-gray-600">No maintenance requests.</p>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2">
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <div className="mt-0.5 font-medium text-gray-900">{children}</div>
    </div>
  );
}
