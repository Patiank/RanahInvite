import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Recipient } from '../types';
import {
  PDF_DIRECTORY_GROUPS,
  buildPdfDirectoryRecipients,
} from '../data/pdfDirectoryRecipients';

export interface MasterBankEntry {
  id: string;
  salutation: string;
  recipientName: string;
  institution: string;
  placeLabel: string;
  group: string;
  invitationCode: string;
}

export interface StoredMasterBank {
  version: 1;
  updatedAt: number;
  entries: MasterBankEntry[];
}

export type BankEntryDiffStatus = 'unchanged' | 'edited' | 'custom';

const MASTER_BANK_STORAGE_KEY = 'ranahinvite_master_bank_v1';

function recipientToBankEntry(r: Recipient): MasterBankEntry {
  return {
    id: r.id,
    salutation: (r.salutation || 'Kepada Yth.').trim() || 'Kepada Yth.',
    recipientName: (r.recipientName || '').trim(),
    institution: (r.institution || '').trim(),
    placeLabel: (r.placeLabel || 'di tempat').trim() || 'di tempat',
    group: (r.group || PDF_DIRECTORY_GROUPS[0].name).trim() || PDF_DIRECTORY_GROUPS[0].name,
    invitationCode: (r.invitationCode || '').trim(),
  };
}

export function bankEntryToRecipient(entry: MasterBankEntry): Recipient {
  return {
    id: entry.id,
    salutation: entry.salutation || 'Kepada Yth.',
    recipientName: entry.recipientName,
    institution: entry.institution,
    placeLabel: entry.placeLabel || 'di tempat',
    group: entry.group,
    invitationCode: entry.invitationCode,
    status: 'ready',
  };
}

export function getDefaultBankEntries(): MasterBankEntry[] {
  return buildPdfDirectoryRecipients().map(recipientToBankEntry);
}

export function getDefaultBankMap(): Map<string, MasterBankEntry> {
  const map = new Map<string, MasterBankEntry>();
  for (const item of getDefaultBankEntries()) {
    map.set(item.id, item);
  }
  return map;
}

export function getEntryDiffStatus(
  entry: MasterBankEntry,
  defaultMap: Map<string, MasterBankEntry>
): BankEntryDiffStatus {
  const original = defaultMap.get(entry.id);
  if (!original) return 'custom';
  const same =
    original.salutation === entry.salutation &&
    original.recipientName === entry.recipientName &&
    original.institution === entry.institution &&
    original.placeLabel === entry.placeLabel &&
    original.group === entry.group;
  return same ? 'unchanged' : 'edited';
}

export function loadMasterBank(): {
  entries: MasterBankEntry[];
  updatedAt: number | null;
  isCustomized: boolean;
} {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return {
        entries: getDefaultBankEntries(),
        updatedAt: null,
        isCustomized: false,
      };
    }
    const raw = window.localStorage.getItem(MASTER_BANK_STORAGE_KEY);
    if (!raw) {
      return {
        entries: getDefaultBankEntries(),
        updatedAt: null,
        isCustomized: false,
      };
    }
    const parsed = JSON.parse(raw) as Partial<StoredMasterBank>;
    if (!parsed || !Array.isArray(parsed.entries) || parsed.entries.length === 0) {
      return {
        entries: getDefaultBankEntries(),
        updatedAt: null,
        isCustomized: false,
      };
    }

    const sanitized: MasterBankEntry[] = parsed.entries
      .filter(
        (item): item is MasterBankEntry =>
          Boolean(item) &&
          typeof item.recipientName === 'string' &&
          item.recipientName.trim().length > 0
      )
      .map((item, idx) => ({
        id:
          typeof item.id === 'string' && item.id.trim()
            ? item.id.trim()
            : `bank-rec-${idx + 1}`,
        salutation:
          typeof item.salutation === 'string' && item.salutation.trim()
            ? item.salutation.trim()
            : 'Kepada Yth.',
        recipientName: item.recipientName.trim(),
        institution:
          typeof item.institution === 'string' ? item.institution.trim() : '',
        placeLabel:
          typeof item.placeLabel === 'string' && item.placeLabel.trim()
            ? item.placeLabel.trim()
            : 'di tempat',
        group:
          typeof item.group === 'string' && item.group.trim()
            ? item.group.trim()
            : PDF_DIRECTORY_GROUPS[0].name,
        invitationCode:
          typeof item.invitationCode === 'string' && item.invitationCode.trim()
            ? item.invitationCode.trim()
            : `BNK-${String(idx + 1).padStart(3, '0')}`,
      }));

    if (sanitized.length === 0) {
      return {
        entries: getDefaultBankEntries(),
        updatedAt: null,
        isCustomized: false,
      };
    }

    return {
      entries: sanitized,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      isCustomized: true,
    };
  } catch {
    return {
      entries: getDefaultBankEntries(),
      updatedAt: null,
      isCustomized: false,
    };
  }
}

