import { useEffect, useRef, useState } from 'react';
import { useToast } from '../lib/toast';

/// Header wallet pill — click reveals a small popover with the full address,
/// a Copy button, and Disconnect. Avoids the previous footgun where a single
/// click on the pill silently disconnected the user.
export function WalletMenu({ address, onDisconnect }: { address: string; onDisconnect: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function copy() {
    void navigator.clipboard.writeText(address).then(() => {
      toast.success('Address copied');
    });
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-2xs sm:text-xs font-mono px-2.5 py-1.5 rounded-md bg-ipe-navy-100 text-ipe-navy-700 dark:bg-ipe-navy-700/40 dark:text-ipe-cream-100 hover:opacity-90 transition-opacity"
        title="Wallet menu"
      >
        <span className="sm:hidden">{address.slice(0, 4)}…{address.slice(-3)}</span>
        <span className="hidden sm:inline">{address.slice(0, 6)}…{address.slice(-4)}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 z-30 rounded-lg border border-ipe-stone-200 dark:border-ipe-navy-500/40 bg-ipe-cream-50 dark:bg-ipe-navy-800 shadow-lg p-3 space-y-3 animate-fade-up"
        >
          <div>
            <p className="text-2xs uppercase tracking-widest text-ipe-ink/50 mb-1">Connected wallet</p>
            <p className="font-mono text-xs break-all text-ipe-ink leading-snug">{address}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={copy} className="action-btn-ghost flex-1 justify-center">
              <CopyIcon /> Copy
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onDisconnect();
              }}
              className="action-btn-destructive flex-1 justify-center"
            >
              <DisconnectIcon /> Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DisconnectIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
