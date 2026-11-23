import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Archive,
  CheckCircle2,
  Clock,
  Download,
  FileDown,
  Layers,
  Loader2,
  Play,
} from 'lucide-react';
import { EventMetadata, Recipient, TemplateImages } from '../types';
import { buildSafePdfFilename } from '../utils/pdfEngine';
import { PaginationBar } from './PaginationBar';
import { CountUpNumber, SmartMarqueeText } from './UiPolish';

interface BatchQueueViewProps {
  metadata: EventMetadata;
  templates: TemplateImages;
  recipients: Recipient[];
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
  downloadingId: string | null;
  searchQuery?: string;
}

export const BatchQueueView: React.FC<BatchQueueViewProps> = ({
  metadata,
  templates,
  recipients,
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
  downloadingId,
  searchQuery = '',
}) => {
  const BATCH_PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  const progressPct =
    batchTotalCount > 0
      ? Math.round((batchProcessedCount / batchTotalCount) * 100)
      : 0;
  const generatedCount = recipients.filter((r) => r.status === 'generated').length;

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="font-display font-bold text-[20px] text-[#111827]">
            Ekspor PDF & ZIP
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {hasReadyZip && !isGeneratingBatch && (
            <button
              type="button"
              onClick={onDownloadZipArchive}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-[#111827] transition-all hover:brightness-95 whitespace-nowrap"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <Archive className="w-4 h-4" />
              <span>Unduh Arsip .ZIP</span>
            </button>
          )}

          <button
            type="button"
            disabled={recipients.length === 0 || isGeneratingBatch}
            onClick={onStartBatchExport}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            style={{ backgroundColor: 'var(--bg-sidebar)' }}
          >
            {isGeneratingBatch ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Merender PDF...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Generate Semua PDF ({recipients.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Group Target Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
          <label
            htmlFor="batch-group-filter"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#111827] whitespace-nowrap"
          >
            <Layers className="w-4 h-4 text-[#158A85]" />
            <span>Target Kelompok Ekspor ZIP:</span>
          </label>
          <select
            id="batch-group-filter"
            disabled={isGeneratingBatch}
            value={groupFilter}
            onChange={(e) => {
              onSelectGroupFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="flex-1 max-w-md rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-[13px] font-medium text-[#111827] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#158A85] disabled:opacity-60"
          >
            <option value="Semua">Semua Kelompok ({totalRecipientsCount})</option>
            {availableGroups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name} ({g.count})
              </option>
            ))}
          </select>
        </div>
        <div className="text-[12px] text-slate-500 tabular-nums">
          Antrean aktif: <strong className="text-[#111827]">{recipients.length}</strong> berkas PDF
        </div>
      </div>

      {/* Smooth Progress Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[14px] font-display font-semibold text-[#111827]">
              {isGeneratingBatch
                ? `Sedang merender: ${currentGeneratingName}`
                : hasReadyZip
                  ? 'Semua PDF individual selesai dibuat dan siap diunduh sebagai arsip ZIP'
                  : 'Siap menjalankan generasi PDF batch'}
            </div>
            <div className="text-[12px] text-slate-500 mt-0.5 tabular-nums">
              Acara: {metadata.eventName} · {generatedCount} dari {recipients.length} status Generated
            </div>
          </div>

          <div className="font-display font-bold text-[18px] text-[#158A85] tabular-nums">
            {isGeneratingBatch ? (
              <CountUpNumber value={progressPct} duration={260} suffix="%" />
            ) : (
              <>
                <CountUpNumber value={generatedCount} />/
                <CountUpNumber value={recipients.length} />
              </>
            )}
          </div>
        </div>

        <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
          <motion.div
            className="relative h-full rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--bg-sidebar)' }}
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

      {/* Output Queue Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[12px] font-semibold text-slate-600">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Penerima & Instansi</th>
                <th className="py-3 px-4">Nama Berkas PDF Otomatis</th>
                <th className="py-3 px-4 whitespace-nowrap">Status</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Unduh Satuan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px]">
              {visibleSlice.map(({ rec, idx }) => {
                const autoFilename = computedFilenames[idx];
                const isItemBusy =
                  rec.status === 'generating' || downloadingId === rec.id;

                return (
                  <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-[12px] text-slate-500 tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 max-w-[260px]">
                      <div className="font-semibold text-[#111827]">
                        <SmartMarqueeText
                          text={rec.recipientName}
                          highlightQuery={searchQuery}
                        />
                      </div>
                      <SmartMarqueeText
                        text={rec.institution}
                        highlightQuery={searchQuery}
                        className="text-[12px] text-slate-500"
                      />
                    </td>
                    <td className="py-3 px-4 font-mono text-[12px] text-slate-600 max-w-[320px]">
                      <SmartMarqueeText text={autoFilename} />
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {rec.status === 'generated' ? (
                        <motion.span
                          key="generated"
                          initial={{ scale: 0.88, opacity: 0.7 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Generated</span>
                        </motion.span>
                      ) : rec.status === 'generating' ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#158A85]">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Rendering</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Ready</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={isItemBusy || isGeneratingBatch}
                        onClick={() => onDownloadSinglePdf(rec)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#158A85] bg-[#E6F4F8] hover:bg-[#d2ebf2] transition-colors disabled:opacity-50"
                      >
                        {isItemBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : rec.status === 'generated' ? (
                          <Download className="w-3.5 h-3.5" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5" />
                        )}
                        <span>Unduh PDF</span>
                      </button>
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
      </div>
    </div>
  );
};
