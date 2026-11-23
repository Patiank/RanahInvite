import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Minus,
  Pencil,
  Plus,
  ReplaceAll,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { BankSyncUpdate, Recipient } from '../types';
import {
  PDF_DIRECTORY_GROUPS,
  PdfDirectoryGroupMeta,
} from '../data/pdfDirectoryRecipients';
import {
  MasterBankEntry,
  bankEntryToRecipient,
  clearMasterBank,
  computeFindReplacePreview,
  exportMasterBankJson,
  exportMasterBankXlsx,
  getDefaultBankEntries,
  getDefaultBankMap,
  getEntryDiffStatus,
  loadMasterBank,
  parseMasterBankImportFile,
  saveMasterBank,
} from '../utils/bankStorage';
import { PaginationBar } from './PaginationBar';

interface PdfBankChecklistModalProps {
  open: boolean;
  existingRecipients: Recipient[];
  onClose: () => void;
  onConfirmSelection: (selected: Recipient[], mode: 'append' | 'replace') => void;
  onSyncBankUpdates?: (updates: BankSyncUpdate[]) => number;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
}

const QUICK_REPLACE_PRESETS: Array<{ label: string; find: string; replace: string; caseSensitive: boolean }> = [
  { label: '" Dan " → " dan "', find: ' Dan ', replace: ' dan ', caseSensitive: true },
  { label: '"Walikota" → "Wali Kota"', find: 'Walikota', replace: 'Wali Kota', caseSensitive: true },
  { label: '"PT. " → "PT "', find: 'PT. ', replace: 'PT ', caseSensitive: true },
  { label: '"TBK" → "Tbk"', find: 'TBK', replace: 'Tbk', caseSensitive: true },
];

function makeRecipientKey(r: Pick<Recipient, 'recipientName' | 'institution' | 'group'>): string {
  return `${r.recipientName.toLowerCase()}||${r.institution.toLowerCase()}||${r.group ?? ''}`;
}

