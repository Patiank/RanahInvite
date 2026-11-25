import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  Link2,
  Loader2,
  Send,
  Share2,
} from 'lucide-react';
import {
  DEFAULT_INTERACTIVE_CONFIG,
  EventMetadata,
  InteractiveInviteConfig,
  NavTab,
  Recipient,
  TemplateImages,
  WorkflowStepStatus,
} from '../types';
import { buildSafePdfFilename, triggerBlobDownload } from '../utils/pdfEngine';
import {
  buildInteractiveInviteUrl,
  buildWhatsAppInviteText,
  getRsvpLabel,
} from '../utils/rsvp';
import {
  isFirestoreRsvpConfigured,
  publishGuestInvitesToCloud,
  publishInviteConfigToCloud,
  publishSingleGuestInviteToCloud,
} from '../utils/firebaseRsvp';
import { PaginationBar } from './PaginationBar';
import { CountUpNumber, HighlightedText } from './UiPolish';
import { BrandIcon, IconBadge } from './BrandIcon';

interface BatchQueueViewProps {
  eventId: string;
  metadata: EventMetadata;
  templates: TemplateImages;
  recipients: Recipient[];
  allRecipients?: Recipient[];
  totalRecipientsCount: number;
  availableGroups: { name: string; count: number }[];
  groupFilter: string;
  onSelectGroupFilter: (group: string) => void;
  isGeneratingBatch: boolean;
  batchProcessedCount: number;
  batchTotalCount: number;
  currentGeneratingName: string;
  hasReadyZip: boolean;
  onStartBatchExport: () => void;
  onDownloadZipArchive: () => void;
  onDownloadSinglePdf: (recipient: Recipient) => void;
  onPreviewRecipient: (recipient: Recipient) => void;
  onSimulateInteractiveInvite?: (recipient: Recipient) => void;
  interactiveConfig?: InteractiveInviteConfig;
  onChangeInteractiveConfig?: (next: InteractiveInviteConfig) => void;
  initialSection?: 'pdf' | 'links';
  whatsappTemplate?: string;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
  stepStatus: WorkflowStepStatus;
  onNavigate: (tab: NavTab) => void;
  downloadingId: string | null;
  searchQuery?: string;
}

