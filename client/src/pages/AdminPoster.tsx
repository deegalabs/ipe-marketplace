import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FlowerMark } from '../components/Logo';

/// Print-ready poster for events: brand-aligned A4 page with a large install
/// QR. Admin can edit the URL, headline, instruction line and (optional) event
/// info; ⌘P/ctrl+P captures the poster cleanly thanks to dedicated print
/// styles that hide the toolbar + dark mode.
export function AdminPoster() {
  const defaultUrl = typeof window !== 'undefined' ? window.location.origin : 'https://ipestore.app';
  const [url, setUrl] = useState(defaultUrl);
  const [headline, setHeadline] = useState('Ipê Store');
  const [subhead, setSubhead] = useState('Loja de merch · ipê.city');
  const [instruction, setInstruction] = useState('Aponte sua câmera e instale o app');
  const [event, setEvent] = useState('');

  function print() {
    window.print();
  }

  // Strip protocol for the printed shortlink — looks cleaner on paper.
  const display = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <section className="space-y-6 max-w-3xl mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-ipe-green">Install poster</h1>
          <p className="text-sm text-ipe-ink/60 mt-1">
            Edit the fields below, then ⌘P / Ctrl+P to print or save as PDF.
          </p>
        </div>
        <button onClick={print} className="btn-primary text-sm">Print poster</button>
      </header>

      {/* ── Editable controls (hidden on print) ── */}
      <div className="card p-5 space-y-3 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">URL</label>
            <input className="input font-mono text-xs" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="label">Event (optional)</label>
            <input className="input" value={event} onChange={(e) => setEvent(e.target.value)} placeholder="ipê.city · Sat 12 Apr · São Paulo" />
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
      </div>

      {/* ── The poster itself — A4 portrait, print-ready ── */}
      <div className="poster-page mx-auto bg-ipe-cream-100 text-ipe-navy-700 shadow-lg print:shadow-none border border-ipe-stone-200/60 print:border-0 flex flex-col">
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
              level="H"                      /* 30% error-correction — survives logo overlay + creases */
              includeMargin={false}
              fgColor="#001627"              /* navy */
              bgColor="#ffffff"
              imageSettings={{
                src: '/pwa-192x192.png',
                height: 60,
                width: 60,
                excavate: true,              /* punch a clear square for the logo */
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

      {/* ── Print-only stylesheet — A4, hide everything except the poster ── */}
      <style>{`
        .poster-page {
          width: 210mm;
          height: 297mm;
        }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          /* Classic print trick: hide everything, then reveal only the poster
             and re-anchor it to the top-left of the page. Works regardless of
             header/nav/footer markup. */
          body * { visibility: hidden !important; }
          .poster-page, .poster-page * { visibility: visible !important; }
          .poster-page {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: 0 !important;
            background: #eff2f1 !important;       /* ipe-cream-100 */
            color: #001627 !important;            /* ipe-navy-700 */
          }
          html.dark .poster-page * {
            color: inherit !important;
          }
        }
      `}</style>
    </section>
  );
}
