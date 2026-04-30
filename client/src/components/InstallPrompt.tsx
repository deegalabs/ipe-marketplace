import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'install_prompt_dismissed_at';
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7; // re-prompt after 7 days
const AUTO_HIDE_MS = 30_000;                    // soft auto-dismiss after 30s

/// Captures Chrome/Edge's beforeinstallprompt and surfaces a small bottom-anchored
/// affordance for users to install the PWA. Dismissals are remembered for a week.
/// iOS Safari has no programmatic prompt — we render a hint there instead.
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
    if (Date.now() - dismissedAt < DISMISS_TTL_MS) return;

    // Already running standalone? nothing to install.
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((navigator as Navigator & { standalone?: boolean }).standalone) return;

    // Only show on phones — desktop "install as app" is rarely useful for an
    // e-commerce flow and clutters the page. We treat any non-coarse-pointer
    // device as desktop, plus a max-width guard for narrow desktop windows.
    const isMobile =
      window.matchMedia('(pointer: coarse)').matches &&
      window.matchMedia('(max-width: 820px)').matches;
    if (!isMobile) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS Safari fallback: detect once on load.
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
    if (isIos) {
      setShowIosHint(true);
      setHidden(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  // Auto-hide 30s after the prompt becomes visible. Silent — doesn't mark
  // dismissed in localStorage, so it can show again on a future visit. Keeps
  // the install affordance available without making it feel mandatory.
  useEffect(() => {
    if (hidden) return;
    const t = setTimeout(() => setHidden(true), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [hidden]);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setHidden(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const result = await deferred.userChoice;
    if (result.outcome === 'accepted') dismiss();
    setDeferred(null);
  }

  if (hidden) return null;

  return (
    <div
      className="fixed inset-x-3 z-30 bg-ipe-green text-ipe-cream rounded-lg shadow-lg p-3 flex items-start gap-3"
      // Lift above the bottom nav on mobile.
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.5rem)' }}
    >
      <div className="flex-1 text-sm">
        <p className="font-medium">Install ipê.city</p>
        <p className="text-xs opacity-80 mt-0.5">
          {showIosHint
            ? 'Tap Share, then "Add to Home Screen".'
            : 'Add to your home screen for a fullscreen, app-like experience.'}
        </p>
      </div>
      {deferred && (
        <button onClick={install} className="text-xs px-3 py-1.5 rounded bg-ipe-cream text-ipe-green font-medium">
          Install
        </button>
      )}
      <button onClick={dismiss} className="text-xs opacity-70" aria-label="Dismiss">✕</button>
    </div>
  );
}