export const BatchQueueView: React.FC<BatchQueueViewProps> = ({
  eventId,
  metadata,
  recipients,
  allRecipients,
  totalRecipientsCount,
  availableGroups,
  groupFilter,
  onSelectGroupFilter,
  isGeneratingBatch,
  batchProcessedCount,
  batchTotalCount,
  currentGeneratingName,
  hasReadyZip,
  onStartBatchExport,
  onDownloadZipArchive,
  onDownloadSinglePdf,
  onPreviewRecipient,
  onSimulateInteractiveInvite,
  interactiveConfig,
  onChangeInteractiveConfig,
  initialSection = 'pdf',
  whatsappTemplate,
  onNotify,
  onNavigate,
  downloadingId,
  searchQuery = '',
}) => {
  const BATCH_PAGE_SIZE = 10;
  const [activeSection, setActiveSection] = useState<'pdf' | 'links'>(
    initialSection
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [linksPage, setLinksPage] = useState(1);
  const [isExportingReportPdf, setIsExportingReportPdf] = useState(false);

  // Video Links & WhatsApp Distribution Hub state
  const [rsvpLinkFilter, setRsvpLinkFilter] = useState<
    'all' | 'pending' | 'responded'
  >('all');
  const [copiedGuestId, setCopiedGuestId] = useState<string | null>(null);
  const [exportingLinks, setExportingLinks] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [cloudSyncedAt, setCloudSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const activeConfig = useMemo<InteractiveInviteConfig>(
    () => ({ ...DEFAULT_INTERACTIVE_CONFIG, ...interactiveConfig }),
    [interactiveConfig]
  );
  const effectiveWaTemplate =
    activeConfig.whatsappTemplate || whatsappTemplate || DEFAULT_INTERACTIVE_CONFIG.whatsappTemplate;
  const cloudConfigured = isFirestoreRsvpConfigured();

  const progressPct =
    batchTotalCount > 0
      ? Math.round((batchProcessedCount / batchTotalCount) * 100)
      : 0;
  const generatedCount = recipients.filter((r) => r.status === 'generated').length;

  const rsvpCounts = useMemo(() => {
    let pending = 0;
    let responded = 0;
    for (const r of recipients) {
      if (
        r.rsvpStatus === 'attending' ||
        r.rsvpStatus === 'represented' ||
        r.rsvpStatus === 'declined'
      ) {
        responded += 1;
      } else {
        pending += 1;
      }
    }
    return { pending, responded };
  }, [recipients]);

  const filteredLinkGuests = useMemo(() => {
    return recipients.filter((r) => {
      const hasResponded =
        r.rsvpStatus === 'attending' ||
        r.rsvpStatus === 'represented' ||
        r.rsvpStatus === 'declined';
      if (rsvpLinkFilter === 'pending' && hasResponded) return false;
      if (rsvpLinkFilter === 'responded' && !hasResponded) return false;
      return true;
    });
  }, [recipients, rsvpLinkFilter]);

  const totalLinkPages = Math.max(
    1,
    Math.ceil(filteredLinkGuests.length / BATCH_PAGE_SIZE)
  );
  const safeLinksPage = Math.min(linksPage, totalLinkPages);
  const visibleLinkSlice = useMemo(() => {
    const start = (safeLinksPage - 1) * BATCH_PAGE_SIZE;
    return filteredLinkGuests.slice(start, start + BATCH_PAGE_SIZE);
  }, [filteredLinkGuests, safeLinksPage]);

  const syncAllLinksToCloud = async (targetList?: Recipient[]): Promise<boolean> => {
    if (!cloudConfigured) return true;
    setSyncingCloud(true);
    try {
      const targets = targetList ?? allRecipients ?? recipients;
      await publishInviteConfigToCloud(eventId, activeConfig, metadata);
      const count =
        targets.length > 0
          ? await publishGuestInvitesToCloud(eventId, targets)
          : 0;
      setCloudSyncedAt(Date.now());
      onNotify?.(
        `Desain video & ${count} link pendek tamu (/v/...) berhasil disinkronkan ke Cloud!`,
        'success'
      );
      return true;
    } catch (err) {
      onNotify?.(
        `Gagal menyinkronkan ke Cloud: ${
          err instanceof Error ? err.message : String(err)
        }`,
        'error'
      );
      return false;
    } finally {
      setSyncingCloud(false);
    }
  };

  const ensureSingleGuestSynced = async (rec: Recipient): Promise<boolean> => {
    if (!cloudConfigured) return true;
    try {
      if (!cloudSyncedAt) {
        await publishInviteConfigToCloud(eventId, activeConfig, metadata);
        setCloudSyncedAt(Date.now());
      }
      await publishSingleGuestInviteToCloud(eventId, rec);
      return true;
    } catch (err) {
      onNotify?.(
        `Gagal menyinkronkan data tamu "${rec.recipientName}" ke Cloud: ${
          err instanceof Error ? err.message : String(err)
        }`,
        'error'
      );
      return false;
    }
  };

  const handleCopyGuestVideoLink = async (rec: Recipient) => {
    try {
      const ok = await ensureSingleGuestSynced(rec);
      if (!ok) return;
      const url = buildInteractiveInviteUrl(eventId, metadata, rec);
      await navigator.clipboard.writeText(url);
      setCopiedGuestId(rec.id);
      window.setTimeout(() => setCopiedGuestId(null), 1800);
      onNotify?.(
        `Link video "${rec.recipientName}" disalin & datanya sudah aktif di Cloud!`,
        'success'
      );
    } catch {
      onNotify?.('Gagal menyalin link tamu.', 'error');
    }
  };

  const handleOpenGuestWhatsApp = async (rec: Recipient) => {
    const ok = await ensureSingleGuestSynced(rec);
    if (!ok) return;
    const text = buildWhatsAppInviteText(
      eventId,
      metadata,
      rec,
      effectiveWaTemplate
    );
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleCopyAllFilteredLinks = async () => {
    if (filteredLinkGuests.length === 0) {
      onNotify?.('Tidak ada tamu pada daftar saat ini.', 'error');
      return;
    }
    try {
      const ok = await syncAllLinksToCloud(filteredLinkGuests);
      if (!ok) return;
      const lines = filteredLinkGuests.map((r, i) => {
        const url = buildInteractiveInviteUrl(eventId, metadata, r);
        return `${i + 1}. ${r.recipientName}${r.institution ? ` (${r.institution})` : ''}\n${url}`;
      });
      await navigator.clipboard.writeText(lines.join('\n\n'));
      onNotify?.(
        `${filteredLinkGuests.length} link video interaktif berhasil disinkronkan lalu disalin!`,
        'success'
      );
    } catch {
      onNotify?.('Gagal menyalin semua link.', 'error');
    }
  };

  const handleExportAllLinksExcel = async () => {
    if (filteredLinkGuests.length === 0) {
      onNotify?.('Belum ada daftar tamu untuk di-generate.', 'error');
      return;
    }
    setExportingLinks(true);
    try {
      const ok = await syncAllLinksToCloud(filteredLinkGuests);
      if (!ok) return;
      const XLSX = await import('xlsx');
      const rows = filteredLinkGuests.map((r, idx) => ({
        No: idx + 1,
        'Kode Undangan': r.invitationCode,
        Sapaan: r.salutation,
        'Nama Penerima': r.recipientName,
        Instansi: r.institution,
        Kelompok: r.group || 'Umum',
        'Status RSVP': getRsvpLabel(r.rsvpStatus),
        'Link Undangan Video Interaktif': buildInteractiveInviteUrl(
          eventId,
          metadata,
          r
        ),
        'Pesan WhatsApp Siap Kirim': buildWhatsAppInviteText(
          eventId,
          metadata,
          r,
          effectiveWaTemplate
        ),
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 5 },
        { wch: 15 },
        { wch: 16 },
        { wch: 30 },
        { wch: 30 },
        { wch: 18 },
        { wch: 18 },
        { wch: 58 },
        { wch: 64 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Link Video Tamu');
      const safeName = (metadata.eventName || 'undangan-interaktif')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 40);
      const filename = `Link_Video_Interaktif_${safeName || 'RanahInvite'}.xlsx`;
      XLSX.writeFile(wb, filename);
      onNotify?.(
        `Berhasil mengekspor ${filteredLinkGuests.length} link video & pesan WhatsApp ke ${filename}!`,
        'success'
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error
          ? err.message
          : 'Gagal mengekspor Excel daftar link tamu.',
        'error'
      );
    } finally {
      setExportingLinks(false);
    }
  };

  const computedFilenames = useMemo(() => {
    const used = new Set<string>();
    return recipients.map((rec) =>
      buildSafePdfFilename(
        metadata.eventName,
        rec.recipientName,
        rec.institution,
        used
      )
    );
  }, [recipients, metadata.eventName]);

  const totalPages = Math.max(1, Math.ceil(recipients.length / BATCH_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const visibleSlice = useMemo(() => {
    const start = (safePage - 1) * BATCH_PAGE_SIZE;
    return recipients
      .slice(start, start + BATCH_PAGE_SIZE)
      .map((rec, offset) => ({ rec, idx: start + offset }));
  }, [recipients, safePage]);

  const handleExportReportPdf = async () => {
    if (recipients.length === 0 || isExportingReportPdf) return;
    setIsExportingReportPdf(true);
    try {
      let cloudSynced = false;
      if (cloudConfigured && eventId) {
        try {
          await publishInviteConfigToCloud(eventId, activeConfig, metadata);
          await publishGuestInvitesToCloud(eventId, recipients);
          setCloudSyncedAt(Date.now());
          cloudSynced = true;
        } catch {
          // Best-effort sync so PDF export still succeeds even when offline
        }
      }
      const { generateInvitationListReportPdf } = await import('../utils/reportPdf');
      const filterSummary =
        groupFilter === 'Semua'
          ? 'Seluruh Daftar Penerima'
          : `Kelompok: ${groupFilter}`;
      const { bytes, filename } = await generateInvitationListReportPdf({
        metadata,
        recipients,
        filterSummary,
        eventId,
        whatsappTemplate: effectiveWaTemplate,
      });
      triggerBlobDownload(bytes, filename, 'application/pdf');
      onNotify?.(
        `Laporan PDF (${recipients.length} penerima + tombol klik Kirim WA${
          cloudSynced ? ', link tersinkron Cloud' : ''
        }) berhasil diekspor: ${filename}`,
        'success'
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
      const filterSummary =
        groupFilter === 'Semua'
          ? 'Seluruh Daftar Penerima'
          : `Kelompok: ${groupFilter}`;
      const { filename } = exportInvitationListReportExcel({
        metadata,
        recipients,
        filterSummary,
      });
      onNotify?.(
        `Laporan Excel (${recipients.length} penerima) berhasil diekspor: ${filename}`,
        'success'
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal mengekspor laporan Excel.',
        'error'
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Clean Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDF6F9] pb-3.5">
        <div className="flex items-center gap-3">
          <IconBadge name="nav-export-pdf" size="md" />
          <h2 className="font-display font-bold text-[20px] text-[#1B1B4B]">
            Generate &amp; Rekap
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportReportPdf}
            disabled={recipients.length === 0 || isExportingReportPdf}
            title="Unduh Laporan PDF lengkap dengan tombol klik Kirim WA"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#DDEEF3] bg-white hover:bg-[#F4FBFD] text-[12.5px] font-semibold text-[#1B1B4B] transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <BrandIcon name="doc-pdf" className="w-4 h-4 text-[#1F9B96]" />
            <span>{isExportingReportPdf ? 'Membuat PDF...' : 'Laporan PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportReportExcel}
            disabled={recipients.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#DDEEF3] bg-white hover:bg-[#F4FBFD] text-[12.5px] font-semibold text-[#1B1B4B] transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <BrandIcon name="action-download-doc" className="w-4 h-4 text-[#167F7B]" />
            <span>Laporan XLS</span>
          </button>

          {activeSection === 'pdf' && hasReadyZip && !isGeneratingBatch && (
            <button
              type="button"
              onClick={onDownloadZipArchive}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#F9DE6C] hover:bg-[#F3D34F] text-[12.5px] font-bold text-[#1B1B4B] transition-colors shadow-xs whitespace-nowrap"
            >
              <BrandIcon name="action-download" className="w-4 h-4 text-[#1B1B4B]" />
              <span>Unduh .ZIP</span>
            </button>
          )}

          {activeSection === 'pdf' ? (
            <button
              type="button"
              disabled={recipients.length === 0 || isGeneratingBatch}
              onClick={onStartBatchExport}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-[12.5px] font-semibold text-white transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isGeneratingBatch ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Merender...</span>
                </>
              ) : (
                <>
                  <BrandIcon name="nav-export-pdf" white className="w-4 h-4" />
                  <span>Generate PDF ({recipients.length})</span>
                </>
              )}
            </button>
          ) : (
            cloudConfigured && (
              <button
                type="button"
                disabled={syncingCloud}
                onClick={() => void syncAllLinksToCloud()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-[12.5px] font-semibold text-white transition-colors shadow-xs disabled:opacity-50 whitespace-nowrap"
              >
                {syncingCloud ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CloudUpload className="w-4 h-4" />
                )}
                <span>
                  {syncingCloud
                    ? 'Menyimpan...'
                    : cloudSyncedAt
                      ? 'Perbarui Online'
                      : 'Simpan Online'}
                </span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Slim 1-Row Toolbar: Tab Switcher + Group Filter */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div
          role="tablist"
          aria-label="Pilih jenis distribusi undangan"
          className="inline-flex items-center gap-1 p-1 rounded-full bg-[#F4FBFD] border border-[#DDEEF3]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'pdf'}
            onClick={() => setActiveSection('pdf')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all whitespace-nowrap ${
              activeSection === 'pdf'
                ? 'bg-[#1F9B96] text-white shadow-xs'
                : 'text-[#5A647B] hover:text-[#1B1B4B]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Undangan PDF ({recipients.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'links'}
            onClick={() => setActiveSection('links')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all whitespace-nowrap ${
              activeSection === 'links'
                ? 'bg-[#171512] text-[#FCE9B2] shadow-xs'
                : 'text-[#5A647B] hover:text-[#1B1B4B]'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Link Video &amp; WA ({rsvpCounts.responded}/{recipients.length} RSVP)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="batch-group-filter"
            className="text-[12px] font-semibold text-[#757E96] whitespace-nowrap"
          >
            Kelompok:
          </label>
          <select
            id="batch-group-filter"
            disabled={isGeneratingBatch}
            value={groupFilter}
            onChange={(e) => {
              onSelectGroupFilter(e.target.value);
              setCurrentPage(1);
              setLinksPage(1);
            }}
            className="rounded-full border border-[#DDEEF3] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96] disabled:opacity-60"
          >
            <option value="Semua">Semua ({totalRecipientsCount})</option>
            {availableGroups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name} ({g.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Compact Contextual Strip (PDF Progress OR Video Links Actions) */}
      {activeSection === 'pdf' ? (
        recipients.length > 0 && (
          <div
            className={`rounded-2xl border px-4 py-3 flex flex-col gap-2 transition-colors ${
              hasReadyZip && !isGeneratingBatch
                ? 'border-[#B5E9E0] bg-[#E0F6F2]'
                : 'border-[#E5F1F5] bg-white'
            }`}
          >
            <div className="flex items-center justify-between gap-3 text-[12.5px]">
              <span className="font-semibold text-[#1B1B4B] truncate">
                {isGeneratingBatch
                  ? `Merender: ${currentGeneratingName}`
                  : hasReadyZip
                    ? 'Semua PDF siap diunduh sebagai arsip .ZIP'
                    : `${generatedCount} dari ${recipients.length} PDF siap`}
              </span>
              <span className="font-display font-bold text-[14px] text-[#1F9B96] tabular-nums shrink-0">
                {isGeneratingBatch ? (
                  <CountUpNumber value={progressPct} duration={260} suffix="%" />
                ) : (
                  <>
                    <CountUpNumber value={generatedCount} />/
                    <CountUpNumber value={recipients.length} />
                  </>
                )}
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-[#E3F5FA] overflow-hidden">
              <motion.div
                className="relative h-full rounded-full overflow-hidden"
                style={{
                  backgroundColor:
                    hasReadyZip && !isGeneratingBatch ? '#157A76' : '#1F9B96',
                }}
                initial={{ width: 0 }}
                animate={{
                  width: `${
                    isGeneratingBatch
                      ? progressPct
                      : recipients.length > 0
                        ? Math.round((generatedCount / recipients.length) * 100)
                        : 0
                  }%`,
                }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                {isGeneratingBatch && (
                  <div
                    aria-hidden="true"
                    className="progress-shimmer-sheen absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                  />
                )}
              </motion.div>
            </div>
          </div>
        )
      ) : (
        <div className="rounded-2xl border border-[#F3D34F]/70 bg-[#FFFBEB] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={exportingLinks || filteredLinkGuests.length === 0}
              onClick={() => void handleExportAllLinksExcel()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#F9DE6C] hover:bg-[#F3D34F] text-[#1B1B4B] text-[12px] font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {exportingLinks ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Unduh Excel Link ({filteredLinkGuests.length})</span>
            </button>

            <button
              type="button"
              disabled={filteredLinkGuests.length === 0}
              onClick={() => void handleCopyAllFilteredLinks()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#DDEEF3] bg-white hover:bg-[#F4FBFD] text-[#1B1B4B] text-[12px] font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5 text-[#1F9B96]" />
              <span>Salin Semua Link</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('video')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#F3D34F] bg-white hover:bg-[#FEF3C7] text-[11.5px] font-bold text-[#6E5108] whitespace-nowrap"
          >
            <Film className="w-3.5 h-3.5" />
            <span>Edit Video 3D</span>
          </button>
        </div>
      )}

      {/* TAB 2 CONTENT: LINK VIDEO & KIRIM WHATSAPP */}
      {activeSection === 'links' ? (
        <div className="space-y-4">
          <div className="rounded-[22px] border border-[#E5F1F5] bg-white p-4 sm:p-5 space-y-3.5">
            {/* RSVP Status Quick Filter (uses topbar search bar — no duplicate search!) */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `Semua (${recipients.length})` },
                  {
                    id: 'pending',
                    label: `Belum Konfirmasi (${rsvpCounts.pending})`,
                  },
                  {
                    id: 'responded',
                    label: `Sudah Konfirmasi (${rsvpCounts.responded})`,
                  },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setRsvpLinkFilter(f.id);
                    setLinksPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold transition-colors ${
                    rsvpLinkFilter === f.id
                      ? 'bg-[#1F9B96] text-white'
                      : 'bg-[#F4FBFD] border border-[#DDEEF3] text-[#5A647B] hover:text-[#1B1B4B]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Per-Guest Video Links & RSVP Status List */}
            {filteredLinkGuests.length === 0 ? (
              <div className="py-10 px-4 text-center text-[12.5px] text-[#757E96] rounded-2xl border border-dashed border-[#DDEEF3]">
                {recipients.length === 0
                  ? 'Belum ada daftar tamu pada event ini.'
                  : 'Tidak ada tamu yang cocok dengan filter / pencarian saat ini.'}
              </div>
            ) : (
              <>
                <div className="divide-y divide-[#EDF5F8] rounded-2xl border border-[#E5F1F5] overflow-hidden">
                  {visibleLinkSlice.map((rec) => {
                    const justCopied = copiedGuestId === rec.id;
                    const shortUrl = buildInteractiveInviteUrl(
                      eventId,
                      metadata,
                      rec
                    );
                    const rsvpStatus = rec.rsvpStatus ?? 'pending';
                    const rsvpBadgeClass =
                      rsvpStatus === 'attending'
                        ? 'bg-[#DCF5F1] text-[#157A76]'
                        : rsvpStatus === 'represented'
                          ? 'bg-[#E3F5FA] text-[#167F7B]'
                          : rsvpStatus === 'declined'
                            ? 'bg-[#FDE8EE] text-[#B83B5E]'
                            : 'bg-[#FFF7D6] text-[#9A7409]';

                    return (
                      <div
                        key={rec.id}
                        className="p-3 sm:p-3.5 bg-white hover:bg-[#FAFEFD] flex flex-wrap items-center justify-between gap-2.5 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[13px] font-bold text-[#1B1B4B] truncate">
                              {rec.recipientName}
                            </span>
                            <span className="text-[10.5px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#EDF5F8] text-[#5A647B] shrink-0">
                              {rec.invitationCode}
                            </span>
                            <span
                              className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${rsvpBadgeClass}`}
                            >
                              {getRsvpLabel(rec.rsvpStatus)}
                            </span>
                          </div>
                          {rec.institution && (
                            <div className="text-[11.5px] text-[#757E96] truncate mt-0.5">
                              {rec.institution}
                            </div>
                          )}
                          <div className="text-[10.5px] font-mono text-[#167F7B]/85 truncate mt-0.5">
                            {shortUrl}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {onSimulateInteractiveInvite && (
                            <button
                              type="button"
                              onClick={() => onSimulateInteractiveInvite(rec)}
                              title="Pratinjau Video Interaktif"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-[#F3D34F]/80 bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[11px] font-semibold text-[#6E5108]"
                            >
                              <Film className="w-3.5 h-3.5" />
                              <span>Pratinjau</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => void handleCopyGuestVideoLink(rec)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                              justCopied
                                ? 'bg-[#DCF5F1] text-[#157A76]'
                                : 'border border-[#DDEEF3] bg-white hover:bg-[#F4FBFD] text-[#1B1B4B]'
                            }`}
                          >
                            {justCopied ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-[#1F9B96]" />
                            )}
                            <span>{justCopied ? 'Tersalin' : 'Salin Link'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await ensureSingleGuestSynced(rec);
                              if (!ok) return;
                              window.open(
                                shortUrl,
                                '_blank',
                                'noopener,noreferrer'
                              );
                            }}
                            title="Buka link undangan di tab baru"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-[#DDEEF3] bg-white hover:bg-[#F4FBFD] text-[11px] font-semibold text-[#1B1B4B]"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-[#1F9B96]" />
                            <span>Buka</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleOpenGuestWhatsApp(rec)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[11px] font-bold"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Kirim WA</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <PaginationBar
                  currentPage={safeLinksPage}
                  totalItems={filteredLinkGuests.length}
                  pageSize={BATCH_PAGE_SIZE}
                  onPageChange={setLinksPage}
                />
              </>
            )}

            {/* WhatsApp Template Editor */}
            <div className="pt-3 border-t border-[#EDF5F8]">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="export-wa-template"
                  className="text-[12px] font-bold text-[#1B1B4B]"
                >
                  Template Pesan WhatsApp Otomatis
                </label>
                {onChangeInteractiveConfig && (
                  <button
                    type="button"
                    onClick={() =>
                      onChangeInteractiveConfig({
                        ...activeConfig,
                        whatsappTemplate:
                          DEFAULT_INTERACTIVE_CONFIG.whatsappTemplate,
                      })
                    }
                    className="text-[11px] font-semibold text-[#1F9B96] hover:underline"
                  >
                    Reset Default
                  </button>
                )}
              </div>
              <textarea
                id="export-wa-template"
                rows={4}
                value={effectiveWaTemplate}
                disabled={!onChangeInteractiveConfig}
                onChange={(e) =>
                  onChangeInteractiveConfig?.({
                    ...activeConfig,
                    whatsappTemplate: e.target.value,
                  })
                }
                className="w-full rounded-xl border border-[#DDEEF3] bg-[#FAFEFD] px-3 py-2 text-[12px] text-[#1B1B4B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
              <p className="text-[11px] text-[#757E96] mt-1">
                Variabel otomatis: <code>{'{sapaan}'}</code>,{' '}
                <code>{'{nama}'}</code>, <code>{'{instansi}'}</code>,{' '}
                <code>{'{acara}'}</code>, <code>{'{tanggal}'}</code>,{' '}
                <code>{'{waktu}'}</code>, <code>{'{lokasi}'}</code>,{' '}
                <code>{'{link}'}</code>
              </p>
            </div>
          </div>
        </div>
      ) : (
      /* TAB 1 CONTENT: Output Queue Table (PDF) */
      <div className="rounded-[22px] border border-[#E5F1F5] bg-white overflow-hidden">
        {recipients.length === 0 ? (
          <div className="py-12 px-6 text-center space-y-3">
            <div className="text-[14px] font-display font-bold text-[#1B1B4B]">
              Belum ada daftar tamu
            </div>
            <p className="text-[12.5px] text-[#757E96] max-w-md mx-auto">
              Tambahkan penerima di menu Daftar Tamu terlebih dahulu.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('guests')}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[13px] font-semibold transition-colors"
            >
              <span>Buka Daftar Tamu</span>
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <caption className="sr-only">
                  Antrean Generate PDF Undangan per Penerima
                </caption>
                <thead>
                  <tr className="border-b border-[#E5F1F5] bg-[#F4FBFD] text-[12px] font-semibold text-[#757E96]">
                    <th scope="col" className="py-3 px-4">#</th>
                    <th scope="col" className="py-3 px-4">Penerima & Instansi</th>
                    <th scope="col" className="py-3 px-4">Nama Berkas PDF</th>
                    <th scope="col" className="py-3 px-4 whitespace-nowrap">Status</th>
                    <th scope="col" className="py-3 px-4 text-right whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF6F9] text-[13px]">
                  {visibleSlice.map(({ rec, idx }) => {
                    const autoFilename = computedFilenames[idx];
                    const isItemBusy =
                      rec.status === 'generating' || downloadingId === rec.id;

                    return (
                      <tr key={rec.id} className="hover:bg-[#EBF8FC] transition-colors">
                        <td className="py-3 px-4 text-[12px] text-[#757E96] tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4 max-w-[260px]">
                          <div
                            title={rec.recipientName}
                            className="font-semibold text-[#1B1B4B] truncate"
                          >
                            <HighlightedText
                              text={rec.recipientName}
                              query={searchQuery}
                            />
                          </div>
                          <div
                            title={rec.institution}
                            className="text-[12px] text-[#757E96] truncate"
                          >
                            <HighlightedText
                              text={rec.institution}
                              query={searchQuery}
                            />
                          </div>
                        </td>
                        <td
                          title={autoFilename}
                          className="py-3 px-4 font-mono text-[12px] text-[#757E96] max-w-[300px] truncate"
                        >
                          {autoFilename}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {rec.status === 'generated' ? (
                            <motion.span
                              key="generated"
                              initial={{ scale: 0.88, opacity: 0.7 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#DCF5F1] text-[12px] font-semibold text-[#157A76]"
                            >
                              <BrandIcon name="status-check" className="w-3.5 h-3.5" />
                              <span>Siap</span>
                            </motion.span>
                          ) : rec.status === 'generating' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E3F5FA] text-[12px] font-semibold text-[#167F7B]">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Membuat</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF7D6] text-[12px] font-semibold text-[#9A7409]">
                              <BrandIcon name="rsvp-pending" className="w-3.5 h-3.5" />
                              <span>Belum</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {onSimulateInteractiveInvite && (
                              <button
                                type="button"
                                onClick={() => onSimulateInteractiveInvite(rec)}
                                title="Pratinjau Undangan Video Interaktif"
                                aria-label={`Pratinjau undangan video interaktif untuk ${rec.recipientName}`}
                                className="p-1.5 rounded-full text-[#9A7409] hover:text-[#151109] hover:bg-[#F9DE6C]/60 transition-colors"
                              >
                                <Film className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  if (isFirestoreRsvpConfigured()) {
                                    await publishSingleGuestInviteToCloud(
                                      eventId,
                                      rec
                                    );
                                  }
                                  const text = buildWhatsAppInviteText(
                                    eventId,
                                    metadata,
                                    rec,
                                    whatsappTemplate
                                  );
                                  await navigator.clipboard.writeText(text);
                                  onNotify?.(
                                    `Data tamu disinkronkan & pesan link video "${rec.recipientName}" disalin — siap tempel ke WhatsApp.`,
                                    'success'
                                  );
                                } catch (err) {
                                  onNotify?.(
                                    err instanceof Error
                                      ? err.message
                                      : 'Gagal menyinkronkan/menyalin tautan.',
                                    'error'
                                  );
                                }
                              }}
                              title="Salin Pesan & Link Video Interaktif untuk WhatsApp"
                              aria-label={`Salin pesan WhatsApp undangan interaktif untuk ${rec.recipientName}`}
                              className="p-1.5 rounded-full text-[#167F7B] hover:bg-[#DCF5F1] transition-colors"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onPreviewRecipient(rec)}
                              title="Pratinjau Undangan PDF"
                              aria-label={`Pratinjau undangan PDF untuk ${rec.recipientName}`}
                              className="p-1.5 rounded-full text-[#757E96] hover:text-[#1F9B96] hover:bg-[#E3F5FA] transition-colors"
                            >
                              <BrandIcon name="action-eye" className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={isItemBusy || isGeneratingBatch}
                              onClick={() => onDownloadSinglePdf(rec)}
                              aria-label={`Unduh PDF untuk ${rec.recipientName}`}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold text-[#167F7B] bg-[#E3F5FA] hover:bg-[#CCEBF4] transition-colors disabled:opacity-50"
                            >
                              {isItemBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <BrandIcon name="action-download-doc" className="w-4 h-4" />
                              )}
                              <span>Unduh PDF</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <PaginationBar
              currentPage={safePage}
              totalItems={recipients.length}
              pageSize={BATCH_PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>
      )}
    </div>
  );
};
