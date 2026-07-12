import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { api, getAccessToken } from '../lib/api';
import { PageHeader, Spinner } from '../components/ui';

const CHART_COLORS = { grid: '#2a3340', text: '#94a3b8', bar: '#7c5cff', line: '#34d399' };

export default function ReportsPage() {
  const { data: util } = useQuery({ queryKey: ['r-util'], queryFn: () => api<any>('/reports/utilization') });
  const { data: dept } = useQuery({ queryKey: ['r-dept'], queryFn: () => api<any[]>('/reports/department-allocation') });
  const { data: maint } = useQuery({ queryKey: ['r-maint'], queryFn: () => api<any[]>('/reports/maintenance-frequency') });
  const { data: upcoming } = useQuery({ queryKey: ['r-upcoming'], queryFn: () => api<any>('/reports/upcoming-maintenance') });

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

  if (!util || !dept) return <Spinner />;

  const deptData = dept.map((d) => ({ name: d.name, allocations: d.allocations, assets: d.assets }));
  const maintData = (maint ?? []).slice(0, 8).map((m) => ({ name: m.asset?.assetTag ?? '—', count: m.count }));

  return (
    <div>
      <PageHeader title="Reports & Analytics" subtitle="Actionable operational insight" actions={<button className="btn-primary" onClick={exportCsv}>Export CSV</button>} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Allocation by Department</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="name" stroke={CHART_COLORS.text} fontSize={12} />
              <YAxis stroke={CHART_COLORS.text} fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#161b24', border: '1px solid #2a3340', borderRadius: 8 }} />
              <Bar dataKey="allocations" fill={CHART_COLORS.bar} radius={[4, 4, 0, 0]} />
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
            {util.mostUsed.slice(0, 6).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg bg-ink-800/60 px-3 py-2 text-sm">
                <span className="text-slate-200"><span className="font-mono text-accent-soft">{a.assetTag}</span> · {a.name}</span>
                <span className="text-slate-400">{a.usage} uses</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Idle Assets & Nearing Retirement</h3>
          <div className="space-y-2 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Idle ({util.idle.length})</p>
            {util.idle.slice(0, 4).map((a: any) => <p key={a.id} className="text-slate-300">{a.assetTag} · {a.name}</p>)}
            <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Nearing retirement (Poor/Fair)</p>
            {(upcoming?.nearingRetirement ?? []).slice(0, 4).map((a: any) => <p key={a.id} className="text-amber-300">{a.assetTag} · {a.name} ({a.condition})</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}
