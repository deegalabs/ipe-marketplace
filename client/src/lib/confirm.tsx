import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/// Branded confirmation dialog — replaces the OS-native `window.confirm()`,
/// which can't carry warning callouts, doesn't match the rest of the app's
/// styling, and is blocked or stripped on some mobile browsers.
///
/// Usage (mirrors `confirm()`'s API but Promise-based):
///
///   const confirm = useConfirm();
///   if (await confirm({
///     title: 'Cancel order?',
///     body: 'If you have already paid…',
///     confirmLabel: 'Yes, cancel',
///     destructive: true,
///   })) {
///     // proceed
///   }

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  /// Optional callout shown inside the card (e.g. a warning highlight).
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface PendingDialog extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const ctx = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingDialog | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  function close(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  // Esc cancels.
  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <ctx.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog dialog={pending} onClose={close} />}
    </ctx.Provider>
  );
}

export function useConfirm() {
  const v = useContext(ctx);
  if (!v) throw new Error('useConfirm must be inside ConfirmProvider');
  return v;
}

function ConfirmDialog({ dialog, onClose }: { dialog: PendingDialog; onClose: (ok: boolean) => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-ipe-navy-800/60 backdrop-blur-sm animate-fade-up"
      onClick={() => onClose(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-ipe-cream-50 dark:bg-ipe-navy-800 rounded-t-xl sm:rounded-xl w-full sm:max-w-md shadow-xl border border-ipe-stone-200 dark:border-ipe-navy-500/40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="px-5 pt-5 space-y-3">
          <h2
            id="confirm-title"
            className="font-display font-semibold text-lg text-ipe-navy-700 dark:text-ipe-cream-100"
          >
            {dialog.title}
          </h2>
          {dialog.body && (
            <div className="text-sm text-ipe-ink/70 leading-relaxed">{dialog.body}</div>
          )}
          {dialog.warning && (
            <div className="flex gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-900/40">
              <WarnIcon />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">{dialog.warning}</p>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-5 py-4 mt-2 border-t border-ipe-stone-200 dark:border-ipe-navy-500/30">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="action-btn-ghost flex-1 justify-center"
            autoFocus
          >
            {dialog.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => onClose(true)}
            className={`flex-1 justify-center ${dialog.destructive ? 'action-btn-destructive' : 'action-btn-primary'}`}
          >
            {dialog.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
    </svg>
  );
}
