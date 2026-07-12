import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { PageHeader, StatusBadge, Field, Spinner, EmptyState } from '../components/ui';
import { toast } from '../lib/toast';
import { fmtTime, fmtDate } from '../lib/format';
import { localDateKey, minutesOfLocalDay, parseLocalDateTime, todayLocal, toApiDateTime } from '../lib/datetime';
import { useAuth } from '../lib/auth';
import { useAssets, useDepartments } from '../features/queries';
import type { Asset } from '../lib/types';

const DAY_END_MIN = 24 * 60; // full day, 00:00 → 24:00
const END_OF_DAY_MIN = DAY_END_MIN - 1; // 23:59 — latest selectable end
const DAY_SPAN_MIN = DAY_END_MIN;
const TIMELINE_WIDTH_PX = 2400; // 100px per hour — scrollable full-day view
const HOUR_LABELS = Array.from({ length: 25 }, (_, i) => i); // 0 … 24

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toTimeValue(hour: number, minute: number) {
  return `${pad(hour)}:${pad(minute)}`;
}

function parseTimeOnDate(date: string, time: string) {
  return parseLocalDateTime(date, time);
}

function minutesOfDay(d: Date) {
  return minutesOfLocalDay(d);
}

function clampMinutes(minutes: number) {
  return Math.max(0, Math.min(END_OF_DAY_MIN, minutes));
}

function minutesToTime(minutes: number) {
  const clamped = clampMinutes(minutes);
  return toTimeValue(Math.floor(clamped / 60), clamped % 60);
}

function defaultStartTime(date: string, today: string, now: Date) {
  if (date > today) return '09:00';
  if (date < today) return '09:00';
  const mins = minutesOfDay(now);
  if (mins >= END_OF_DAY_MIN) return '23:00';
  return minutesToTime(mins);
}

function defaultEndTime(startTime: string, durationMin = 60) {
  const [h, m] = startTime.split(':').map(Number);
  return minutesToTime(Math.min(END_OF_DAY_MIN, h * 60 + m + durationMin));
}

function minStartTime(date: string, today: string, now: Date) {
  if (date > today) return '00:00';
  if (date < today) return '23:59';
  return minutesToTime(minutesOfDay(now));
}

function rangeOverlaps(bookings: any[], start: Date, end: Date) {
  return bookings.some((b) => {
    const bs = new Date(b.startTime);
    const be = new Date(b.endTime);
    return bs < end && be > start;
  });
}

function toTimelinePx(minutes: number) {
  return (Math.max(0, Math.min(DAY_END_MIN, minutes)) / DAY_SPAN_MIN) * TIMELINE_WIDTH_PX;
}

function validateSelection(date: string, today: string, now: Date, start: string, end: string, dayBookings: any[]) {
  const startDt = parseTimeOnDate(date, start);
  const endDt = parseTimeOnDate(date, end);
  const startMin = minutesOfDay(startDt);
  const endMin = minutesOfDay(endDt);

  if (startMin < 0 || endMin > END_OF_DAY_MIN) {
    return 'Bookings must stay within the same day (00:00 – 23:59).';
  }
  if (startDt.getTime() < now.getTime() && date === today) {
    return 'Start time cannot be in the past.';
  }
  if (endDt <= startDt) {
    return 'End time must be after start time.';
  }
  if (rangeOverlaps(dayBookings, startDt, endDt)) {
    return 'This range overlaps an existing booking.';
  }
  return null;
}

function isBookingBlocked(asset: Asset) {
  return asset.status === 'UNDER_MAINTENANCE' || ['LOST', 'RETIRED', 'DISPOSED'].includes(asset.status);
}

