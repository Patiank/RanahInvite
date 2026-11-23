import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import QRCode from 'qrcode';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Copy,
  FileDown,
  QrCode,
  X,
} from 'lucide-react';
import {
  EventMetadata,
  OverlayBlock,
  OverlayFontFamily,
  Recipient,
  TemplateImages,
} from '../types';
import {
  computeBrowserWrappedLines,
  getBrowserCssFontFamily,
  getPdfReferenceWidth,
  resolveFieldText,
} from '../utils/pdfEngine';
import { buildRsvpUrl } from '../utils/rsvp';
import { RecipientPickerDropdown } from './RecipientPickerDropdown';

type PreviewLayoutMode = 'page1' | 'page2' | 'both';

interface InvitationPreviewModalProps {
  eventId: string;
  recipient: Recipient | null;
  recipients?: Recipient[];
  initialPage?: 1 | 2;
  metadata: EventMetadata;
  templates: TemplateImages;
  overlays: OverlayBlock[];
  onClose: () => void;
  onSelectRecipient?: (recipient: Recipient) => void;
  onDownloadPdf: (recipient: Recipient) => void;
  onSimulateRsvp: (recipient: Recipient) => void;
}

function getCssFontFamily(family: OverlayFontFamily): string {
  return getBrowserCssFontFamily(family);
}

interface RenderedPageStageProps {
  pageNum: 1 | 2;
  hasPage2: boolean;
  imgUrl: string;
  imgW: number;
  imgH: number;
  overlays: OverlayBlock[];
  recipient: Recipient;
  qrDataUrl: string;
  isSideBySide: boolean;
}

