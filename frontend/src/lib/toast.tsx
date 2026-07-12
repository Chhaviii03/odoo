import { create } from 'zustand';

interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error' | 'info';
  title?: string;
  detail?: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (message: string, kind?: Toast['kind'], options?: { title?: string; detail?: string }) => void;
  remove: (id: number) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, kind = 'info', options) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, message, kind, title: options?.title, detail: options?.detail }] }));
    const duration = kind === 'error' ? 6000 : 4000;
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), duration);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(message: string, kind?: Toast['kind'], options?: { title?: string; detail?: string }) {
  useToastStore.getState().push(message, kind, options);
}

function ToastIcon({ kind }: { kind: Toast['kind'] }) {
  if (kind === 'success') {
    return (
      <svg className="h-6 w-6 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (kind === 'error') {
    return (
      <svg className="h-6 w-6 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  return (
    <svg className="h-6 w-6 shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ModalToast({ toast: t, onClose }: { toast: Toast; onClose: () => void }) {
  const styles =
    t.kind === 'success'
      ? 'border-emerald-500/30 bg-ink-900'
      : t.kind === 'error'
        ? 'border-rose-500/40 bg-ink-900'
        : 'border-blue-500/30 bg-ink-900';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="alertdialog"
        className={`toast-in relative w-full max-w-md rounded-2xl border px-6 py-5 shadow-2xl ${styles}`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-500 transition hover:text-slate-300"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex gap-4 pr-6">
          <ToastIcon kind={t.kind} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-white">{t.title ?? (t.kind === 'error' ? 'Something went wrong' : t.kind === 'success' ? 'Success' : 'Notice')}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{t.message}</p>
            {t.detail && <p className="mt-3 rounded-lg border border-ink-700 bg-ink-800/80 px-3 py-2 text-sm text-slate-400">{t.detail}</p>}
            <button type="button" onClick={onClose} className="btn-primary mt-4 w-full">
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineToast({ toast: t, onClose }: { toast: Toast; onClose: () => void }) {
  const styles =
    t.kind === 'success'
      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100'
      : 'border-blue-500/40 bg-blue-500/15 text-blue-100';

  return (
    <div className={`flex min-w-[280px] max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm shadow-xl ${styles}`}>
      <ToastIcon kind={t.kind} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t.message}</p>
        {t.detail && <p className="mt-1 text-xs opacity-80">{t.detail}</p>}
      </div>
      <button type="button" onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Close">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ToastHost() {
  const { toasts, remove } = useToastStore();
  const modalToast = toasts.find((t) => t.kind === 'error');
  const inlineToasts = toasts.filter((t) => t.kind !== 'error');

  return (
    <>
      {modalToast && <ModalToast toast={modalToast} onClose={() => remove(modalToast.id)} />}
      {inlineToasts.length > 0 && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-[99] flex -translate-x-1/2 flex-col items-center gap-2">
          {inlineToasts.map((t) => (
            <div key={t.id} className="pointer-events-auto">
              <InlineToast toast={t} onClose={() => remove(t.id)} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