export const PdfBankChecklistModal: React.FC<PdfBankChecklistModalProps> = ({
  open,
  existingRecipients,
  onClose,
  onConfirmSelection,
  onSyncBankUpdates,
  onNotify,
}) => {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);

  const defaultEntries = useMemo(() => getDefaultBankEntries(), []);
  const defaultMap = useMemo(() => getDefaultBankMap(), []);

  const [bankEntries, setBankEntries] = useState<MasterBankEntry[]>(
    () => loadMasterBank().entries
  );
  const [bankUpdatedAt, setBankUpdatedAt] = useState<number | null>(
    () => loadMasterBank().updatedAt
  );
  const [isCustomized, setIsCustomized] = useState<boolean>(
    () => loadMasterBank().isCustomized
  );

  const [activeGroupName, setActiveGroupName] = useState<string>(
    PDF_DIRECTORY_GROUPS[0].name
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [searchAllGroups, setSearchAllGroups] = useState(false);
  const [onlyEditedFilter, setOnlyEditedFilter] = useState(false);
  const [applyMode, setApplyMode] = useState<'append' | 'replace'>('append');

  // Inline Edit state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    salutation: 'Kepada Yth.',
    recipientName: '',
    institution: '',
    placeLabel: 'di tempat',
    group: PDF_DIRECTORY_GROUPS[0].name,
  });
  const [syncEditToActiveEvent, setSyncEditToActiveEvent] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Add New Entry state
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    salutation: 'Kepada Yth.',
    recipientName: '',
    institution: '',
    placeLabel: 'di tempat',
    group: PDF_DIRECTORY_GROUPS[0].name,
    customGroup: '',
  });

  // Bulk Find & Replace state
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [findCaseSensitive, setFindCaseSensitive] = useState(true);
  const [findScopeAll, setFindScopeAll] = useState(true);
  const [syncReplaceToActiveEvent, setSyncReplaceToActiveEvent] = useState(true);

  // Tools menu, Reset & Import state
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [confirmResetMode, setConfirmResetMode] = useState<'none' | 'group' | 'all'>('none');
  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    entries: MasterBankEntry[];
  } | null>(null);
  const [modalFeedback, setModalFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Refresh master bank when modal opens
  useEffect(() => {
    if (!open) return;
    const loaded = loadMasterBank();
    setBankEntries(loaded.entries);
    setBankUpdatedAt(loaded.updatedAt);
    setIsCustomized(loaded.isCustomized);
    setEditingEntryId(null);
    setConfirmDeleteId(null);
    setAddFormOpen(false);
    setConfirmResetMode('none');
    setPendingImport(null);
    setToolsMenuOpen(false);
  }, [open]);

  // Close backup/tools menu on outside click
  useEffect(() => {
    if (!toolsMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setToolsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [toolsMenuOpen]);

  // Auto-dismiss modal feedback after 4.5s
  useEffect(() => {
    if (!modalFeedback) return;
    const timer = setTimeout(() => setModalFeedback(null), 4500);
    return () => clearTimeout(timer);
  }, [modalFeedback]);

  const showFeedback = (message: string, type: 'success' | 'error' = 'success') => {
    setModalFeedback({ message, type });
    onNotify?.(message, type);
  };

  const persistBank = (nextEntries: MasterBankEntry[]) => {
    const saved = saveMasterBank(nextEntries);
    setBankEntries(saved.entries);
    setBankUpdatedAt(saved.updatedAt);
    setIsCustomized(true);
  };

  // Combine default 11 groups with any custom groups created/imported by user
  const allGroups = useMemo<PdfDirectoryGroupMeta[]>(() => {
    const knownNames = new Set(PDF_DIRECTORY_GROUPS.map((g) => g.name));
    const extras: PdfDirectoryGroupMeta[] = [];
    for (const entry of bankEntries) {
      if (entry.group && !knownNames.has(entry.group)) {
        knownNames.add(entry.group);
        extras.push({
          id: `custom-grp-${extras.length + 1}`,
          name: entry.group,
          sourcePages: 'Kelompok Kustom',
          description: `Daftar tujuan kustom pada kelompok ${entry.group}`,
        });
      }
    }
    return [...PDF_DIRECTORY_GROUPS, ...extras];
  }, [bankEntries]);

  const existingKeySet = useMemo(
    () => new Set(existingRecipients.map((r) => makeRecipientKey(r))),
    [existingRecipients]
  );

  const itemsByGroup = useMemo(() => {
    const map = new Map<string, MasterBankEntry[]>();
    for (const grp of allGroups) {
      map.set(grp.name, []);
    }
    for (const item of bankEntries) {
      const key = item.group || allGroups[0].name;
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return map;
  }, [bankEntries, allGroups]);

  // Compute diff stats per group & overall
  const diffStats = useMemo(() => {
    let editedCount = 0;
    let customCount = 0;
    const perGroupModified = new Map<string, number>();

    for (const entry of bankEntries) {
      const status = getEntryDiffStatus(entry, defaultMap);
      if (status === 'edited') {
        editedCount += 1;
        perGroupModified.set(entry.group, (perGroupModified.get(entry.group) ?? 0) + 1);
      } else if (status === 'custom') {
        customCount += 1;
        perGroupModified.set(entry.group, (perGroupModified.get(entry.group) ?? 0) + 1);
      }
    }

    const currentIds = new Set(bankEntries.map((e) => e.id));
    let deletedDefaultCount = 0;
    for (const def of defaultEntries) {
      if (!currentIds.has(def.id)) {
        deletedDefaultCount += 1;
        perGroupModified.set(def.group, (perGroupModified.get(def.group) ?? 0) + 1);
      }
    }

    return {
      editedCount,
      customCount,
      deletedDefaultCount,
      totalChanges: editedCount + customCount + deletedDefaultCount,
      perGroupModified,
    };
  }, [bankEntries, defaultEntries, defaultMap]);

  const activeGroupMeta = useMemo(
    () => allGroups.find((g) => g.name === activeGroupName) ?? allGroups[0],
    [allGroups, activeGroupName]
  );

  const visibleItems = useMemo(() => {
    const base = searchAllGroups
      ? bankEntries
      : itemsByGroup.get(activeGroupMeta.name) ?? [];
    const q = searchTerm.trim().toLowerCase();

    return base.filter((r) => {
      if (onlyEditedFilter && getEntryDiffStatus(r, defaultMap) === 'unchanged') {
        return false;
      }
      if (!q) return true;
      return (
        r.recipientName.toLowerCase().includes(q) ||
        r.institution.toLowerCase().includes(q) ||
        r.group.toLowerCase().includes(q) ||
        r.salutation.toLowerCase().includes(q) ||
        r.placeLabel.toLowerCase().includes(q)
      );
    });
  }, [
    searchAllGroups,
    bankEntries,
    itemsByGroup,
    activeGroupMeta.name,
    searchTerm,
    onlyEditedFilter,
    defaultMap,
  ]);

  const BANK_PAGE_SIZE = 10;
  const [bankPage, setBankPage] = useState(1);

  useEffect(() => {
    setBankPage(1);
  }, [activeGroupMeta.name, searchTerm, searchAllGroups, onlyEditedFilter, open]);

  const totalBankPages = Math.max(1, Math.ceil(visibleItems.length / BANK_PAGE_SIZE));
  const safeBankPage = Math.min(bankPage, totalBankPages);
  const paginatedVisibleItems = useMemo(() => {
    const start = (safeBankPage - 1) * BANK_PAGE_SIZE;
    return visibleItems.slice(start, start + BANK_PAGE_SIZE);
  }, [visibleItems, safeBankPage]);

  const findReplaceMatches = useMemo(() => {
    if (!findReplaceOpen || !findText) return [];
    return computeFindReplacePreview(bankEntries, {
      findText,
      replaceText,
      caseSensitive: findCaseSensitive,
      scopeGroup: findScopeAll ? null : activeGroupMeta.name,
    });
  }, [
    findReplaceOpen,
    bankEntries,
    findText,
    replaceText,
    findCaseSensitive,
    findScopeAll,
    activeGroupMeta.name,
  ]);

  if (!open) return null;

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroupAll = (groupName: string) => {
    const groupItems = itemsByGroup.get(groupName) ?? [];
    const allChecked =
      groupItems.length > 0 && groupItems.every((r) => selectedIds.has(r.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        groupItems.forEach((r) => next.delete(r.id));
      } else {
        groupItems.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const toggleVisibleAll = () => {
    const allChecked =
      visibleItems.length > 0 && visibleItems.every((r) => selectedIds.has(r.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        visibleItems.forEach((r) => next.delete(r.id));
      } else {
        visibleItems.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const checkAllDirectory = () => {
    setSelectedIds(new Set(bankEntries.map((r) => r.id)));
  };

  const clearAllSelection = () => {
    setSelectedIds(new Set());
  };

  const handleConfirm = () => {
    const chosen = bankEntries
      .filter((r) => selectedIds.has(r.id))
      .map(bankEntryToRecipient);
    if (chosen.length === 0) return;
    onConfirmSelection(chosen, applyMode);
    setSelectedIds(new Set());
    setSearchTerm('');
    onClose();
  };

  // --- Inline Item Editing Handlers ---
  const startEditingItem = (entry: MasterBankEntry) => {
    setConfirmDeleteId(null);
    setAddFormOpen(false);
    setEditingEntryId(entry.id);
    setEditForm({
      salutation: entry.salutation,
      recipientName: entry.recipientName,
      institution: entry.institution,
      placeLabel: entry.placeLabel,
      group: entry.group,
    });
  };

  const handleSaveEditedItem = (entry: MasterBankEntry) => {
    const trimmedName = editForm.recipientName.trim();
    if (!trimmedName) {
      showFeedback('Nama penerima / jabatan wajib diisi.', 'error');
      return;
    }

    const updatedEntry: MasterBankEntry = {
      ...entry,
      salutation: editForm.salutation.trim() || 'Kepada Yth.',
      recipientName: trimmedName,
      institution: editForm.institution.trim(),
      placeLabel: editForm.placeLabel.trim() || 'di tempat',
      group: editForm.group.trim() || entry.group,
    };

    const nextEntries = bankEntries.map((item) =>
      item.id === entry.id ? updatedEntry : item
    );
    persistBank(nextEntries);
    setEditingEntryId(null);

    let syncedCount = 0;
    if (syncEditToActiveEvent && onSyncBankUpdates) {
      syncedCount = onSyncBankUpdates([
        {
          previousKey: {
            invitationCode: entry.invitationCode,
            recipientName: entry.recipientName,
            institution: entry.institution,
            group: entry.group,
          },
          next: {
            salutation: updatedEntry.salutation,
            recipientName: updatedEntry.recipientName,
            institution: updatedEntry.institution,
            placeLabel: updatedEntry.placeLabel,
            group: updatedEntry.group,
          },
        },
      ]);
    }

    showFeedback(
      syncedCount > 0
        ? `Perubahan "${updatedEntry.recipientName}" disimpan ke Bank Daftar & diperbarui di daftar event aktif.`
        : `Perubahan "${updatedEntry.recipientName}" berhasil disimpan ke Bank Daftar.`
    );
  };

  const handleRestoreSingleDefault = (entry: MasterBankEntry) => {
    const original = defaultMap.get(entry.id);
    if (!original) return;
    setEditForm({
      salutation: original.salutation,
      recipientName: original.recipientName,
      institution: original.institution,
      placeLabel: original.placeLabel,
      group: original.group,
    });
  };

  const handleDeleteBankItem = (entry: MasterBankEntry) => {
    const nextEntries = bankEntries.filter((item) => item.id !== entry.id);
    persistBank(nextEntries);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(entry.id);
      return next;
    });
    setConfirmDeleteId(null);
    if (editingEntryId === entry.id) setEditingEntryId(null);
    showFeedback(`"${entry.recipientName}" dihapus dari Bank Daftar.`);
  };

  // --- Add New Item Handler ---
  const openAddForm = () => {
    setEditingEntryId(null);
    setConfirmDeleteId(null);
    setFindReplaceOpen(false);
    setAddForm({
      salutation: 'Kepada Yth.',
      recipientName: '',
      institution: '',
      placeLabel: 'di tempat',
      group: activeGroupMeta.name,
      customGroup: '',
    });
    setAddFormOpen(true);
  };

  const handleSaveNewItem = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = addForm.recipientName.trim();
    if (!trimmedName) {
      showFeedback('Nama penerima / jabatan wajib diisi.', 'error');
      return;
    }

    const resolvedGroup =
      addForm.group === '__custom__'
        ? addForm.customGroup.trim() || activeGroupMeta.name
        : addForm.group;

    const now = Date.now();
    const newEntry: MasterBankEntry = {
      id: `bank-custom-${now}`,
      salutation: addForm.salutation.trim() || 'Kepada Yth.',
      recipientName: trimmedName,
      institution: addForm.institution.trim() || '-',
      placeLabel: addForm.placeLabel.trim() || 'di tempat',
      group: resolvedGroup,
      invitationCode: `BNK-${String(bankEntries.length + 1).padStart(3, '0')}`,
    };

    const nextEntries = [newEntry, ...bankEntries];
    persistBank(nextEntries);
    setActiveGroupName(resolvedGroup);
    setSearchAllGroups(false);
    setAddFormOpen(false);
    showFeedback(`Tujuan baru "${newEntry.recipientName}" ditambahkan ke Bank Daftar.`);
  };

  // --- Bulk Find & Replace Handler ---
  const handleApplyFindReplace = () => {
    if (findReplaceMatches.length === 0) return;

    const replacementMap = new Map(findReplaceMatches.map((m) => [m.entryId, m.after]));
    const nextEntries = bankEntries.map((item) => replacementMap.get(item.id) ?? item);
    persistBank(nextEntries);

    let syncedCount = 0;
    if (syncReplaceToActiveEvent && onSyncBankUpdates) {
      const updates: BankSyncUpdate[] = findReplaceMatches.map((m) => ({
        previousKey: {
          invitationCode: m.before.invitationCode,
          recipientName: m.before.recipientName,
          institution: m.before.institution,
          group: m.before.group,
        },
        next: {
          salutation: m.after.salutation,
          recipientName: m.after.recipientName,
          institution: m.after.institution,
          placeLabel: m.after.placeLabel,
          group: m.after.group,
        },
      }));
      syncedCount = onSyncBankUpdates(updates);
    }

    const count = findReplaceMatches.length;
    setFindText('');
    setReplaceText('');
    showFeedback(
      syncedCount > 0
        ? `${count} tujuan di Bank Daftar diperbarui (${syncedCount} item ikut disinkronkan ke daftar event aktif).`
        : `${count} tujuan di Bank Daftar berhasil diperbarui & disimpan.`
    );
  };

  // --- Reset & Backup Handlers ---
  const handleResetActiveGroup = () => {
    const targetGroup = activeGroupMeta.name;
    const defaultGroupItems = defaultEntries.filter((e) => e.group === targetGroup);
    const otherGroupItems = bankEntries.filter((e) => e.group !== targetGroup);
    const nextEntries = [...otherGroupItems, ...defaultGroupItems];
    persistBank(nextEntries);
    setConfirmResetMode('none');
    setEditingEntryId(null);
    showFeedback(`Kelompok "${targetGroup}" dikembalikan ke data bawaan awal.`);
  };

  const handleResetAllBank = () => {
    clearMasterBank();
    const freshDefaults = getDefaultBankEntries();
    setBankEntries(freshDefaults);
    setBankUpdatedAt(null);
    setIsCustomized(false);
    setConfirmResetMode('none');
    setEditingEntryId(null);
    setActiveGroupName(PDF_DIRECTORY_GROUPS[0].name);
    showFeedback('Seluruh Bank Daftar dikembalikan ke data bawaan awal.');
  };

  const handleExportJson = () => {
    const filename = exportMasterBankJson(bankEntries);
    setToolsMenuOpen(false);
    showFeedback(`Backup Bank Daftar disimpan sebagai ${filename}.`);
  };

  const handleExportXlsx = () => {
    const filename = exportMasterBankXlsx(bankEntries);
    setToolsMenuOpen(false);
    showFeedback(`Bank Daftar diekspor ke Excel (${filename}).`);
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setToolsMenuOpen(false);
    if (!file) return;

    try {
      const parsed = await parseMasterBankImportFile(file);
      setPendingImport({ fileName: file.name, entries: parsed });
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Gagal membaca file backup Bank Daftar.',
        'error'
      );
    }
  };

  const handleConfirmImportBank = () => {
    if (!pendingImport) return;
    persistBank(pendingImport.entries);
    setSelectedIds(new Set());
    setEditingEntryId(null);
    const firstGroup = pendingImport.entries[0]?.group ?? PDF_DIRECTORY_GROUPS[0].name;
    setActiveGroupName(firstGroup);
    const count = pendingImport.entries.length;
    setPendingImport(null);
    showFeedback(`${count} tujuan berhasil dimuat & disimpan sebagai Bank Daftar Master.`);
  };

  const visibleAllChecked =
    visibleItems.length > 0 && visibleItems.every((r) => selectedIds.has(r.id));

  const activeGroupModifiedCount = diffStats.perGroupModified.get(activeGroupMeta.name) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-slate-900/55 backdrop-blur-xs">
      <div className="w-full max-w-6xl h-[90vh] max-h-[840px] rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display font-bold text-[17px] text-[#111827]">
                Bank Daftar Lampiran Undangan ({allGroups.length} Kelompok)
              </h3>
              {isCustomized && (
                <span
                  title={
                    bankUpdatedAt
                      ? `Terakhir disimpan: ${new Date(bankUpdatedAt).toLocaleString('id-ID')}`
                      : 'Bank Master kustom tersimpan di browser'
                  }
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#E6F4F8] text-[#0F6E6A] border border-[#158A85]/25"
                >
                  <Save className="w-3 h-3" />
                  <span>
                    Bank Tersimpan
                    {diffStats.totalChanges > 0 ? ` · ${diffStats.totalChanges} koreksi` : ''}
                  </span>
                </span>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Centang penerima untuk dimasukkan ke event, atau edit &amp; perbaiki penulisan langsung untuk disimpan sebagai Bank Master
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setFindReplaceOpen((prev) => !prev);
                setAddFormOpen(false);
                setEditingEntryId(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12px] font-semibold transition-colors ${
                findReplaceOpen
                  ? 'bg-[#E6F4F8] border-[#158A85] text-[#0F6E6A]'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ReplaceAll className="w-3.5 h-3.5" />
              <span>Cari &amp; Ganti</span>
            </button>

            <button
              type="button"
              onClick={() => (addFormOpen ? setAddFormOpen(false) : openAddForm())}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12px] font-semibold transition-colors ${
                addFormOpen
                  ? 'bg-[#E6F4F8] border-[#158A85] text-[#0F6E6A]'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah</span>
            </button>

            {/* Backup & Reset Dropdown */}
            <div className="relative" ref={toolsMenuRef}>
              <button
                type="button"
                onClick={() => setToolsMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span>Backup &amp; Reset</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {toolsMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-60 rounded-2xl bg-white shadow-xl border border-slate-200 py-1.5 z-30">
                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="w-full px-3.5 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                  >
                    <Download className="w-3.5 h-3.5 text-[#158A85]" />
                    <span>Ekspor Backup (.JSON)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportXlsx}
                    className="w-full px-3.5 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#158A85]" />
                    <span>Ekspor ke Excel (.XLSX)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    className="w-full px-3.5 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#158A85]" />
                    <span>Impor Bank (JSON / XLSX / CSV)</span>
                  </button>

                  {(activeGroupModifiedCount > 0 || isCustomized) && (
                    <div className="my-1 border-t border-slate-100" />
                  )}

                  {activeGroupModifiedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setToolsMenuOpen(false);
                        setConfirmResetMode('group');
                      }}
                      className="w-full px-3.5 py-2 text-left text-[12px] font-medium text-amber-700 hover:bg-amber-50 flex items-center gap-2.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Kelompok Aktif</span>
                    </button>
                  )}

                  {isCustomized && (
                    <button
                      type="button"
                      onClick={() => {
                        setToolsMenuOpen(false);
                        setConfirmResetMode('all');
                      }}
                      className="w-full px-3.5 py-2 text-left text-[12px] font-medium text-red-600 hover:bg-red-50 flex items-center gap-2.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Semua ke Bawaan Awal</span>
                    </button>
                  )}
                </div>
              )}

              <input
                ref={importInputRef}
                type="file"
                accept=".json,.xlsx,.xls,.csv"
                onChange={handleImportFileChange}
                className="hidden"
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
              aria-label="Tutup modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Inline Feedback / Confirmation Strips */}
        {modalFeedback && (
          <div
            className={`px-5 sm:px-6 py-2.5 text-[12px] font-medium border-b flex items-center justify-between gap-2 shrink-0 ${
              modalFeedback.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-[#E6F4F8] border-[#158A85]/20 text-[#0F6E6A]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {modalFeedback.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span className="truncate">{modalFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setModalFeedback(null)}
              className="p-1 rounded-lg hover:bg-black/5 shrink-0"
              aria-label="Tutup notifikasi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {confirmResetMode !== 'none' && (
          <div className="px-5 sm:px-6 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="text-[12px] text-amber-900">
              <span className="font-semibold">
                {confirmResetMode === 'all'
                  ? 'Kembalikan seluruh Bank Daftar ke data bawaan awal?'
                  : `Kembalikan kelompok "${activeGroupMeta.name}" ke data bawaan awal?`}
              </span>{' '}
              Semua perubahan penulisan yang Anda simpan pada cakupan ini akan diganti.
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmResetMode('none')}
                className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={
                  confirmResetMode === 'all' ? handleResetAllBank : handleResetActiveGroup
                }
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700"
              >
                Ya, Reset Sekarang
              </button>
            </div>
          </div>
        )}

        {pendingImport && (
          <div className="px-5 sm:px-6 py-3 bg-[#E6F4F8] border-b border-[#158A85]/25 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="text-[12px] text-[#0F6E6A]">
              Ditemukan <span className="font-bold">{pendingImport.entries.length} tujuan</span>{' '}
              dari berkas <span className="font-semibold">{pendingImport.fileName}</span>. Simpan
              sebagai Bank Daftar Master yang baru?
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmImportBank}
                className="px-3 py-1.5 rounded-lg bg-[#158A85] text-white text-[12px] font-semibold hover:brightness-95"
              >
                Simpan sebagai Bank Master
              </button>
            </div>
          </div>
        )}

        {/* Two-pane Checklist & Editor Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Pane: Groups */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-100 flex flex-col min-h-0 bg-slate-50/50">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-white shrink-0">
              <span className="text-[12px] font-semibold text-[#111827]">
                Pilih Kelompok ({allGroups.length})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={checkAllDirectory}
                  className="px-2.5 py-1 rounded-lg bg-[#E6F4F8] text-[11px] font-semibold text-[#0F6E6A] hover:bg-[#d3ecf3] transition-colors"
                >
                  Centang Semua ({bankEntries.length})
                </button>
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={clearAllSelection}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 text-[11px] font-medium text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Kosongkan
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {allGroups.map((grp) => {
                const members = itemsByGroup.get(grp.name) ?? [];
                const checkedCount = members.filter((r) => selectedIds.has(r.id)).length;
                const allChecked =
                  members.length > 0 && checkedCount === members.length;
                const partial = checkedCount > 0 && checkedCount < members.length;
                const isActive = !searchAllGroups && activeGroupMeta.name === grp.name;
                const grpModCount = diffStats.perGroupModified.get(grp.name) ?? 0;

                return (
                  <div
                    key={grp.id}
                    onClick={() => {
                      setSearchAllGroups(false);
                      setActiveGroupName(grp.name);
                      setConfirmResetMode('none');
                    }}
                    className={`flex items-start gap-2.5 rounded-2xl border p-3 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-[#E6F4F8]/80 border-[#158A85]/60'
                        : 'bg-white border-slate-200/80 hover:border-slate-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroupAll(grp.name);
                        setSearchAllGroups(false);
                        setActiveGroupName(grp.name);
                      }}
                      aria-label={`Centang kelompok ${grp.name}`}
                      className={`mt-0.5 w-4.5 h-4.5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        allChecked || partial
                          ? 'bg-[#158A85] border-[#158A85] text-white'
                          : 'bg-white border-slate-300 hover:border-[#158A85]'
                      }`}
                    >
                      {allChecked ? (
                        <Check className="w-3 h-3 stroke-[3]" />
                      ) : partial ? (
                        <Minus className="w-3 h-3 stroke-[3]" />
                      ) : null}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[13px] text-[#111827] leading-snug">
                          {grp.name}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums shrink-0 ${
                            checkedCount > 0
                              ? 'bg-[#158A85] text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {checkedCount}/{members.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                        <span>{grp.sourcePages}</span>
                        {grpModCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/70 text-[10px] font-semibold">
                            {grpModCount} diubah
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Pane: Individual Recipients Checklist + Inline Editor */}
          <div className="lg:col-span-8 flex flex-col min-h-0 bg-white">
            {/* Sub-header & Search */}
            <div className="px-4 py-3 border-b border-slate-100 space-y-2.5 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14px] font-display font-semibold text-[#111827] truncate">
                    {searchAllGroups
                      ? `Semua Kelompok (${visibleItems.length})`
                      : activeGroupMeta.name}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {searchAllGroups
                      ? `Menampilkan hasil yang cocok dari seluruh ${bankEntries.length} tujuan di Bank Daftar`
                      : activeGroupMeta.description}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={toggleVisibleAll}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-[#158A85] hover:bg-[#E6F4F8] whitespace-nowrap shrink-0"
                >
                  {visibleAllChecked
                    ? `Batal Centang (${visibleItems.length})`
                    : `Centang Semua (${visibleItems.length})`}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Cari nama jabatan, instansi, atau kabupaten/kota..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-[12px] text-[#111827] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                  />
                </div>

                <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-600 cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={searchAllGroups}
                    onChange={(e) => setSearchAllGroups(e.target.checked)}
                    className="rounded border-slate-300 accent-[#158A85]"
                  />
                  <span>Semua kelompok</span>
                </label>

                {diffStats.editedCount + diffStats.customCount > 0 && (
                  <label className="inline-flex items-center gap-1.5 text-[12px] text-amber-700 font-medium cursor-pointer select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={onlyEditedFilter}
                      onChange={(e) => setOnlyEditedFilter(e.target.checked)}
                      className="rounded border-amber-300 accent-amber-600"
                    />
                    <span>Hanya yang diubah</span>
                  </label>
                )}
              </div>
            </div>

            {/* Collapsible Bulk Find & Replace Panel */}
            {findReplaceOpen && (
              <div className="px-4 py-3.5 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12px] font-semibold text-[#111827] flex items-center gap-1.5">
                    <ReplaceAll className="w-4 h-4 text-[#158A85]" />
                    <span>Cari &amp; Ganti Massal di Bank Daftar</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFindReplaceOpen(false)}
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-800"
                  >
                    Tutup
                  </button>
                </div>

                {/* Quick Typo Fix Suggestions */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 mr-0.5">Koreksi cepat:</span>
                  {QUICK_REPLACE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setFindText(preset.find);
                        setReplaceText(preset.replace);
                        setFindCaseSensitive(preset.caseSensitive);
                      }}
                      className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] font-medium text-slate-700 hover:border-[#158A85] hover:text-[#0F6E6A] transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Cari teks (contoh: &ldquo; Dan &rdquo; atau &ldquo;Walikota&rdquo;)
                    </label>
                    <input
                      type="text"
                      value={findText}
                      onChange={(e) => setFindText(e.target.value)}
                      placeholder="Masukkan kata/frasa yang ingin diperbaiki..."
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Ganti dengan
                    </label>
                    <input
                      type="text"
                      value={replaceText}
                      onChange={(e) => setReplaceText(e.target.value)}
                      placeholder="Masukkan ejaan yang benar..."
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={findScopeAll}
                        onChange={(e) => setFindScopeAll(e.target.checked)}
                        className="rounded border-slate-300 accent-[#158A85]"
                      />
                      <span>Semua kelompok</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={findCaseSensitive}
                        onChange={(e) => setFindCaseSensitive(e.target.checked)}
                        className="rounded border-slate-300 accent-[#158A85]"
                      />
                      <span>Cocokkan huruf besar/kecil</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={syncReplaceToActiveEvent}
                        onChange={(e) => setSyncReplaceToActiveEvent(e.target.checked)}
                        className="rounded border-slate-300 accent-[#158A85]"
                      />
                      <span>Perbarui juga di daftar event aktif</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    disabled={findReplaceMatches.length === 0}
                    onClick={handleApplyFindReplace}
                    className="px-3.5 py-1.5 rounded-xl bg-[#158A85] text-white text-[12px] font-semibold hover:brightness-95 disabled:opacity-45 disabled:cursor-not-allowed transition-all"
                  >
                    Terapkan ke {findReplaceMatches.length} Tujuan
                  </button>
                </div>

                {/* Live Sample Preview */}
                {findText && (
                  <div className="rounded-xl bg-white border border-slate-200 p-2.5 text-[11px] space-y-1.5">
                    {findReplaceMatches.length === 0 ? (
                      <div className="text-slate-500">
                        Tidak ditemukan teks yang cocok dengan &ldquo;{findText}&rdquo;.
                      </div>
                    ) : (
                      <>
                        <div className="font-semibold text-[#0F6E6A]">
                          Pratinjau perubahan ({findReplaceMatches.length} tujuan terpengaruh):
                        </div>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {findReplaceMatches.slice(0, 4).map((m) => (
                            <div
                              key={m.entryId}
                              className="flex flex-col sm:flex-row sm:items-center gap-1 text-slate-600"
                            >
                              <span className="line-through text-red-600/80 truncate">
                                {m.before.recipientName} — {m.before.institution}
                              </span>
                              <span className="hidden sm:inline text-slate-400">→</span>
                              <span className="font-semibold text-emerald-700 truncate">
                                {m.after.recipientName} — {m.after.institution}
                              </span>
                            </div>
                          ))}
                          {findReplaceMatches.length > 4 && (
                            <div className="text-slate-400 italic">
                              ...dan {findReplaceMatches.length - 4} tujuan lainnya.
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Collapsible Add New Bank Item Form */}
            {addFormOpen && (
              <form
                onSubmit={handleSaveNewItem}
                className="px-4 py-3.5 bg-[#E6F4F8]/45 border-b border-[#158A85]/20 space-y-2.5 shrink-0"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#0F6E6A]">
                    Tambah Tujuan Baru ke Bank Daftar Master
                  </span>
                  <button
                    type="button"
                    onClick={() => setAddFormOpen(false)}
                    className="text-[11px] text-slate-500 hover:text-slate-800"
                  >
                    Tutup
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Nama Penerima / Jabatan *
                    </label>
                    <input
                      type="text"
                      required
                      value={addForm.recipientName}
                      onChange={(e) =>
                        setAddForm({ ...addForm, recipientName: e.target.value })
                      }
                      placeholder="Contoh: Kepala Dinas Pariwisata"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Instansi / Wilayah
                    </label>
                    <input
                      type="text"
                      value={addForm.institution}
                      onChange={(e) =>
                        setAddForm({ ...addForm, institution: e.target.value })
                      }
                      placeholder="Contoh: Pemerintah Provinsi Sumatera Barat"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Kelompok
                    </label>
                    <select
                      value={addForm.group}
                      onChange={(e) =>
                        setAddForm({ ...addForm, group: e.target.value })
                      }
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                    >
                      {allGroups.map((g) => (
                        <option key={g.id} value={g.name}>
                          {g.name}
                        </option>
                      ))}
                      <option value="__custom__">+ Buat Kelompok Baru...</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        Sapaan
                      </label>
                      <input
                        type="text"
                        value={addForm.salutation}
                        onChange={(e) =>
                          setAddForm({ ...addForm, salutation: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        Tempat
                      </label>
                      <input
                        type="text"
                        value={addForm.placeLabel}
                        onChange={(e) =>
                          setAddForm({ ...addForm, placeLabel: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                      />
                    </div>
                  </div>
                </div>

                {addForm.group === '__custom__' && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Nama Kelompok Baru *
                    </label>
                    <input
                      type="text"
                      required
                      value={addForm.customGroup}
                      onChange={(e) =>
                        setAddForm({ ...addForm, customGroup: e.target.value })
                      }
                      placeholder="Contoh: Media & Komunitas Pariwisata"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAddFormOpen(false)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-xl bg-[#158A85] text-white text-[12px] font-semibold hover:brightness-95"
                  >
                    Simpan ke Bank
                  </button>
                </div>
              </form>
            )}

            {/* Recipients List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {visibleItems.length === 0 ? (
                <div className="py-12 px-6 text-center text-[13px] text-slate-500">
                  {searchTerm
                    ? `Tidak ada tujuan yang cocok dengan pencarian "${searchTerm}".`
                    : onlyEditedFilter
                      ? 'Belum ada item yang diubah pada kelompok ini.'
                      : 'Kelompok ini belum memiliki daftar tujuan.'}
                </div>
              ) : (
                paginatedVisibleItems.map((item) => {
                  const isChecked = selectedIds.has(item.id);
                  const alreadyExists = existingKeySet.has(makeRecipientKey(item));
                  const diffStatus = getEntryDiffStatus(item, defaultMap);
                  const isEditing = editingEntryId === item.id;
                  const isConfirmingDelete = confirmDeleteId === item.id;
                  const hasNonDefaultMeta =
                    item.salutation !== 'Kepada Yth.' || item.placeLabel !== 'di tempat';

                  if (isEditing) {
                    const hasDefaultOriginal = defaultMap.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className="p-4 bg-[#E6F4F8]/40 border-l-4 border-[#158A85] space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-semibold text-[#0F6E6A]">
                            Edit Item Bank Daftar
                          </span>
                          {hasDefaultOriginal && diffStatus === 'edited' && (
                            <button
                              type="button"
                              onClick={() => handleRestoreSingleDefault(item)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:underline"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Isi Ulang Teks Asli</span>
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">
                              Nama Penerima / Jabatan *
                            </label>
                            <input
                              type="text"
                              value={editForm.recipientName}
                              onChange={(e) =>
                                setEditForm({ ...editForm, recipientName: e.target.value })
                              }
                              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">
                              Instansi / Wilayah
                            </label>
                            <input
                              type="text"
                              value={editForm.institution}
                              onChange={(e) =>
                                setEditForm({ ...editForm, institution: e.target.value })
                              }
                              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 mb-1">
                              Kelompok
                            </label>
                            <select
                              value={editForm.group}
                              onChange={(e) =>
                                setEditForm({ ...editForm, group: e.target.value })
                              }
                              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                            >
                              {allGroups.map((g) => (
                                <option key={g.id} value={g.name}>
                                  {g.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                                Sapaan
                              </label>
                              <input
                                type="text"
                                value={editForm.salutation}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, salutation: e.target.value })
                                }
                                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                                Tempat
                              </label>
                              <input
                                type="text"
                                value={editForm.placeLabel}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, placeLabel: e.target.value })
                                }
                                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={syncEditToActiveEvent}
                              onChange={(e) => setSyncEditToActiveEvent(e.target.checked)}
                              className="rounded border-slate-300 accent-[#158A85]"
                            />
                            <span>Perbarui juga di daftar event aktif (jika sudah ada)</span>
                          </label>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingEntryId(null)}
                              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEditedItem(item)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#158A85] text-white text-[12px] font-semibold hover:brightness-95"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Simpan ke Bank</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      className={`group flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                        isChecked ? 'bg-[#E6F4F8]/45' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleItem(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 rounded border-slate-300 accent-[#158A85] shrink-0 cursor-pointer"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-[#111827]">
                            {item.recipientName}
                          </span>
                          {diffStatus === 'edited' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/70">
                              Diedit
                            </span>
                          )}
                          {diffStatus === 'custom' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200/70">
                              Baru
                            </span>
                          )}
                          {alreadyExists && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                              Sudah di daftar
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-slate-500 flex flex-wrap items-center gap-1.5">
                          <span>{item.institution}</span>
                          {hasNonDefaultMeta && (
                            <span className="text-[11px] text-slate-400">
                              · {item.salutation} ({item.placeLabel})
                            </span>
                          )}
                          {searchAllGroups && item.group && (
                            <span className="text-[11px] text-[#158A85] font-medium">
                              · {item.group}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Row Actions: Edit & Delete */}
                      <div
                        className="flex items-center gap-1 shrink-0 pt-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                            <span className="text-[11px] font-medium text-red-700 mr-1">
                              Hapus?
                            </span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-0.5 rounded text-[11px] font-medium text-slate-600 hover:bg-white"
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBankItem(item)}
                              className="px-2 py-0.5 rounded bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700"
                            >
                              Ya
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditingItem(item)}
                              title="Edit penulisan item ini di Bank Daftar"
                              aria-label={`Edit ${item.recipientName}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#158A85] hover:bg-[#E6F4F8] transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(item.id)}
                              title="Hapus item ini dari Bank Daftar"
                              aria-label={`Hapus ${item.recipientName}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <PaginationBar
              currentPage={safeBankPage}
              totalItems={visibleItems.length}
              pageSize={BANK_PAGE_SIZE}
              onPageChange={setBankPage}
              compact
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold text-[#111827] tabular-nums">
              {selectedIds.size} penerima dicentang
            </span>
            <select
              aria-label="Mode masukkan daftar"
              value={applyMode}
              onChange={(e) => setApplyMode(e.target.value as 'append' | 'replace')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#158A85]"
            >
              <option value="append">Tambahkan ke Daftar Saat Ini</option>
              <option value="replace">Ganti Seluruh Daftar dengan Pilihan</option>
            </select>
            <span className="hidden xl:inline text-[11px] text-slate-500">
              · Koreksi pada Bank Daftar tersimpan otomatis di browser
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
            >
              Tutup
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={handleConfirm}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white hover:brightness-95 disabled:opacity-45 disabled:cursor-not-allowed transition-all"
              style={{ backgroundColor: 'var(--bg-sidebar)' }}
            >
              Masukkan {selectedIds.size > 0 ? `(${selectedIds.size}) ` : ''}ke Daftar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
