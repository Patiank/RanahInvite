import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import QRCode from 'qrcode';
import {
  EventMetadata,
  OverlayBlock,
  OverlayFontFamily,
  Recipient,
  TemplateImages,
} from '../types';
import { buildRsvpUrl } from './rsvp';

export function sanitizeFilenameSegment(value: string, fallback = 'Undangan'): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return normalized || fallback;
}

export function buildSafePdfFilename(
  eventName: string,
  recipientName: string,
  institution: string,
  usedFilenames?: Set<string>
): string {
  const eventPart = sanitizeFilenameSegment(eventName, 'Event');
  const targetSource = recipientName.trim() || institution.trim() || 'Tamu';
  const targetPart = sanitizeFilenameSegment(targetSource, 'Tamu');
  const base = `Undangan_${eventPart}_${targetPart}`;

  let candidate = `${base}.pdf`;
  if (usedFilenames) {
    let counter = 2;
    while (usedFilenames.has(candidate.toLowerCase())) {
      candidate = `${base}_${counter}.pdf`;
      counter++;
    }
    usedFilenames.add(candidate.toLowerCase());
  }
  return candidate;
}

/**
 * Normalizes characters outside WinAnsi encoding so pdf-lib StandardFonts
 * never throw encoding errors on pasted curly quotes, dashes, or symbols.
 */
function sanitizeWinAnsiText(input: string): string {
  return input
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [0.07, 0.09, 0.15];
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return [r, g, b];
}

async function dataUrlToPngBytes(dataUrl: string): Promise<{ bytes: Uint8Array; isJpg: boolean }> {
  // Fast path if already jpeg or png
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
    const base64 = dataUrl.split(',')[1];
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, isJpg: true };
  }
  if (dataUrl.startsWith('data:image/png')) {
    const base64 = dataUrl.split(',')[1];
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, isJpg: false };
  }

  // Convert WEBP or other browser-supported formats to PNG via canvas
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 1240;
      canvas.height = img.naturalHeight || 1754;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const pngUrl = canvas.toDataURL('image/png');
      const base64 = pngUrl.split(',')[1];
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      resolve({ bytes, isJpg: false });
    };
    img.onerror = () => reject(new Error('Gagal memproses gambar undangan ke PDF'));
    img.src = dataUrl;
  });
}

function wrapWordsWithMeasure(
  text: string,
  fontSize: number,
  maxWidth: number,
  measureWidth: (str: string, sz: number) => number
): string[] {
  const safeText = sanitizeWinAnsiText(text);
  if (!safeText) return [''];
  const paragraphs = safeText.split(/\r?\n/);
  const result: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/);
    if (words.length === 0 || (words.length === 1 && words[0] === '')) {
      result.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (measureWidth(test, fontSize) > maxWidth && current) {
        result.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) result.push(current);
  }
  return result.length > 0 ? result : [''];
}

