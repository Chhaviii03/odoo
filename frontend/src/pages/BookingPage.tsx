import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { PageHeader, StatusBadge, Field, Spinner, EmptyState } from '../components/ui';
import { toast } from '../lib/toast';
import { fmtTime, fmtDate } from '../lib/format';
import { useAssets } from '../features/queries';
import type { Asset } from '../lib/types';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8:00 – 20:00

export default function BookingPage() {
  const [selected, setSelected] = useState<Asset | null>(null);
  const { data: assets, isLoading } = useAssets({ isBookable: 'true' });

  return (
    <div>
      <PageHeader title="Resource Booking" subtitle="Time-slot booking of shared resources with no overlaps" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden">
          <div className="border-b border-ink-700 px-4 py-3 text-sm font-semibold text-white">Bookable Resources</div>
          {isLoading ? <Spinner /> : !assets?.length ? <EmptyState title="No bookable resources" hint="Mark an asset as bookable when registering it." /> : (
            <div className="divide-y divide-ink-800">
              {assets.map((a) => (
                <button key={a.id} onClick={() => setSelected(a)} className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-ink-800/50 ${selected?.id === a.id ? 'bg-ink-800' : ''}`}>
                  <div><p className="font-mono text-xs text-accent-soft">{a.assetTag}</p><p className="text-sm text-slate-200">{a.name}</p></div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="lg:col-span-2">
          {selected ? <BookingPanel asset={selected} /> : <EmptyState title="Select a resource" hint="Choose a bookable resource to view its calendar and book a slot." />}
        </div>
      </div>
    </div>
  );
}

function BookingPanel({ asset }: { asset: Asset }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');

  const { data: bookings } = useQuery({ queryKey: ['bookings', asset.id], queryFn: () => api<any[]>(`/assets/${asset.id}/bookings`) });

  const dayBookings = (bookings ?? []).filter((b) => new Date(b.startTime).toISOString().slice(0, 10) === date && b.status !== 'CANCELLED');

  const create = useMutation({
    mutationFn: () => api('/bookings', { method: 'POST', body: { assetId: asset.id, startTime: `${date}T${start}:00`, endTime: `${date}T${end}:00` } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings', asset.id] }); toast('Booking confirmed', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api(`/bookings/${id}/cancel`, { method: 'PATCH' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings', asset.id] }); toast('Booking cancelled', 'info'); },
  });

  function slotBooking(hour: number) {
    return dayBookings.find((b) => {
      const s = new Date(b.startTime).getHours();
      const e = new Date(b.endTime).getHours();
      return hour >= s && hour < e;
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div><p className="font-mono text-xs text-accent-soft">{asset.assetTag}</p><h3 className="text-lg font-semibold text-white">{asset.name}</h3></div>
          <input className="input max-w-[180px]" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="grid gap-1">
          {HOURS.map((h) => {
            const b = slotBooking(h);
            return (
              <div key={h} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-right text-xs text-slate-500">{h}:00</span>
                <div className={`h-9 flex-1 rounded-md border px-3 text-xs leading-9 ${b ? 'border-amber-500/40 bg-amber-500/15 text-amber-200' : 'border-ink-700 bg-ink-800/40 text-slate-500'}`}>
                  {b ? `Booked · ${b.bookedBy?.name ?? ''} (${fmtTime(b.startTime)}–${fmtTime(b.endTime)})` : 'Available'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5">
        <h4 className="mb-3 text-sm font-semibold text-white">Book a slot</h4>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Start"><input className="input max-w-[120px]" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="End"><input className="input max-w-[120px]" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <button className="btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>Book slot</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Overlapping requests are rejected. A slot starting exactly when another ends is allowed.</p>
      </div>

      <div className="card p-5">
        <h4 className="mb-3 text-sm font-semibold text-white">Bookings</h4>
        <div className="space-y-1">
          {(bookings ?? []).length === 0 && <p className="text-sm text-slate-500">No bookings yet.</p>}
          {bookings?.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg bg-ink-800/60 px-3 py-2 text-sm">
              <span className="text-slate-300">{fmtDate(b.startTime)} · {fmtTime(b.startTime)}–{fmtTime(b.endTime)} · {b.bookedBy?.name}</span>
              <span className="flex items-center gap-2"><StatusBadge status={b.status} />{['UPCOMING', 'ONGOING'].includes(b.status) && <button className="text-xs text-rose-300 hover:underline" onClick={() => cancel.mutate(b.id)}>Cancel</button>}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
