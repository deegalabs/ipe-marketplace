import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/// Banner that appears when a new service worker is ready. Lets the user
/// apply the update with one tap instead of waiting for the page to reload
/// on its own. Without this, the new code only kicks in on the next time
/// the user opens the app from scratch — easy to miss for hours.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, r) {
      // Poll for updates every 60s. Cheap (server returns 304 when nothing changed)
      // and means users with the app open for hours still pick up new deploys.
      if (r) {
        setInterval(() => {
          r.update().catch(() => {});
        }, 60_000);
      }
    },
  });

  const [applying, setApplying] = useState(false);

  // Light haptic + small entrance animation cue.
  useEffect(() => {
    if (needRefresh && 'vibrate' in navigator) {
      try { navigator.vibrate?.(15); } catch { /* ignore */ }
    }
  }, [needRefresh]);

  if (!needRefresh) return null;

  return (
    <div
      className="fixed inset-x-3 z-40 bg-ipe-navy-700 text-ipe-cream-100 rounded-lg shadow-xl p-3.5 flex items-center gap-3 animate-fade-up"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.5rem)' }}
      role="alert"
      aria-live="polite"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">New version available</p>
        <p className="text-xs opacity-80 mt-0.5">Refresh to get the latest improvements.</p>
      </div>
      <button
        onClick={async () => {
          setApplying(true);
          await updateServiceWorker(true);
        }}
        disabled={applying}
        className="text-xs px-3 py-1.5 rounded bg-ipe-gold text-ipe-navy-900 font-semibold hover:bg-ipe-gold/90 disabled:opacity-60"
      >
        {applying ? 'Updating…' : 'Refresh'}
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="text-xs opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
