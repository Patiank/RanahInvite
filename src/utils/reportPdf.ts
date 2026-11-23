import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { EventMetadata, Recipient } from '../types';
import { getRsvpLabel } from './rsvp';
import { sanitizeFilenameSegment } from './pdfEngine';

export interface GenerateReportPdfParams {
  metadata: EventMetadata;
  recipients: Recipient[];
  filterSummary?: string;
}

function sanitizeWinAnsi(input: string): string {
  return (input || '')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function wrapTextToLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const safe = sanitizeWinAnsi(text).trim();
  if (!safe) return ['-'];

  const paragraphs = safe.split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
          current = '';
        }
        // Handle single very long token (e.g. code or unbroken text)
        if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, fontSize) > maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) lines.push(current);
  }

  return lines.length > 0 ? lines : ['-'];
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

export async function generateInvitationListReportPdf({
  metadata,
  recipients,
  filterSummary = 'Seluruh Daftar Penerima',
}: GenerateReportPdfParams): Promise<{ bytes: Uint8Array; filename: string }> {
  const pdfDoc = await PDFDocument.create();
  const safeEventName = sanitizeWinAnsi(metadata.eventName || 'Undangan Kegiatan');
  const safeOrganizer = sanitizeWinAnsi(metadata.organizer || 'Ranah Invite');
  const safeDate = sanitizeWinAnsi(metadata.date || '-');
  const safeTime = sanitizeWinAnsi(metadata.time || '');
  const safeLocation = sanitizeWinAnsi(metadata.location || '-');
  const safeFilter = sanitizeWinAnsi(filterSummary);

  pdfDoc.setTitle(`Laporan Daftar Undangan - ${safeEventName}`);
  pdfDoc.setAuthor(safeOrganizer);
  pdfDoc.setCreator('Ranah Invite');

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // A4 Landscape dimensions (pt)
  const PAGE_W = 841.89;
  const PAGE_H = 595.28;
  const MARGIN_X = 36;
  const TABLE_W = PAGE_W - MARGIN_X * 2; // 769.89 pt
  const BOTTOM_SAFE_Y = 46;

  // Palette
  const COLOR_INK = rgb(0.067, 0.094, 0.153); // #111827
  const COLOR_MUTED = rgb(0.39, 0.45, 0.54); // #64748B
  const COLOR_TEAL = rgb(0.082, 0.541, 0.522); // #158A85
  const COLOR_TEAL_DARK = rgb(0.059, 0.431, 0.416); // #0F6E6A
  const COLOR_GOLD = rgb(0.851, 0.467, 0.024); // #D97706
  const COLOR_BORDER = rgb(0.87, 0.9, 0.93);
  const COLOR_ZEBRA = rgb(0.973, 0.98, 0.988);
  const COLOR_WHITE = rgb(1, 1, 1);

  const COLOR_EMERALD = rgb(0.02, 0.47, 0.34);
  const COLOR_EMERALD_BG = rgb(0.925, 0.992, 0.961);
  const COLOR_TEAL_BG = rgb(0.902, 0.957, 0.973);
  const COLOR_RED = rgb(0.725, 0.11, 0.11);
  const COLOR_RED_BG = rgb(0.996, 0.949, 0.949);
  const COLOR_SLATE_BG = rgb(0.953, 0.961, 0.973);

  // Compute summary stats
  let attending = 0;
  let represented = 0;
  let declined = 0;
  let pending = 0;
  let generatedPdf = 0;
  for (const r of recipients) {
    if (r.rsvpStatus === 'attending') attending++;
    else if (r.rsvpStatus === 'represented') represented++;
    else if (r.rsvpStatus === 'declined') declined++;
    else pending++;
    if (r.status === 'generated') generatedPdf++;
  }
  const total = recipients.length;

  // Column definitions (total = 769.89)
  const cols = [
    { key: 'no', label: 'No', width: 32, align: 'center' as const },
    { key: 'code', label: 'Kode', width: 74, align: 'left' as const },
    { key: 'name', label: 'Nama Penerima / Jabatan', width: 212, align: 'left' as const },
    { key: 'inst', label: 'Instansi / Daerah Asal', width: 184, align: 'left' as const },
    { key: 'group', label: 'Kelompok', width: 134, align: 'left' as const },
    { key: 'rsvp', label: 'Status RSVP & Keterangan', width: TABLE_W - 636, align: 'left' as const },
  ];

  const colX: number[] = [];
  let runningX = MARGIN_X;
  for (const c of cols) {
    colX.push(runningX);
    runningX += c.width;
  }

  const printedAtLabel = sanitizeWinAnsi(formatPrintDateId(new Date()));
  const pages: PDFPage[] = [];

  const drawTableHeader = (page: PDFPage, topY: number): number => {
    const headerH = 24;
    page.drawRectangle({
      x: MARGIN_X,
      y: topY - headerH,
      width: TABLE_W,
      height: headerH,
      color: COLOR_TEAL_DARK,
    });

    cols.forEach((col, i) => {
      const textW = fontBold.widthOfTextAtSize(col.label, 8.5);
      const drawX =
        col.align === 'center'
          ? colX[i] + (col.width - textW) / 2
          : colX[i] + 6;
      page.drawText(col.label, {
        x: drawX,
        y: topY - 15.5,
        size: 8.5,
        font: fontBold,
        color: COLOR_WHITE,
      });
    });

    return topY - headerH;
  };

  const startContinuationPage = (): { page: PDFPage; cursorY: number } => {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);

    // Subtle top accent bar
    page.drawRectangle({
      x: 0,
      y: PAGE_H - 5,
      width: PAGE_W,
      height: 5,
      color: COLOR_TEAL,
    });

    // Running mini header
    page.drawText(`LAPORAN DAFTAR UNDANGAN - ${safeEventName}`, {
      x: MARGIN_X,
      y: PAGE_H - 26,
      size: 9,
      font: fontBold,
      color: COLOR_TEAL_DARK,
    });

    const dateRight = `Dicetak: ${printedAtLabel}`;
    const dateW = fontRegular.widthOfTextAtSize(dateRight, 8);
    page.drawText(dateRight, {
      x: PAGE_W - MARGIN_X - dateW,
      y: PAGE_H - 26,
      size: 8,
      font: fontRegular,
      color: COLOR_MUTED,
    });

    page.drawLine({
      start: { x: MARGIN_X, y: PAGE_H - 33 },
      end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 33 },
      thickness: 0.7,
      color: COLOR_BORDER,
    });

    const nextY = drawTableHeader(page, PAGE_H - 42);
    return { page, cursorY: nextY };
  };

  // --- PAGE 1: Official Cover Header + Summary Strip + Table ---
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  pages.push(page);

  // Top Dual Accent Bar (Teal + Gold)
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 7,
    width: PAGE_W,
    height: 7,
    color: COLOR_TEAL,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 9,
    width: PAGE_W,
    height: 2,
    color: COLOR_GOLD,
  });

  let y = PAGE_H - 32;

  // Report Super-title & Title
  page.drawText('LAPORAN DAFTAR PENERIMA UNDANGAN & REKAP KEHADIRAN', {
    x: MARGIN_X,
    y,
    size: 13.5,
    font: fontBold,
    color: COLOR_INK,
  });

  const printedText = `Tanggal Cetak: ${printedAtLabel}`;
  const printedW = fontRegular.widthOfTextAtSize(printedText, 8.2);
  page.drawText(printedText, {
    x: PAGE_W - MARGIN_X - printedW,
    y: y + 2,
    size: 8.2,
    font: fontRegular,
    color: COLOR_MUTED,
  });

  y -= 17;
  const eventTitleLines = wrapTextToLines(safeEventName, fontBold, 11, TABLE_W);
  for (const line of eventTitleLines.slice(0, 2)) {
    page.drawText(line, {
      x: MARGIN_X,
      y,
      size: 11,
      font: fontBold,
      color: COLOR_TEAL_DARK,
    });
    y -= 14;
  }

  // Metadata 2-column box
  const metaBoxH = 40;
  y -= 2;
  page.drawRectangle({
    x: MARGIN_X,
    y: y - metaBoxH,
    width: TABLE_W,
    height: metaBoxH,
    color: COLOR_ZEBRA,
    borderColor: COLOR_BORDER,
    borderWidth: 0.75,
  });

  const leftColX = MARGIN_X + 10;
  const rightColX = MARGIN_X + TABLE_W / 2 + 8;
  const row1Y = y - 15;
  const row2Y = y - 30;

  page.drawText('Penyelenggara:', { x: leftColX, y: row1Y, size: 8.2, font: fontBold, color: COLOR_MUTED });
  page.drawText(
    wrapTextToLines(safeOrganizer, fontRegular, 8.5, TABLE_W / 2 - 90)[0],
    { x: leftColX + 74, y: row1Y, size: 8.5, font: fontRegular, color: COLOR_INK }
  );

  page.drawText('Lokasi Acara:', { x: leftColX, y: row2Y, size: 8.2, font: fontBold, color: COLOR_MUTED });
  page.drawText(
    wrapTextToLines(safeLocation, fontRegular, 8.5, TABLE_W / 2 - 90)[0],
    { x: leftColX + 74, y: row2Y, size: 8.5, font: fontRegular, color: COLOR_INK }
  );

  const scheduleStr = safeTime ? `${safeDate} | ${safeTime}` : safeDate;
  page.drawText('Jadwal:', { x: rightColX, y: row1Y, size: 8.2, font: fontBold, color: COLOR_MUTED });
  page.drawText(
    wrapTextToLines(scheduleStr, fontRegular, 8.5, TABLE_W / 2 - 80)[0],
    { x: rightColX + 62, y: row1Y, size: 8.5, font: fontRegular, color: COLOR_INK }
  );

  page.drawText('Cakupan:', { x: rightColX, y: row2Y, size: 8.2, font: fontBold, color: COLOR_MUTED });
  page.drawText(
    wrapTextToLines(`${safeFilter} (${generatedPdf}/${total} PDF undangan terbuat)`, fontRegular, 8.5, TABLE_W / 2 - 80)[0],
    { x: rightColX + 62, y: row2Y, size: 8.5, font: fontRegular, color: COLOR_INK }
  );

  y -= metaBoxH + 10;

  // 5 Summary KPI Boxes
  const kpiGap = 8;
  const kpiW = (TABLE_W - kpiGap * 4) / 5;
  const kpiH = 38;
  const confirmRate = total > 0 ? Math.round(((attending + represented) / total) * 100) : 0;

  const kpis = [
    {
      label: 'Total Undangan',
      value: `${total}`,
      sub: `${confirmRate}% konfirmasi hadir`,
      bg: COLOR_WHITE,
      accent: COLOR_INK,
    },
    {
      label: 'Hadir',
      value: `${attending}`,
      sub: total > 0 ? `${Math.round((attending / total) * 100)}% dari daftar` : '0%',
      bg: COLOR_EMERALD_BG,
      accent: COLOR_EMERALD,
    },
    {
      label: 'Diwakilkan',
      value: `${represented}`,
      sub: total > 0 ? `${Math.round((represented / total) * 100)}% dari daftar` : '0%',
      bg: COLOR_TEAL_BG,
      accent: COLOR_TEAL_DARK,
    },
    {
      label: 'Berhalangan',
      value: `${declined}`,
      sub: total > 0 ? `${Math.round((declined / total) * 100)}% dari daftar` : '0%',
      bg: COLOR_RED_BG,
      accent: COLOR_RED,
    },
    {
      label: 'Belum Konfirmasi',
      value: `${pending}`,
      sub: total > 0 ? `${Math.round((pending / total) * 100)}% dari daftar` : '0%',
      bg: COLOR_SLATE_BG,
      accent: COLOR_MUTED,
    },
  ];

  kpis.forEach((k, idx) => {
    const bx = MARGIN_X + idx * (kpiW + kpiGap);
    page.drawRectangle({
      x: bx,
      y: y - kpiH,
      width: kpiW,
      height: kpiH,
      color: k.bg,
      borderColor: COLOR_BORDER,
      borderWidth: 0.75,
    });
    page.drawText(k.label, {
      x: bx + 9,
      y: y - 12.5,
      size: 7.5,
      font: fontBold,
      color: COLOR_MUTED,
    });
    page.drawText(k.value, {
      x: bx + 9,
      y: y - 27,
      size: 13,
      font: fontBold,
      color: k.accent,
    });
    const subW = fontRegular.widthOfTextAtSize(k.sub, 7);
    page.drawText(k.sub, {
      x: bx + kpiW - subW - 8,
      y: y - 26,
      size: 7,
      font: fontRegular,
      color: COLOR_MUTED,
    });
  });

  y -= kpiH + 12;

  // Draw Table Header on Page 1
  y = drawTableHeader(page, y);

  // Table Rows
  const ROW_FONT_SIZE = 8.2;
  const ROW_SUB_SIZE = 7.4;
  const LINE_H = 10.6;
  const CELL_PAD_X = 6;
  const CELL_PAD_Y = 5.5;

  if (recipients.length === 0) {
    const emptyH = 34;
    page.drawRectangle({
      x: MARGIN_X,
      y: y - emptyH,
      width: TABLE_W,
      height: emptyH,
      color: COLOR_WHITE,
      borderColor: COLOR_BORDER,
      borderWidth: 0.5,
    });
    const msg = 'Belum ada daftar penerima undangan yang diinput.';
    const msgW = fontOblique.widthOfTextAtSize(msg, 9);
    page.drawText(msg, {
      x: MARGIN_X + (TABLE_W - msgW) / 2,
      y: y - 20,
      size: 9,
      font: fontOblique,
      color: COLOR_MUTED,
    });
    y -= emptyH;
  } else {
    recipients.forEach((rec, idx) => {
      const noStr = String(idx + 1);
      const codeLines = wrapTextToLines(rec.invitationCode || '-', fontRegular, ROW_FONT_SIZE, cols[1].width - CELL_PAD_X * 2);
      const nameLines = wrapTextToLines(rec.recipientName || '-', fontBold, ROW_FONT_SIZE, cols[2].width - CELL_PAD_X * 2);
      const instLines = wrapTextToLines(rec.institution || '-', fontRegular, ROW_FONT_SIZE, cols[3].width - CELL_PAD_X * 2);
      const groupLines = wrapTextToLines(rec.group?.trim() || 'Manual / Umum', fontRegular, ROW_SUB_SIZE, cols[4].width - CELL_PAD_X * 2);

      const rsvpStatusLabel = sanitizeWinAnsi(getRsvpLabel(rec.rsvpStatus));
      const detailParts: string[] = [];
      if (rec.rsvpRepresentative?.trim()) {
        detailParts.push(rec.rsvpRepresentative.trim());
      }
      if (rec.rsvpNote?.trim()) {
        detailParts.push(rec.rsvpNote.trim());
      }
      const rsvpDetailLines =
        detailParts.length > 0
          ? wrapTextToLines(detailParts.join(' - '), fontRegular, ROW_SUB_SIZE, cols[5].width - CELL_PAD_X * 2)
          : [];

      const rsvpLineCount = 1 + rsvpDetailLines.length;
      const maxLines = Math.max(
        1,
        codeLines.length,
        nameLines.length,
        instLines.length,
        groupLines.length,
        rsvpLineCount
      );
      const rowH = Math.max(21, maxLines * LINE_H + CELL_PAD_Y * 2);

      if (y - rowH < BOTTOM_SAFE_Y) {
        const next = startContinuationPage();
        page = next.page;
        y = next.cursorY;
      }

      // Row background (zebra)
      page.drawRectangle({
        x: MARGIN_X,
        y: y - rowH,
        width: TABLE_W,
        height: rowH,
        color: idx % 2 === 1 ? COLOR_ZEBRA : COLOR_WHITE,
      });

      // Row bottom divider
      page.drawLine({
        start: { x: MARGIN_X, y: y - rowH },
        end: { x: MARGIN_X + TABLE_W, y: y - rowH },
        thickness: 0.45,
        color: COLOR_BORDER,
      });

      const firstLineY = y - CELL_PAD_Y - ROW_FONT_SIZE + 1;

      // Col 0: No
      const noW = fontRegular.widthOfTextAtSize(noStr, ROW_FONT_SIZE);
      page.drawText(noStr, {
        x: colX[0] + (cols[0].width - noW) / 2,
        y: firstLineY,
        size: ROW_FONT_SIZE,
        font: fontRegular,
        color: COLOR_MUTED,
      });

      // Col 1: Code
      codeLines.forEach((ln, li) => {
        page.drawText(ln, {
          x: colX[1] + CELL_PAD_X,
          y: firstLineY - li * LINE_H,
          size: ROW_FONT_SIZE,
          font: fontRegular,
          color: COLOR_MUTED,
        });
      });

      // Col 2: Recipient Name
      nameLines.forEach((ln, li) => {
        page.drawText(ln, {
          x: colX[2] + CELL_PAD_X,
          y: firstLineY - li * LINE_H,
          size: ROW_FONT_SIZE,
          font: fontBold,
          color: COLOR_INK,
        });
      });

      // Col 3: Institution
      instLines.forEach((ln, li) => {
        page.drawText(ln, {
          x: colX[3] + CELL_PAD_X,
          y: firstLineY - li * LINE_H,
          size: ROW_FONT_SIZE,
          font: fontRegular,
          color: COLOR_INK,
        });
      });

      // Col 4: Group
      groupLines.forEach((ln, li) => {
        page.drawText(ln, {
          x: colX[4] + CELL_PAD_X,
          y: firstLineY - li * LINE_H,
          size: ROW_SUB_SIZE,
          font: fontRegular,
          color: COLOR_MUTED,
        });
      });

      // Col 5: RSVP Status & Note
      const rsvpColor =
        rec.rsvpStatus === 'attending'
          ? COLOR_EMERALD
          : rec.rsvpStatus === 'represented'
            ? COLOR_TEAL_DARK
            : rec.rsvpStatus === 'declined'
              ? COLOR_RED
              : COLOR_MUTED;

      page.drawText(rsvpStatusLabel, {
        x: colX[5] + CELL_PAD_X,
        y: firstLineY,
        size: ROW_FONT_SIZE,
        font: fontBold,
        color: rsvpColor,
      });

      rsvpDetailLines.forEach((ln, li) => {
        page.drawText(ln, {
          x: colX[5] + CELL_PAD_X,
          y: firstLineY - (li + 1) * LINE_H,
          size: ROW_SUB_SIZE,
          font: fontRegular,
          color: COLOR_MUTED,
        });
      });

      y -= rowH;
    });
  }

  // Closing Summary & Signature Area
  const closingBlockH = 74;
  if (y - closingBlockH < BOTTOM_SAFE_Y) {
    const next = startContinuationPage();
    page = next.page;
    y = next.cursorY;
  }

  y -= 14;
  page.drawText(
    `Ringkasan Akhir: ${total} penerima tercatat (${attending} hadir, ${represented} diwakilkan, ${declined} berhalangan, ${pending} belum konfirmasi).`,
    {
      x: MARGIN_X,
      y,
      size: 8.5,
      font: fontBold,
      color: COLOR_INK,
    }
  );

  // Right-aligned official sign-off block
  const sigX = PAGE_W - MARGIN_X - 210;
  page.drawText('Mengetahui / Penyelenggara,', {
    x: sigX,
    y: y - 16,
    size: 8.2,
    font: fontRegular,
    color: COLOR_MUTED,
  });
  page.drawLine({
    start: { x: sigX, y: y - 54 },
    end: { x: PAGE_W - MARGIN_X, y: y - 54 },
    thickness: 0.6,
    color: COLOR_MUTED,
  });
  page.drawText(
    wrapTextToLines(safeOrganizer, fontBold, 8.2, 210)[0],
    {
      x: sigX,
      y: y - 65,
      size: 8.2,
      font: fontBold,
      color: COLOR_INK,
    }
  );

  // Stamp page numbers & running footer on all pages
  const totalPages = pages.length;
  pages.forEach((p, idx) => {
    p.drawLine({
      start: { x: MARGIN_X, y: 30 },
      end: { x: PAGE_W - MARGIN_X, y: 30 },
      thickness: 0.5,
      color: COLOR_BORDER,
    });
    p.drawText(`Ranah Invite  |  ${safeOrganizer}`, {
      x: MARGIN_X,
      y: 18,
      size: 7.5,
      font: fontRegular,
      color: COLOR_MUTED,
    });
    const pgLabel = `Halaman ${idx + 1} dari ${totalPages}`;
    const pgW = fontBold.widthOfTextAtSize(pgLabel, 7.8);
    p.drawText(pgLabel, {
      x: PAGE_W - MARGIN_X - pgW,
      y: 18,
      size: 7.8,
      font: fontBold,
      color: COLOR_MUTED,
    });
  });

  const bytes = await pdfDoc.save();
  const filename = `Laporan_Daftar_Undangan_${sanitizeFilenameSegment(metadata.eventName, 'Event')}.pdf`;

  return { bytes, filename };
}
