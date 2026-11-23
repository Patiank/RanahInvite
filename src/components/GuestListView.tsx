import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import Papa from 'papaparse';
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FolderOpen,
  Layers,
  Pencil,
  Plus,
  QrCode,
  Trash2,
  Upload,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { BankSyncUpdate, EventMetadata, Recipient, RsvpStatus } from '../types';
import { PdfBankChecklistModal } from './PdfBankChecklistModal';
import { PaginationBar } from './PaginationBar';
import {
  ColumnMapping,
  ParsedImportResult,
  downloadSampleCsv,
  downloadSampleXlsx,
  mapRowsToRecipients,
  parseImportFile,
} from '../utils/importer';
import { getRsvpLabel } from '../utils/rsvp';
import { sanitizeFilenameSegment, triggerBlobDownload } from '../utils/pdfEngine';

interface GuestListViewProps {
  recipients: Recipient[];
  filteredRecipients: Recipient[];
  availableGroups: { name: string; count: number }[];
  groupFilter: string;
  onSelectGroupFilter: (group: string) => void;
  metadata: EventMetadata;
  onAddRecipient: (recipient: Omit<Recipient, 'id' | 'status'>) => void;
  onUpdateRecipient: (id: string, patch: Partial<Recipient>) => void;
  onDeleteRecipient: (id: string) => void;
  onBulkDeleteByGroup: (targetGroup: string) => void;
  onApplyPdfSelection: (selected: Recipient[], mode: 'append' | 'replace') => void;
  onSyncBankUpdates?: (updates: BankSyncUpdate[]) => number;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
  onBulkImport: (imported: Recipient[], mode: 'append' | 'replace') => void;
  onPreviewRecipient: (recipient: Recipient) => void;
  onDownloadSinglePdf: (recipient: Recipient) => void;
  onSimulateRsvp: (recipient: Recipient) => void;
  downloadingId: string | null;
}

