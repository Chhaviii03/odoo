import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { PageHeader, Spinner } from '../components/ui';
import { ago } from '../lib/format';

interface Kpis {
  available: number;
  allocated: number;
  maintenanceToday: number;
  activeBookings: number;
  pendingTransfers: number;
  upcomingReturns: number;
  overdue: number;
}

interface DashboardData {
  kpis: Kpis;
  overdueReturns: { id: string; asset: { assetTag: string; name: string }; employee?: { name: string } | null; expectedReturnDate: string }[];
  recentActivity: { id: string; action: string; entityType: string; createdAt: string; user?: { name: string } | null }[];
}

const CARDS: { key: keyof Kpis; label: string; accent: string }[] = [
  { key: 'available', label: 'Assets Available', accent: 'text-emerald-700' },
  { key: 'allocated', label: 'Assets Allocated', accent: 'text-blue-700' },
  { key: 'maintenanceToday', label: 'Maintenance Today', accent: 'text-orange-700' },
  { key: 'activeBookings', label: 'Active Bookings', accent: 'text-indigo-700' },
  { key: 'pendingTransfers', label: 'Pending Transfers', accent: 'text-amber-700' },
  { key: 'upcomingReturns', label: 'Upcoming Returns', accent: 'text-gray-800' },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardData>('/dashboard/kpis') });

  if (isLoading || !data) return <Spinner />;

  return (
    <div>
      <PageHeader title="Today's Overview" subtitle="Real-time operational snapshot" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {CARDS.map((c) => (
          <div key={c.key} className="card p-4">
            <p className="text-xs font-medium text-gray-600">{c.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${c.accent}`}>{data.kpis[c.key]}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {data.kpis.overdue > 0 && (
            <div className="card mb-4 border-rose-500/40 bg-rose-500/10 p-4">
              <p className="text-sm font-semibold text-rose-800">{data.kpis.overdue} overdue return{data.kpis.overdue > 1 ? 's' : ''} — flagged for follow-up</p>
              <div className="mt-3 space-y-2">
                {data.overdueReturns.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-lg bg-gray-100 px-3 py-2 text-sm">
                    <span className="text-gray-800">{o.asset.assetTag} · {o.asset.name}</span>
                    <span className="text-rose-700">{o.employee?.name ?? 'Dept'} · due {ago(o.expectedReturnDate)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Quick actions</h3>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => navigate('/assets')}>+ Register Asset</button>
              <button className="btn-ghost" onClick={() => navigate('/booking')}>Book Resource</button>
              <button className="btn-ghost" onClick={() => navigate('/maintenance')}>Raise Maintenance Request</button>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Recent Activity</h3>
          <div className="space-y-3">
            {data.recentActivity.length === 0 && <p className="text-sm text-gray-600">No activity yet.</p>}
            {data.recentActivity.map((a) => (
              <div key={a.id} className="text-sm">
                <p className="text-gray-800">
                  <span className="font-medium text-primary">{a.user?.name ?? 'System'}</span> · {a.action.replace(/_/g, ' ').toLowerCase()}
                </p>
                <p className="text-xs text-gray-600">{a.entityType} · {ago(a.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
