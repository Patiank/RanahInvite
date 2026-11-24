import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import QRCode from 'qrcode';
import { ArrowRight, Film } from 'lucide-react';
import {
  EventMetadata,
  NavTab,
  OverlayBlock,
  Recipient,
  SavedEventRecord,
  TemplateImages,
  WorkflowStepStatus,
} from '../types';
import {
  computeBrowserWrappedLines,
  getBrowserCssFontFamily,
  getPdfReferenceWidth,
  resolveFieldText,
  triggerBlobDownload,
} from '../utils/pdfEngine';
import { RSVP_QR_RENDER_OPTIONS, buildRsvpUrl } from '../utils/rsvp';
import { EventHistoryPanel } from './EventHistoryPanel';
import {
  RecipientPickerDropdown,
  SAMPLE_PREVIEW_RECIPIENT,
} from './RecipientPickerDropdown';
import {
  CountUpNumber,
  ProgressRing,
  SmartMarqueeText,
} from './UiPolish';
import { BrandIcon, IconBadge, getSumbarEventIcon } from './BrandIcon';

interface DashboardViewProps {
  eventId: string;
  metadata: EventMetadata;
  templates: TemplateImages;
  overlays: OverlayBlock[];
  recipients: Recipient[];
  previewRecipientId: string;
  onSelectPreviewRecipient: (id: string) => void;
  events: SavedEventRecord[];
  activeEventId: string;
  stepStatus: WorkflowStepStatus;
  onSelectEvent: (eventId: string) => void;
  onCreateEvent: (metadata: EventMetadata) => void;
  onDuplicateEvent: (eventId: string) => void;
  onToggleEventCompleted: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onNavigate: (tab: NavTab) => void;
  onPreviewRecipient: (recipient: Recipient, page?: 1 | 2) => void;
  onSimulateInteractiveInvite?: (recipient: Recipient) => void;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
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
  const [naturalDims, setNaturalDims] = useState<{ w: number; h: number }>({
    w: imgW || 1240,
    h: imgH || 1754,
  });

