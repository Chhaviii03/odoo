import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { toast } from '../lib/toast';
import { ago, humanize } from '../lib/format';
import type { Notification, Role } from '../lib/types';

interface NavItem {
  to: string;
  label: string;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/organization', label: 'Organization Setup', roles: ['ADMIN'] },
  { to: '/assets', label: 'Assets' },
  { to: '/allocation', label: 'Allocation & Transfer' },
  { to: '/booking', label: 'Resource Booking' },
  { to: '/maintenance', label: 'Maintenance' },
  { to: '/audit', label: 'Audit' },
  { to: '/reports', label: 'Reports', roles: ['ADMIN', 'ASSET_MANAGER'] },
  { to: '/activity', label: 'Notifications & Logs' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [bellOpen, setBellOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notification[]>('/notifications'),
    refetchInterval: 30_000,
  });

  const unread = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    if (!user) return;
    const socket = connectSocket(user.id);
    socket.on('notification', (n: Notification) => {
      toast(n.message, 'info');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    return () => {
      socket.off('notification');
    };
  }, [user, queryClient]);

  async function markAllRead() {
    await api('/notifications/read-all', { method: 'PATCH' });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent font-bold text-white">AF</div>
          <span className="text-lg font-semibold text-white">AssetFlow</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.filter((item) => !item.roles || can(item.roles)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent/15 text-accent-soft' : 'text-slate-400 hover:bg-ink-800 hover:text-slate-100',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-700 p-3">
          <div className="rounded-lg bg-ink-800 p-3">
            <p className="truncate text-sm font-medium text-white">{user?.name}</p>
            <p className="text-xs text-slate-400">{humanize(user?.role)}</p>
          </div>
          <button onClick={() => { logout(); navigate('/login'); }} className="btn-ghost mt-2 w-full text-xs">
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-end gap-3 border-b border-ink-700 bg-ink-900/60 px-6 py-3">
          <div className="relative">
            <button onClick={() => setBellOpen((o) => !o)} className="btn-ghost relative">
              Notifications
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute right-0 top-12 z-40 w-80 card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Notifications</span>
                  <button onClick={markAllRead} className="text-xs text-accent-soft hover:underline">Mark all read</button>
                </div>
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {notifications.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No notifications</p>}
                  {notifications.slice(0, 12).map((n) => (
                    <div key={n.id} className={clsx('rounded-lg px-3 py-2 text-sm', n.isRead ? 'text-slate-400' : 'bg-ink-800 text-slate-100')}>
                      <p>{n.message}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{ago(n.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