export default function BookingPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: assets, isLoading } = useAssets({ isBookable: 'true' });
  const selected = assets?.find((a) => a.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader title="Resource Booking" subtitle="Book any time range — pick exact start and end times" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden">
          <div className="border-b border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900">Bookable Resources</div>
          {isLoading ? <Spinner /> : !assets?.length ? <EmptyState title="No bookable resources" hint="Mark an asset as bookable when registering it." /> : (
            <div className="divide-y divide-gray-200">
              {assets.map((a) => {
                const blocked = isBookingBlocked(a);
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-100 ${selected?.id === a.id ? 'bg-gray-100' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-accent-soft">{a.assetTag}</p>
                      <p className="text-sm text-gray-800">{a.name}</p>
                      {blocked && (
                        <p className="mt-0.5 text-xs text-orange-700">
                          {a.status === 'UNDER_MAINTENANCE' ? 'Cannot book — under maintenance' : 'Cannot book'}
                        </p>
                      )}
                    </div>
                    {blocked && <StatusBadge status={a.status} />}
                  </button>
                );
              })}
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
  const { user, can } = useAuth();
  const { data: departments = [] } = useDepartments();
  const canManageBookings = can(['ADMIN', 'ASSET_MANAGER']);
  const isDeptHead = user?.role === 'DEPARTMENT_HEAD';
  const blocked = isBookingBlocked(asset);
  const deptHeadDepartments = useMemo(() => {
    if (!isDeptHead || !user) return [];
    return departments.filter((d) => d.id === user.departmentId || d.head?.id === user.id);
  }, [departments, isDeptHead, user]);
  const [bookForDept, setBookForDept] = useState(false);
  const [departmentId, setDepartmentId] = useState(user?.departmentId ?? '');
  const now = new Date();
  const today = todayLocal();
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(() => defaultStartTime(today, today, now));
  const [end, setEnd] = useState(() => defaultEndTime(defaultStartTime(today, today, now)));

  const { data: bookings } = useQuery({ queryKey: ['bookings', asset.id], queryFn: () => api<any[]>(`/assets/${asset.id}/bookings`) });

  const dayBookings = useMemo(
    () => (bookings ?? []).filter((b) => localDateKey(new Date(b.startTime)) === date && b.status !== 'CANCELLED'),
    [bookings, date],
  );

  const minStart = minStartTime(date, today, now);
  const validationError = useMemo(
    () => (blocked ? 'Cannot book — this resource is not available' : validateSelection(date, today, new Date(), start, end, dayBookings)),
    [blocked, date, today, start, end, dayBookings],
  );

  const startDt = parseTimeOnDate(date, start);
  const endDt = parseTimeOnDate(date, end);
  const selectionDurationMin = Math.max(0, (endDt.getTime() - startDt.getTime()) / 60000);

  const create = useMutation({
    mutationFn: () => api('/bookings', {
      method: 'POST',
      body: {
        assetId: asset.id,
        startTime: toApiDateTime(date, start),
        endTime: toApiDateTime(date, end),
        ...(bookForDept && departmentId ? { departmentId } : {}),
      },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings', asset.id] }); toast('Your booking has been confirmed.', 'success', { title: 'Booking confirmed' }); },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409 && e.details?.conflictingBooking) {
        const conflict = e.details.conflictingBooking;
        toast('This time slot overlaps an existing booking.', 'error', {
          title: 'Slot unavailable',
          detail: conflict.bookedBy
            ? `Already booked by ${conflict.bookedBy} on ${fmtDate(conflict.startTime)} (${fmtTime(conflict.startTime)}–${fmtTime(conflict.endTime)})`
            : 'Pick a different time or check the schedule above.',
        });
      } else {
        toast(e instanceof ApiError ? e.message : 'Failed to book slot', 'error', { title: 'Booking failed' });
      }
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api(`/bookings/${id}/cancel`, { method: 'PATCH' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings', asset.id] }); toast('Booking cancelled', 'info'); },
  });

  function handleDateChange(nextDate: string) {
    const safeDate = nextDate < today ? today : nextDate;
    const nextStart = defaultStartTime(safeDate, today, now);
    setDate(safeDate);
    setStart(nextStart);
    setEnd(defaultEndTime(nextStart));
  }

  function handleStartChange(nextStart: string) {
    setStart(nextStart);
    const startDate = parseTimeOnDate(date, nextStart);
    const endDate = parseTimeOnDate(date, end);
    if (endDate <= startDate) {
      setEnd(defaultEndTime(nextStart));
    }
  }

  function handleEndChange(nextEnd: string) {
    setEnd(nextEnd);
  }

  function handleTimelineClick(event: MouseEvent<HTMLDivElement>) {
    if (blocked) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(TIMELINE_WIDTH_PX, event.clientX - rect.left));
    const clickedMin = (x / TIMELINE_WIDTH_PX) * DAY_SPAN_MIN;
    const roundedMin = Math.round(clickedMin);
    const nextStart = minutesToTime(roundedMin);
    const startDate = parseTimeOnDate(date, nextStart);
    if (date === today && startDate.getTime() < now.getTime()) return;
    setStart(nextStart);
    const currentDuration = Math.max(30, selectionDurationMin || 60);
    setEnd(minutesToTime(Math.min(END_OF_DAY_MIN, roundedMin + currentDuration)));
  }

  const nowMin = date === today ? minutesOfDay(now) : null;
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    const focusMin = date === today && nowMin != null ? nowMin : 9 * 60;
    const target = toTimelinePx(focusMin) - el.clientWidth / 2 + 50;
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [date, today, asset.id, nowMin]);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-accent-soft">{asset.assetTag}</p>
            <h3 className="text-lg font-semibold text-gray-900">{asset.name}</h3>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={asset.status} />
            <input
              className="input max-w-[180px]"
              type="date"
              min={today}
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              disabled={blocked}
            />
          </div>
        </div>

        {blocked ? (
          <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-8 text-center">
            <p className="text-sm font-medium text-orange-800">
              {asset.status === 'UNDER_MAINTENANCE'
                ? 'Cannot book — this resource is under maintenance'
                : 'Cannot book — this resource is not available'}
            </p>
            <p className="mt-1 text-xs text-orange-700/80">
              Booking will be available again once maintenance is resolved and the asset returns to Available.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-gray-600">Scroll the timeline to explore the full day. Click the bar to set a start time, then adjust end time below.</p>

            <div ref={timelineScrollRef} className="timeline-scroll -mx-1 overflow-x-auto px-1 pb-2">
              <div style={{ width: TIMELINE_WIDTH_PX }}>
                <div className="relative mb-1 flex text-[10px] text-gray-600">
                  {HOUR_LABELS.map((h) => (
                    <span key={h} className="shrink-0 text-center" style={{ width: TIMELINE_WIDTH_PX / 24 }}>
                      {h === 24 ? '24:00' : `${pad(h)}:00`}
                    </span>
                  ))}
                </div>

                <div
                  role="presentation"
                  onClick={handleTimelineClick}
                  className="relative h-28 cursor-crosshair overflow-hidden rounded-xl border border-gray-300 bg-gray-100"
                  style={{ width: TIMELINE_WIDTH_PX }}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute inset-y-0 border-l border-gray-300"
                      style={{ left: toTimelinePx(h * 60) }}
                    />
                  ))}

                  {nowMin != null && nowMin > 0 && (
                    <div className="pointer-events-none absolute inset-y-0 left-0 bg-gray-200/70" style={{ width: toTimelinePx(nowMin) }} />
                  )}

                  {dayBookings.map((b) => {
                    const bs = new Date(b.startTime);
                    const be = new Date(b.endTime);
                    const sm = minutesOfDay(bs);
                    const em = Math.min(DAY_END_MIN, minutesOfDay(be));
                    const left = toTimelinePx(sm);
                    const width = Math.max(8, toTimelinePx(em) - left);
                    return (
                      <div
                        key={b.id}
                        className="pointer-events-none absolute inset-y-2 rounded-md border border-amber-500/50 bg-amber-500/25 px-2 text-[11px] leading-4 text-amber-800"
                        style={{ left, width }}
                        title={`${b.bookedBy?.name ?? 'Booked'} · ${fmtTime(bs)}–${fmtTime(be)}`}
                      >
                        <span className="block truncate font-medium">{b.bookedBy?.name ?? 'Booked'}</span>
                        <span className="block truncate opacity-80">{fmtTime(bs)}–{fmtTime(be)}</span>
                      </div>
                    );
                  })}

                  {!validationError && (
                    <div
                      className="pointer-events-none absolute inset-y-2 rounded-md border-2 border-accent bg-accent/25"
                      style={{
                        left: toTimelinePx(minutesOfDay(startDt)),
                        width: Math.max(8, toTimelinePx(minutesOfDay(endDt)) - toTimelinePx(minutesOfDay(startDt))),
                      }}
                    />
                  )}

                  {nowMin != null && nowMin >= 0 && nowMin <= DAY_END_MIN && (
                    <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-rose-400" style={{ left: toTimelinePx(nowMin) }} title="Now" />
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-amber-500/50 bg-amber-500/25" /> Booked</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border-2 border-accent bg-accent/25" /> Your selection</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-0.5 bg-rose-400" /> Now</span>
            </div>
          </>
        )}
      </div>

      {!blocked && (
        <div className="card p-5">
          <h4 className="mb-3 text-sm font-semibold text-gray-900">Book a slot</h4>
          {isDeptHead && (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={bookForDept} onChange={(e) => setBookForDept(e.target.checked)} />
                Book on behalf of department
              </label>
              {bookForDept && (
                <select className="input max-w-[220px]" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">Select department…</option>
                  {deptHeadDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Start">
              <input
                className="input max-w-[140px]"
                type="time"
                step={60}
                min={minStart}
                max="23:59"
                value={start}
                onChange={(e) => handleStartChange(e.target.value)}
              />
            </Field>
            <Field label="End">
              <input
                className="input max-w-[140px]"
                type="time"
                step={60}
                min={start}
                max="23:59"
                value={end}
                onChange={(e) => handleEndChange(e.target.value)}
              />
            </Field>
            <button className="btn-primary" disabled={create.isPending || !!validationError || (bookForDept && !departmentId)} onClick={() => create.mutate()}>
              Book slot
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-600">
            Pick any minute through the full day — e.g. 2:15 AM to 11:45 PM ({Math.round(selectionDurationMin)} min selected).
          </p>
          {validationError && <p className="mt-1 text-xs text-rose-700">{validationError}</p>}
        </div>
      )}

      <div className="card p-5">
        <h4 className="mb-3 text-sm font-semibold text-gray-900">Bookings</h4>
        <div className="space-y-1">
          {(bookings ?? []).length === 0 && <p className="text-sm text-gray-600">No bookings yet.</p>}
          {bookings?.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg bg-gray-100 px-3 py-2 text-sm">
              <span className="text-gray-700">{fmtDate(b.startTime)} · {fmtTime(b.startTime)}–{fmtTime(b.endTime)} · {b.bookedBy?.name}</span>
              <span className="flex items-center gap-2">
                <StatusBadge status={b.status} />
                {['UPCOMING', 'ONGOING'].includes(b.status) && (b.bookedBy?.id === user?.id || canManageBookings) && (
                  <button className="text-xs text-rose-700 hover:underline" onClick={() => cancel.mutate(b.id)}>Cancel</button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