  useEffect(() => {
    setNaturalDims({ w: imgW || 1240, h: imgH || 1754 });
  }, [imgUrl, imgW, imgH]);

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
  }, [naturalDims.w, naturalDims.h, pageNum]);

  const safeW = naturalDims.w;
  const safeH = naturalDims.h;
  const scaleRatio = stageWidth / getPdfReferenceWidth(safeW, safeH);
  const pageOverlays = overlays.filter(
    (o) => o.visible && (hasPage2 ? o.page : 1) === pageNum
  );

  return (
    <div
      ref={stageRef}
      onClick={onClick}
      title={`Klik untuk membuka Full Preview Halaman ${pageNum}`}
      className={`relative overflow-hidden rounded-xl bg-white cursor-pointer group studio-paper-card self-center ${className}`}
    >
      <img
        src={imgUrl}
        alt={`Desain Undangan Halaman ${pageNum}`}
        onLoad={(e) => {
          const nw = e.currentTarget.naturalWidth;
          const nh = e.currentTarget.naturalHeight;
          if (nw > 0 && nh > 0 && (nw !== naturalDims.w || nh !== naturalDims.h)) {
            setNaturalDims({ w: nw, h: nh });
          }
        }}
        className="w-full h-auto block pointer-events-none select-none"
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
  previewRecipientId,
  onSelectPreviewRecipient,
  events,
  activeEventId,
  stepStatus,
  onSelectEvent,
  onCreateEvent,
  onDuplicateEvent,
  onToggleEventCompleted,
  onDeleteEvent,
  onNavigate,
  onPreviewRecipient,
  onSimulateInteractiveInvite,
  onNotify,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isExportingReportPdf, setIsExportingReportPdf] = useState(false);

  const handleExportReportPdf = async () => {
    if (recipients.length === 0 || isExportingReportPdf) return;
    setIsExportingReportPdf(true);
    try {
      const { generateInvitationListReportPdf } = await import('../utils/reportPdf');
      const { bytes, filename } = await generateInvitationListReportPdf({
        metadata,
        recipients,
        filterSummary: 'Seluruh Daftar Penerima',
      });
      triggerBlobDownload(bytes, filename, 'application/pdf');
      onNotify?.(
        `Laporan PDF (${recipients.length} penerima) berhasil diekspor: ${filename}`
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal mengekspor laporan PDF.',
        'error'
      );
    } finally {
      setIsExportingReportPdf(false);
    }
  };

  const handleExportReportExcel = async () => {
    if (recipients.length === 0) return;
    try {
      const { exportInvitationListReportExcel } = await import('../utils/reportExcel');
      const { filename } = exportInvitationListReportExcel({
        metadata,
        recipients,
        filterSummary: 'Seluruh Daftar Penerima',
      });
      onNotify?.(
        `Laporan Excel (${recipients.length} penerima) berhasil diekspor: ${filename}`
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal mengekspor laporan Excel.',
        'error'
      );
    }
  };

  const smartNextStep = useMemo(() => {
    if (!stepStatus.infoReady) {
      return { tab: 'info' as NavTab, label: 'Atur Info & Template' };
    }
    if (!stepStatus.guestsReady) {
      return { tab: 'guests' as NavTab, label: 'Kelola Daftar Tamu' };
    }
    if (!stepStatus.exportReady) {
      return { tab: 'layout' as NavTab, label: 'Edit Tata Letak PDF' };
    }
    return { tab: 'export' as NavTab, label: 'Generate & Ekspor ZIP' };
  }, [stepStatus]);

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
      ...RSVP_QR_RENDER_OPTIONS,
      width: 220,
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
    <div className="space-y-5 sm:space-y-6">
      {/* Row 1: KPI Summary Strip — Interactive status overview at a glance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-[22px] border border-[#E5F1F5] bg-white px-5 py-4 flex flex-col justify-between gap-3 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#1F9B96]/40 hover:shadow-sm"
        >
          <div className="flex items-center gap-3 min-w-0">
            <IconBadge name="sumbar-jam-gadang" size="lg" />
            <div className="text-[12px] font-semibold text-[#757E96] leading-snug">
              Total Event Tersimpan
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="font-display font-bold text-[26px] text-[#1B1B4B] tabular-nums leading-tight">
                <CountUpNumber value={events.length} />
              </div>
              <div className="text-[12px] text-[#757E96] mt-1 tabular-nums">
                <CountUpNumber value={completedEventsCount} /> selesai ·{' '}
                <CountUpNumber value={activeEventsCount} /> aktif
              </div>
            </div>
          </div>
        </motion.div>

        <motion.button
          type="button"
          onClick={() => onNavigate('guests')}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          title="Buka Daftar Tamu & Status RSVP"
          className="text-left rounded-[22px] border border-[#B5E4F1] bg-[#E3F5FA] px-5 py-4 flex flex-col justify-between gap-3 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#1F9B96]/60 hover:shadow-sm cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <IconBadge name="brand-verify" size="lg" />
            <div className="text-[12px] font-semibold text-[#167F7B] leading-snug">
              Konfirmasi Hadir (RSVP)
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 w-full">
            <div className="min-w-0">
              <div className="font-display font-bold text-[26px] text-[#1B1B4B] tabular-nums leading-tight">
                <CountUpNumber value={confirmedCount} />
                <span className="text-[18px] font-semibold text-[#757E96]/75">
                  /<CountUpNumber value={totalRecipients} />
                </span>
              </div>
              <div className="text-[12px] text-[#1B1B4B]/70 mt-1 tabular-nums">
                <CountUpNumber value={declinedCount} /> berhalangan ·{' '}
                <CountUpNumber value={pendingRsvpCount} /> belum
              </div>
            </div>
            <ProgressRing percent={rsvpPercent} color="#1F9B96" trackColor="#CBEAF3" />
          </div>
        </motion.button>

        <motion.button
          type="button"
          onClick={() => onNavigate('export')}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          title="Buka Ekspor Batch PDF & Laporan"
          className="text-left rounded-[22px] border border-[#B5E9E0] bg-[#E0F6F2] px-5 py-4 flex flex-col justify-between gap-3 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#1F9B96]/60 hover:shadow-sm cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <IconBadge name="brand-ticket" size="lg" />
            <div className="text-[12px] font-semibold text-[#157A76] leading-snug">
              Status Undangan PDF
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 w-full">
            <div className="min-w-0">
              <div className="font-display font-bold text-[26px] text-[#1B1B4B] tabular-nums leading-tight">
                <CountUpNumber value={generatedCount} />
                <span className="text-[18px] font-semibold text-[#757E96]/75">
                  /<CountUpNumber value={totalRecipients} />
                </span>
              </div>
              <div className="text-[12px] text-[#1B1B4B]/70 mt-1 tabular-nums">
                <CountUpNumber value={readyCount} /> siap digenerate
              </div>
            </div>
            <ProgressRing percent={generatedPercent} color="#1F9B96" trackColor="#C3ECE5" />
          </div>
        </motion.button>

        <motion.button
          type="button"
          onClick={() => onNavigate('info')}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          title="Ubah Info Event & Template Dokumen"
          className="text-left rounded-[22px] border border-[#F4DF89] bg-[#FFF7D6] px-5 py-4 flex flex-col justify-between gap-3 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#E5C656] hover:shadow-sm cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <IconBadge name="doc-pdf" size="lg" />
            <div className="text-[12px] font-semibold text-[#9A7409] leading-snug">
              Format Dokumen
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 w-full">
            <div className="min-w-0">
              <div className="font-display font-bold text-[26px] text-[#1B1B4B] tabular-nums leading-tight">
                <CountUpNumber value={templates.pageCount} /> Hal
              </div>
              <div className="text-[12px] text-[#9A7409]/85 mt-1 tabular-nums">
                {templates.page1Width} × {templates.page1Height} px
              </div>
            </div>
          </div>
        </motion.button>
      </div>

      {/* Row 2: Quick Studio Launcher — Clear 2-path choice (PDF vs Interactive Video 3D) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <button
          type="button"
          onClick={() => onNavigate('layout')}
          className="group rounded-[20px] border-2 border-[#CFEAE5] bg-gradient-to-br from-[#F4FBFD] to-[#E3F5FA] hover:border-[#1F9B96] p-4 text-left transition-all flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#1F9B96]/15 text-[#157A76] text-[10px] font-extrabold uppercase tracking-wider mb-1">
              Jalur Cetak / File
            </div>
            <div className="font-display font-extrabold text-[15px] text-[#1B1B4B]">
              Kanvas Undangan PDF
            </div>
            <p className="text-[11.5px] text-[#5A647B] mt-0.5 leading-snug">
              Tata letak nama, instansi, QR Code & ekspor batch ZIP PDF.
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-full bg-[#1F9B96] group-hover:bg-[#167F7B] text-white text-[11.5px] font-bold shrink-0 transition-colors">
            Buka →
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('video')}
          className="group rounded-[20px] border-2 border-[#D4AF37]/60 bg-gradient-to-br from-[#171512] via-[#1F1B14] to-[#12100C] hover:border-[#FCE9B2] p-4 text-left transition-all flex items-center justify-between gap-3 shadow-sm"
        >
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#F9DE6C]/20 text-[#FCE9B2] text-[10px] font-extrabold uppercase tracking-wider mb-1">
              Jalur Digital · 3D
            </div>
            <div className="font-display font-extrabold text-[15px] text-[#FCE9B2]">
              Studio Video Interaktif 3D
            </div>
            <p className="text-[11.5px] text-[#E6DEC8]/85 mt-0.5 leading-snug">
              Segel emas 3D, animasi pembuka, & generate link WhatsApp tamu.
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-full bg-gradient-to-r from-[#FCE9B2] to-[#C69535] text-[#151109] text-[11.5px] font-extrabold shrink-0">
            Buka →
          </span>
        </button>
      </div>

      {/* Row 3: Main Workspace — 5/7 Split (Saved Events List + Active Design Preview & Reports) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-5 flex flex-col">
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

        <div className="xl:col-span-7 rounded-[22px] border border-[#E5F1F5] bg-white p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <IconBadge
                name={getSumbarEventIcon(metadata.eventName, metadata.location)}
                size="md"
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div
                  title={`${metadata.date} · ${metadata.organizer}`}
                  className="text-[12px] text-[#757E96] truncate"
                >
                  {metadata.date} · {metadata.organizer}
                </div>
                <h3 className="font-display font-bold text-[16px] text-[#1B1B4B] mt-0.5">
                  <SmartMarqueeText text={metadata.eventName} />
                </h3>
                <div
                  title={metadata.location}
                  className="text-[12px] text-[#757E96] mt-0.5 truncate"
                >
                  {metadata.location}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-[#757E96] whitespace-nowrap">
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
              <div className="grid grid-cols-2 gap-3.5 w-full items-center">
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

          {/* Primary Actions + Quick Report Export Strip */}
          <div className="space-y-3 pt-1 shrink-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onNavigate(smartNextStep.tab)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold text-white bg-[#1F9B96] hover:bg-[#167F7B] transition-colors shadow-xs whitespace-nowrap"
              >
                <span>{smartNextStep.label}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onPreviewRecipient(previewRecipient, 1)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-[#DDEEF3] bg-[#F4FBFD] text-[13px] font-semibold text-[#1B1B4B] hover:bg-[#E3F5FA] transition-colors whitespace-nowrap"
              >
                <BrandIcon name="action-eye" className="w-4.5 h-4.5 text-[#1B1B4B]" />
                <span>Pratinjau PDF</span>
              </button>

              {onSimulateInteractiveInvite && (
                <button
                  type="button"
                  onClick={() => onSimulateInteractiveInvite(previewRecipient)}
                  title="Pratinjau Undangan Video Interaktif (Segel Emas)"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-[#D4AF37]/60 bg-[#171512] text-[13px] font-semibold text-[#FCE9B2] hover:bg-[#24201A] transition-colors whitespace-nowrap shadow-xs"
                >
                  <Film className="w-4 h-4 text-[#E8C56E]" />
                  <span>Video Interaktif</span>
                </button>
              )}
            </div>

            <div className="pt-3 border-t border-[#EDF6F9] flex flex-wrap items-center justify-between gap-2.5">
              <span className="text-[12px] font-medium text-[#757E96]">
                Unduh Rekap Daftar Tamu ({totalRecipients} penerima):
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportReportPdf}
                  disabled={recipients.length === 0 || isExportingReportPdf}
                  title={
                    recipients.length === 0
                      ? 'Daftar penerima masih kosong'
                      : `Ekspor laporan PDF resmi (${recipients.length} penerima)`
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#E0F6F2] border border-[#B5E9E0] text-[#157A76] text-[12px] font-semibold hover:bg-[#D0EFE9] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  <BrandIcon name="doc-pdf" className="w-3.5 h-3.5 text-[#157A76]" />
                  <span>{isExportingReportPdf ? 'Membuat PDF...' : 'Laporan PDF'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportReportExcel}
                  disabled={recipients.length === 0}
                  title={
                    recipients.length === 0
                      ? 'Daftar penerima masih kosong'
                      : `Ekspor laporan Excel (.xlsx) resmi (${recipients.length} penerima)`
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#FFF7D6] border border-[#F4DF89] text-[#9A7409] text-[12px] font-semibold hover:bg-[#F9DE6C]/70 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  <BrandIcon name="action-download-doc" className="w-3.5 h-3.5 text-[#9A7409]" />
                  <span>Laporan XLS</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
