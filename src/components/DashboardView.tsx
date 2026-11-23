import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import QRCode from 'qrcode';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  PenTool,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  EventMetadata,
  NavTab,
  OverlayBlock,
  Recipient,
  SavedEventRecord,
  TemplateImages,
} from '../types';
import {
  computeBrowserWrappedLines,
  getBrowserCssFontFamily,
  getPdfReferenceWidth,
  resolveFieldText,
} from '../utils/pdfEngine';
import { buildRsvpUrl } from '../utils/rsvp';
import { EventHistoryPanel } from './EventHistoryPanel';
import { PaginationBar } from './PaginationBar';
import {
  RecipientPickerDropdown,
  SAMPLE_PREVIEW_RECIPIENT,
} from './RecipientPickerDropdown';
import {
  CountUpNumber,
  HighlightedText,
  ProgressRing,
  SmartMarqueeText,
} from './UiPolish';

interface DashboardViewProps {
  eventId: string;
  metadata: EventMetadata;
  templates: TemplateImages;
  overlays: OverlayBlock[];
  recipients: Recipient[];
  filteredRecipients: Recipient[];
  previewRecipientId: string;
  onSelectPreviewRecipient: (id: string) => void;
  events: SavedEventRecord[];
  activeEventId: string;
  onSelectEvent: (eventId: string) => void;
  onCreateEvent: (metadata: EventMetadata) => void;
  onDuplicateEvent: (eventId: string) => void;
  onToggleEventCompleted: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onNavigate: (tab: NavTab) => void;
  onPreviewRecipient: (recipient: Recipient, page?: 1 | 2) => void;
  onDownloadSinglePdf: (recipient: Recipient) => void;
  downloadingId: string | null;
  searchQuery?: string;
}

interface DashboardPagePreviewProps {
  pageNum: 1 | 2;
  hasPage2: boolean;
  imgUrl: string;
  imgW: number;
  imgH: number;
  overlays: OverlayBlock[];
  recipient: Recipient;
  qrDataUrl: string;
  className?: string;
  onClick?: () => void;
}

