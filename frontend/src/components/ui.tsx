import clsx from 'clsx';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  ALLOCATED: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  RESERVED: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  UNDER_MAINTENANCE: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  LOST: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  RETIRED: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  DISPOSED: 'bg-slate-600/15 text-slate-400 border-slate-600/30',
  ACTIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  OVERDUE: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  RETURNED: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  APPROVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  REQUESTED: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  COMPLETED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  CANCELLED: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  UPCOMING: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  ONGOING: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  TECHNICIAN_ASSIGNED: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  IN_PROGRESS: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  RESOLVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  VERIFIED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  MISSING: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  DAMAGED: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  OPEN: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  CLOSED: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  HIGH: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  CRITICAL: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  LOW: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

export function StatusBadge({ status }: { status: string }) {
  const label = status
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return (
    <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[status] ?? 'bg-ink-700 text-slate-300 border-ink-600')}>
      {label}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-slate-400">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-600 border-t-accent" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-600 py-12 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div
        className={clsx(
          'relative z-10 w-full rounded-2xl border border-ink-500 bg-ink-900 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-white/10',
          wide ? 'max-w-2xl' : 'max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3 border-b border-ink-700 pb-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-ink-800 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
