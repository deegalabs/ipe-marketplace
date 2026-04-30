import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  durationMs: number;
}

interface ToastCtx {
  show: (kind: ToastKind, title: string, message?: string, durationMs?: number) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, title: string, message?: string, durationMs = 5000) => {
      const id = `t${++idRef.current}`;
      setToasts((prev) => [...prev, { id, kind, title, message, durationMs }]);
    },
    [],
  );

  const value: ToastCtx = {
    show,
    success: (title, message) => show('success', title, message),
    error: (title, message) => show('error', title, message, 8000),
    info: (title, message) => show('info', title, message),
  };

  return (
    <ctx.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(ctx);
  if (!v) throw new Error('useToast must be inside ToastProvider');
  return v;
}

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed z-50 flex flex-col gap-2 pointer-events-none"
      style={{
        top: 'calc(env(safe-area-inset-top) + 16px)',
        right: 'calc(env(safe-area-inset-right) + 16px)',
        maxWidth: 'min(380px, calc(100vw - 32px))',
      }}
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, toast.durationMs);
    return () => clearTimeout(id);
  }, [onDismiss, toast.durationMs]);

  const accent =
    toast.kind === 'success'
      ? 'border-l-ipe-lime'
      : toast.kind === 'error'
        ? 'border-l-red-500'
        : 'border-l-ipe-sky';
  const icon = toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : 'i';
  const iconBg =
    toast.kind === 'success'
      ? 'bg-ipe-lime/20 text-ipe-lime-600 dark:text-ipe-lime'
      : toast.kind === 'error'
        ? 'bg-red-500/15 text-red-700 dark:text-red-300'
        : 'bg-ipe-sky/15 text-ipe-sky dark:text-ipe-sky';

  return (
    <div
      className={`pointer-events-auto bg-white dark:bg-ipe-navy-700 border border-ipe-stone-200 dark:border-ipe-navy-500/50 border-l-4 ${accent} rounded-md shadow-lg p-3 flex items-start gap-3 animate-fade-up`}
    >
      <span
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${iconBg}`}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ipe-ink leading-snug">{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-ipe-ink-70 mt-0.5 leading-snug whitespace-pre-line break-words">
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 text-ipe-ink-50 hover:text-ipe-ink leading-none text-base"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