export function saveMasterBank(entries: MasterBankEntry[]): StoredMasterBank {
  const payload: StoredMasterBank = {
    version: 1,
    updatedAt: Date.now(),
    entries: entries.map((e) => ({
      ...e,
      salutation: e.salutation.trim() || 'Kepada Yth.',
      recipientName: e.recipientName.trim(),
      institution: e.institution.trim(),
      placeLabel: e.placeLabel.trim() || 'di tempat',
      group: e.group.trim() || PDF_DIRECTORY_GROUPS[0].name,
      invitationCode: e.invitationCode.trim(),
    })),
  };

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(MASTER_BANK_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    // Ignore storage quota errors gracefully
  }

  return payload;
}

export function clearMasterBank(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(MASTER_BANK_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}

export function getEffectiveBankRecipients(): Recipient[] {
  return loadMasterBank().entries.map(bankEntryToRecipient);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replaceAllText(
  source: string,
  findText: string,
  replaceText: string,
  caseSensitive: boolean
): string {
  if (!findText) return source;
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(escapeRegExp(findText), flags);
  return source.replace(regex, () => replaceText);
}

export interface FindReplacePreviewItem {
  entryId: string;
  group: string;
  before: MasterBankEntry;
  after: MasterBankEntry;
}

export function computeFindReplacePreview(
  entries: MasterBankEntry[],
  options: {
    findText: string;
    replaceText: string;
    caseSensitive: boolean;
    scopeGroup: string | null; // null = all groups
  }
): FindReplacePreviewItem[] {
  const { findText, replaceText, caseSensitive, scopeGroup } = options;
  if (!findText) return [];

  const matches: FindReplacePreviewItem[] = [];
  for (const entry of entries) {
    if (scopeGroup !== null && entry.group !== scopeGroup) continue;

    const nextRecipientName = replaceAllText(
      entry.recipientName,
      findText,
      replaceText,
      caseSensitive
    );
    const nextInstitution = replaceAllText(
      entry.institution,
      findText,
      replaceText,
      caseSensitive
    );
    const nextSalutation = replaceAllText(
      entry.salutation,
      findText,
      replaceText,
      caseSensitive
    );
    const nextPlaceLabel = replaceAllText(
      entry.placeLabel,
      findText,
      replaceText,
      caseSensitive
    );

    if (
      nextRecipientName !== entry.recipientName ||
      nextInstitution !== entry.institution ||
      nextSalutation !== entry.salutation ||
      nextPlaceLabel !== entry.placeLabel
    ) {
      matches.push({
        entryId: entry.id,
        group: entry.group,
        before: entry,
        after: {
          ...entry,
          recipientName: nextRecipientName,
          institution: nextInstitution,
          salutation: nextSalutation,
          placeLabel: nextPlaceLabel,
        },
      });
    }
  }

  return matches;
}

function formatDateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function exportMasterBankJson(entries: MasterBankEntry[]): string {
  const payload: StoredMasterBank = {
    version: 1,
    updatedAt: Date.now(),
    entries,
  };
  const filename = `RanahInvite_Bank_Daftar_${formatDateStamp()}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return filename;
}

export function exportMasterBankXlsx(entries: MasterBankEntry[]): string {
  const rows = entries.map((e, idx) => ({
    No: idx + 1,
    ID: e.id,
    Kode: e.invitationCode,
    Kelompok: e.group,
    Sapaan: e.salutation,
    'Nama Penerima / Jabatan': e.recipientName,
    'Instansi / Wilayah': e.institution,
    'Keterangan Tempat': e.placeLabel,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 12 },
    { wch: 36 },
    { wch: 16 },
    { wch: 44 },
    { wch: 40 },
    { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bank_Daftar_Master');
  const filename = `RanahInvite_Bank_Daftar_${formatDateStamp()}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}

function pickColumnValue(row: Record<string, unknown>, candidates: string[]): string {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const exact = keys.find((k) => k.toLowerCase().trim() === cand);
    if (exact && row[exact] !== undefined && row[exact] !== null) {
      const val = String(row[exact]).trim();
      if (val) return val;
    }
  }
  for (const cand of candidates) {
    const partial = keys.find((k) => k.toLowerCase().trim().includes(cand));
    if (partial && row[partial] !== undefined && row[partial] !== null) {
      const val = String(row[partial]).trim();
      if (val) return val;
    }
  }
  return '';
}

function normalizeTabularRows(rows: Record<string, unknown>[]): MasterBankEntry[] {
  const out: MasterBankEntry[] = [];
  const usedIds = new Set<string>();

  rows.forEach((row, idx) => {
    const recipientName = pickColumnValue(row, [
      'nama penerima / jabatan',
      'nama penerima',
      'recipientname',
      'nama',
      'jabatan',
      'penerima',
      'tujuan',
    ]);
    const institution = pickColumnValue(row, [
      'instansi / wilayah',
      'instansi',
      'institution',
      'wilayah',
      'asal',
      'daerah',
      'organisasi',
    ]);

    if (!recipientName && !institution) return;

    const salutation =
      pickColumnValue(row, ['sapaan', 'salutation', 'kepada', 'yth']) ||
      'Kepada Yth.';
    const placeLabel =
      pickColumnValue(row, ['keterangan tempat', 'tempat', 'placelabel', 'di_tempat']) ||
      'di tempat';
    const group =
      pickColumnValue(row, ['kelompok', 'grup', 'group', 'kategori']) ||
      PDF_DIRECTORY_GROUPS[0].name;
    const rawId = pickColumnValue(row, ['id']);
    const code =
      pickColumnValue(row, ['kode', 'invitationcode', 'kode undangan', 'code']) ||
      `BNK-${String(out.length + 1).padStart(3, '0')}`;

    let id = rawId || `bank-imp-${Date.now()}-${idx + 1}`;
    if (usedIds.has(id)) {
      id = `${id}-${idx + 1}`;
    }
    usedIds.add(id);

    out.push({
      id,
      salutation,
      recipientName: recipientName || institution,
      institution: institution || '-',
      placeLabel,
      group,
      invitationCode: code,
    });
  });

  return out;
}

export async function parseMasterBankImportFile(file: File): Promise<MasterBankEntry[]> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'json') {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('File JSON tidak valid atau rusak.');
    }

    const rawList = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { entries?: unknown }).entries)
        ? (parsed as { entries: unknown[] }).entries
        : null;

    if (!rawList || rawList.length === 0) {
      throw new Error('File JSON tidak berisi daftar tujuan yang valid.');
    }

    const normalized = normalizeTabularRows(
      rawList.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    );
    if (normalized.length === 0) {
      throw new Error('Tidak ditemukan data nama penerima pada file JSON.');
    }
    return normalized;
  }

  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const normalized = normalizeTabularRows(results.data);
          if (normalized.length === 0) {
            reject(new Error('Tidak ditemukan kolom Nama Penerima yang valid di file CSV.'));
            return;
          }
          resolve(normalized);
        },
        error: (err) => reject(err),
      });
    });
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('File Excel tidak memiliki lembar kerja (sheet).');
    }
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
    });
    const normalized = normalizeTabularRows(jsonRows);
    if (normalized.length === 0) {
      throw new Error('Tidak ditemukan data tujuan yang valid di file Excel.');
    }
    return normalized;
  }

  throw new Error('Format tidak didukung. Gunakan file .JSON, .XLSX, atau .CSV.');
}
