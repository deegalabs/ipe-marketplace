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
      className="fixed z-50 flex flex-col gap-3 pointer-events-none"
      style={{
        top: 'calc(env(safe-area-inset-top) + 24px)',
        right: 'calc(env(safe-area-inset-right) + 24px)',
        left: 'calc(env(safe-area-inset-left) + 24px)',
        // Cap width but stay aligned to the right on wider viewports.
        maxWidth: '420px',
        marginLeft: 'auto',
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
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const startRef = useRef(Date.now());
  const elapsedBeforePauseRef = useRef(0);

  // Auto-dismiss with hover-pause. Tracking elapsed time across pauses keeps
  // the progress bar accurate when the user mouses in/out.
  useEffect(() => {
    if (paused) {
      elapsedBeforePauseRef.current += Date.now() - startRef.current;
      return;
    }
    startRef.current = Date.now();
    const tick = () => {
      const elapsed = elapsedBeforePauseRef.current + (Date.now() - startRef.current);
      const pct = Math.max(0, 100 - (elapsed / toast.durationMs) * 100);
      setProgress(pct);
      if (pct <= 0) onDismiss();
    };
    const interval = setInterval(tick, 50);
    return () => clearInterval(interval);
  }, [paused, toast.durationMs, onDismiss]);

  const accent = ACCENTS[toast.kind];

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto group relative overflow-hidden bg-white dark:bg-ipe-navy-700 border border-ipe-stone-200 dark:border-ipe-navy-500/40 rounded-lg shadow-xl backdrop-blur-sm animate-toast-slide"
    >
      {/* Top accent stripe — subtle but unmistakable */}
      <span aria-hidden className={`absolute top-0 inset-x-0 h-0.5 ${accent.stripe}`} />

      <div className="flex items-start gap-3 p-4 pr-3">
        <span
          className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-full ${accent.iconBg}`}
          aria-hidden
        >
          <ToastIcon kind={toast.kind} className={accent.iconColor} />
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className={`font-display font-semibold leading-snug tracking-tight text-sm ${accent.titleColor}`}>
            {toast.title}
          </p>
          {toast.message && (
            <p className="text-xs text-ipe-ink-70 mt-1 leading-relaxed whitespace-pre-line break-words">
              {toast.message}
            </p>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 -mt-1 -mr-1 w-7 h-7 inline-flex items-center justify-center rounded-md text-ipe-ink-50 hover:text-ipe-ink hover:bg-ipe-stone-100 dark:hover:bg-ipe-navy-500/30 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 3 L11 11 M11 3 L3 11" />
          </svg>
        </button>
      </div>

      {/* Bottom progress bar — drains from full to empty as the toast lives */}
      <div className="absolute bottom-0 inset-x-0 h-0.5 bg-ipe-stone-100 dark:bg-ipe-navy-500/30">
        <div
          className={`h-full transition-[width] ease-linear ${accent.progress}`}
          style={{ width: `${progress}%`, transitionDuration: paused ? '0s' : '50ms' }}
        />
      </div>
    </div>
  );
}

const ACCENTS = {
  success: {
    stripe: 'bg-ipe-lime',
    iconBg: 'bg-ipe-lime/15',
    iconColor: 'text-ipe-lime-600 dark:text-ipe-lime',
    titleColor: 'text-ipe-navy-700 dark:text-ipe-cream-100',
    progress: 'bg-ipe-lime',
  },
  error: {
    stripe: 'bg-red-500',
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-600 dark:text-red-400',
    titleColor: 'text-red-700 dark:text-red-300',
    progress: 'bg-red-500',
  },
  info: {
    stripe: 'bg-ipe-sky',
    iconBg: 'bg-ipe-sky/15',
    iconColor: 'text-ipe-sky dark:text-ipe-sky',
    titleColor: 'text-ipe-navy-700 dark:text-ipe-cream-100',
    progress: 'bg-ipe-sky',
  },
} as const;

function ToastIcon({ kind, className = '' }: { kind: ToastKind; className?: string }) {
  if (kind === 'success') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M3.5 9.5 L7 13 L14.5 5" />
      </svg>
    );
  }
  if (kind === 'error') {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="9" cy="9" r="7" />
        <path d="M9 5.5 V9.5 M9 12.2 v0.1" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="9" r="7" />
      <path d="M9 12 V8.5 M9 5.6 v0.1" />
    </svg>
  );
}
