import { useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { FlowerMark } from './Logo';

/// Print-ready install poster shown as a modal inside /admin. Admin can edit
/// URL, headline, instruction line, and (optional) event info; ⌘P/ctrl+P
/// captures the A4 cleanly thanks to dedicated print styles that hide
/// everything else on the page.
export function InstallPosterModal({ onClose }: { onClose: () => void }) {
  const defaultUrl = typeof window !== 'undefined' ? window.location.origin : 'https://ipestore.app';
  const [url, setUrl] = useState(defaultUrl);
  const [headline, setHeadline] = useState('Ipê Store');
  const [subhead, setSubhead] = useState('Loja de merch · ipê.city');
  const [instruction, setInstruction] = useState('Aponte sua câmera e instale o app');
  const [event, setEvent] = useState('');

  // Strip protocol for the printed shortlink — looks cleaner on paper.
  const display = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-ipe-navy-800/60 backdrop-blur-sm overflow-y-auto print:bg-transparent print:relative print:inset-auto print:overflow-visible"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-ipe-cream-50 dark:bg-ipe-navy-800 rounded-xl my-6 w-full max-w-3xl shadow-xl border border-ipe-stone-200 dark:border-ipe-navy-500/40 print:bg-transparent print:my-0 print:max-w-none print:border-0 print:shadow-none print:rounded-none"
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-ipe-stone-200 dark:border-ipe-navy-500/40 print:hidden">
          <h2 className="font-display font-semibold text-ipe-navy-700 dark:text-ipe-cream-100">
            Install poster
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="action-btn-primary">
              <PrintIcon /> Print
            </button>
            <button onClick={onClose} className="text-ipe-ink-50 hover:text-ipe-ink leading-none text-lg" aria-label="close">×</button>
          </div>
        </header>

        {/* ── Editable controls (hidden on print) ── */}
        <div className="p-5 space-y-3 print:hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">URL</label>
              <input className="input font-mono text-xs" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div>
              <label className="label">Event (optional)</label>
              <input className="input" value={event} onChange={(e) => setEvent(e.target.value)} placeholder="ipê.city · Sat 12 Apr" />
            </div>
            <div>
              <label className="label">Headline</label>
              <input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} />
            </div>
            <div>
              <label className="label">Subhead</label>
              <input className="input" value={subhead} onChange={(e) => setSubhead(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Instruction</label>
              <input className="input" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
            </div>
          </div>
          <p className="text-2xs text-ipe-ink/50">
            Preview below. ⌘P / Ctrl+P to print or save as PDF — only the poster comes through.
          </p>
        </div>

        {/* ── The poster itself — A4 portrait, print-ready ── */}
        <div className="px-5 pb-6 print:p-0">
          <div className="poster-page mx-auto bg-ipe-cream-100 text-ipe-navy-700 shadow-md print:shadow-none border border-ipe-stone-200/60 print:border-0 flex flex-col">
            <div className="px-12 pt-12 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FlowerMark size={42} className="text-ipe-gold" />
                <span className="font-display font-semibold text-2xl tracking-tight">Ipê Store</span>
              </div>
              <span className="text-2xs uppercase tracking-widest text-ipe-ink-50 font-display">
                Onchain receipts · Base
              </span>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-12 pb-12 text-center">
              <h1 className="font-display font-bold text-[64px] leading-[0.95] tracking-tight">
                {headline}
              </h1>
              <p className="mt-3 text-lg text-ipe-ink-70 max-w-md">{subhead}</p>

              <div className="mt-12 mb-10 inline-block bg-white p-5 rounded-2xl border-4 border-ipe-navy-700">
                <QRCodeSVG
                  value={url}
                  size={320}
                  level="H"
                  includeMargin={false}
                  fgColor="#001627"
                  bgColor="#ffffff"
                  imageSettings={{
                    src: '/pwa-192x192.png',
                    height: 60,
                    width: 60,
                    excavate: true,
                  }}
                />
              </div>

              <p className="text-base font-medium">{instruction}</p>
              <p className="mt-1 font-mono text-sm text-ipe-ink-70">{display}</p>
            </div>

            {event && (
              <div className="px-12 pb-10 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ipe-lime/15 border border-ipe-lime/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-ipe-lime" />
                  <span className="text-2xs font-semibold uppercase tracking-widest text-ipe-navy-700">{event}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Print stylesheet — A4, hide everything except .poster-page ── */}
        <style>{`
          .poster-page {
            width: 210mm;
            height: 297mm;
          }
          @media print {
            @page { size: A4 portrait; margin: 0; }
            body * { visibility: hidden !important; }
            .poster-page, .poster-page * { visibility: visible !important; }
            .poster-page {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              margin: 0 !important;
              box-shadow: none !important;
              border: 0 !important;
              background: #eff2f1 !important;
              color: #001627 !important;
            }
          }
        `}</style>
      </div>
    </div>,
    document.body,
  );
}

function PrintIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
    </svg>
  );
}
