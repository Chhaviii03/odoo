import { create } from 'zustand';
import { useEffect } from 'react';

interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error' | 'info';
}

interface ToastStore {
  toasts: Toast[];
  push: (message: string, kind?: Toast['kind']) => void;
  remove: (id: number) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(message: string, kind?: Toast['kind']) {
  useToastStore.getState().push(message, kind);
}

export function ToastHost() {
  const { toasts, remove } = useToastStore();
  useEffect(() => {}, []);
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => remove(t.id)}
          className={
            'min-w-[240px] rounded-lg border px-4 py-3 text-left text-sm shadow-lg ' +
            (t.kind === 'success'
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
              : t.kind === 'error'
              ? 'border-rose-500/40 bg-rose-500/15 text-rose-200'
              : 'border-ink-600 bg-ink-800 text-slate-200')
          }
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
