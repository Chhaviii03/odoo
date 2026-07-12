import clsx from 'clsx';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  ALLOCATED: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  RESERVED: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  UNDER_MAINTENANCE: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
  LOST: 'bg-rose-500/15 text-rose-700 border-rose-500/30',
  RETIRED: 'bg-gray-200 text-gray-700 border-gray-300',
  DISPOSED: 'bg-gray-200 text-gray-600 border-gray-300',
  ACTIVE: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  OVERDUE: 'bg-rose-500/15 text-rose-700 border-rose-500/30',
  RETURNED: 'bg-gray-200 text-gray-700 border-gray-300',
  PENDING: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  APPROVED: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  REJECTED: 'bg-rose-500/15 text-rose-700 border-rose-500/30',
  REQUESTED: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  COMPLETED: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  CANCELLED: 'bg-gray-200 text-gray-600 border-gray-300',
  UPCOMING: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  ONGOING: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  TECHNICIAN_ASSIGNED: 'bg-indigo-500/15 text-indigo-700 border-indigo-500/30',
  IN_PROGRESS: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  RESOLVED: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  VERIFIED: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  MISSING: 'bg-rose-500/15 text-rose-700 border-rose-500/30',
  DAMAGED: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
  OPEN: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  CLOSED: 'bg-gray-200 text-gray-600 border-gray-300',
  HIGH: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
  CRITICAL: 'bg-rose-500/15 text-rose-700 border-rose-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  LOW: 'bg-gray-200 text-gray-700 border-gray-300',
};

export function StatusBadge({ status }: { status: string }) {
  const label = status
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return (
    <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[status] ?? 'bg-gray-200 text-gray-700 border-gray-300')}>
      {label}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-gray-600">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-12 text-center">
      <p className="text-sm font-medium text-gray-800">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-600">{hint}</p>}
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
      <div className="overlay absolute inset-0 backdrop-blur-sm" onClick={onClose} />
      <div
        className={clsx(
          'relative z-10 flex w-full max-h-[min(90vh,900px)] flex-col overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-lg',
          wide ? 'max-w-2xl' : 'max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-300 px-6 pb-4 pt-6">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
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
