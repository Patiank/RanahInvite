import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Recipient } from '../types';

export interface ColumnMapping {
  salutation: string;
  recipientName: string;
  institution: string;
  placeLabel: string;
  group: string;
  invitationCode: string;
}

export interface ParsedImportResult {
  headers: string[];
  rows: Record<string, string>[];
  suggestedMapping: ColumnMapping;
  fileName: string;
}

function guessColumn(headers: string[], keywords: string[]): string {
  for (const header of headers) {
    const lower = header.toLowerCase().trim();
    if (keywords.some((kw) => lower === kw || lower.includes(kw))) {
      return header;
    }
  }
  return '';
}

export function autoMapHeaders(headers: string[]): ColumnMapping {
  return {
    salutation: guessColumn(headers, ['sapaan', 'salutation', 'kepada', 'yth', 'sebutan']),
    recipientName: guessColumn(headers, [
      'nama',
      'recipient',
      'penerima',
      'name',
      'tamu',
      'pejabat',
      'jabatan',
    ]),
    institution: guessColumn(headers, [
      'instansi',
      'institution',
      'asal',
      'daerah',
      'organisasi',
      'perusahaan',
      'dinas',
      'lembaga',
    ]),
    placeLabel: guessColumn(headers, ['tempat', 'di_tempat', 'kota', 'place', 'tujuan']),
    group: guessColumn(headers, ['kelompok', 'grup', 'group', 'kategori', 'bagian']),
    invitationCode: guessColumn(headers, ['kode', 'code', 'id_undangan', 'nomor', 'no_undangan']),
  };
}

export async function parseImportFile(file: File): Promise<ParsedImportResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const headers = (results.meta.fields ?? []).filter((h) => h.trim() !== '');
          const rows = results.data.map((row) => {
            const clean: Record<string, string> = {};
            for (const h of headers) {
              clean[h] = String(row[h] ?? '').trim();
            }
            return clean;
          });
          resolve({
            headers,
            rows,
            suggestedMapping: autoMapHeaders(headers),
            fileName: file.name,
          });
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
      throw new Error('Berkas Excel tidak memiliki lembar kerja (sheet).');
    }
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
    });

    if (jsonRows.length === 0) {
      throw new Error('Lembar kerja Excel kosong.');
    }

    const headers = Object.keys(jsonRows[0]).filter((h) => h.trim() !== '');
    const rows = jsonRows.map((row) => {
      const clean: Record<string, string> = {};
      for (const h of headers) {
        clean[h] = String(row[h] ?? '').trim();
      }
      return clean;
    });

    return {
      headers,
      rows,
      suggestedMapping: autoMapHeaders(headers),
      fileName: file.name,
    };
  }

  throw new Error('Format berkas tidak didukung. Gunakan berkas .CSV atau .XLSX.');
}

export function mapRowsToRecipients(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  existingCount: number
): Recipient[] {
  const mapped: Recipient[] = [];
  rows.forEach((row, index) => {
    const recipientName = mapping.recipientName ? (row[mapping.recipientName] ?? '').trim() : '';
    const institution = mapping.institution ? (row[mapping.institution] ?? '').trim() : '';

    if (!recipientName && !institution) return;

    const salutation =
      (mapping.salutation ? row[mapping.salutation]?.trim() : '') || 'Kepada Yth.';
    const placeLabel = mapping.placeLabel ? row[mapping.placeLabel]?.trim() : '';
    const rawGroup = mapping.group ? row[mapping.group]?.trim() : '';
    const rawCode = mapping.invitationCode ? row[mapping.invitationCode]?.trim() : '';

    const num = existingCount + mapped.length + 1;
    const autoCode = `RI-${String(num).padStart(3, '0')}`;

    mapped.push({
      id: `rec-imp-${Date.now()}-${index}`,
      salutation,
      recipientName: recipientName || institution,
      institution: institution || '-',
      placeLabel: placeLabel || undefined,
      group: rawGroup || undefined,
      invitationCode: rawCode || autoCode,
      status: 'ready',
    });
  });

  return mapped;
}

const SAMPLE_ROWS = [
  {
    Sapaan: 'Kepada Yth.',
    'Nama Penerima': 'Gubernur Sumatera Barat',
    Instansi: 'Pemerintah Provinsi Sumatera Barat',
    Kelompok: 'Forkopimda Provinsi & 19 Kab/Kota se-Sumbar',
    'Kode Undangan': 'FPM-2026-101',
  },
  {
    Sapaan: 'Kepada Yth.',
    'Nama Penerima': 'Kepala Dinas Pariwisata dan Kebudayaan',
    Instansi: 'Kota Padang',
    Kelompok: 'Dinas Pariwisata Kab/Kota se-Sumbar',
    'Kode Undangan': 'FPM-2026-102',
  },
  {
    Sapaan: 'Kepada Yth.',
    'Nama Penerima': 'Ketua HPI',
    Instansi: 'Provinsi Sumatera Barat',
    Kelompok: 'Asosiasi Pariwisata Sumatera Barat',
    'Kode Undangan': 'FPM-2026-103',
  },
  {
    Sapaan: 'Kepada Yth.',
    'Nama Penerima': 'Ketua Dekranasda',
    Instansi: 'Kab. Tanah Datar',
    Kelompok: 'Ketua Dekranasda Provinsi & Kab/Kota',
    'Kode Undangan': 'FPM-2026-104',
  },
];

export function downloadSampleXlsx(): void {
  const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS);
  ws['!cols'] = [{ wch: 16 }, { wch: 36 }, { wch: 42 }, { wch: 20 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daftar_Tamu');
  XLSX.writeFile(wb, 'Template_Daftar_Tamu_RanahInvite.xlsx');
}

export function downloadSampleCsv(): void {
  const csv = Papa.unparse(SAMPLE_ROWS);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Template_Daftar_Tamu_RanahInvite.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