const RenderedPageStage: React.FC<RenderedPageStageProps> = ({
  pageNum,
  hasPage2,
  imgUrl,
  imgW,
  imgH,
  overlays,
  recipient,
  qrDataUrl,
  isSideBySide,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = useState<number>(480);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const initialW = el.getBoundingClientRect().width;
    if (initialW > 0) {
      setStageWidth(initialW);
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setStageWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageNum, isSideBySide, imgW, imgH]);

  const safeW = imgW || 1240;
  const safeH = imgH || 1754;
  const ratio = safeW / safeH;
  const scaleRatio = stageWidth / getPdfReferenceWidth(safeW, safeH);
  const pageOverlays = overlays.filter(
    (o) => o.visible && (hasPage2 ? o.page : 1) === pageNum
  );

  const stageWidthCss = isSideBySide
    ? safeW >= safeH
      ? `min(44vw, 680px)`
      : `min(44vw, calc((100vh - 138px) * ${ratio.toFixed(4)}))`
    : safeW >= safeH
      ? `min(92vw, 1020px, calc((100vh - 132px) * ${ratio.toFixed(4)}))`
      : `min(92vw, calc((100vh - 132px) * ${ratio.toFixed(4)}))`;

  return (
    <div
      ref={stageRef}
      className="relative shadow-2xl rounded-xl overflow-hidden bg-white ring-1 ring-white/15 shrink-0"
      style={{
        aspectRatio: `${safeW} / ${safeH}`,
        width: stageWidthCss,
      }}
    >
      <img
        src={imgUrl}
        alt={`Pratinjau Halaman ${pageNum}`}
        referrerPolicy="no-referrer"
        className="w-full h-full object-contain block"
      />
      {pageOverlays.map((block) => {
        const translateX =
          block.id === 'qr_code'
            ? '-50%'
            : block.align === 'center'
              ? '-50%'
              : block.align === 'right'
                ? '-100%'
                : '0%';
        const val = resolveFieldText(block.id, recipient, block.placeholder);
        const maxWidthPx = (stageWidth * block.width) / 100;
        const isInstitution = block.id === 'institution';
        const fitted =
          block.id === 'qr_code'
            ? { lines: [] as string[], scaledFontSizePx: 12 }
            : computeBrowserWrappedLines(
                val,
                block.fontFamily,
                block.fontWeight,
                block.italic,
                block.fontSize,
                scaleRatio,
                maxWidthPx,
                isInstitution
              );

        return (
          <div
            key={block.id}
            style={{
              left: `${block.x}%`,
              top: `${block.y}%`,
              width: `${block.width}%`,
              transform: `translate(${translateX}, -50%)`,
            }}
            className="absolute pointer-events-none"
          >
            {block.id === 'qr_code' ? (
              <div className="w-full aspect-square bg-white p-1 rounded-xs">
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt="QR Code"
                    className="w-full h-full object-contain block"
                  />
                )}
              </div>
            ) : (
              <div
                className={`flex flex-col ${
                  block.align === 'center'
                    ? 'items-center'
                    : block.align === 'right'
                      ? 'items-end'
                      : 'items-start'
                }`}
                style={{
                  fontFamily: getCssFontFamily(block.fontFamily),
                  fontSize: `${fitted.scaledFontSizePx}px`,
                  fontWeight: block.fontWeight,
                  fontStyle: block.italic ? 'italic' : 'normal',
                  textAlign: block.align,
                  color: block.color,
                  lineHeight: 1.28,
                }}
              >
                {fitted.lines.map((line, lineIdx) => (
                  <div key={lineIdx} className="whitespace-nowrap">
                    {line || '\u00A0'}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const InvitationPreviewModal: React.FC<InvitationPreviewModalProps> = ({
  eventId,
  recipient,
  recipients,
  initialPage = 1,
  metadata,
  templates,
  overlays,
  onClose,
  onSelectRecipient,
  onDownloadPdf,
  onSimulateRsvp,
}) => {
  const hasPage2 = templates.pageCount === 2 && Boolean(templates.page2DataUrl);
  const [layoutMode, setLayoutMode] = useState<PreviewLayoutMode>(
    initialPage === 2 && hasPage2 ? 'page2' : 'page1'
  );
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setLayoutMode(initialPage === 2 && hasPage2 ? 'page2' : 'page1');
  }, [initialPage, hasPage2]);

  useEffect(() => {
    if (!recipient) return;
    let cancelled = false;
    const rsvpUrl = buildRsvpUrl(eventId, metadata, recipient);
    QRCode.toDataURL(rsvpUrl, { width: 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId, recipient, metadata]);

  const list = recipients && recipients.length > 0 ? recipients : recipient ? [recipient] : [];
  const currentIdx = recipient ? list.findIndex((r) => r.id === recipient.id) : -1;

  const goPrevRecipient = () => {
    if (!onSelectRecipient || list.length <= 1 || currentIdx < 0) return;
    const prevIdx = (currentIdx - 1 + list.length) % list.length;
    onSelectRecipient(list[prevIdx]);
  };

  const goNextRecipient = () => {
    if (!onSelectRecipient || list.length <= 1 || currentIdx < 0) return;
    const nextIdx = (currentIdx + 1) % list.length;
    onSelectRecipient(list[nextIdx]);
  };

  useEffect(() => {
    if (!recipient) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && onSelectRecipient && list.length > 1) {
        const prevIdx = (currentIdx - 1 + list.length) % list.length;
        onSelectRecipient(list[prevIdx]);
      } else if (e.key === 'ArrowRight' && onSelectRecipient && list.length > 1) {
        const nextIdx = (currentIdx + 1) % list.length;
        onSelectRecipient(list[nextIdx]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [recipient, onClose, onSelectRecipient, list, currentIdx]);

  const handleCopyRsvpLink = async () => {
    if (!recipient) return;
    const url = buildRsvpUrl(eventId, metadata, recipient);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  if (!recipient || typeof document === 'undefined') return null;

  const effectiveMode: PreviewLayoutMode =
    !hasPage2 && layoutMode !== 'page1' ? 'page1' : layoutMode;

  return createPortal(
    <div
      className="fixed inset-0 z-[9000] flex flex-col bg-slate-950/85 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Top Full-Preview Toolbar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-white border-b border-slate-200/90 shadow-sm shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Recipient Switcher */}
        <div className="flex items-center gap-2 min-w-0">
          {onSelectRecipient && list.length > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrevRecipient}
                title="Tamu Sebelumnya (Panah Kiri)"
                aria-label="Tamu Sebelumnya"
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-[#111827] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={goNextRecipient}
                title="Tamu Berikutnya (Panah Kanan)"
                aria-label="Tamu Berikutnya"
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-[#111827] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="min-w-0">
            {onSelectRecipient ? (
              <div className="flex items-center gap-2">
                <RecipientPickerDropdown
                  recipients={recipients ?? []}
                  selectedRecipient={recipient}
                  onSelect={onSelectRecipient}
                  align="left"
                  showIndex
                  maxWidthClass="max-w-[240px] sm:max-w-[300px]"
                  ariaLabel="Pilih Tamu untuk Full Preview"
                />
                {list.length > 0 && currentIdx >= 0 && (
                  <span className="hidden md:inline text-[12px] text-slate-500 tabular-nums whitespace-nowrap">
                    ({currentIdx + 1}/{list.length})
                  </span>
                )}
              </div>
            ) : (
              <h3 className="font-display font-bold text-[15px] text-[#111827] truncate">
                Full Preview · {recipient.recipientName}
              </h3>
            )}
            <p className="text-[11px] text-slate-500 truncate mt-0.5">
              {recipient.institution}
            </p>
          </div>
        </div>

        {/* Right: Page Mode + Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {hasPage2 && (
            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-100">
              <button
                type="button"
                onClick={() => setLayoutMode('page1')}
                className={`px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                  effectiveMode === 'page1'
                    ? 'bg-white text-[#111827] shadow-xs'
                    : 'text-slate-600 hover:text-[#111827]'
                }`}
              >
                Hal 1
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('page2')}
                className={`px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                  effectiveMode === 'page2'
                    ? 'bg-white text-[#111827] shadow-xs'
                    : 'text-slate-600 hover:text-[#111827]'
                }`}
              >
                Hal 2
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('both')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                  effectiveMode === 'both'
                    ? 'bg-white text-[#158A85] shadow-xs'
                    : 'text-slate-600 hover:text-[#111827]'
                }`}
                title="Tampilkan Halaman 1 & Halaman 2 berdampingan"
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Berdampingan</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleCopyRsvpLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            title="Salin tautan RSVP unik untuk dibagikan"
          >
            {copiedLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span className="hidden md:inline">
              {copiedLink ? 'Tersalin' : 'Link RSVP'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onSimulateRsvp(recipient);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-[#111827] transition-colors hover:brightness-95 whitespace-nowrap"
            style={{ backgroundColor: 'var(--accent-primary)' }}
            title="Simulasi tampilan saat tamu memindai QR"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Simulasi QR</span>
          </button>

          <button
            type="button"
            onClick={() => onDownloadPdf(recipient)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12px] font-semibold text-white transition-colors hover:brightness-95 whitespace-nowrap"
            style={{ backgroundColor: 'var(--bg-sidebar)' }}
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Unduh PDF</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            aria-label="Tutup Full Preview"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Full-Screen Clean Preview Stage */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 overflow-auto p-4 sm:p-6 flex items-center justify-center"
      >
        <div
          className={`flex items-center justify-center ${
            effectiveMode === 'both' ? 'flex-col md:flex-row gap-5' : ''
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {(effectiveMode === 'page1' || effectiveMode === 'both') && (
            <RenderedPageStage
              pageNum={1}
              hasPage2={hasPage2}
              imgUrl={templates.page1DataUrl}
              imgW={templates.page1Width}
              imgH={templates.page1Height}
              overlays={overlays}
              recipient={recipient}
              qrDataUrl={qrDataUrl}
              isSideBySide={effectiveMode === 'both'}
            />
          )}

          {hasPage2 &&
            templates.page2DataUrl &&
            (effectiveMode === 'page2' || effectiveMode === 'both') && (
              <RenderedPageStage
                pageNum={2}
                hasPage2={hasPage2}
                imgUrl={templates.page2DataUrl}
                imgW={templates.page2Width || templates.page1Width}
                imgH={templates.page2Height || templates.page1Height}
                overlays={overlays}
                recipient={recipient}
                qrDataUrl={qrDataUrl}
                isSideBySide={effectiveMode === 'both'}
              />
            )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
};
