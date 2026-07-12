import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { api, getAccessToken } from '../lib/api';
import { PageHeader, Spinner } from '../components/ui';

const CHART_COLORS = {
  grid: '#2a3340',
  text: '#94a3b8',
  bar: '#7c5cff',
  bar2: '#38bdf8',
  line: '#34d399',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HEATMAP_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

function heatColor(count: number, max: number) {
  if (!count || max <= 0) return 'rgba(42, 51, 64, 0.45)';
  const t = Math.min(1, count / max);
  const alpha = 0.25 + t * 0.75;
  return `rgba(124, 92, 255, ${alpha})`;
}

export default function ReportsPage() {
  const { data: util } = useQuery({ queryKey: ['r-util'], queryFn: () => api<any>('/reports/utilization') });
  const { data: dept } = useQuery({ queryKey: ['r-dept'], queryFn: () => api<any[]>('/reports/department-allocation') });
  const { data: maint } = useQuery({ queryKey: ['r-maint'], queryFn: () => api<any[]>('/reports/maintenance-frequency') });
  const { data: upcoming } = useQuery({ queryKey: ['r-upcoming'], queryFn: () => api<any>('/reports/upcoming-maintenance') });
  const { data: heatmap } = useQuery({
    queryKey: ['r-heatmap'],
    queryFn: () => api<{ day: number; hour: number; count: number }[]>('/reports/booking-heatmap'),
  });

  async function exportCsv() {
    const res = await fetch('/api/v1/reports/export', { headers: { Authorization: `Bearer ${getAccessToken()}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'assetflow-assets.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

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
        actions={<button className="btn-primary" onClick={exportCsv}>Export CSV</button>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Allocation by Department</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="name" stroke={CHART_COLORS.text} fontSize={12} />
              <YAxis stroke={CHART_COLORS.text} fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#161b24', border: '1px solid #2a3340', borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: CHART_COLORS.text }} />
              <Bar dataKey="allocations" name="Active allocations" fill={CHART_COLORS.bar} radius={[4, 4, 0, 0]} />
              <Bar dataKey="assets" name="Owned assets" fill={CHART_COLORS.bar2} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Maintenance Frequency (top assets)</h3>
          {maintData.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={maintData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="name" stroke={CHART_COLORS.text} fontSize={12} />
                <YAxis stroke={CHART_COLORS.text} fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#161b24', border: '1px solid #2a3340', borderRadius: 8 }} />
                <Line type="monotone" dataKey="count" stroke={CHART_COLORS.line} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="py-16 text-center text-sm text-slate-500">No maintenance data yet.</p>}
        </div>

        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Most-used Assets</h3>
          <div className="space-y-2">
            {mostUsed.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No usage recorded yet.</p>}
            {mostUsed.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg bg-ink-800/60 px-3 py-2 text-sm">
                <span className="text-slate-200"><span className="font-mono text-accent-soft">{a.assetTag}</span> · {a.name}</span>
                <span className="text-slate-400">{a.usage} {a.usage === 1 ? 'use' : 'uses'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Idle Assets & Due / Nearing Retirement</h3>
          <div className="space-y-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Idle — never used ({util.idle.length})</p>
            {idle.length === 0 && <p className="text-slate-500">No idle assets.</p>}
            {idle.map((a: any) => (
              <p key={a.id} className="text-slate-300"><span className="font-mono text-accent-soft">{a.assetTag}</span> · {a.name}</p>
            ))}

            <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Under maintenance</p>
            {underMaint.length === 0 && <p className="text-slate-500">None currently.</p>}
            {underMaint.map((a: any) => (
              <p key={a.id} className="text-rose-300"><span className="font-mono">{a.assetTag}</span> · {a.name}</p>
            ))}

            <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Nearing retirement (Poor/Fair)</p>
            {nearing.length === 0 && <p className="text-slate-500">None flagged.</p>}
            {nearing.map((a: any) => (
              <p key={a.id} className="text-amber-300"><span className="font-mono">{a.assetTag}</span> · {a.name} ({a.condition})</p>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt-6 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">Resource Booking Heatmap</h3>
            <p className="mt-1 text-xs text-slate-500">Peak usage windows by day of week and hour</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Low</span>
            <div className="flex gap-0.5">
              {[0.25, 0.45, 0.65, 0.85, 1].map((a) => (
                <span key={a} className="h-3 w-4 rounded-sm" style={{ background: `rgba(124, 92, 255, ${a})` }} />
              ))}
            </div>
            <span>High</span>
          </div>
        </div>

        {!heatmap?.length ? (
          <p className="py-12 text-center text-sm text-slate-500">No booking activity to chart yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-grid min-w-full gap-1" style={{ gridTemplateColumns: `48px repeat(${HEATMAP_HOURS.length}, minmax(36px, 1fr))` }}>
              <div />
              {HEATMAP_HOURS.map((h) => (
                <div key={h} className="pb-1 text-center text-[10px] text-slate-500">{h}:00</div>
              ))}
              {DAY_LABELS.map((label, day) => (
                <div key={label} className="contents">
                  <div className="flex items-center text-xs text-slate-400">{label}</div>
                  {HEATMAP_HOURS.map((hour) => {
                    const count = heatMap.map.get(`${day}-${hour}`) ?? 0;
                    return (
                      <div
                        key={`${day}-${hour}`}
                        title={`${label} ${hour}:00 — ${count} booking${count === 1 ? '' : 's'}`}
                        className="flex h-8 items-center justify-center rounded-md text-[10px] font-medium text-white/90"
                        style={{ background: heatColor(count, heatMap.max) }}
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
