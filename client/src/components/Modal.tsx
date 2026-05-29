import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './AdminIcons';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /// Width preset. `md` (default) is good for forms; `lg` for tables/wider content.
  size?: 'md' | 'lg';
}

/// Centered modal with overlay. Closes on Esc and on overlay click.
/// Body scroll is locked while open.
export function Modal({ title, onClose, children, size = 'md' }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const widthClass = size === 'lg' ? 'max-w-4xl' : 'max-w-2xl';

  // Portal to <body> so the modal escapes any parent containing block.
  // Cards on the page use `backdrop-filter`, which would otherwise trap
  // `position: fixed` inside the card (CSS spec quirk).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`relative w-full ${widthClass} mx-3 my-6 bg-white dark:bg-ipe-navy-800 rounded-lg shadow-xl border border-ipe-stone-200 dark:border-ipe-navy-500/30`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-ipe-stone-200 dark:border-ipe-navy-500/30">
          <h2 className="font-display font-semibold text-ipe-green-700 dark:text-ipe-cream-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-ipe-ink-50 hover:text-ipe-ink p-1 rounded"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