export function splitInstitutionTwoLines(
  text: string,
  baseFontSize: number,
  maxWidth: number,
  measureWidth: (str: string, sz: number) => number
): string[] {
  const safe = sanitizeWinAnsiText(text).trim();
  if (!safe) return [''];

  // 1. Honor explicit manual newline if provided
  if (safe.includes('\n')) {
    const parts = safe
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return [parts[0], parts.slice(1).join(' ')];
    }
    return parts.length > 0 ? parts : [''];
  }

  // 2. Semantic split: Line 1 = Dinas/Instansi, Line 2 = Provinsi / Kabupaten / Kota / Kecamatan / Nagari
  const regionRegex =
    /\s+(?=(?:Provinsi|Prov\.?|Kabupaten|Kab\.?|Kota|Kecamatan|Kec\.?|Nagari)\b)/i;
  const regionMatch = regionRegex.exec(safe);
  if (regionMatch && regionMatch.index > 0) {
    const line1 = safe.slice(0, regionMatch.index).trim();
    const line2 = safe.slice(regionMatch.index).trim();
    if (line1 && line2) {
      return [line1, line2];
    }
  }

  // 3. Separator split (e.g. "PT Angkasa Pura II — Bandara Internasional Minangkabau")
  const dashMatch = /\s+[—-]\s+/.exec(safe);
  if (dashMatch && dashMatch.index > 0) {
    const line1 = safe.slice(0, dashMatch.index).trim();
    const line2 = safe.slice(dashMatch.index + dashMatch[0].length).trim();
    if (line1 && line2) {
      return [line1, line2];
    }
  }

  // 4. Trailing regional name without "Provinsi/Kab/Kota" prefix (e.g. "... DPD Sumbar", "... Sumatera Barat")
  const tailRegionRegex = /\s+(?=(?:(?:DPD|BPD)\s+)?(?:Sumatera Barat|Sumbar|Indonesia)\b)/i;
  const tailMatch = tailRegionRegex.exec(safe);
  if (tailMatch && tailMatch.index > 0) {
    const line1 = safe.slice(0, tailMatch.index).trim();
    const line2 = safe.slice(tailMatch.index).trim();
    if (line1 && line2) {
      return [line1, line2];
    }
  }

  // 5. No regional marker: keep 1 line if it fits, otherwise balance cleanly into 2 lines at full fontSize
  if (measureWidth(safe, baseFontSize) <= maxWidth) {
    return [safe];
  }

  const words = safe.split(/\s+/);
  if (words.length <= 1) return [safe];

  let bestIdx = Math.ceil(words.length / 2);
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const w1 = measureWidth(words.slice(0, i).join(' '), baseFontSize);
    const w2 = measureWidth(words.slice(i).join(' '), baseFontSize);
    const diff = Math.abs(w1 - w2);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  return [words.slice(0, bestIdx).join(' '), words.slice(bestIdx).join(' ')];
}

export function fitTextBlockLines(
  text: string,
  baseFontSize: number,
  maxWidth: number,
  measureWidth: (str: string, sz: number) => number,
  _isInstitution = false
): { lines: string[]; fontSize: number } {
  const lines = wrapWordsWithMeasure(text, baseFontSize, maxWidth, measureWidth);
  return { lines, fontSize: baseFontSize };
}

let measureCanvasCtx: CanvasRenderingContext2D | null = null;

export function getBrowserCssFontFamily(_family: OverlayFontFamily): string {
  return '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif';
}

export function computeBrowserWrappedLines(
  text: string,
  fontFamily: OverlayFontFamily,
  fontWeight: 400 | 600 | 700,
  italic: boolean,
  baseFontSizePt: number,
  scaleRatio: number,
  maxWidthPx: number,
  isInstitution = false
): { lines: string[]; scaledFontSizePx: number } {
  if (typeof document === 'undefined' || maxWidthPx <= 0) {
    return {
      lines: [text],
      scaledFontSizePx: Math.max(2, baseFontSizePt * scaleRatio),
    };
  }
  if (!measureCanvasCtx) {
    const c = document.createElement('canvas');
    measureCanvasCtx = c.getContext('2d');
  }
  const ctx = measureCanvasCtx;
  if (!ctx) {
    return {
      lines: [text],
      scaledFontSizePx: Math.max(2, baseFontSizePt * scaleRatio),
    };
  }

  const cssFamily = getBrowserCssFontFamily(fontFamily);
  const stylePrefix = italic ? 'italic ' : '';
  const safeBasePt = Number.isFinite(Number(baseFontSizePt)) && Number(baseFontSizePt) > 0
    ? Number(baseFontSizePt)
    : 14;
  const fitted = fitTextBlockLines(
    text,
    safeBasePt,
    maxWidthPx,
    (str, szPt) => {
      const px = Math.max(1, szPt * scaleRatio);
      ctx.font = `${stylePrefix}${fontWeight} ${px}px ${cssFamily}`;
      return ctx.measureText(str).width;
    },
    isInstitution
  );

  return {
    lines: fitted.lines,
    scaledFontSizePx: Math.max(2, fitted.fontSize * scaleRatio),
  };
}