const DashboardPagePreview: React.FC<DashboardPagePreviewProps> = ({
  pageNum,
  hasPage2,
  imgUrl,
  imgW,
  imgH,
  overlays,
  recipient,
  qrDataUrl,
  className = '',
  onClick,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = useState<number>(260);

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
  }, [imgW, imgH, pageNum]);

  const safeW = imgW || 1240;
  const safeH = imgH || 1754;
  const scaleRatio = stageWidth / getPdfReferenceWidth(safeW, safeH);
  const pageOverlays = overlays.filter(
    (o) => o.visible && (hasPage2 ? o.page : 1) === pageNum
  );

  return (
    <div
      ref={stageRef}
      onClick={onClick}
      title={`Klik untuk membuka Full Preview Halaman ${pageNum}`}
      className={`relative overflow-hidden rounded-xl bg-white cursor-pointer group studio-paper-card ${className}`}
      style={{
        aspectRatio: `${safeW} / ${safeH}`,
      }}
    >
      <img
        src={imgUrl}
        alt={`Desain Undangan Halaman ${pageNum}`}
        className="w-full h-full object-contain block pointer-events-none"
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
            ? { lines: [] as string[], scaledFontSizePx: 10 }
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
              <div className="w-full aspect-square bg-white p-0.5 rounded-xs">
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
                  fontFamily: getBrowserCssFontFamily(block.fontFamily),
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

export const DashboardView: React.FC<DashboardViewProps> = ({
  eventId,
  metadata,
  templates,
  overlays,
  recipients,
  filteredRecipients,
  previewRecipientId,
  onSelectPreviewRecipient,
  events,
  activeEventId,
  onSelectEvent,
  onCreateEvent,
  onDuplicateEvent,
  onToggleEventCompleted,
  onDeleteEvent,
  onNavigate,
  onPreviewRecipient,
  onDownloadSinglePdf,
  downloadingId,
  searchQuery = '',
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [listPage, setListPage] = useState<number>(1);
  const DASHBOARD_PAGE_SIZE = 10;

  useEffect(() => {
    setListPage(1);
  }, [activeEventId, filteredRecipients.length]);

  const totalListPages = Math.max(
    1,
    Math.ceil(filteredRecipients.length / DASHBOARD_PAGE_SIZE)
  );
  const safeListPage = Math.min(listPage, totalListPages);
  const paginatedDashboardRecipients = useMemo(() => {
    const start = (safeListPage - 1) * DASHBOARD_PAGE_SIZE;
    return filteredRecipients.slice(start, start + DASHBOARD_PAGE_SIZE);
  }, [filteredRecipients, safeListPage]);

  const previewRecipient = useMemo(
    () =>
      recipients.find((r) => r.id === previewRecipientId) ??
      recipients[0] ??
      SAMPLE_PREVIEW_RECIPIENT,
    [recipients, previewRecipientId]
  );

  useEffect(() => {
    let cancelled = false;
    const rsvpUrl = buildRsvpUrl(eventId, metadata, previewRecipient);
    QRCode.toDataURL(rsvpUrl, {
      width: 180,
      margin: 1,
      color: { dark: '#111827', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId, metadata, previewRecipient]);

  const hasPage2 = templates.pageCount === 2 && Boolean(templates.page2DataUrl);
  const totalRecipients = recipients.length;
  const generatedCount = recipients.filter((r) => r.status === 'generated').length;
  const readyCount = totalRecipients - generatedCount;
  const confirmedCount = recipients.filter(
    (r) => r.rsvpStatus === 'attending' || r.rsvpStatus === 'represented'
  ).length;
  const declinedCount = recipients.filter((r) => r.rsvpStatus === 'declined').length;
  const pendingRsvpCount = Math.max(0, totalRecipients - confirmedCount - declinedCount);
  const completedEventsCount = events.filter((e) => e.isCompleted).length;
  const activeEventsCount = events.length - completedEventsCount;
  const rsvpPercent =
    totalRecipients > 0 ? Math.round((confirmedCount / totalRecipients) * 100) : 0;
  const generatedPercent =
    totalRecipients > 0 ? Math.round((generatedCount / totalRecipients) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip — Smooth count-up numbers + animated progress rings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#158A85]/35 hover:shadow-xs"
        >
          <div className="text-[12px] font-medium text-slate-500">
            Total Event Tersimpan
          </div>
          <div className="font-display font-bold text-[26px] text-[#111827] mt-1 tabular-nums leading-tight">
            <CountUpNumber value={events.length} />
          </div>
          <div className="text-[12px] text-slate-500 mt-1 tabular-nums">
            <CountUpNumber value={completedEventsCount} /> selesai ·{' '}
            <CountUpNumber value={activeEventsCount} /> aktif
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 flex items-center justify-between gap-3 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#158A85]/35 hover:shadow-xs"
        >
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-slate-500">
              Konfirmasi Hadir (RSVP)
            </div>
            <div className="font-display font-bold text-[26px] text-[#111827] mt-1 tabular-nums leading-tight">
              <CountUpNumber value={confirmedCount} />
              <span className="text-[18px] font-semibold text-slate-400">
                /<CountUpNumber value={totalRecipients} />
              </span>
            </div>
            <div className="text-[12px] text-slate-500 mt-1 tabular-nums">
              <CountUpNumber value={declinedCount} /> berhalangan ·{' '}
              <CountUpNumber value={pendingRsvpCount} /> belum
            </div>
          </div>
          <ProgressRing percent={rsvpPercent} color="#158A85" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 flex items-center justify-between gap-3 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#158A85]/35 hover:shadow-xs"
        >
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-slate-500">
              Status Undangan PDF
            </div>
            <div className="font-display font-bold text-[26px] text-[#111827] mt-1 tabular-nums leading-tight">
              <CountUpNumber value={generatedCount} />
              <span className="text-[18px] font-semibold text-slate-400">
                /<CountUpNumber value={totalRecipients} />
              </span>
            </div>
            <div className="text-[12px] text-slate-500 mt-1 tabular-nums">
              <CountUpNumber value={readyCount} /> siap digenerate
            </div>
          </div>
          <ProgressRing percent={generatedPercent} color="#16A34A" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#158A85]/35 hover:shadow-xs"
        >
          <div className="text-[12px] font-medium text-slate-500">
            Format Dokumen
          </div>
          <div className="font-display font-bold text-[26px] text-[#111827] mt-1 tabular-nums leading-tight">
            <CountUpNumber value={templates.pageCount} /> Hal
          </div>
          <div className="text-[12px] text-slate-500 mt-1 tabular-nums">
            {templates.page1Width} × {templates.page1Height} px
          </div>
        </motion.div>
      </div>

      {/* Middle Panel: Saved Events List + Active Design Preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-6 flex flex-col">
          <EventHistoryPanel
            events={events}
            activeEventId={activeEventId}
            onSelectEvent={onSelectEvent}
            onCreateEvent={onCreateEvent}
            onDuplicateEvent={onDuplicateEvent}
            onToggleCompleted={onToggleEventCompleted}
            onDeleteEvent={onDeleteEvent}
          />
        </div>

        <div className="xl:col-span-6 rounded-2xl border border-slate-200/80 bg-white p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3 shrink-0">
            <div className="min-w-0 flex-1">
              <SmartMarqueeText
                text={`${metadata.date} · ${metadata.organizer}`}
                className="text-[12px] text-slate-500"
              />
              <h3 className="font-display font-bold text-[16px] text-[#111827] mt-0.5">
                <SmartMarqueeText text={metadata.eventName} />
              </h3>
              <SmartMarqueeText
                text={metadata.location}
                className="text-[12px] text-slate-500 mt-0.5"
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-slate-500 whitespace-nowrap">
                Pratinjau:
              </span>
              <RecipientPickerDropdown
                recipients={recipients}
                selectedRecipient={previewRecipient}
                onSelect={(rec) => onSelectPreviewRecipient(rec.id)}
                align="right"
                maxWidthClass="max-w-[185px] min-w-[140px]"
                ariaLabel="Pilih penerima untuk pratinjau desain dashboard"
              />
            </div>
          </div>

          {/* Active Canvas Preview — Live proportional overlays on Page 1 & Page 2 */}
          <motion.div
            key={`${activeEventId}-${previewRecipient.id}-${hasPage2 ? '2' : '1'}`}
            initial={{ opacity: 0.72, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 flex items-center justify-center min-h-0 py-1"
          >
            {hasPage2 && templates.page2DataUrl ? (
              <div className="grid grid-cols-2 gap-3.5 w-full">
                <DashboardPagePreview
                  pageNum={1}
                  hasPage2={hasPage2}
                  imgUrl={templates.page1DataUrl}
                  imgW={templates.page1Width}
                  imgH={templates.page1Height}
                  overlays={overlays}
                  recipient={previewRecipient}
                  qrDataUrl={qrDataUrl}
                  className="w-full"
                  onClick={() => onPreviewRecipient(previewRecipient, 1)}
                />
                <DashboardPagePreview
                  pageNum={2}
                  hasPage2={hasPage2}
                  imgUrl={templates.page2DataUrl}
                  imgW={templates.page2Width || templates.page1Width}
                  imgH={templates.page2Height || templates.page1Height}
                  overlays={overlays}
                  recipient={previewRecipient}
                  qrDataUrl={qrDataUrl}
                  className="w-full"
                  onClick={() => onPreviewRecipient(previewRecipient, 2)}
                />
              </div>
            ) : (
              <DashboardPagePreview
                pageNum={1}
                hasPage2={false}
                imgUrl={templates.page1DataUrl}
                imgW={templates.page1Width}
                imgH={templates.page1Height}
                overlays={overlays}
                recipient={previewRecipient}
                qrDataUrl={qrDataUrl}
                className={
                  (templates.page1Width || 1240) >= (templates.page1Height || 1754)
                    ? 'w-full'
                    : 'w-full max-w-[260px] mx-auto'
                }
                onClick={() => onPreviewRecipient(previewRecipient, 1)}
              />
            )}
          </motion.div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('design')}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all hover:brightness-95 whitespace-nowrap"
              style={{ backgroundColor: 'var(--bg-sidebar)' }}
            >
              <PenTool className="w-4 h-4" />
              <span>Editor Kanvas</span>
            </button>

            <button
              type="button"
              onClick={() => onPreviewRecipient(previewRecipient, 1)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-[#111827] hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Eye className="w-4 h-4 text-[#158A85]" />
              <span>Pratinjau</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Panel: Quick Recipient List & Single PDF Download */}
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div className="min-w-0 flex-1">
            <h3 className="font-display font-semibold text-[15px] text-[#111827]">
              <SmartMarqueeText text={`Daftar Penerima — ${metadata.eventName}`} />
            </h3>
            <p className="text-[12px] text-slate-500 mt-0.5 tabular-nums">
              <CountUpNumber value={filteredRecipients.length} /> penerima
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('guests')}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#158A85] hover:underline whitespace-nowrap"
          >
            <span>Kelola & Impor Excel/CSV</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {filteredRecipients.length === 0 ? (
          <div className="py-10 px-6 text-center text-[13px] text-slate-500">
            Tidak ada penerima yang cocok dengan filter atau kata kunci pencarian saat ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[12px] font-semibold text-slate-600">
                  <th className="py-2.5 px-4 whitespace-nowrap">Kode</th>
                  <th className="py-2.5 px-4">Penerima Undangan</th>
                  <th className="py-2.5 px-4">Instansi Tujuan</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Kehadiran (RSVP)</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Status PDF</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">PDF Satuan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px]">
                {paginatedDashboardRecipients.map((rec, idx) => (
                  <motion.tr
                    key={rec.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.2,
                      delay: idx * 0.05,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    onClick={() => onPreviewRecipient(rec)}
                    className="hover:bg-[#E6F4F8]/40 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono text-[12px] text-slate-600 tabular-nums whitespace-nowrap">
                      <HighlightedText text={rec.invitationCode} query={searchQuery} />
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#111827] max-w-[260px]">
                      <SmartMarqueeText
                        text={rec.recipientName}
                        highlightQuery={searchQuery}
                      />
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-[230px]">
                      <SmartMarqueeText
                        text={rec.institution}
                        highlightQuery={searchQuery}
                      />
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {rec.rsvpStatus === 'attending' ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Hadir</span>
                        </span>
                      ) : rec.rsvpStatus === 'represented' ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#158A85]">
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Diwakilkan</span>
                        </span>
                      ) : rec.rsvpStatus === 'declined' ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-red-600">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Berhalangan</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Belum Konfirmasi</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {rec.status === 'generated' ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Generated</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Ready</span>
                        </span>
                      )}
                    </td>
                    <td
                      className="py-3 px-4 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        disabled={downloadingId === rec.id}
                        onClick={() => onDownloadSinglePdf(rec)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#158A85] bg-[#E6F4F8] hover:bg-[#d2ebf2] transition-colors disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{downloadingId === rec.id ? 'Menyiapkan...' : 'Unduh PDF'}</span>
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PaginationBar
          currentPage={safeListPage}
          totalItems={filteredRecipients.length}
          pageSize={DASHBOARD_PAGE_SIZE}
          onPageChange={setListPage}
        />
      </div>
    </div>
  );
};
