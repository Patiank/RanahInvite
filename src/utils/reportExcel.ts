import * as XLSX from 'xlsx';
import { EventMetadata, Recipient } from '../types';
import { getRsvpLabel } from './rsvp';
import { sanitizeFilenameSegment } from './pdfEngine';

export interface GenerateReportExcelParams {
  metadata: EventMetadata;
  recipients: Recipient[];
  filterSummary?: string;
}

function formatPrintDateId(date: Date): string {
  try {
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function maxLineLength(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const text = String(value);
  return text
    .split(/\r?\n/)
    .reduce((max, line) => Math.max(max, line.trim().length), 0);
}

function computeAutoColumnWidths(
  rows: (string | number)[][],
  colCount: number,
  bounds: { min: number; max: number }[]
): XLSX.ColInfo[] {
  const widths = Array.from({ length: colCount }, (_, i) => bounds[i]?.min ?? 10);

  for (const row of rows) {
    for (let c = 0; c < colCount; c++) {
      const len = maxLineLength(row[c]);
      const padded = len + 4;
      const minW = bounds[c]?.min ?? 8;
      const maxW = bounds[c]?.max ?? 52;
      widths[c] = Math.max(widths[c], Math.min(maxW, Math.max(minW, padded)));
    }
  }

  return widths.map((wch) => ({ wch }));
}

export function exportInvitationListReportExcel({
  metadata,
  recipients,
  filterSummary = 'Seluruh Daftar Penerima',
}: GenerateReportExcelParams): { filename: string } {
  let attending = 0;
  let represented = 0;
  let declined = 0;
  let pending = 0;
  let generatedPdf = 0;

  const groupStats = new Map<
    string,
    {
      total: number;
      attending: number;
      represented: number;
      declined: number;
      pending: number;
      generated: number;
    }
  >();

  for (const r of recipients) {
    const grp = r.group?.trim() || 'Manual / Umum';
    const current = groupStats.get(grp) ?? {
      total: 0,
      attending: 0,
      represented: 0,
      declined: 0,
      pending: 0,
      generated: 0,
    };
    current.total++;

    if (r.rsvpStatus === 'attending') {
      attending++;
      current.attending++;
    } else if (r.rsvpStatus === 'represented') {
      represented++;
      current.represented++;
    } else if (r.rsvpStatus === 'declined') {
      declined++;
      current.declined++;
    } else {
      pending++;
      current.pending++;
    }

    if (r.status === 'generated') {
      generatedPdf++;
      current.generated++;
    }

    groupStats.set(grp, current);
  }

  const total = recipients.length;
  const confirmRate =
    total > 0 ? Math.round(((attending + represented) / total) * 100) : 0;
  const printedAt = formatPrintDateId(new Date());
  const scheduleStr = metadata.time
    ? `${metadata.date} | ${metadata.time}`
    : metadata.date || '-';

  // --- Sheet 1: Laporan Daftar Undangan ---
  const headerBlock: (string | number)[][] = [
    ['LAPORAN DAFTAR PENERIMA UNDANGAN & REKAP KEHADIRAN'],
    ['Nama Acara', metadata.eventName || '-'],
    ['Penyelenggara', metadata.organizer || '-', '', '', '', 'Jadwal', scheduleStr],
    ['Lokasi Acara', metadata.location || '-', '', '', '', 'Cakupan Data', filterSummary],
    [
      'Tanggal Cetak',
      printedAt,
      '',
      '',
      '',
      'PDF Undangan',
      `${generatedPdf} dari ${total} terbuat`,
    ],
    [],
    [
      'Ringkasan RSVP',
      'Total Undangan',
      'Hadir',
      'Diwakilkan',
      'Berhalangan',
      'Belum Konfirmasi',
      'Tingkat Konfirmasi',
    ],
    [
      'Jumlah',
      total,
      attending,
      represented,
      declined,
      pending,
      `${confirmRate}%`,
    ],
    [],
  ];

  const tableHeader: (string | number)[] = [
    'No',
    'Kode Undangan',
    'Sapaan',
    'Nama Penerima / Jabatan',
    'Instansi / Daerah Asal',
    'Kelompok',
    'Status RSVP',
    'Keterangan / Perwakilan',
    'Catatan Tamu',
    'Waktu Konfirmasi',
  ];

  const tableRows: (string | number)[][] =
    recipients.length > 0
      ? recipients.map((r, idx) => [
          idx + 1,
          r.invitationCode || '-',
          r.salutation || 'Kepada Yth.',
          r.recipientName || '-',
          r.institution || '-',
          r.group?.trim() || 'Manual / Umum',
          getRsvpLabel(r.rsvpStatus),
          r.rsvpRepresentative?.trim() || '-',
          r.rsvpNote?.trim() || '-',
          r.rsvpAt ? new Date(r.rsvpAt).toLocaleString('id-ID') : '-',
        ])
      : [['-', '-', '-', 'Belum ada daftar penerima undangan', '-', '-', '-', '-', '-', '-']];

  const closingRows: (string | number)[][] = [
    [],
    [
      `Ringkasan Akhir: ${total} penerima tercatat (${attending} hadir, ${represented} diwakilkan, ${declined} berhalangan, ${pending} belum konfirmasi).`,
    ],
  ];

  const allSheet1Rows = [
    ...headerBlock,
    tableHeader,
    ...tableRows,
    ...closingRows,
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(allSheet1Rows);

  // Merge banner & metadata value cells for clean official report layout
  const closingRowIdx = headerBlock.length + 1 + tableRows.length + 1;
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, // Title
    { s: { r: 1, c: 1 }, e: { r: 1, c: 9 } }, // Event Name
    { s: { r: 2, c: 1 }, e: { r: 2, c: 4 } }, // Organizer
    { s: { r: 2, c: 6 }, e: { r: 2, c: 9 } }, // Schedule
    { s: { r: 3, c: 1 }, e: { r: 3, c: 4 } }, // Location
    { s: { r: 3, c: 6 }, e: { r: 3, c: 9 } }, // Scope
    { s: { r: 4, c: 1 }, e: { r: 4, c: 4 } }, // Print date
    { s: { r: 4, c: 6 }, e: { r: 4, c: 9 } }, // PDF status
    { s: { r: closingRowIdx, c: 0 }, e: { r: closingRowIdx, c: 9 } }, // Closing summary
  ];

  // Auto-size columns based strictly on table header + data rows + metadata labels
  const widthSourceRows: (string | number)[][] = [
    tableHeader,
    ...tableRows,
    // Include summary headers so summary cells never truncate either
    headerBlock[6],
    headerBlock[7],
  ];

  ws1['!cols'] = computeAutoColumnWidths(widthSourceRows, 10, [
    { min: 15, max: 18 }, // Col A: No + metadata labels ("Ringkasan RSVP")
    { min: 16, max: 22 }, // Col B: Kode Undangan
    { min: 14, max: 20 }, // Col C: Sapaan
    { min: 28, max: 52 }, // Col D: Nama Penerima / Jabatan
    { min: 26, max: 48 }, // Col E: Instansi / Daerah Asal
    { min: 22, max: 44 }, // Col F: Kelompok
    { min: 18, max: 24 }, // Col G: Status RSVP
    { min: 24, max: 40 }, // Col H: Keterangan / Perwakilan
    { min: 20, max: 42 }, // Col I: Catatan Tamu
    { min: 20, max: 26 }, // Col J: Waktu Konfirmasi
  ]);

  ws1['!rows'] = [
    { hpt: 26 }, // Row 1 Title
    { hpt: 20 },
    { hpt: 19 },
    { hpt: 19 },
    { hpt: 19 },
    { hpt: 10 },
    { hpt: 20 }, // Summary header
    { hpt: 20 }, // Summary values
    { hpt: 10 },
    { hpt: 24 }, // Table header
  ];

  // --- Sheet 2: Rekap per Kelompok ---
  const groupHeader: (string | number)[] = [
    'No',
    'Kelompok Penerima',
    'Total',
    'Hadir',
    'Diwakilkan',
    'Berhalangan',
    'Belum Konfirmasi',
    'PDF Terbuat',
  ];

  const groupRows: (string | number)[][] = Array.from(groupStats.entries()).map(
    ([groupName, st], i) => [
      i + 1,
      groupName,
      st.total,
      st.attending,
      st.represented,
      st.declined,
      st.pending,
      st.generated,
    ]
  );

  const sheet2Data: (string | number)[][] = [
    [`REKAPITULASI PER KELOMPOK — ${metadata.eventName || 'Undangan Kegiatan'}`],
    [],
    groupHeader,
    ...groupRows,
    ['', 'TOTAL KESELURUHAN', total, attending, represented, declined, pending, generatedPdf],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
  ws2['!cols'] = computeAutoColumnWidths(
    [groupHeader, ...groupRows, sheet2Data[sheet2Data.length - 1]],
    8,
    [
      { min: 6, max: 8 },
      { min: 28, max: 52 },
      { min: 10, max: 14 },
      { min: 10, max: 14 },
      { min: 13, max: 16 },
      { min: 14, max: 18 },
      { min: 18, max: 22 },
      { min: 14, max: 18 },
    ]
  );
  ws2['!rows'] = [{ hpt: 24 }, { hpt: 10 }, { hpt: 22 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Laporan_Undangan');
  XLSX.utils.book_append_sheet(wb, ws2, 'Rekap_Kelompok');

  const filename = `Laporan_Daftar_Undangan_${sanitizeFilenameSegment(metadata.eventName, 'Event')}.xlsx`;
  XLSX.writeFile(wb, filename);

  return { filename };
}