function isSerifFamily(_family: OverlayFontFamily): boolean {
  return false;
}

export function isCustomTextField(fieldId: OverlayBlock['id']): boolean {
  return fieldId === 'rsvp_note' || fieldId.startsWith('custom_text_');
}

export function resolveFieldText(
  fieldId: OverlayBlock['id'],
  recipient: Recipient,
  fallbackText?: string
): string {
  switch (fieldId) {
    case 'salutation':
      return recipient.salutation;
    case 'recipient_name':
      return recipient.recipientName;
    case 'institution':
      return recipient.institution;
    case 'place_label':
      return recipient.placeLabel?.trim() || (fallbackText ?? 'di tempat');
    case 'qr_code':
      return recipient.invitationCode;
    case 'rsvp_note':
      return fallbackText ?? '';
    default:
      return fallbackText ?? '';
  }
}

export function getPdfReferenceWidth(imgWidth: number, imgHeight: number): number {
  return imgWidth >= imgHeight ? 841.89 : 595.28;
}

export interface GenerateSinglePdfParams {
  eventId?: string;
  metadata: EventMetadata;
  templates: TemplateImages;
  overlays: OverlayBlock[];
  recipient: Recipient;
}

export async function generateSingleRecipientPdf({
  eventId = 'evt-active',
  metadata,
  templates,
  overlays,
  recipient,
}: GenerateSinglePdfParams): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Undangan - ${metadata.eventName} - ${recipient.recipientName}`);
  pdfDoc.setAuthor(metadata.organizer || 'Ranah Invite');
  pdfDoc.setCreator('Ranah Invite');

  // Pre-embed standard vector fonts
  const fontCache = {
    sansRegular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    sansBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    sansItalic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    sansBoldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
    serifRegular: await pdfDoc.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
    serifItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
    serifBoldItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
  };

  const pickFont = (block: OverlayBlock): PDFFont => {
    const serif = isSerifFamily(block.fontFamily);
    const bold = block.fontWeight >= 600;
    if (serif) {
      if (bold && block.italic) return fontCache.serifBoldItalic;
      if (bold) return fontCache.serifBold;
      if (block.italic) return fontCache.serifItalic;
      return fontCache.serifRegular;
    }
    if (bold && block.italic) return fontCache.sansBoldItalic;
    if (bold) return fontCache.sansBold;
    if (block.italic) return fontCache.sansItalic;
    return fontCache.sansRegular;
  };

  // Pre-generate unique QR PNG once per recipient if QR overlay is visible
  const hasVisibleQr = overlays.some((o) => o.id === 'qr_code' && o.visible);
  let qrImage: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null;
  if (hasVisibleQr) {
    const rsvpUrl = buildRsvpUrl(eventId, metadata, recipient);
    const qrDataUrl = await QRCode.toDataURL(rsvpUrl, {
      width: 320,
      margin: 1,
      color: { dark: '#111827', light: '#FFFFFF' },
    });
    const { bytes } = await dataUrlToPngBytes(qrDataUrl);
    qrImage = await pdfDoc.embedPng(bytes);
  }

  const renderPage = async (
    pageNum: 1 | 2,
    dataUrl: string,
    imgW: number,
    imgH: number
  ) => {
    const safeW = imgW || 1240;
    const safeH = imgH || 1754;
    const pageWidth = getPdfReferenceWidth(safeW, safeH);
    const pageHeight = pageWidth * (safeH / safeW);

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const { bytes, isJpg } = await dataUrlToPngBytes(dataUrl);
    const embeddedBg = isJpg ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);

    page.drawImage(embeddedBg, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });

    const hasPage2 = templates.pageCount === 2 && Boolean(templates.page2DataUrl);
    const pageOverlays = overlays.filter(
      (o) => o.visible && (hasPage2 ? o.page : 1) === pageNum
    );

    for (const block of pageOverlays) {
      if (block.id === 'qr_code') {
        if (!qrImage) continue;
        const qrSize = pageWidth * (block.width / 100);
        const cx = pageWidth * (block.x / 100);
        const cy = pageHeight * (1 - block.y / 100);
        page.drawImage(qrImage, {
          x: cx - qrSize / 2,
          y: cy - qrSize / 2,
          width: qrSize,
          height: qrSize,
        });
        continue;
      }

      const rawValue = resolveFieldText(block.id, recipient, block.placeholder);
      if (!rawValue.trim()) continue;

      const font = pickFont(block);
      const maxWidth = pageWidth * (block.width / 100);
      const isInstitution = block.id === 'institution';
      const fitted = fitTextBlockLines(
        rawValue,
        block.fontSize,
        maxWidth,
        (str, sz) => font.widthOfTextAtSize(str, sz),
        isInstitution
      );
      const fontSize = fitted.fontSize;
      const lines = fitted.lines;

      const lineHeight = fontSize * 1.28;
      const capHeight = fontSize * 0.72;
      const totalBlockHeight = (lines.length - 1) * lineHeight + capHeight;
      const centerY = pageHeight * (1 - block.y / 100);
      const firstBaselineY = centerY + totalBlockHeight / 2 - capHeight;

      const [r, g, b] = hexToRgbTuple(block.color);
      const anchorX = pageWidth * (block.x / 100);

      lines.forEach((line, idx) => {
        if (!line) return;
        const textWidth = font.widthOfTextAtSize(line, fontSize);
        let drawX = anchorX;
        if (block.align === 'center') {
          drawX = anchorX - textWidth / 2;
        } else if (block.align === 'right') {
          drawX = anchorX - textWidth;
        }
        const drawY = firstBaselineY - idx * lineHeight;
        page.drawText(line, {
          x: drawX,
          y: drawY,
          size: fontSize,
          font,
          color: rgb(r, g, b),
        });
      });
    }
  };

  await renderPage(1, templates.page1DataUrl, templates.page1Width, templates.page1Height);

  if (templates.pageCount === 2 && templates.page2DataUrl) {
    await renderPage(2, templates.page2DataUrl, templates.page2Width, templates.page2Height);
  }

  return pdfDoc.save();
}

export interface BatchExportParams {
  eventId?: string;
  metadata: EventMetadata;
  templates: TemplateImages;
  overlays: OverlayBlock[];
  recipients: Recipient[];
  onItemStart?: (recipientId: string, index: number) => void;
  onItemDone?: (recipientId: string, filename: string, pdfBytes: Uint8Array, index: number) => void;
}

export async function generateBatchZip({
  eventId = 'evt-active',
  metadata,
  templates,
  overlays,
  recipients,
  onItemStart,
  onItemDone,
}: BatchExportParams): Promise<{
  zipBlob: Blob;
  zipFilename: string;
  files: Map<string, { filename: string; bytes: Uint8Array }>;
}> {
  const zip = new JSZip();
  const usedNames = new Set<string>();
  const files = new Map<string, { filename: string; bytes: Uint8Array }>();

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    onItemStart?.(recipient.id, i);

    const bytes = await generateSingleRecipientPdf({
      eventId,
      metadata,
      templates,
      overlays,
      recipient,
    });

    const filename = buildSafePdfFilename(
      metadata.eventName,
      recipient.recipientName,
      recipient.institution,
      usedNames
    );

    zip.file(filename, bytes);
    files.set(recipient.id, { filename, bytes });
    onItemDone?.(recipient.id, filename, bytes, i);

    // Yield frame for smooth UI progress & badge animation
    await new Promise((r) => setTimeout(r, 45));
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipFilename = `Batch_Undangan_${sanitizeFilenameSegment(metadata.eventName, 'RanahInvite')}.zip`;

  return { zipBlob, zipFilename, files };
}

export function triggerBlobDownload(data: Blob | Uint8Array, filename: string, mime = 'application/pdf') {
  const blob =
    data instanceof Blob
      ? data
      : new Blob([new Uint8Array(data)], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
