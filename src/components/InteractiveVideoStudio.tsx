import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Link2,
  Loader2,
  Palette,
  RotateCcw,
  Search,
  Send,
  Shield,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import {
  DEFAULT_INTERACTIVE_CONFIG,
  DEFAULT_PANEL_SCALES,
  DEFAULT_SLIDE_TEXT_SIZES,
  EventMetadata,
  InteractiveCardStyle,
  InteractiveFontPreset,
  InteractiveImageAnimation,
  InteractiveInviteConfig,
  InteractivePanelScales,
  InteractiveSealSize,
  InteractiveSlideTextSizes,
  InteractiveTextAlign,
  InteractiveTextScale,
  InteractiveThemeId,
  InteractiveVerticalAlign,
  Recipient,
} from '../types';
import {
  isFirestoreRsvpConfigured,
  publishGuestInvitesToCloud,
  publishInviteConfigToCloud,
  publishSingleGuestInviteToCloud,
} from '../utils/firebaseRsvp';
import {
  buildInteractiveInviteUrl,
  buildWhatsAppInviteText,
  getRsvpLabel,
} from '../utils/rsvp';
import { InteractiveInvitePage, PreviewJumpTarget } from './InteractiveInvitePage';
import {
  RecipientPickerDropdown,
  SAMPLE_PREVIEW_RECIPIENT,
} from './RecipientPickerDropdown';

interface InteractiveVideoStudioProps {
  eventId: string;
  metadata: EventMetadata;
  recipients: Recipient[];
  previewRecipientId: string;
  onSelectPreviewRecipient: (id: string) => void;
  config: InteractiveInviteConfig;
  onChangeConfig: (next: InteractiveInviteConfig) => void;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
}

type StudioSectionTab = 'media' | 'seal' | 'style' | 'slides' | 'links';

function isImageFile(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(file.name)
  );
}

function isPngFile(file: File): boolean {
  return (
    file.type === 'image/png' ||
    file.type === 'image/x-png' ||
    /\.png$/i.test(file.name)
  );
}

function detectCanvasTransparency(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 16) {
    if (data[i] < 245) return true;
  }
  return false;
}

async function compressImageToWebp(
  file: File,
  maxWidth = 540,
  maxDataUrlLen = 260000
): Promise<{
  dataUrl: string;
  sizeKb: number;
  suggestedTheme: InteractiveThemeId;
  format: 'PNG' | 'WebP' | 'JPEG';
}> {
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Berkas gambar tidak valid.'));
      el.src = blobUrl;
    });

    const natW = img.naturalWidth || maxWidth;
    const natH = img.naturalHeight || 960;
    const scale = Math.min(1, maxWidth / natW);
    const w = Math.max(1, Math.round(natW * scale));
    const h = Math.max(1, Math.round(natH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Kanvas browser tidak tersedia.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    const hasAlpha = isPngFile(file) && detectCanvasTransparency(ctx, w, h);
    const sample = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < sample.length; i += 64) {
      if (sample[i + 3] < 40) continue;
      sum += 0.299 * sample[i] + 0.587 * sample[i + 1] + 0.114 * sample[i + 2];
      count += 1;
    }
    const avgLum = count > 0 ? sum / count : 40;
    const suggestedTheme: InteractiveThemeId =
      avgLum > 150 ? 'emerald-light' : 'gold-dark';

    let dataUrl = '';
    let format: 'PNG' | 'WebP' | 'JPEG' = 'WebP';

    for (const q of [0.8, 0.68, 0.56, 0.44]) {
      dataUrl = canvas.toDataURL('image/webp', q);
      if (dataUrl.startsWith('data:image/webp') && dataUrl.length <= maxDataUrlLen) {
        format = 'WebP';
        break;
      }
    }

    if (!dataUrl.startsWith('data:image/webp') || dataUrl.length > maxDataUrlLen) {
      if (hasAlpha) {
        // Preserve PNG transparency — never fall back to JPEG
        for (const stepScale of [1, 0.8, 0.65, 0.5]) {
          const sw = Math.max(1, Math.round(w * stepScale));
          const sh = Math.max(1, Math.round(h * stepScale));
          const tmp = document.createElement('canvas');
          tmp.width = sw;
          tmp.height = sh;
          const tctx = tmp.getContext('2d');
          if (!tctx) break;
          tctx.imageSmoothingEnabled = true;
          tctx.imageSmoothingQuality = 'high';
          tctx.drawImage(img, 0, 0, sw, sh);
          const webpCandidate = tmp.toDataURL('image/webp', 0.62);
          if (
            webpCandidate.startsWith('data:image/webp') &&
            webpCandidate.length <= maxDataUrlLen
          ) {
            dataUrl = webpCandidate;
            format = 'WebP';
            break;
          }
          const pngCandidate = tmp.toDataURL('image/png');
          dataUrl = pngCandidate;
          format = 'PNG';
          if (pngCandidate.length <= maxDataUrlLen) break;
        }
      } else {
        dataUrl = canvas.toDataURL('image/jpeg', 0.62);
        format = 'JPEG';
      }
    }

    const approxBytes = Math.round((dataUrl.length * 3) / 4);
    return {
      dataUrl,
      sizeKb: Math.max(1, Math.round(approxBytes / 1024)),
      suggestedTheme,
      format,
    };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function compressSlide1ImageSquare(
  file: File,
  targetSize = 420,
  maxDataUrlLen = 78000
): Promise<{ dataUrl: string; sizeKb: number; format: 'PNG' | 'WebP' | 'JPEG' }> {
  const targetW = targetSize;
  const targetH = targetSize;
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Berkas gambar Slide 1 tidak valid.'));
      el.src = blobUrl;
    });

    const srcW = img.naturalWidth || targetW;
    const srcH = img.naturalHeight || targetH;
    const targetRatio = 1; // 1:1 square
    const srcRatio = srcW / srcH;

    // Quick alpha probe for PNG files so transparent logos/emblems keep transparency & never get cropped
    let hasAlpha = false;
    if (isPngFile(file)) {
      const probe = document.createElement('canvas');
      probe.width = Math.min(srcW, 240);
      probe.height = Math.max(1, Math.round((probe.width / srcW) * srcH));
      const pctx = probe.getContext('2d');
      if (pctx) {
        pctx.drawImage(img, 0, 0, probe.width, probe.height);
        hasAlpha = detectCanvasTransparency(pctx, probe.width, probe.height);
      }
    }

    const drawBannerToCanvas = (cw: number, ch: number) => {
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const cctx = c.getContext('2d');
      if (!cctx) throw new Error('Kanvas browser tidak tersedia.');
      cctx.imageSmoothingEnabled = true;
      cctx.imageSmoothingQuality = 'high';

      if (hasAlpha) {
        // Contain-fit transparent PNG cleanly inside 1:1 without cropping any graphic edge
        const fitScale = Math.min(cw / srcW, ch / srcH);
        const dw = Math.max(1, Math.round(srcW * fitScale));
        const dh = Math.max(1, Math.round(srcH * fitScale));
        const dx = Math.round((cw - dw) / 2);
        const dy = Math.round((ch - dh) / 2);
        cctx.drawImage(img, dx, dy, dw, dh);
      } else {
        // Center-crop opaque photos cleanly to exact 1:1 square without stretching
        let sx = 0;
        let sy = 0;
        let sw = srcW;
        let sh = srcH;
        if (srcRatio > targetRatio) {
          sw = Math.round(srcH * targetRatio);
          sx = Math.round((srcW - sw) / 2);
        } else if (srcRatio < targetRatio) {
          sh = Math.round(srcW / targetRatio);
          sy = Math.round((srcH - sh) / 2);
        }
        cctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
      }
      return c;
    };

    let dataUrl = '';
    let format: 'PNG' | 'WebP' | 'JPEG' = 'WebP';

    if (hasAlpha) {
      // Keep crisp transparent PNG within Firestore quota, stepping down dimensions gently if needed
      for (const scaleStep of [1, 0.85, 0.7, 0.55]) {
        const cw = Math.round(targetW * scaleStep);
        const ch = Math.round(targetH * scaleStep);
        const c = drawBannerToCanvas(cw, ch);
        const pngCandidate = c.toDataURL('image/png');
        if (pngCandidate.length <= maxDataUrlLen) {
          dataUrl = pngCandidate;
          format = 'PNG';
          break;
        }
      }
      if (!dataUrl || dataUrl.length > maxDataUrlLen) {
        const c = drawBannerToCanvas(targetW, targetH);
        for (const q of [0.8, 0.68, 0.56, 0.44]) {
          const webpCandidate = c.toDataURL('image/webp', q);
          if (
            webpCandidate.startsWith('data:image/webp') &&
            webpCandidate.length <= maxDataUrlLen
          ) {
            dataUrl = webpCandidate;
            format = 'WebP';
            break;
          }
        }
      }
      if (!dataUrl) {
        const c = drawBannerToCanvas(Math.round(targetW * 0.5), Math.round(targetH * 0.5));
        dataUrl = c.toDataURL('image/png');
        format = 'PNG';
      }
    } else {
      const canvas = drawBannerToCanvas(targetW, targetH);
      for (const q of [0.78, 0.68, 0.56, 0.44, 0.34]) {
        dataUrl = canvas.toDataURL('image/webp', q);
        if (
          dataUrl.startsWith('data:image/webp') &&
          dataUrl.length <= maxDataUrlLen
        ) {
          format = 'WebP';
          break;
        }
      }
      if (!dataUrl.startsWith('data:image/webp') || dataUrl.length > maxDataUrlLen) {
        for (const q of [0.72, 0.58, 0.45]) {
          dataUrl = canvas.toDataURL('image/jpeg', q);
          format = 'JPEG';
          if (dataUrl.length <= maxDataUrlLen) break;
        }
      }
    }

    const approxBytes = Math.round((dataUrl.length * 3) / 4);
    return {
      dataUrl,
      sizeKb: Math.max(1, Math.round(approxBytes / 1024)),
      format,
    };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function analyzeAndExtractVideoFrames(file: File): Promise<{
  videoBlobUrl: string;
  posterDataUrl: string;
  openBgDataUrl: string;
  suggestedTheme: InteractiveThemeId;
  durationSec: number;
}> {
  const videoBlobUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoBlobUrl;

    const captureFrame = (): { dataUrl: string; avgLuminance: number } => {
      const targetW = Math.min(540, video.videoWidth || 540);
      const targetH = Math.round(
        targetW * ((video.videoHeight || 960) / (video.videoWidth || 540))
      );
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { dataUrl: '', avgLuminance: 40 };
      ctx.drawImage(video, 0, 0, targetW, targetH);
      const sample = ctx.getImageData(0, 0, targetW, targetH).data;
      let sum = 0;
      let count = 0;
      for (let i = 0; i < sample.length; i += 64) {
        sum += 0.299 * sample[i] + 0.587 * sample[i + 1] + 0.114 * sample[i + 2];
        count += 1;
      }
      return {
        dataUrl: canvas.toDataURL('image/webp', 0.8),
        avgLuminance: count > 0 ? sum / count : 40,
      };
    };

    let posterDataUrl = '';
    let step: 'first' | 'last' = 'first';

    video.onerror = () => {
      URL.revokeObjectURL(videoBlobUrl);
      reject(
        new Error(
          'Format video tidak dapat dibaca browser. Gunakan .MP4 (H.264) atau .WEBM.'
        )
      );
    };

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.05, Math.max(0, (video.duration || 1) * 0.02));
    };

    video.onseeked = () => {
      if (step === 'first') {
        posterDataUrl = captureFrame().dataUrl;
        step = 'last';
        const dur = Number.isFinite(video.duration) ? video.duration : 1;
        video.currentTime = Math.max(0, dur - 0.15);
      } else {
        const { dataUrl: openBgDataUrl, avgLuminance } = captureFrame();
        const suggestedTheme: InteractiveThemeId =
          avgLuminance > 150 ? 'emerald-light' : 'gold-dark';
        resolve({
          videoBlobUrl,
          posterDataUrl,
          openBgDataUrl,
          suggestedTheme,
          durationSec: Number.isFinite(video.duration) ? video.duration : 0,
        });
      }
    };
  });
}

