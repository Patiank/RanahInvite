import { EventMetadata } from '../types';

export interface GeneratedArtworkResult {
  page1DataUrl: string;
  page1Width: number;
  page1Height: number;
  page2DataUrl: string | null;
  page2Width: number;
  page2Height: number;
}

function drawFrameBorder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  primaryColor: string,
  secondaryColor: string
) {
  const pad = 44;
  ctx.save();
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

  ctx.lineWidth = 1.2;
  ctx.strokeStyle = secondaryColor;
  ctx.strokeRect(pad + 12, pad + 12, w - (pad + 12) * 2, h - (pad + 12) * 2);
  ctx.restore();
}

function wrapCenterText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  startY: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(' ');
  let line = '';
  let y = startY;
  for (let i = 0; i < words.length; i++) {
    const testLine = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, cx, y);
      line = words[i];
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, cx, y);
  }
  return y;
}

/**
 * Minimal blank-safe canvas fallback used only when no custom template image
 * has been uploaded or saved as System Default yet.
 */
export function renderFallbackTemplateArtwork(
  meta: EventMetadata
): GeneratedArtworkResult {
  const w = 1240;
  const h = 1754;

  const canvas1 = document.createElement('canvas');
  canvas1.width = w;
  canvas1.height = h;
  const ctx = canvas1.getContext('2d')!;

  ctx.fillStyle = '#FCFBF7';
  ctx.fillRect(0, 0, w, h);
  drawFrameBorder(ctx, w, h, '#D4A338', 'rgba(21, 138, 133, 0.35)');

  ctx.textAlign = 'center';
  ctx.fillStyle = '#158A85';
  ctx.font = '600 22px "Manrope", sans-serif';
  ctx.fillText(meta.organizer.toUpperCase(), w / 2, 220);

  ctx.fillStyle = '#D4A338';
  ctx.fillRect(w / 2 - 70, 248, 140, 2.5);

  ctx.fillStyle = '#6B7280';
  ctx.font = '500 24px "Manrope", sans-serif';
  ctx.fillText('UNDANGAN', w / 2, 308);

  ctx.fillStyle = '#111827';
  ctx.font = '700 50px "Manrope", sans-serif';
  const lastY = wrapCenterText(ctx, meta.eventName, w / 2, 390, w - 240, 64);

  const infoY = lastY + 90;
  ctx.fillStyle = '#F4FAF9';
  ctx.strokeStyle = 'rgba(21, 138, 133, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(140, infoY, w - 280, 170, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#111827';
  ctx.font = '600 25px "Manrope", sans-serif';
  ctx.fillText(`${meta.date}   |   ${meta.time}`, w / 2, infoY + 66);
  ctx.fillStyle = '#158A85';
  ctx.font = '500 23px "Manrope", sans-serif';
  ctx.fillText(meta.location, w / 2, infoY + 118);

  // Clean recipient frame
  const cardY = 945;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#D4A338';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(170, cardY, w - 340, 420, 20);
  ctx.fill();
  ctx.stroke();

  const page1DataUrl = canvas1.toDataURL('image/png');

  const canvas2 = document.createElement('canvas');
  canvas2.width = w;
  canvas2.height = h;
  const ctx2 = canvas2.getContext('2d')!;

  ctx2.fillStyle = '#FCFBF7';
  ctx2.fillRect(0, 0, w, h);
  drawFrameBorder(ctx2, w, h, '#D4A338', 'rgba(21, 138, 133, 0.3)');

  ctx2.textAlign = 'center';
  ctx2.fillStyle = '#158A85';
  ctx2.font = '700 22px "Manrope", sans-serif';
  ctx2.fillText('HALAMAN 2', w / 2, 145);

  ctx2.fillStyle = '#111827';
  ctx2.font = '700 40px "Manrope", sans-serif';
  ctx2.fillText(meta.eventName, w / 2, 215);

  const page2DataUrl = canvas2.toDataURL('image/png');

  return {
    page1DataUrl,
    page1Width: w,
    page1Height: h,
    page2DataUrl,
    page2Width: w,
    page2Height: h,
  };
}