export const GuestListView: React.FC<GuestListViewProps> = ({
  recipients,
  filteredRecipients,
  availableGroups,
  groupFilter,
  onSelectGroupFilter,
  metadata,
  onAddRecipient,
  onUpdateRecipient,
  onDeleteRecipient,
  onBulkDeleteByGroup,
  onApplyPdfSelection,
  onSyncBankUpdates,
  onNotify,
  onBulkImport,
  onPreviewRecipient,
  onDownloadSinglePdf,
  onSimulateRsvp,
  downloadingId,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rsvpFilter, setRsvpFilter] = useState<'all' | RsvpStatus>('all');
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [confirmClearGroup, setConfirmClearGroup] = useState(false);
  const GUEST_PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const [formValues, setFormValues] = useState({
    salutation: 'Kepada Yth.',
    recipientName: '',
    institution: '',
    placeLabel: '',
    group: '',
    invitationCode: '',
  });
  const [importData, setImportData] = useState<ParsedImportResult | null>(null);
  const [importMapping, setImportMapping] = useState<ColumnMapping>({
    salutation: '',
    recipientName: '',
    institution: '',
    placeLabel: '',
    group: '',
    invitationCode: '',
  });
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [importError, setImportError] = useState<string | null>(null);

  const openAddForm = () => {
    setEditingId(null);
    const nextCode = `RI-${String(recipients.length + 1).padStart(3, '0')}`;
    setFormValues({
      salutation: 'Kepada Yth.',
      recipientName: '',
      institution: '',
      placeLabel: '',
      group: groupFilter !== 'Semua' ? groupFilter : '',
      invitationCode: nextCode,
    });
    setFormOpen(true);
  };

  const openEditForm = (r: Recipient) => {
    setEditingId(r.id);
    setFormValues({
      salutation: r.salutation,
      recipientName: r.recipientName,
      institution: r.institution,
      placeLabel: r.placeLabel ?? '',
      group: r.group ?? '',
      invitationCode: r.invitationCode,
    });
    setFormOpen(true);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValues.recipientName.trim()) return;

    if (editingId) {
      onUpdateRecipient(editingId, {
        salutation: formValues.salutation.trim() || 'Kepada Yth.',
        recipientName: formValues.recipientName.trim(),
        institution: formValues.institution.trim() || '-',
        placeLabel: formValues.placeLabel.trim() || undefined,
        group: formValues.group.trim() || undefined,
        invitationCode: formValues.invitationCode.trim() || `RI-${Date.now().toString().slice(-4)}`,
        status: 'ready',
      });
    } else {
      onAddRecipient({
        salutation: formValues.salutation.trim() || 'Kepada Yth.',
        recipientName: formValues.recipientName.trim(),
        institution: formValues.institution.trim() || '-',
        placeLabel: formValues.placeLabel.trim() || undefined,
        group: formValues.group.trim() || undefined,
        invitationCode:
          formValues.invitationCode.trim() ||
          `RI-${String(recipients.length + 1).padStart(3, '0')}`,
      });
    }
    setFormOpen(false);
  };

  const handleFileChange = async (file?: File) => {
    if (!file) return;
    setImportError(null);
    try {
      const parsed = await parseImportFile(file);
      setImportData(parsed);
      setImportMapping(parsed.suggestedMapping);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Gagal membaca berkas.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (!importData) return;
    const mapped = mapRowsToRecipients(
      importData.rows,
      importMapping,
      importMode === 'replace' ? 0 : recipients.length
    );
    if (mapped.length === 0) {
      setImportError('Tidak ada baris valid yang dapat diimpor dengan pemetaan kolom ini.');
      return;
    }
    onBulkImport(mapped, importMode);
    setImportData(null);
  };

  const rsvpCounts = useMemo(() => {
    let attending = 0;
    let represented = 0;
    let declined = 0;
    let pending = 0;
    for (const r of recipients) {
      if (r.rsvpStatus === 'attending') attending++;
      else if (r.rsvpStatus === 'represented') represented++;
      else if (r.rsvpStatus === 'declined') declined++;
      else pending++;
    }
    return { attending, represented, declined, pending };
  }, [recipients]);

  const displayedRecipients = useMemo(() => {
    if (rsvpFilter === 'all') return filteredRecipients;
    return filteredRecipients.filter(
      (r) => (r.rsvpStatus ?? 'pending') === rsvpFilter
    );
  }, [filteredRecipients, rsvpFilter]);

  const totalPages = Math.max(1, Math.ceil(displayedRecipients.length / GUEST_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRecipients = useMemo(() => {
    const start = (safePage - 1) * GUEST_PAGE_SIZE;
    return displayedRecipients.slice(start, start + GUEST_PAGE_SIZE);
  }, [displayedRecipients, safePage]);

  const handleExportAttendanceCsv = () => {
    const rows = recipients.map((r) => ({
      'Kode Undangan': r.invitationCode,
      Kelompok: r.group ?? '-',
      Sapaan: r.salutation,
      'Nama Penerima': r.recipientName,
      Instansi: r.institution,
      'Status Kehadiran (RSVP)': getRsvpLabel(r.rsvpStatus),
      'Keterangan / Perwakilan': r.rsvpRepresentative ?? '',
      'Catatan Tamu': r.rsvpNote ?? '',
      'Waktu Konfirmasi': r.rsvpAt
        ? new Date(r.rsvpAt).toLocaleString('id-ID')
        : '-',
    }));
    const csv = Papa.unparse(rows);
    const filename = `Rekap_Kehadiran_${sanitizeFilenameSegment(metadata.eventName, 'Event')}.csv`;
    triggerBlobDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename, 'text/csv');
  };

  return (
    <div className="space-y-6">
      {/* Header & Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="font-display font-bold text-[20px] text-[#111827]">
            Daftar Tamu & RSVP
          </h2>
          <p className="text-[13px] text-slate-500 mt-0.5 tabular-nums">
            {displayedRecipients.length} dari {recipients.length} penerima
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadSampleXlsx}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#158A85]" />
            <span>Template .XLSX</span>
          </button>

          <button
            type="button"
            onClick={downloadSampleCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-500" />
            <span>Template .CSV</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold text-[#111827] transition-all hover:brightness-95 whitespace-nowrap"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <Upload className="w-4 h-4" />
            <span>Impor Excel / CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportAttendanceCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#158A85]" />
            <span>Rekap RSVP (.CSV)</span>
          </button>

          <button
            type="button"
            onClick={() => setBankModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#158A85]/35 bg-[#E6F4F8]/60 text-[12px] font-semibold text-[#0F6E6A] hover:bg-[#d3ecf3] transition-colors whitespace-nowrap"
          >
            <FolderOpen className="w-4 h-4" />
            <span>Bank Daftar PDF (11 Grup)</span>
          </button>

          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-semibold text-white transition-all hover:brightness-95 whitespace-nowrap"
            style={{ backgroundColor: 'var(--bg-sidebar)' }}
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Penerima</span>
          </button>
        </div>
      </div>

      {/* Group Filter & Quick Cleanup Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
          <label
            htmlFor="guest-group-filter"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#111827] whitespace-nowrap"
          >
            <Layers className="w-4 h-4 text-[#158A85]" />
            <span>Kelompok Undangan:</span>
          </label>
          <select
            id="guest-group-filter"
            value={groupFilter}
            onChange={(e) => {
              onSelectGroupFilter(e.target.value);
              setCurrentPage(1);
              setConfirmClearGroup(false);
            }}
            className="flex-1 max-w-md rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-[13px] font-medium text-[#111827] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#158A85]"
          >
            <option value="Semua">Semua Kelompok ({recipients.length})</option>
            {availableGroups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name} ({g.count})
              </option>
            ))}
          </select>
        </div>

        {recipients.length > 0 && (
          <div className="flex items-center gap-2">
            {confirmClearGroup ? (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-1.5 text-[12px]">
                <span className="text-red-700 font-medium">
                  {groupFilter === 'Semua'
                    ? `Kosongkan semua (${recipients.length})?`
                    : `Hapus "${groupFilter}"?`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onBulkDeleteByGroup(groupFilter);
                    setConfirmClearGroup(false);
                    setCurrentPage(1);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700"
                >
                  Ya, Hapus
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearGroup(false)}
                  className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearGroup(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-[12px] font-medium text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {groupFilter === 'Semua' ? 'Kosongkan Daftar' : 'Hapus Kelompok Ini'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* RSVP Attendance Filter & Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-3">
        <div className="flex flex-wrap items-center gap-4 text-[12px] tabular-nums">
          <span className="font-semibold text-[#111827]">Rekap Kehadiran:</span>
          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{rsvpCounts.attending} Hadir</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#158A85] font-medium">
            <UserCheck className="w-3.5 h-3.5" />
            <span>{rsvpCounts.represented} Diwakilkan</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-red-600 font-medium">
            <XCircle className="w-3.5 h-3.5" />
            <span>{rsvpCounts.declined} Berhalangan</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>{rsvpCounts.pending} Belum Konfirmasi</span>
          </span>
        </div>

        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-white border border-slate-200 overflow-x-auto">
          {(
            [
              { id: 'all', label: 'Semua' },
              { id: 'attending', label: 'Hadir' },
              { id: 'represented', label: 'Diwakilkan' },
              { id: 'declined', label: 'Berhalangan' },
              { id: 'pending', label: 'Belum' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setRsvpFilter(f.id);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                rsvpFilter === f.id
                  ? 'bg-[#158A85] text-white'
                  : 'text-slate-600 hover:text-[#111827]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {importError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700 flex items-center justify-between">
          <span>{importError}</span>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="p-1 hover:bg-red-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Manual Add / Edit Form Panel */}
      {formOpen && (
        <motion.form
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmitForm}
          className="rounded-2xl border border-[#158A85]/30 bg-[#E6F4F8]/40 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-[15px] text-[#111827]">
              {editingId ? 'Sunting Data Penerima' : 'Tambah Penerima Baru'}
            </h3>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-slate-700 mb-1">
                Sapaan
              </label>
              <input
                type="text"
                value={formValues.salutation}
                onChange={(e) =>
                  setFormValues({ ...formValues, salutation: e.target.value })
                }
                placeholder="Kepada Yth."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[12px] font-medium text-slate-700 mb-1">
                Nama Penerima / Jabatan *
              </label>
              <input
                type="text"
                required
                value={formValues.recipientName}
                onChange={(e) =>
                  setFormValues({ ...formValues, recipientName: e.target.value })
                }
                placeholder="Contoh: Kepala Dinas Pariwisata Kab. Agam"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[12px] font-medium text-slate-700 mb-1">
                Instansi / Asal Daerah
              </label>
              <input
                type="text"
                value={formValues.institution}
                onChange={(e) =>
                  setFormValues({ ...formValues, institution: e.target.value })
                }
                placeholder="Contoh: Pemerintah Kabupaten Agam"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[12px] font-medium text-slate-700 mb-1">
                Keterangan Tempat (Opsional)
              </label>
              <input
                type="text"
                value={formValues.placeLabel}
                onChange={(e) =>
                  setFormValues({ ...formValues, placeLabel: e.target.value })
                }
                placeholder="Default: di tempat"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[12px] font-medium text-slate-700 mb-1">
                Kelompok / Grup (Opsional)
              </label>
              <input
                type="text"
                value={formValues.group}
                onChange={(e) =>
                  setFormValues({ ...formValues, group: e.target.value })
                }
                placeholder="Contoh: OPD Pemprov Sumbar"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
              />
            </div>

            <div className="lg:col-span-1 flex items-end justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white hover:brightness-95"
                style={{ backgroundColor: 'var(--bg-sidebar)' }}
              >
                {editingId ? 'Simpan' : 'Tambah'}
              </button>
            </div>
          </div>
        </motion.form>
      )}

      {/* Recipients Data Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
        {displayedRecipients.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="font-display font-semibold text-[15px] text-[#111827]">
              Tidak ada penerima undangan yang sesuai
            </p>
            <p className="text-[13px] text-slate-500 mt-1 mb-4">
              Tambahkan penerima secara manual, ubah filter RSVP, atau impor daftar tamu dari Excel (.XLSX) / CSV.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setBankModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#158A85]/40 bg-[#E6F4F8]/70 text-[13px] font-semibold text-[#0F6E6A] hover:bg-[#d3ecf3] transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Pilih dari Bank Daftar PDF (11 Grup)</span>
              </button>
              <button
                type="button"
                onClick={openAddForm}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white"
                style={{ backgroundColor: 'var(--bg-sidebar)' }}
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Penerima Pertama</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[12px] font-semibold text-slate-600">
                  <th className="py-3 px-4 whitespace-nowrap">Kode</th>
                  <th className="py-3 px-4">Nama Penerima / Jabatan</th>
                  <th className="py-3 px-4">Instansi / Asal Daerah</th>
                  <th className="py-3 px-4 whitespace-nowrap">Kehadiran (RSVP)</th>
                  <th className="py-3 px-4 whitespace-nowrap">Status PDF</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px]">
                {paginatedRecipients.map((recipient) => {
                  const isBusy = downloadingId === recipient.id;
                  return (
                    <tr
                      key={recipient.id}
                      onClick={() => onPreviewRecipient(recipient)}
                      className="hover:bg-[#E6F4F8]/40 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4 font-mono text-[12px] text-slate-600 tabular-nums whitespace-nowrap">
                        <div>{recipient.invitationCode}</div>
                        {recipient.group && (
                          <div
                            className="font-sans text-[11px] font-medium text-[#158A85] truncate max-w-[140px]"
                            title={recipient.group}
                          >
                            {recipient.group}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-[11px] text-slate-500">{recipient.salutation}</div>
                        <div className="font-semibold text-[#111827]">
                          {recipient.recipientName}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-[240px] truncate">
                        {recipient.institution}
                      </td>
                      <td className="py-3 px-4">
                        {recipient.rsvpStatus === 'attending' ? (
                          <div>
                            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Hadir</span>
                            </span>
                            {(recipient.rsvpRepresentative || recipient.rsvpNote) && (
                              <div className="text-[11px] text-slate-500 truncate max-w-[190px]">
                                {recipient.rsvpRepresentative || recipient.rsvpNote}
                              </div>
                            )}
                          </div>
                        ) : recipient.rsvpStatus === 'represented' ? (
                          <div>
                            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#158A85]">
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Diwakilkan</span>
                            </span>
                            {recipient.rsvpRepresentative && (
                              <div className="text-[11px] text-slate-500 truncate max-w-[190px]">
                                {recipient.rsvpRepresentative}
                              </div>
                            )}
                          </div>
                        ) : recipient.rsvpStatus === 'declined' ? (
                          <div>
                            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-red-600">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Berhalangan</span>
                            </span>
                            {recipient.rsvpNote && (
                              <div className="text-[11px] text-slate-500 truncate max-w-[190px]">
                                {recipient.rsvpNote}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Belum Konfirmasi</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {recipient.status === 'generated' ? (
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
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onSimulateRsvp(recipient)}
                            title="Simulasi Halaman Verifikasi Tamu (Scan QR)"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#158A85] hover:bg-[#158A85]/10 transition-colors"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onPreviewRecipient(recipient)}
                            title="Pratinjau Undangan"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#158A85] hover:bg-[#158A85]/10 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditForm(recipient)}
                            title="Sunting Penerima"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#111827] hover:bg-slate-100 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onDownloadSinglePdf(recipient)}
                            title="Unduh PDF Satuan"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-[#158A85] bg-[#E6F4F8] hover:bg-[#d2ebf2] transition-colors disabled:opacity-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{isBusy ? '...' : 'PDF'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteRecipient(recipient.id)}
                            title="Hapus Penerima"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <PaginationBar
          currentPage={safePage}
          totalItems={displayedRecipients.length}
          pageSize={GUEST_PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Column Mapping Modal for CSV / Excel Import */}
      {importData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-display font-bold text-[16px] text-[#111827]">
                  Pemetaan Kolom Impor ({importData.fileName})
                </h3>
                <p className="text-[12px] text-slate-500 tabular-nums">
                  {importData.rows.length} baris data ditemukan · Sesuaikan kolom sebelum mengimpor
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportData(null)}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {(
                  [
                    { key: 'recipientName', label: 'Nama Penerima / Jabatan *' },
                    { key: 'institution', label: 'Instansi / Asal Daerah' },
                    { key: 'salutation', label: 'Sapaan (Kepada Yth.)' },
                    { key: 'placeLabel', label: 'Keterangan Tempat (di tempat)' },
                    { key: 'group', label: 'Kelompok / Grup (Opsional)' },
                    { key: 'invitationCode', label: 'ID Referensi QR (Opsional)' },
                  ] as { key: keyof ColumnMapping; label: string }[]
                ).map((field) => (
                  <div key={field.key}>
                    <label className="block text-[12px] font-medium text-slate-700 mb-1">
                      {field.label}
                    </label>
                    <select
                      value={importMapping[field.key]}
                      onChange={(e) =>
                        setImportMapping({
                          ...importMapping,
                          [field.key]: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                    >
                      <option value="">-- Lewati / Default --</option>
                      {importData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

                <div>
                  <label className="block text-[12px] font-medium text-slate-700 mb-1">
                    Mode Impor Data
                  </label>
                  <select
                    value={importMode}
                    onChange={(e) =>
                      setImportMode(e.target.value as 'append' | 'replace')
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                  >
                    <option value="append">Tambahkan ke Daftar Saat Ini</option>
                    <option value="replace">Ganti Seluruh Daftar Penerima</option>
                  </select>
                </div>
              </div>

              {/* Sample 3 rows preview */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-3.5 py-2 text-[12px] font-semibold text-slate-600 border-b border-slate-200">
                  Pratinjau 3 Baris Pertama
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <tbody className="divide-y divide-slate-100">
                      {importData.rows.slice(0, 3).map((row, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 text-slate-500">
                            {importMapping.salutation
                              ? row[importMapping.salutation] || 'Kepada Yth.'
                              : 'Kepada Yth.'}
                          </td>
                          <td className="py-2 px-3 font-semibold text-[#111827]">
                            {importMapping.recipientName
                              ? row[importMapping.recipientName] || '-'
                              : '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {importMapping.institution
                              ? row[importMapping.institution] || '-'
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/70">
              <button
                type="button"
                onClick={() => setImportData(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white hover:brightness-95"
                style={{ backgroundColor: 'var(--bg-sidebar)' }}
              >
                Impor {importData.rows.length} Penerima
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank Daftar PDF Modal (Checklist Kelompok & Per Penerima) */}
      <PdfBankChecklistModal
        open={bankModalOpen}
        existingRecipients={recipients}
        onClose={() => setBankModalOpen(false)}
        onConfirmSelection={(selected, mode) => {
          onApplyPdfSelection(selected, mode);
          setCurrentPage(1);
        }}
        onSyncBankUpdates={onSyncBankUpdates}
        onNotify={onNotify}
      />
    </div>
  );
};
