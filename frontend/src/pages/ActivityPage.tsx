import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../lib/api';
import { PageHeader, Spinner, EmptyState } from '../components/ui';
import { ago, humanize } from '../lib/format';
import { useAuth } from '../lib/auth';
import type { Notification } from '../lib/types';

type Filter = 'ALL' | 'ALERTS' | 'APPROVALS' | 'BOOKINGS';

const FILTER_MATCH: Record<Filter, (t: string) => boolean> = {
  ALL: () => true,
  ALERTS: (t) => t.includes('OVERDUE') || t.includes('REMINDER') || t.includes('DISCREPANCY'),
  APPROVALS: (t) => t.includes('APPROVED') || t.includes('REJECTED') || t.includes('TRANSFER') || t.includes('ROLE'),
  BOOKINGS: (t) => t.includes('BOOKING'),
};

export default function ActivityPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('ALL');
  const { data: notifications, isLoading } = useQuery({ queryKey: ['notifications'], queryFn: () => api<Notification[]>('/notifications') });
  const canViewLogs = can(['ADMIN', 'ASSET_MANAGER']);

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const filtered = (notifications ?? []).filter((n) => FILTER_MATCH[filter](n.type));

  return (
    <div>
      <PageHeader title="Notifications & Activity Logs" subtitle="Stay informed without digging for updates" />

      <div className="mb-4 flex gap-2">
        {(['ALL', 'ALERTS', 'APPROVALS', 'BOOKINGS'] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={clsx('tab', filter === f && 'tab-active')}>{f[0] + f.slice(1).toLowerCase()}</button>
        ))}
      </div>

      <div className={clsx('grid gap-6', canViewLogs ? 'lg:grid-cols-2' : 'grid-cols-1')}>
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Notifications</h3>
          {isLoading ? <Spinner /> : !filtered.length ? <EmptyState title="Nothing here" /> : (
            <div className="space-y-2">
              {filtered.map((n) => (
                <button key={n.id} onClick={() => !n.isRead && markRead.mutate(n.id)} className={clsx('flex w-full items-start justify-between rounded-lg px-3 py-2 text-left text-sm', n.isRead ? 'bg-ink-800/40 text-slate-400' : 'bg-ink-800 text-slate-100')}>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-accent-soft">{humanize(n.type)}</p>
                    <p>{n.message}</p>
                  </div>
                  <span className="shrink-0 pl-3 text-[11px] text-slate-500">{ago(n.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {canViewLogs && <ActivityLog />}
      </div>
    </div>
  );
}

function ActivityLog() {
  const { data: logs, isLoading } = useQuery({ queryKey: ['activity-logs'], queryFn: () => api<any[]>('/activity-logs') });
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-semibold text-white">Audit Log — who did what, when</h3>
      {isLoading ? <Spinner /> : !logs?.length ? <EmptyState title="No activity logged yet" /> : (
        <div className="max-h-[70vh] space-y-2 overflow-y-auto">
          {logs.map((l) => (
            <div key={l.id} className="rounded-lg bg-ink-800/40 px-3 py-2 text-sm">
              <p className="text-slate-200"><span className="text-accent-soft">{l.user?.name ?? 'System'}</span> · {humanize(l.action)}</p>
              <p className="text-[11px] text-slate-500">{l.entityType} · {ago(l.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