export const InteractiveVideoStudio: React.FC<InteractiveVideoStudioProps> = ({
  eventId,
  metadata,
  recipients,
  previewRecipientId,
  onSelectPreviewRecipient,
  config,
  onChangeConfig,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const coverImageInputRef = useRef<HTMLInputElement | null>(null);
  const openImageInputRef = useRef<HTMLInputElement | null>(null);
  const sealImageInputRef = useRef<HTMLInputElement | null>(null);
  const slide1BannerInputRef = useRef<HTMLInputElement | null>(null);

  const [sectionTab, setSectionTab] = useState<StudioSectionTab>('media');
  const [mobilePane, setMobilePane] = useState<'editor' | 'preview'>('editor');
  const [activeTextSlideTab, setActiveTextSlideTab] = useState<
    'cover' | 'slide1' | 'slide2' | 'slide3'
  >('cover');
  const [guestLinkSearch, setGuestLinkSearch] = useState('');
  const [copiedGuestId, setCopiedGuestId] = useState<string | null>(null);
  const [exportingLinks, setExportingLinks] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<number | null>(null);
  const [publishedSignature, setPublishedSignature] = useState<string | null>(
    null
  );
  const [localVideoName, setLocalVideoName] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewJumpTarget, setPreviewJumpTarget] =
    useState<PreviewJumpTarget | null>(null);

  const currentConfigSignature = useMemo(
    () =>
      JSON.stringify({
        config,
        meta: metadata,
        guests: recipients.map((r) => [
          r.invitationCode,
          r.salutation,
          r.recipientName,
          r.institution,
        ]),
      }),
    [config, metadata, recipients]
  );
  const hasUnpublishedChanges =
    publishedSignature === null || publishedSignature !== currentConfigSignature;

  const isUsingLocalBlob = config.videoUrl.startsWith('blob:');
  const cloudConfigured = isFirestoreRsvpConfigured();

  const previewRecipient = useMemo(
    () =>
      recipients.find((r) => r.id === previewRecipientId) ??
      recipients[0] ??
      SAMPLE_PREVIEW_RECIPIENT,
    [recipients, previewRecipientId]
  );

  const filteredGuestLinks = useMemo(() => {
    const q = guestLinkSearch.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter(
      (r) =>
        r.recipientName.toLowerCase().includes(q) ||
        r.institution.toLowerCase().includes(q) ||
        r.invitationCode.toLowerCase().includes(q) ||
        (r.group || '').toLowerCase().includes(q)
    );
  }, [recipients, guestLinkSearch]);

  const jumpPreviewTo = (
    phase: 'sealed' | 'opening' | 'story',
    slideIndex?: 0 | 1 | 2
  ) => {
    setPreviewJumpTarget({ phase, slideIndex, nonce: Date.now() });
  };

  const currentTextSizes: InteractiveSlideTextSizes = {
    ...DEFAULT_SLIDE_TEXT_SIZES,
    ...(config.textSizes ?? {}),
  };

  const currentPanelScales: InteractivePanelScales = {
    ...DEFAULT_PANEL_SCALES,
    ...(config.panelScales ?? {}),
  };

  const stepPanelScale = (target: keyof InteractivePanelScales, delta: number) => {
    const next = Math.min(115, Math.max(75, currentPanelScales[target] + delta));
    onChangeConfig({
      ...config,
      panelScales: { ...currentPanelScales, [target]: next },
    });
  };

  const stepTextSize = (
    field: keyof InteractiveSlideTextSizes,
    delta: number,
    min = 8,
    max = 26
  ) => {
    const next = Math.min(max, Math.max(min, currentTextSizes[field] + delta));
    onChangeConfig({
      ...config,
      textSizes: { ...currentTextSizes, [field]: next },
    });
  };

  const renderPanelScaleBar = (
    target: keyof InteractivePanelScales,
    label: string
  ) => {
    const val = currentPanelScales[target];
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-[#DDEEF3] bg-white px-3 py-2">
        <div className="min-w-0">
          <div className="text-[11.5px] font-semibold text-[#1B1B4B]">
            Ukuran Panel Box ({label})
          </div>
          <div className="text-[10.5px] text-[#757E96]">
            Perkecil atau perbesar kotak panel secara proporsional
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {val !== 100 && (
            <button
              type="button"
              onClick={() =>
                onChangeConfig({
                  ...config,
                  panelScales: { ...currentPanelScales, [target]: 100 },
                })
              }
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-[#157A76] bg-[#EDF8FB] hover:bg-[#DCF5F1]"
            >
              Reset
            </button>
          )}
          <span className="inline-flex items-center gap-0.5 rounded-full border border-[#DDEEF3] bg-[#FAFEFD] px-1 py-0.5">
            <button
              type="button"
              disabled={val <= 75}
              onClick={() => stepPanelScale(target, -5)}
              aria-label={`Perkecil panel box ${label}`}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[#5A647B] hover:bg-[#EDF8FB] hover:text-[#157A76] active:scale-90 disabled:opacity-35"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <span className="min-w-[34px] text-center text-[10.5px] font-bold text-[#1B1B4B] tabular-nums select-none">
              {val}%
            </span>
            <button
              type="button"
              disabled={val >= 115}
              onClick={() => stepPanelScale(target, 5)}
              aria-label={`Perbesar panel box ${label}`}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[#5A647B] hover:bg-[#EDF8FB] hover:text-[#157A76] active:scale-90 disabled:opacity-35"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      </div>
    );
  };

  const renderSizeStepper = (
    field: keyof InteractiveSlideTextSizes,
    label: string,
    min = 8,
    max = 24
  ) => {
    const val = currentTextSizes[field];
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full border border-[#DDEEF3] bg-white px-1 py-0.5 shrink-0"
        title={`Ukuran teks ${label}`}
      >
        <button
          type="button"
          disabled={val <= min}
          onClick={() => stepTextSize(field, -1, min, max)}
          aria-label={`Perkecil ukuran ${label}`}
          className="w-5 h-5 rounded-full flex items-center justify-center text-[#5A647B] hover:bg-[#EDF8FB] hover:text-[#157A76] active:scale-90 disabled:opacity-35"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <span className="min-w-[28px] text-center text-[10.5px] font-bold text-[#1B1B4B] tabular-nums select-none">
          {val}px
        </span>
        <button
          type="button"
          disabled={val >= max}
          onClick={() => stepTextSize(field, 1, min, max)}
          aria-label={`Perbesar ukuran ${label}`}
          className="w-5 h-5 rounded-full flex items-center justify-center text-[#5A647B] hover:bg-[#EDF8FB] hover:text-[#157A76] active:scale-90 disabled:opacity-35"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      </span>
    );
  };

  const applyStylePreset = (preset: 'dinas' | 'adat' | 'gala') => {
    if (preset === 'dinas') {
      onChangeConfig({
        ...config,
        theme: 'navy-gold',
        fontPreset: 'modern',
        textScale: 'md',
        cardStyle: 'solid',
        textAlign: 'center',
        panelPosition: 'center',
        panelOffsetY: 0,
        overlayDarkness: 60,
        openAnimDurationSec: 1.3,
        slide1DurationSec: 5,
        slide2DurationSec: 8,
      });
      onNotify?.('Preset "Rapat Dinas Resmi" diterapkan.', 'success');
    } else if (preset === 'adat') {
      onChangeConfig({
        ...config,
        theme: 'gold-dark',
        fontPreset: 'ceremonial',
        textScale: 'md',
        cardStyle: 'solid',
        textAlign: 'center',
        panelPosition: 'center',
        panelOffsetY: 0,
        overlayDarkness: 65,
        imageAnimation: 'wax-seal-open',
        openAnimDurationSec: 1.6,
        slide1DurationSec: 6,
        slide2DurationSec: 9,
      });
      onNotify?.('Preset "Seremonial Adat Minang" diterapkan.', 'success');
    } else {
      onChangeConfig({
        ...config,
        theme: 'gold-dark',
        fontPreset: 'editorial',
        textScale: 'md',
        cardStyle: 'glass',
        textAlign: 'center',
        panelPosition: 'bottom',
        panelOffsetY: 0,
        overlayDarkness: 50,
        imageAnimation: 'gate-split',
        openAnimDurationSec: 1.8,
        slide1DurationSec: 6,
        slide2DurationSec: 9,
      });
      onNotify?.('Preset "Gala VIP Minimalis" diterapkan.', 'success');
    }
  };

  const handleUploadCoverImage = async (
    target: 'cover' | 'open',
    file?: File
  ) => {
    if (!file) return;
    if (!isImageFile(file)) {
      onNotify?.('Pilih berkas gambar .PNG, .JPG, atau .WEBP.', 'error');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await compressImageToWebp(
        file,
        540,
        target === 'cover' ? 280000 : 240000
      );
      if (target === 'cover') {
        onChangeConfig({
          ...config,
          mediaMode: 'image',
          coverImageDataUrl: res.dataUrl,
          theme: res.suggestedTheme,
        });
        onNotify?.(
          `Gambar sampul diramu (${res.sizeKb} KB ${res.format} · siap terbit online gratis!).`,
          'success'
        );
      } else {
        onChangeConfig({
          ...config,
          mediaMode: 'image',
          openImageDataUrl: res.dataUrl,
        });
        onNotify?.(
          `Gambar latar isi dipasang (${res.sizeKb} KB ${res.format}).`,
          'success'
        );
      }
      setPreviewKey((k) => k + 1);
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal memproses gambar.',
        'error'
      );
    } finally {
      setAnalyzing(false);
      if (coverImageInputRef.current) coverImageInputRef.current.value = '';
      if (openImageInputRef.current) openImageInputRef.current.value = '';
    }
  };

  const handleUploadSlide1Banner = async (file?: File) => {
    if (!file) return;
    if (!isImageFile(file)) {
      onNotify?.('Pilih berkas gambar banner .PNG, .JPG, atau .WEBP.', 'error');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await compressSlide1ImageSquare(file);
      onChangeConfig({
        ...config,
        slide1BannerDataUrl: res.dataUrl,
      });
      jumpPreviewTo('story', 0);
      onNotify?.(
        `Gambar Slide 1 (1:1) terkompresi otomatis ${res.sizeKb} KB ${res.format} — hemat kuota & cepat dimuat!`,
        'success'
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal memproses gambar banner.',
        'error'
      );
    } finally {
      setAnalyzing(false);
      if (slide1BannerInputRef.current) slide1BannerInputRef.current.value = '';
    }
  };

  const handleUploadCustomSeal = async (file?: File) => {
    if (!file) return;
    if (!isImageFile(file)) {
      onNotify?.('Pilih berkas logo/segel .PNG atau .WEBP transparan.', 'error');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await compressImageToWebp(file, 320, 110000);
      onChangeConfig({
        ...config,
        showSeal: true,
        customSealDataUrl: res.dataUrl,
      });
      jumpPreviewTo('sealed');
      onNotify?.(
        `Segel 3D kustom terpasang (${res.sizeKb} KB ${res.format} · siap terbit online).`,
        'success'
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal memproses gambar segel.',
        'error'
      );
    } finally {
      setAnalyzing(false);
      if (sealImageInputRef.current) sealImageInputRef.current.value = '';
    }
  };

  const handleUploadLocalVideo = async (file?: File) => {
    if (!file) return;
    if (isImageFile(file)) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      await handleUploadCoverImage('cover', file);
      return;
    }
    if (!file.type.startsWith('video/') && !/\.(mp4|webm)$/i.test(file.name)) {
      onNotify?.('Pilih berkas video .MP4 / .WEBM atau gambar .PNG.', 'error');
      return;
    }
    setAnalyzing(true);
    try {
      const result = await analyzeAndExtractVideoFrames(file);
      setLocalVideoName(file.name);
      onChangeConfig({
        ...config,
        mediaMode: 'video',
        videoUrl: result.videoBlobUrl,
        posterUrl: result.posterDataUrl || config.posterUrl,
        openBgUrl: result.openBgDataUrl || config.openBgUrl,
        theme: result.suggestedTheme,
      });
      setPreviewKey((k) => k + 1);
      onNotify?.(
        `Video "${file.name}" (${result.durationSec.toFixed(1)} dtk) berhasil diramu!`,
        'success'
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal menganalisis video.',
        'error'
      );
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUseDefaultPreset = () => {
    setLocalVideoName(null);
    onChangeConfig({
      ...config,
      mediaMode: 'video',
      videoUrl: DEFAULT_INTERACTIVE_CONFIG.videoUrl,
      posterUrl: DEFAULT_INTERACTIVE_CONFIG.posterUrl,
      openBgUrl: DEFAULT_INTERACTIVE_CONFIG.openBgUrl,
      theme: 'gold-dark',
    });
    setPreviewKey((k) => k + 1);
    onNotify?.('Preset Amplop Hitam Segel Emas diaktifkan.', 'success');
  };

  const ensurePublishedForGuestParity = async (
    targetRecipient?: Recipient
  ): Promise<boolean> => {
    if (!cloudConfigured) return true;
    if (!hasUnpublishedChanges) {
      if (targetRecipient) {
        try {
          await publishSingleGuestInviteToCloud(eventId, targetRecipient);
        } catch (err) {
          onNotify?.(
            `Gagal menyinkronkan data tamu "${targetRecipient.recipientName}" ke Cloud: ${
              err instanceof Error ? err.message : String(err)
            }`,
            'error'
          );
          return false;
        }
      }
      return true;
    }
    setPublishing(true);
    try {
      const ok = await publishInviteConfigToCloud(eventId, config, metadata);
      if (recipients.length > 0) {
        await publishGuestInvitesToCloud(eventId, recipients);
      } else if (targetRecipient) {
        await publishSingleGuestInviteToCloud(eventId, targetRecipient);
      }
      if (ok) {
        setPublishedAt(Date.now());
        setPublishedSignature(currentConfigSignature);
      }
      return ok;
    } catch (err) {
      onNotify?.(
        `Gagal menerbitkan ke Cloud: ${
          err instanceof Error ? err.message : String(err)
        }`,
        'error'
      );
      return false;
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishToCloud = async () => {
    if (!cloudConfigured || publishing) return;
    setPublishing(true);
    try {
      await publishInviteConfigToCloud(eventId, config, metadata);
      const guestCount =
        recipients.length > 0
          ? await publishGuestInvitesToCloud(eventId, recipients)
          : 0;
      setPublishedAt(Date.now());
      setPublishedSignature(currentConfigSignature);
      onNotify?.(
        isUsingLocalBlob
          ? `Teks, tema, & ${guestCount} link pendek tamu diterbitkan ke Cloud!`
          : `Pengaturan & ${guestCount} link pendek tamu (/v/...) berhasil diterbitkan ke Cloud!`,
        'success'
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error
          ? err.message
          : 'Gagal menerbitkan pengaturan ke Cloud Firestore.',
        'error'
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyGuestLink = async (rec: Recipient) => {
    try {
      const synced = await ensurePublishedForGuestParity(rec);
      if (!synced) return;
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
    const synced = await ensurePublishedForGuestParity(rec);
    if (!synced) return;
    const text = buildWhatsAppInviteText(
      eventId,
      metadata,
      rec,
      config.whatsappTemplate
    );
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleCopyAllGuestLinks = async () => {
    if (recipients.length === 0) {
      onNotify?.('Belum ada daftar tamu pada event ini.', 'error');
      return;
    }
    try {
      const synced = await ensurePublishedForGuestParity();
      if (!synced) return;
      const lines = recipients.map((r, i) => {
        const url = buildInteractiveInviteUrl(eventId, metadata, r);
        return `${i + 1}. ${r.recipientName}${r.institution ? ` (${r.institution})` : ''}\n${url}`;
      });
      await navigator.clipboard.writeText(lines.join('\n\n'));
      onNotify?.(
        `${recipients.length} link video interaktif & data tamu berhasil disinkronkan lalu disalin!`,
        'success'
      );
    } catch {
      onNotify?.('Gagal menyalin semua link.', 'error');
    }
  };

  const handleExportAllLinksExcel = async () => {
    if (recipients.length === 0) {
      onNotify?.('Belum ada daftar tamu untuk di-generate.', 'error');
      return;
    }
    setExportingLinks(true);
    try {
      const synced = await ensurePublishedForGuestParity();
      if (!synced) return;
      const XLSX = await import('xlsx');
      const rows = recipients.map((r, idx) => ({
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
          config.whatsappTemplate
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
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 48);
      XLSX.writeFile(wb, `Link-Video-${safeName || 'Event'}.xlsx`);
      onNotify?.(
        `Berhasil generate ${recipients.length} link video personal ke file Excel (.xlsx)!`,
        'success'
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal mengekspor daftar link.',
        'error'
      );
    } finally {
      setExportingLinks(false);
    }
  };

  const STUDIO_TABS: {
    id: StudioSectionTab;
    label: string;
    icon: React.ReactNode;
    onEnter?: () => void;
  }[] = [
    {
      id: 'media',
      label: 'Media',
      icon: <Film className="w-3.5 h-3.5" />,
    },
    {
      id: 'seal',
      label: 'Segel 3D',
      icon: <Shield className="w-3.5 h-3.5" />,
      onEnter: () => jumpPreviewTo('sealed'),
    },
    {
      id: 'style',
      label: 'Gaya & Posisi',
      icon: <Palette className="w-3.5 h-3.5" />,
      onEnter: () => jumpPreviewTo('story', 0),
    },
    {
      id: 'slides',
      label: 'Slide & Teks',
      icon: <Type className="w-3.5 h-3.5" />,
    },
    {
      id: 'links',
      label: `Link Tamu (${recipients.length})`,
      icon: <Link2 className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="space-y-3.5 sm:space-y-4">
      {/* Unsaved Cloud Sync Banner */}
      {cloudConfigured && hasUnpublishedChanges && (
        <div className="rounded-2xl border border-[#F3D34F] bg-[#FFFBEB] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12px] text-[#5C4506] leading-snug">
            <strong className="font-bold text-[#1B1B4B]">
              Perubahan belum terbit ke Cloud:
            </strong>{' '}
            Terbitkan agar tampilan di HP tamu 100% sama dengan pratinjau.
          </div>
          <button
            type="button"
            disabled={publishing}
            onClick={() => void handlePublishToCloud()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[11.5px] font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {publishing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5" />
            )}
            <span>{publishing ? 'Menerbitkan...' : 'Terbitkan Sekarang'}</span>
          </button>
        </div>
      )}

      {/* Mobile Tab Switcher: Editor vs Phone Preview */}
      <div className="xl:hidden sticky top-0 z-20 rounded-2xl bg-[#F4FBFD]/95 backdrop-blur-xs p-1 border border-[#DDEEF3] grid grid-cols-2 gap-1 shadow-xs">
        <button
          type="button"
          onClick={() => setMobilePane('editor')}
          className={`py-2 rounded-xl text-[12px] font-bold transition-colors ${
            mobilePane === 'editor'
              ? 'bg-[#1F9B96] text-white shadow-xs'
              : 'text-[#5A647B] hover:text-[#1B1B4B]'
          }`}
        >
          Editor Pengaturan
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('preview')}
          className={`py-2 rounded-xl text-[12px] font-bold transition-colors ${
            mobilePane === 'preview'
              ? 'bg-[#1F9B96] text-white shadow-xs'
              : 'text-[#5A647B] hover:text-[#1B1B4B]'
          }`}
        >
          Pratinjau Layar HP
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5 items-start">
        {/* LEFT COLUMN: Clean 5-Tab Studio Editor */}
        <div
          className={`xl:col-span-7 space-y-3.5 ${
            mobilePane === 'preview' ? 'hidden xl:block' : 'block'
          }`}
        >
          {/* 5-Tab Studio Navigation Bar */}
          <div
            role="tablist"
            aria-label="Bagian pengaturan Studio Video Interaktif"
            className="flex items-center gap-1 overflow-x-auto pb-0.5 rounded-2xl border border-[#DDEEF3] bg-[#F4FBFD] p-1"
          >
            {STUDIO_TABS.map((tab) => {
              const active = sectionTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setSectionTab(tab.id);
                    tab.onEnter?.();
                  }}
                  className={`flex-1 min-w-fit inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11.5px] font-bold transition-all whitespace-nowrap ${
                    active
                      ? 'bg-[#1F9B96] text-white shadow-xs'
                      : 'text-[#5A647B] hover:text-[#1B1B4B] hover:bg-white/70'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: MEDIA & ANIMASI 3D */}
          {sectionTab === 'media' && (
            <div className="rounded-[20px] border border-[#E5F1F5] bg-white p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
                    Media Latar & Animasi Pembuka 3D
                  </h3>
                  <p className="text-[11.5px] text-[#757E96]">
                    Pilih unggah gambar (langsung animasi 3D · 100% gratis) atau video MP4.
                  </p>
                </div>

                <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#F4FBFD] border border-[#E5F1F5]">
                  <button
                    type="button"
                    onClick={() => {
                      onChangeConfig({ ...config, mediaMode: 'image' });
                      setPreviewKey((k) => k + 1);
                    }}
                    className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold transition-all ${
                      config.mediaMode === 'image'
                        ? 'bg-[#1F9B96] text-white shadow-xs'
                        : 'text-[#5A647B] hover:text-[#1B1B4B]'
                    }`}
                  >
                    Dari Gambar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeConfig({ ...config, mediaMode: 'video' });
                      setPreviewKey((k) => k + 1);
                    }}
                    className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold transition-all ${
                      config.mediaMode === 'video'
                        ? 'bg-[#1F9B96] text-white shadow-xs'
                        : 'text-[#5A647B] hover:text-[#1B1B4B]'
                    }`}
                  >
                    Dari Video
                  </button>
                </div>
              </div>

              {config.mediaMode === 'image' ? (
                <div className="space-y-4">
                  {/* Cover Image Upload */}
                  <div className="rounded-2xl border border-dashed border-[#B5E4F1] bg-[#F4FBFD] p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {config.coverImageDataUrl ? (
                        <img
                          src={config.coverImageDataUrl}
                          alt="Pratinjau sampul"
                          className="w-11 h-18 rounded-xl object-cover border border-[#DDEEF3] shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-18 rounded-xl border border-[#DDEEF3] bg-white flex items-center justify-center text-[#1F9B96]/60 shrink-0">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-bold text-[#1B1B4B]">
                          Gambar Sampul Pembuka (Wajib)
                        </div>
                        <p className="text-[11px] text-[#757E96] mt-0.5">
                          {config.coverImageDataUrl
                            ? `Terkompresi ~${Math.max(1, Math.round((config.coverImageDataUrl.length * 3) / 4 / 1024))} KB WebP · Siap terbit gratis`
                            : 'Unggah 1 gambar (.JPG / .PNG / .WEBP).'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <input
                        ref={coverImageInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                        className="hidden"
                        onChange={(e) =>
                          void handleUploadCoverImage('cover', e.target.files?.[0])
                        }
                      />
                      <button
                        type="button"
                        disabled={analyzing}
                        onClick={() => coverImageInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[12px] font-semibold disabled:opacity-50"
                      >
                        {analyzing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {config.coverImageDataUrl ? 'Ganti' : 'Upload Gambar'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Optional Open Background */}
                  <div className="rounded-2xl border border-[#E5F1F5] bg-[#FAFEFD] p-3 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-bold text-[#1B1B4B]">
                        Gambar Latar Isi Setelah Terbuka (Opsional)
                      </div>
                      <p className="text-[11px] text-[#757E96]">
                        {config.openImageDataUrl
                          ? `Aktif (~${Math.max(1, Math.round((config.openImageDataUrl.length * 3) / 4 / 1024))} KB WebP)`
                          : 'Kosongkan untuk otomatis memakai gambar sampul di atas.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {config.openImageDataUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            onChangeConfig({ ...config, openImageDataUrl: '' });
                            setPreviewKey((k) => k + 1);
                          }}
                          aria-label="Hapus latar isi"
                          className="p-2 rounded-full text-[#757E96] hover:text-[#B83B5E] hover:bg-[#FDE8EE]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <input
                        ref={openImageInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                        className="hidden"
                        onChange={(e) =>
                          void handleUploadCoverImage('open', e.target.files?.[0])
                        }
                      />
                      <button
                        type="button"
                        disabled={analyzing}
                        onClick={() => openImageInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#DDEEF3] bg-white hover:bg-[#F4FBFD] text-[11.5px] font-semibold text-[#1B1B4B]"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#1F9B96]" />
                        <span>Pilih Latar</span>
                      </button>
                    </div>
                  </div>

                  {/* 4 3D Opening Animations */}
                  <div>
                    <div className="text-[12px] font-semibold text-[#1B1B4B] mb-2">
                      Efek Animasi 3D Saat Dibuka
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          {
                            id: 'wax-seal-open',
                            title: 'Segel & Lipatan 3D',
                            desc: 'Lipatan atas-bawah terbuka berengsel 3D',
                          },
                          {
                            id: 'gate-split',
                            title: 'Gerbang 3D Terbuka',
                            desc: 'Daun pintu kiri-kanan berayun 3D',
                          },
                          {
                            id: 'curtain-up',
                            title: 'Tirai 3D Naik',
                            desc: 'Sampul terangkat miring ke atas',
                          },
                          {
                            id: 'ken-burns',
                            title: 'Cinema Dolly Zoom',
                            desc: 'Kamera zoom-in halus ke undangan',
                          },
                        ] as {
                          id: InteractiveImageAnimation;
                          title: string;
                          desc: string;
                        }[]
                      ).map((anim) => {
                        const active = config.imageAnimation === anim.id;
                        return (
                          <button
                            key={anim.id}
                            type="button"
                            onClick={() => {
                              onChangeConfig({ ...config, imageAnimation: anim.id });
                              jumpPreviewTo('opening');
                            }}
                            className={`p-2.5 rounded-2xl border text-left transition-all ${
                              active
                                ? 'border-[#1F9B96] bg-[#DCF5F1]/60 ring-2 ring-[#1F9B96]/15'
                                : 'border-[#E5F1F5] bg-white hover:border-[#B5E4F1]'
                            }`}
                          >
                            <div className="text-[12px] font-bold text-[#1B1B4B]">
                              {anim.title}
                            </div>
                            <div className="text-[10.5px] text-[#757E96] mt-0.5 leading-snug">
                              {anim.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <div className="rounded-2xl border border-dashed border-[#B5E4F1] bg-[#F4FBFD] p-3.5 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-bold text-[#1B1B4B]">
                        {localVideoName
                          ? `Video Lokal: ${localVideoName}`
                          : config.videoUrl === DEFAULT_INTERACTIVE_CONFIG.videoUrl
                            ? 'Preset Amplop Hitam Segel Emas (3,87 dtk)'
                            : 'URL Video Online Kustom'}
                      </div>
                      <p className="text-[11px] text-[#757E96] mt-0.5">
                        Rasio 9:16, format MP4 / WEBM (3–8 dtk) atau gambar PNG (otomatis animasi 3D).
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleUseDefaultPreset}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#DDEEF3] bg-white text-[11px] font-semibold text-[#1B1B4B]"
                      >
                        <RotateCcw className="w-3 h-3 text-[#1F9B96]" />
                        <span>Preset</span>
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/mp4,video/webm,image/png,.mp4,.webm,.png"
                        className="hidden"
                        onChange={(e) =>
                          void handleUploadLocalVideo(e.target.files?.[0])
                        }
                      />
                      <button
                        type="button"
                        disabled={analyzing}
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1F9B96] text-white text-[11.5px] font-semibold disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Video / PNG</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="studio-video-url"
                      className="block text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                    >
                      URL Video Online (Opsional · .mp4 / .webm)
                    </label>
                    <input
                      id="studio-video-url"
                      type="url"
                      value={isUsingLocalBlob ? '' : config.videoUrl}
                      onChange={(e) => {
                        setLocalVideoName(null);
                        onChangeConfig({ ...config, videoUrl: e.target.value });
                      }}
                      placeholder="/media/gold-envelope-intro.mp4?v=2"
                      className="w-full rounded-xl border border-[#DDEEF3] px-3 py-2 text-[12px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                    />
                  </div>
                </div>
              )}

              {/* Opening Speed Controls */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#EDF5F8]">
                <div>
                  <label
                    htmlFor="studio-anim-dur"
                    className="block text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                  >
                    Durasi Animasi 3D
                  </label>
                  <select
                    id="studio-anim-dur"
                    value={config.openAnimDurationSec ?? 1.5}
                    onChange={(e) =>
                      onChangeConfig({
                        ...config,
                        openAnimDurationSec: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-[#DDEEF3] bg-white px-2.5 py-2 text-[12px] font-medium text-[#1B1B4B]"
                  >
                    <option value={1}>Cepat (1,0 dtk)</option>
                    <option value={1.5}>Normal (1,5 dtk)</option>
                    <option value={2.2}>Dramatis (2,2 dtk)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="studio-video-speed"
                    className="block text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                  >
                    Laju Putar Video
                  </label>
                  <select
                    id="studio-video-speed"
                    value={config.videoSpeed}
                    onChange={(e) =>
                      onChangeConfig({
                        ...config,
                        videoSpeed: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-[#DDEEF3] bg-white px-2.5 py-2 text-[12px] font-medium text-[#1B1B4B]"
                  >
                    <option value={1}>1,0× (Normal)</option>
                    <option value={1.25}>1,25× (Cepat)</option>
                    <option value={1.5}>1,5× (Sigap)</option>
                    <option value={1.75}>1,75× (Ekstra)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SEGEL 3D (PEMPROV SUMBAR / KUSTOM) */}
          {sectionTab === 'seal' && (
            <div className="rounded-[20px] border border-[#E5F1F5] bg-white p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
                    Logo Segel Emas 3D (Wax Seal)
                  </h3>
                  <p className="text-[11.5px] text-[#757E96]">
                    Atur ukuran, posisi X/Y, atau ganti logo segel pembuka di sampul.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-[12px] font-bold text-[#1B1B4B] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={config.showSeal !== false}
                    onChange={(e) => {
                      onChangeConfig({ ...config, showSeal: e.target.checked });
                      jumpPreviewTo('sealed');
                    }}
                    className="w-4 h-4 accent-[#1F9B96] rounded"
                  />
                  <span>Tampilkan</span>
                </label>
              </div>

              {/* Seal Preview + Upload/Reset */}
              <div className="rounded-2xl border border-[#E5F1F5] bg-[#FAFEFD] p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={config.customSealDataUrl || '/media/sumbar-gold-seal.webp'}
                    alt="Segel 3D aktif"
                    className="w-12 h-12 object-contain rounded-xl bg-[#13120F] p-1.5 border border-[#D4AF37]/40 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold text-[#1B1B4B]">
                      {config.customSealDataUrl
                        ? 'Logo Segel Kustom Aktif'
                        : 'Segel Emas Pemprov Sumatera Barat'}
                    </div>
                    <div className="text-[11px] text-[#757E96]">
                      Efek melayang 3D + kilau emas + pecah saat disentuh
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {config.customSealDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        onChangeConfig({ ...config, customSealDataUrl: '' });
                        jumpPreviewTo('sealed');
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#DDEEF3] bg-white text-[11px] font-semibold text-[#5A647B]"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Default Sumbar</span>
                    </button>
                  )}
                  <input
                    ref={sealImageInputRef}
                    type="file"
                    accept="image/png,image/webp,image/jpeg,.png,.webp,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) =>
                      void handleUploadCustomSeal(e.target.files?.[0])
                    }
                  />
                  <button
                    type="button"
                    disabled={analyzing}
                    onClick={() => sealImageInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1F9B96] text-white text-[11.5px] font-semibold"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Logo</span>
                  </button>
                </div>
              </div>

              {config.showSeal !== false && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="flex-1 min-w-[160px]">
                      <div className="text-[12px] font-semibold text-[#1B1B4B] mb-1.5">
                        Ukuran Segel 3D
                      </div>
                      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F4FBFD] p-1 border border-[#DDEEF3]">
                        {(
                          [
                            { id: 'sm', label: 'Kecil' },
                            { id: 'md', label: 'Sedang' },
                            { id: 'lg', label: 'Besar' },
                          ] as { id: InteractiveSealSize; label: string }[]
                        ).map((sz) => (
                          <button
                            key={sz.id}
                            type="button"
                            onClick={() => {
                              onChangeConfig({ ...config, sealSize: sz.id });
                              jumpPreviewTo('sealed');
                            }}
                            className={`py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors ${
                              (config.sealSize ?? 'md') === sz.id
                                ? 'bg-[#1F9B96] text-white'
                                : 'text-[#5A647B] hover:text-[#1B1B4B]'
                            }`}
                          >
                            {sz.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {((config.sealOffsetX ?? 0) !== 0 ||
                      (config.sealOffsetY ?? 0) !== 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          onChangeConfig({
                            ...config,
                            sealOffsetX: 0,
                            sealOffsetY: 0,
                          });
                          jumpPreviewTo('sealed');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#DDEEF3] bg-[#F4FBFD] text-[11px] font-semibold text-[#157A76]"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Tengah (0, 0)</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label
                        htmlFor="studio-seal-offset-x"
                        className="flex items-center justify-between text-[12px] font-semibold text-[#1B1B4B] mb-1"
                      >
                        <span>Posisi Kiri / Kanan (X)</span>
                        <span className="text-[11px] font-bold text-[#1F9B96] tabular-nums">
                          {(config.sealOffsetX ?? 0) > 0
                            ? `+${config.sealOffsetX}%`
                            : `${config.sealOffsetX ?? 0}%`}
                        </span>
                      </label>
                      <input
                        id="studio-seal-offset-x"
                        type="range"
                        min={-35}
                        max={35}
                        step={1}
                        value={config.sealOffsetX ?? 0}
                        onChange={(e) => {
                          onChangeConfig({
                            ...config,
                            sealOffsetX: Number(e.target.value),
                          });
                          jumpPreviewTo('sealed');
                        }}
                        className="w-full accent-[#1F9B96]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="studio-seal-offset-y"
                        className="flex items-center justify-between text-[12px] font-semibold text-[#1B1B4B] mb-1"
                      >
                        <span>Posisi Atas / Bawah (Y)</span>
                        <span className="text-[11px] font-bold text-[#1F9B96] tabular-nums">
                          {(config.sealOffsetY ?? 0) > 0
                            ? `+${config.sealOffsetY}%`
                            : `${config.sealOffsetY ?? 0}%`}
                        </span>
                      </label>
                      <input
                        id="studio-seal-offset-y"
                        type="range"
                        min={-35}
                        max={35}
                        step={1}
                        value={config.sealOffsetY ?? 0}
                        onChange={(e) => {
                          onChangeConfig({
                            ...config,
                            sealOffsetY: Number(e.target.value),
                          });
                          jumpPreviewTo('sealed');
                        }}
                        className="w-full accent-[#1F9B96]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GAYA, FONT & POSISI PANEL */}
          {sectionTab === 'style' && (
            <div className="rounded-[20px] border border-[#E5F1F5] bg-white p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#1F9B96]" />
                  <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
                    Tema, Font & Posisi Panel
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyStylePreset('dinas')}
                    className="px-2.5 py-1 rounded-full border border-[#DDEEF3] bg-[#F4FBFD] hover:bg-[#E3F5FA] text-[11px] font-semibold text-[#1B1B4B]"
                  >
                    Preset Dinas
                  </button>
                  <button
                    type="button"
                    onClick={() => applyStylePreset('adat')}
                    className="px-2.5 py-1 rounded-full border border-[#F3D34F]/70 bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[11px] font-semibold text-[#6E5108]"
                  >
                    Preset Adat
                  </button>
                  <button
                    type="button"
                    onClick={() => applyStylePreset('gala')}
                    className="px-2.5 py-1 rounded-full border border-[#DDEEF3] bg-[#F4FBFD] hover:bg-[#E3F5FA] text-[11px] font-semibold text-[#1B1B4B]"
                  >
                    Preset Gala
                  </button>
                </div>
              </div>

              {/* Theme Swatches */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(
                  [
                    {
                      id: 'gold-dark',
                      label: 'Black & Gold',
                      swatch: 'bg-[#13120F] border-[#D4AF37] text-[#FCE9B2]',
                    },
                    {
                      id: 'emerald-light',
                      label: 'Zamrud Terang',
                      swatch: 'bg-[#F4FBFD] border-[#1F9B96] text-[#157A76]',
                    },
                    {
                      id: 'navy-gold',
                      label: 'Navy Gala',
                      swatch: 'bg-[#0E162B] border-[#E8C56E] text-[#F3D88B]',
                    },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onChangeConfig({ ...config, theme: t.id })}
                    className={`px-3 py-2 rounded-xl border text-[12px] font-bold flex items-center justify-between ${t.swatch} ${
                      config.theme === t.id
                        ? 'ring-2 ring-[#1F9B96]'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                  >
                    <span>{t.label}</span>
                    {config.theme === t.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>

              {/* Font Pairings */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    {
                      id: 'modern',
                      label: 'Modern',
                      sample: 'Manrope',
                      fontFamily: "'Manrope', sans-serif",
                    },
                    {
                      id: 'classic',
                      label: 'Klasik',
                      sample: 'Playfair',
                      fontFamily: "'Playfair Display', serif",
                    },
                    {
                      id: 'ceremonial',
                      label: 'Adat',
                      sample: 'Cinzel',
                      fontFamily: "'Cinzel', serif",
                    },
                    {
                      id: 'editorial',
                      label: 'Editorial',
                      sample: 'Cormorant',
                      fontFamily: "'Cormorant Garamond', serif",
                    },
                  ] as {
                    id: InteractiveFontPreset;
                    label: string;
                    sample: string;
                    fontFamily: string;
                  }[]
                ).map((f) => {
                  const active = (config.fontPreset ?? 'modern') === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onChangeConfig({ ...config, fontPreset: f.id })}
                      className={`p-2 rounded-xl border text-left ${
                        active
                          ? 'border-[#1F9B96] bg-[#DCF5F1]/60 ring-2 ring-[#1F9B96]/15'
                          : 'border-[#E5F1F5] bg-white hover:border-[#B5E4F1]'
                      }`}
                    >
                      <div
                        style={{ fontFamily: f.fontFamily }}
                        className="text-[13.5px] font-bold text-[#1B1B4B]"
                      >
                        Aa · {f.label}
                      </div>
                      <div className="text-[10.5px] text-[#757E96]">{f.sample}</div>
                    </button>
                  );
                })}
              </div>

              {/* Text Scale, Box Style & Alignment */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <div className="text-[11.5px] font-semibold text-[#1B1B4B] mb-1">
                    Skala Teks Global
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F4FBFD] p-1 border border-[#DDEEF3]">
                    {(
                      [
                        { id: 'sm', label: 'Kecil' },
                        { id: 'md', label: 'Normal' },
                        { id: 'lg', label: 'Besar' },
                      ] as { id: InteractiveTextScale; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onChangeConfig({ ...config, textScale: opt.id })
                        }
                        className={`py-1 rounded-lg text-[11px] font-semibold ${
                          (config.textScale ?? 'md') === opt.id
                            ? 'bg-[#1F9B96] text-white'
                            : 'text-[#5A647B]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11.5px] font-semibold text-[#1B1B4B] mb-1">
                    Gaya Kotak Panel
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F4FBFD] p-1 border border-[#DDEEF3]">
                    {(
                      [
                        { id: 'solid', label: 'Gelap' },
                        { id: 'glass', label: 'Kaca' },
                        { id: 'minimal', label: 'Polos' },
                      ] as { id: InteractiveCardStyle; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onChangeConfig({ ...config, cardStyle: opt.id })
                        }
                        className={`py-1 rounded-lg text-[11px] font-semibold ${
                          (config.cardStyle ?? 'solid') === opt.id
                            ? 'bg-[#1F9B96] text-white'
                            : 'text-[#5A647B]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11.5px] font-semibold text-[#1B1B4B] mb-1">
                    Perataan Teks
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#F4FBFD] p-1 border border-[#DDEEF3]">
                    {(
                      [
                        { id: 'center', label: 'Tengah' },
                        { id: 'left', label: 'Kiri' },
                      ] as { id: InteractiveTextAlign; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onChangeConfig({ ...config, textAlign: opt.id })
                        }
                        className={`py-1 rounded-lg text-[11px] font-semibold ${
                          (config.textAlign ?? 'center') === opt.id
                            ? 'bg-[#1F9B96] text-white'
                            : 'text-[#5A647B]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Safe-Zone Panel Position & Overlay Darkness */}
              <div className="rounded-2xl border border-[#E5F1F5] bg-[#FAFEFD] p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <div>
                  <div className="text-[11.5px] font-semibold text-[#1B1B4B] mb-1">
                    Posisi Vertikal Panel
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 border border-[#DDEEF3]">
                    {(
                      [
                        { id: 'top', label: 'Atas' },
                        { id: 'center', label: 'Tengah' },
                        { id: 'bottom', label: 'Bawah' },
                      ] as { id: InteractiveVerticalAlign; label: string }[]
                    ).map((pos) => (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() =>
                          onChangeConfig({ ...config, panelPosition: pos.id })
                        }
                        className={`py-1 rounded-lg text-[11px] font-semibold ${
                          (config.panelPosition ?? 'center') === pos.id
                            ? 'bg-[#1F9B96] text-white'
                            : 'text-[#5A647B]'
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="studio-panel-offset"
                    className="flex items-center justify-between text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                  >
                    <span>Geser Halus</span>
                    <span className="text-[11px] font-bold text-[#1F9B96] tabular-nums">
                      {(config.panelOffsetY ?? 0) > 0
                        ? `+${config.panelOffsetY}%`
                        : `${config.panelOffsetY ?? 0}%`}
                    </span>
                  </label>
                  <input
                    id="studio-panel-offset"
                    type="range"
                    min={-15}
                    max={15}
                    step={1}
                    value={config.panelOffsetY ?? 0}
                    onChange={(e) =>
                      onChangeConfig({
                        ...config,
                        panelOffsetY: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#1F9B96]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="studio-overlay-darkness"
                    className="flex items-center justify-between text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                  >
                    <span>Gelap Latar</span>
                    <span className="text-[11px] font-bold text-[#1F9B96] tabular-nums">
                      {config.overlayDarkness ?? 60}%
                    </span>
                  </label>
                  <input
                    id="studio-overlay-darkness"
                    type="range"
                    min={20}
                    max={90}
                    step={5}
                    value={config.overlayDarkness ?? 60}
                    onChange={(e) =>
                      onChangeConfig({
                        ...config,
                        overlayDarkness: Number(e.target.value),
                      })
                    }
                    className="w-full accent-[#1F9B96]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SLIDE, TEKS, UKURAN BOX, DURASI & INFO ACARA */}
          {sectionTab === 'slides' && (
            <div className="rounded-[20px] border border-[#E5F1F5] bg-white p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#1F9B96]" />
                  <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
                    Edit Teks, Ukuran Box & Durasi Per Slide
                  </h3>
                </div>
                <div className="grid grid-cols-4 gap-1 rounded-xl bg-[#F4FBFD] p-1 border border-[#DDEEF3] w-full sm:w-auto">
                  {(
                    [
                      { id: 'cover', label: 'Sampul', phase: 'sealed' as const },
                      {
                        id: 'slide1',
                        label: 'Slide 1',
                        phase: 'story' as const,
                        slide: 0 as const,
                      },
                      {
                        id: 'slide2',
                        label: 'Slide 2',
                        phase: 'story' as const,
                        slide: 1 as const,
                      },
                      {
                        id: 'slide3',
                        label: 'RSVP',
                        phase: 'story' as const,
                        slide: 2 as const,
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTextSlideTab(tab.id);
                        jumpPreviewTo(
                          tab.phase,
                          'slide' in tab ? tab.slide : undefined
                        );
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        activeTextSlideTab === tab.id
                          ? 'bg-[#1F9B96] text-white'
                          : 'text-[#5A647B] hover:text-[#1B1B4B]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Slide Controls */}
              <div className="rounded-2xl border border-[#E5F1F5] bg-[#FAFEFD] p-3.5 space-y-3">
                {activeTextSlideTab === 'cover' && (
                  <>
                    {renderPanelScaleBar('cover', 'Sampul')}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label
                            htmlFor="studio-cover-badge"
                            className="text-[11.5px] font-semibold text-[#1B1B4B]"
                          >
                            Label Atas Sampul
                          </label>
                          {renderSizeStepper('coverBadge', 'Label Atas', 8, 18)}
                        </div>
                        <input
                          id="studio-cover-badge"
                          type="text"
                          maxLength={60}
                          value={config.coverBadge}
                          onChange={(e) =>
                            onChangeConfig({ ...config, coverBadge: e.target.value })
                          }
                          placeholder="Undangan Resmi"
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label
                            htmlFor="studio-open-btn"
                            className="text-[11.5px] font-semibold text-[#1B1B4B]"
                          >
                            Teks Tombol Pembuka
                          </label>
                          {renderSizeStepper(
                            'openButtonText',
                            'Tombol Pembuka',
                            10,
                            18
                          )}
                        </div>
                        <input
                          id="studio-open-btn"
                          type="text"
                          maxLength={60}
                          value={config.openButtonText}
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              openButtonText: e.target.value,
                            })
                          }
                          placeholder="Sentuh Segel untuk Membuka"
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                        />
                      </div>
                    </div>
                  </>
                )}

                {activeTextSlideTab === 'slide1' && (
                  <>
                    {renderPanelScaleBar('slide1', 'Slide 1')}

                    {/* 1:1 Auto-Compressed Slide 1 Image Uploader */}
                    <div className="rounded-xl border border-dashed border-[#B5E4F1] bg-white p-3 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11.5px] font-bold text-[#1B1B4B]">
                            Gambar Slide 1 (Rasio 1:1 · Auto Kompres)
                          </div>
                          <div className="text-[10.5px] text-[#757E96]">
                            {config.slide1BannerDataUrl
                              ? `Aktif · ~${Math.max(1, Math.round((config.slide1BannerDataUrl.length * 3) / 4 / 1024))} KB ${config.slide1BannerDataUrl.startsWith('data:image/png') ? 'PNG Transparan' : 'WebP'} (1:1 · hemat kuota Firebase)`
                              : 'Mendukung JPG & PNG (transparan/solid) beresolusi 1:1. Tampil di bawah nama acara.'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {config.slide1BannerDataUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                onChangeConfig({
                                  ...config,
                                  slide1BannerDataUrl: '',
                                });
                                jumpPreviewTo('story', 0);
                              }}
                              aria-label="Hapus gambar Slide 1"
                              className="p-1.5 rounded-full text-[#757E96] hover:text-[#B83B5E] hover:bg-[#FDE8EE]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <input
                            ref={slide1BannerInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                            className="hidden"
                            onChange={(e) =>
                              void handleUploadSlide1Banner(e.target.files?.[0])
                            }
                          />
                          <button
                            type="button"
                            disabled={analyzing}
                            onClick={() => slide1BannerInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[11px] font-semibold disabled:opacity-50"
                          >
                            {analyzing ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Upload className="w-3 h-3" />
                            )}
                            <span>
                              {config.slide1BannerDataUrl
                                ? 'Ganti Gambar'
                                : 'Upload Gambar 1:1'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {config.slide1BannerDataUrl && (
                        <div className="w-36 sm:w-40 aspect-square mx-auto rounded-lg overflow-hidden border border-[#DDEEF3] bg-[#0E0E10]">
                          <img
                            src={config.slide1BannerDataUrl}
                            alt="Pratinjau gambar Slide 1 (1:1)"
                            className={`w-full h-full block ${
                              config.slide1BannerDataUrl.startsWith('data:image/png')
                                ? 'object-contain p-1'
                                : 'object-cover'
                            }`}
                          />
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div className="sm:col-span-2">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label
                            htmlFor="studio-slide1-heading"
                            className="text-[11.5px] font-semibold text-[#1B1B4B]"
                          >
                            Kalimat Pembuka Atas
                          </label>
                          {renderSizeStepper(
                            'slide1Heading',
                            'Pembuka Atas',
                            8,
                            18
                          )}
                        </div>
                        <input
                          id="studio-slide1-heading"
                          type="text"
                          maxLength={80}
                          value={
                            config.slide1Heading ??
                            DEFAULT_INTERACTIVE_CONFIG.slide1Heading
                          }
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              slide1Heading: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="studio-slide1-dur"
                          className="block text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                        >
                          Durasi Slide 1
                        </label>
                        <select
                          id="studio-slide1-dur"
                          value={config.slide1DurationSec ?? 5}
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              slide1DurationSec: Number(e.target.value),
                              slideDurationSec: Number(e.target.value),
                            })
                          }
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-2.5 py-2 text-[12px] font-medium text-[#1B1B4B]"
                        >
                          <option value={3}>3 detik</option>
                          <option value={5}>5 detik</option>
                          <option value={7}>7 detik</option>
                          <option value={10}>10 detik</option>
                          <option value={0}>Manual</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label
                          htmlFor="studio-welcome-note"
                          className="text-[11.5px] font-semibold text-[#1B1B4B]"
                        >
                          Kalimat Sambutan Bawah
                        </label>
                        {renderSizeStepper('welcomeNote', 'Sambutan', 9, 18)}
                      </div>
                      <textarea
                        id="studio-welcome-note"
                        rows={2}
                        maxLength={300}
                        value={config.welcomeNote}
                        onChange={(e) =>
                          onChangeConfig({ ...config, welcomeNote: e.target.value })
                        }
                        className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                      />
                    </div>
                  </>
                )}

                {activeTextSlideTab === 'slide2' && (
                  <>
                    {renderPanelScaleBar('slide2', 'Slide 2')}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div className="sm:col-span-2">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label
                            htmlFor="studio-slide2-heading"
                            className="text-[11.5px] font-semibold text-[#1B1B4B]"
                          >
                            Judul Bagian Slide 2
                          </label>
                          {renderSizeStepper(
                            'slide2Heading',
                            'Judul Slide 2',
                            8,
                            18
                          )}
                        </div>
                        <input
                          id="studio-slide2-heading"
                          type="text"
                          maxLength={80}
                          value={
                            config.slide2Heading ??
                            DEFAULT_INTERACTIVE_CONFIG.slide2Heading
                          }
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              slide2Heading: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="studio-slide2-dur"
                          className="block text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                        >
                          Durasi Slide 2
                        </label>
                        <select
                          id="studio-slide2-dur"
                          value={config.slide2DurationSec ?? 8}
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              slide2DurationSec: Number(e.target.value),
                            })
                          }
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-2.5 py-2 text-[12px] font-medium text-[#1B1B4B]"
                        >
                          <option value={5}>5 detik</option>
                          <option value={8}>8 detik</option>
                          <option value={12}>12 detik</option>
                          <option value={15}>15 detik</option>
                          <option value={0}>Manual</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label
                          htmlFor="studio-slide2-extra"
                          className="text-[11.5px] font-semibold text-[#1B1B4B]"
                        >
                          Catatan / Agenda Tambahan (Opsional)
                        </label>
                        {renderSizeStepper(
                          'slide2ExtraNote',
                          'Catatan Slide 2',
                          9,
                          18
                        )}
                      </div>
                      <textarea
                        id="studio-slide2-extra"
                        rows={2}
                        maxLength={240}
                        value={config.slide2ExtraNote ?? ''}
                        onChange={(e) =>
                          onChangeConfig({
                            ...config,
                            slide2ExtraNote: e.target.value,
                          })
                        }
                        placeholder="Contoh: Registrasi dibuka 30 menit sebelum acara."
                        className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="studio-dresscode"
                          className="block text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                        >
                          Dresscode / Pakaian
                        </label>
                        <input
                          id="studio-dresscode"
                          type="text"
                          value={config.dresscode}
                          onChange={(e) =>
                            onChangeConfig({ ...config, dresscode: e.target.value })
                          }
                          placeholder="Contoh: Batik / Pakaian Nasional"
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="studio-maps-url"
                          className="block text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                        >
                          Link Google Maps Presisi
                        </label>
                        <input
                          id="studio-maps-url"
                          type="url"
                          value={config.mapsUrl}
                          onChange={(e) =>
                            onChangeConfig({ ...config, mapsUrl: e.target.value })
                          }
                          placeholder="https://maps.app.goo.gl/..."
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="studio-contact-name"
                          className="block text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                        >
                          Nama Narahubung / LO (Opsional)
                        </label>
                        <input
                          id="studio-contact-name"
                          type="text"
                          value={config.contactName ?? ''}
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              contactName: e.target.value,
                            })
                          }
                          placeholder="Contoh: Ibu Rina (Protokol)"
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="studio-contact-phone"
                          className="block text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                        >
                          No. WhatsApp Narahubung
                        </label>
                        <input
                          id="studio-contact-phone"
                          type="tel"
                          value={config.contactPhone ?? ''}
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              contactPhone: e.target.value,
                            })
                          }
                          placeholder="081234567890"
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 pt-1">
                      <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#1B1B4B] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.showCountdown}
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              showCountdown: e.target.checked,
                            })
                          }
                          className="w-4 h-4 accent-[#1F9B96] rounded"
                        />
                        <span>Hitung Mundur</span>
                      </label>
                      <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#1B1B4B] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.showCalendarButton !== false}
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              showCalendarButton: e.target.checked,
                            })
                          }
                          className="w-4 h-4 accent-[#1F9B96] rounded"
                        />
                        <span>Tombol Kalender</span>
                      </label>
                    </div>
                  </>
                )}

                {activeTextSlideTab === 'slide3' && (
                  <>
                    {renderPanelScaleBar('slide3', 'Slide 3 RSVP')}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label
                            htmlFor="studio-slide3-heading"
                            className="text-[11.5px] font-semibold text-[#1B1B4B]"
                          >
                            Judul Form RSVP
                          </label>
                          {renderSizeStepper(
                            'slide3Heading',
                            'Judul Form RSVP',
                            11,
                            24
                          )}
                        </div>
                        <input
                          id="studio-slide3-heading"
                          type="text"
                          maxLength={80}
                          value={
                            config.slide3Heading ??
                            DEFAULT_INTERACTIVE_CONFIG.slide3Heading
                          }
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              slide3Heading: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label
                            htmlFor="studio-slide3-success-title"
                            className="text-[11.5px] font-semibold text-[#1B1B4B]"
                          >
                            Judul Setelah Terkirim
                          </label>
                          {renderSizeStepper(
                            'slide3SuccessTitle',
                            'Judul Terkirim',
                            11,
                            24
                          )}
                        </div>
                        <input
                          id="studio-slide3-success-title"
                          type="text"
                          maxLength={80}
                          value={
                            config.slide3SuccessTitle ??
                            DEFAULT_INTERACTIVE_CONFIG.slide3SuccessTitle
                          }
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              slide3SuccessTitle: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label
                          htmlFor="studio-slide3-success-note"
                          className="text-[11.5px] font-semibold text-[#1B1B4B]"
                        >
                          Pesan Terima Kasih Setelah RSVP
                        </label>
                        {renderSizeStepper(
                          'slide3SuccessNote',
                          'Pesan Terima Kasih',
                          9,
                          18
                        )}
                      </div>
                      <textarea
                        id="studio-slide3-success-note"
                        rows={2}
                        maxLength={240}
                        value={
                          config.slide3SuccessNote ??
                          DEFAULT_INTERACTIVE_CONFIG.slide3SuccessNote
                        }
                        onChange={(e) =>
                          onChangeConfig({
                            ...config,
                            slide3SuccessNote: e.target.value,
                          })
                        }
                        className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: GENERATE LINK VIDEO PER TAMU & EKSPOR MASSAL */}
          {sectionTab === 'links' && (
            <div className="rounded-[20px] border border-[#E5F1F5] bg-white p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
                    Generate Link Video Masing-Masing Tamu ({recipients.length})
                  </h3>
                  <p className="text-[11.5px] text-[#757E96]">
                    Setiap tamu mendapat tautan personal dengan nama & instansi otomatis.
                  </p>
                </div>

                {cloudConfigured && (
                  <button
                    type="button"
                    disabled={publishing}
                    onClick={() => void handlePublishToCloud()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[12px] font-bold disabled:opacity-50"
                  >
                    {publishing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CloudUpload className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {publishedAt ? 'Perbarui Cloud' : 'Terbitkan ke Cloud'}
                    </span>
                  </button>
                )}
              </div>

              {/* Bulk Generate Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={exportingLinks || recipients.length === 0}
                  onClick={() => void handleExportAllLinksExcel()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#F9DE6C] hover:bg-[#F3D34F] text-[#1B1B4B] text-[12.5px] font-extrabold transition-colors disabled:opacity-50"
                >
                  {exportingLinks ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Generate & Unduh Excel Semua Link (.xlsx)</span>
                </button>

                <button
                  type="button"
                  disabled={recipients.length === 0}
                  onClick={() => void handleCopyAllGuestLinks()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border border-[#DDEEF3] bg-[#F4FBFD] hover:bg-[#E3F5FA] text-[#1B1B4B] text-[12.5px] font-bold transition-colors disabled:opacity-50"
                >
                  <Copy className="w-4 h-4 text-[#1F9B96]" />
                  <span>Salin Semua Link ({recipients.length} Tamu)</span>
                </button>
              </div>

              {/* Search Guest List */}
              <div className="relative">
                <Search className="w-4 h-4 text-[#757E96] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={guestLinkSearch}
                  onChange={(e) => setGuestLinkSearch(e.target.value)}
                  placeholder="Cari nama tamu, instansi, atau kode..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#DDEEF3] bg-[#FAFEFD] text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                />
              </div>

              {/* Per-Guest Individual Video Link List */}
              <div className="max-h-[320px] overflow-y-auto overscroll-contain divide-y divide-[#EDF5F8] rounded-2xl border border-[#E5F1F5]">
                {filteredGuestLinks.length === 0 ? (
                  <div className="p-6 text-center text-[12px] text-[#757E96]">
                    {recipients.length === 0
                      ? 'Belum ada tamu di Tahap 2 (Daftar Penerima).'
                      : 'Tidak ada tamu yang cocok dengan pencarian.'}
                  </div>
                ) : (
                  filteredGuestLinks.map((rec) => {
                    const isPreviewed = rec.id === previewRecipient.id;
                    const justCopied = copiedGuestId === rec.id;
                    return (
                      <div
                        key={rec.id}
                        className={`p-3 flex flex-wrap items-center justify-between gap-2 transition-colors ${
                          isPreviewed ? 'bg-[#F4FBFD]' : 'bg-white hover:bg-[#FAFEFD]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12.5px] font-bold text-[#1B1B4B] truncate">
                              {rec.recipientName}
                            </span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EDF5F8] text-[#5A647B] shrink-0">
                              {rec.invitationCode}
                            </span>
                          </div>
                          {rec.institution && (
                            <div className="text-[11px] text-[#757E96] truncate">
                              {rec.institution}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectPreviewRecipient(rec.id);
                              setMobilePane('preview');
                            }}
                            title="Lihat di Pratinjau HP"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-[#DDEEF3] bg-white hover:bg-[#F4FBFD] text-[11px] font-semibold text-[#1B1B4B]"
                          >
                            <ExternalLink className="w-3 h-3 text-[#1F9B96]" />
                            <span>Lihat</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleCopyGuestLink(rec)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                              justCopied
                                ? 'bg-[#DCF5F1] text-[#157A76]'
                                : 'border border-[#DDEEF3] bg-white hover:bg-[#F4FBFD] text-[#1B1B4B]'
                            }`}
                          >
                            {justCopied ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Copy className="w-3 h-3 text-[#1F9B96]" />
                            )}
                            <span>{justCopied ? 'Tersalin' : 'Link'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleOpenGuestWhatsApp(rec)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[11px] font-semibold"
                          >
                            <Send className="w-3 h-3" />
                            <span>WA</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Compact WhatsApp Template Editor */}
              <div className="pt-2 border-t border-[#EDF5F8]">
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="studio-wa-template"
                    className="text-[11.5px] font-semibold text-[#1B1B4B]"
                  >
                    Template Pesan WhatsApp Otomatis
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConfig({
                        ...config,
                        whatsappTemplate:
                          DEFAULT_INTERACTIVE_CONFIG.whatsappTemplate,
                      })
                    }
                    className="text-[11px] font-semibold text-[#1F9B96] hover:underline"
                  >
                    Reset Default
                  </button>
                </div>
                <textarea
                  id="studio-wa-template"
                  rows={3}
                  value={config.whatsappTemplate}
                  onChange={(e) =>
                    onChangeConfig({ ...config, whatsappTemplate: e.target.value })
                  }
                  className="w-full rounded-xl border border-[#DDEEF3] px-3 py-2 text-[11.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                />
                <p className="text-[10.5px] text-[#757E96] mt-1">
                  Variabel: <code>{'{sapaan}'}</code>, <code>{'{nama}'}</code>,{' '}
                  <code>{'{instansi}'}</code>, <code>{'{acara}'}</code>,{' '}
                  <code>{'{tanggal}'}</code>, <code>{'{waktu}'}</code>,{' '}
                  <code>{'{lokasi}'}</code>, <code>{'{link}'}</code>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Live 9:18 Android Smartphone Preview */}
        <div
          className={`xl:col-span-5 xl:sticky xl:top-4 rounded-[20px] sm:rounded-[24px] border border-[#E5F1F5] bg-[#F4FBFD] p-3 sm:p-4 space-y-3 ${
            mobilePane === 'editor' ? 'hidden xl:block' : 'block'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[12.5px] font-display font-bold text-[#1B1B4B]">
              Pratinjau Langsung (Layar HP)
            </div>
            <RecipientPickerDropdown
              recipients={recipients}
              selectedRecipient={previewRecipient}
              onSelect={(r) => onSelectPreviewRecipient(r.id)}
              align="right"
              maxWidthClass="max-w-[180px] min-w-[130px]"
              ariaLabel="Pilih penerima untuk pratinjau video interaktif"
            />
          </div>

          {/* Quick Phase Jump Bar */}
          <div
            className="grid grid-cols-5 gap-1 rounded-2xl bg-white p-1 border border-[#DDEEF3]"
            aria-label="Lompat fase pratinjau"
          >
            {[
              { label: 'Sampul', phase: 'sealed' as const },
              { label: 'Animasi 3D', phase: 'opening' as const },
              { label: 'Slide 1', phase: 'story' as const, slide: 0 as const },
              { label: 'Slide 2', phase: 'story' as const, slide: 1 as const },
              { label: 'RSVP', phase: 'story' as const, slide: 2 as const },
            ].map((btn) => (
              <button
                key={btn.label}
                type="button"
                onClick={() => jumpPreviewTo(btn.phase, btn.slide)}
                className="py-1.5 px-1 rounded-xl text-[11px] font-semibold text-[#1B1B4B] hover:bg-[#DCF5F1] hover:text-[#157A76] active:scale-95 transition-all truncate"
              >
                {btn.label}
              </button>
            ))}
          </div>

          <InteractiveInvitePage
            key={`${previewKey}-${previewRecipient.id}`}
            embeddedPreview
            previewJumpTarget={previewJumpTarget}
            config={config}
            payload={{
              eventId,
              invitationCode: previewRecipient.invitationCode,
              salutation: previewRecipient.salutation,
              recipientName: previewRecipient.recipientName,
              institution: previewRecipient.institution,
              eventName: metadata.eventName,
              date: metadata.date,
              time: metadata.time,
              location: metadata.location,
              organizer: metadata.organizer,
            }}
            initialStatus={previewRecipient.rsvpStatus}
            initialRepresentative={previewRecipient.rsvpRepresentative}
            initialNote={previewRecipient.rsvpNote}
            initialSubmittedAt={previewRecipient.rsvpAt}
            onSubmitRsvp={() => {
              onNotify?.(
                'Simulasi RSVP di pratinjau berhasil! (Data pratinjau tidak mengubah statistik asli.)',
                'success'
              );
            }}
          />
        </div>
      </div>
    </div>
  );
};
