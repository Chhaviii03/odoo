import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { api, getAccessToken } from '../lib/api';
import { PageHeader, Spinner } from '../components/ui';
import { toast } from '../lib/toast';

const CHART_COLORS = {
  grid: '#E6E9ED',
  text: '#6C757D',
  bar: '#714b67',
  bar2: '#017e84',
  line: '#28a745',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HEATMAP_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

const EXPORT_OPTIONS = [
  { value: 'utilization', label: 'Utilization (most-used vs idle)' },
  { value: 'maintenance', label: 'Maintenance frequency' },
  { value: 'upcoming', label: 'Due / nearing retirement' },
  { value: 'department', label: 'Department allocation' },
  { value: 'heatmap', label: 'Booking heatmap' },
  { value: 'assets', label: 'Asset directory' },
] as const;

type ExportType = (typeof EXPORT_OPTIONS)[number]['value'];

function heatColor(count: number, max: number) {
  if (!count || max <= 0) return 'rgba(230, 233, 237, 0.8)';
  const t = Math.min(1, count / max);
  const alpha = 0.2 + t * 0.8;
  return `rgba(113, 75, 103, ${alpha})`;
}

function ExportLink({ type, label = 'CSV' }: { type: ExportType; label?: string }) {
  return (
    <button
      type="button"
      className="text-xs font-medium text-accent-soft hover:text-gray-900"
      onClick={() => void downloadExport(type)}
    >
      Export {label}
    </button>
  );
}

async function downloadExport(type: ExportType) {
  try {
    const res = await fetch(`/api/v1/reports/export?type=${type}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message ?? 'Export failed');
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match?.[1] ?? `assetflow-${type}.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Export failed', 'error');
  }
}

export default function ReportsPage() {
  const [exportType, setExportType] = useState<ExportType>('utilization');
  const { data: util } = useQuery({ queryKey: ['r-util'], queryFn: () => api<any>('/reports/utilization') });
  const { data: dept } = useQuery({ queryKey: ['r-dept'], queryFn: () => api<any[]>('/reports/department-allocation') });
  const { data: maint } = useQuery({ queryKey: ['r-maint'], queryFn: () => api<any[]>('/reports/maintenance-frequency') });
  const { data: upcoming } = useQuery({ queryKey: ['r-upcoming'], queryFn: () => api<any>('/reports/upcoming-maintenance') });
  const { data: heatmap } = useQuery({
    queryKey: ['r-heatmap'],
    queryFn: () => api<{ day: number; hour: number; count: number }[]>('/reports/booking-heatmap'),
  });

  const heatMap = useMemo(() => {
    const map = new Map<string, number>();
    let max = 0;
    for (const cell of heatmap ?? []) {
      map.set(`${cell.day}-${cell.hour}`, cell.count);
      if (cell.count > max) max = cell.count;
    }
    return { map, max };
  }, [heatmap]);

  if (!util || !dept) return <Spinner />;

  const deptData = dept.map((d) => ({ name: d.name, allocations: d.allocations, assets: d.assets }));
  const maintData = (maint ?? []).slice(0, 8).map((m) => ({ name: m.asset?.assetTag ?? '—', count: m.count }));
  const mostUsed = (util.mostUsed ?? []).slice(0, 6);
  const idle = (util.idle ?? []).slice(0, 5);
  const underMaint = (upcoming?.underMaintenance ?? []).slice(0, 4);
  const nearing = (upcoming?.nearingRetirement ?? []).slice(0, 4);

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Actionable operational insight"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-auto min-w-[220px]"
              value={exportType}
              onChange={(e) => setExportType(e.target.value as ExportType)}
              aria-label="Report to export"
            >
              {EXPORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button className="btn-primary" type="button" onClick={() => void downloadExport(exportType)}>
              Export CSV
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Allocation by Department</h3>
            <ExportLink type="department" />
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="name" stroke={CHART_COLORS.text} fontSize={12} />
              <YAxis stroke={CHART_COLORS.text} fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #E6E9ED', borderRadius: 10, color: '#374151' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: CHART_COLORS.text }} />
              <Bar dataKey="allocations" name="Active allocations" fill={CHART_COLORS.bar} radius={[4, 4, 0, 0]} />
              <Bar dataKey="assets" name="Owned assets" fill={CHART_COLORS.bar2} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Maintenance Frequency (top assets)</h3>
            <ExportLink type="maintenance" />
          </div>
          {maintData.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={maintData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="name" stroke={CHART_COLORS.text} fontSize={12} />
                <YAxis stroke={CHART_COLORS.text} fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #E6E9ED', borderRadius: 10, color: '#374151' }} />
                <Line type="monotone" dataKey="count" stroke={CHART_COLORS.line} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="py-16 text-center text-sm text-gray-600">No maintenance data yet.</p>}
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Most-used Assets</h3>
            <ExportLink type="utilization" />
          </div>
          <div className="space-y-2">
            {mostUsed.length === 0 && <p className="py-8 text-center text-sm text-gray-600">No usage recorded yet.</p>}
            {mostUsed.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg bg-gray-100 px-3 py-2 text-sm">
                <span className="text-gray-800"><span className="font-mono text-accent-soft">{a.assetTag}</span> · {a.name}</span>
                <span className="text-gray-600">{a.usage} {a.usage === 1 ? 'use' : 'uses'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Idle Assets & Due / Nearing Retirement</h3>
            <ExportLink type="upcoming" />
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-gray-600">Idle — never used ({util.idle.length})</p>
            {idle.length === 0 && <p className="text-gray-600">No idle assets.</p>}
            {idle.map((a: any) => (
              <p key={a.id} className="text-gray-700"><span className="font-mono text-accent-soft">{a.assetTag}</span> · {a.name}</p>
            ))}

            <p className="mt-3 text-xs uppercase tracking-wide text-gray-600">Under maintenance</p>
            {underMaint.length === 0 && <p className="text-gray-600">None currently.</p>}
            {underMaint.map((a: any) => (
              <p key={a.id} className="text-rose-700"><span className="font-mono">{a.assetTag}</span> · {a.name}</p>
            ))}

            <p className="mt-3 text-xs uppercase tracking-wide text-gray-600">Nearing retirement (Poor/Fair)</p>
            {nearing.length === 0 && <p className="text-gray-600">None flagged.</p>}
            {nearing.map((a: any) => (
              <p key={a.id} className="text-amber-700"><span className="font-mono">{a.assetTag}</span> · {a.name} ({a.condition})</p>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt-6 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Resource Booking Heatmap</h3>
            <p className="mt-1 text-xs text-gray-600">Peak usage windows by day of week and hour</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ExportLink type="heatmap" />
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span>Low</span>
              <div className="flex gap-0.5">
                {[0.25, 0.45, 0.65, 0.85, 1].map((a) => (
                  <span key={a} className="h-3 w-4 rounded-sm" style={{ background: `rgba(113, 75, 103, ${a})` }} />
                ))}
              </div>
              <span>High</span>
            </div>
          </div>
        </div>

        {!heatmap?.length ? (
          <p className="py-12 text-center text-sm text-gray-600">No booking activity to chart yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-grid min-w-full gap-1" style={{ gridTemplateColumns: `48px repeat(${HEATMAP_HOURS.length}, minmax(36px, 1fr))` }}>
              <div />
              {HEATMAP_HOURS.map((h) => (
                <div key={h} className="pb-1 text-center text-[10px] text-gray-600">{h}:00</div>
              ))}
              {DAY_LABELS.map((label, day) => (
                <div key={label} className="contents">
                  <div className="flex items-center text-xs text-gray-600">{label}</div>
                  {HEATMAP_HOURS.map((hour) => {
                    const count = heatMap.map.get(`${day}-${hour}`) ?? 0;
                    return (
                      <div
                        key={`${day}-${hour}`}
                        title={`${label} ${hour}:00 — ${count} booking${count === 1 ? '' : 's'}`}
                        className="flex h-8 items-center justify-center rounded-md text-[10px] font-medium"
                        style={{
                          background: heatColor(count, heatMap.max),
                          color: count / Math.max(heatMap.max, 1) > 0.45 ? '#ffffff' : '#212529',
                        }}
                      >
                        {count > 0 ? count : ''}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
