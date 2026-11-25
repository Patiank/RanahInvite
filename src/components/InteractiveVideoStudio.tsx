import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Film,
  Image as ImageIcon,
  Link2,
  Loader2,
  Moon,
  MousePointerClick,
  Music,
  Palette,
  Play,
  RotateCcw,
  Shield,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Upload,
  Volume2,
} from 'lucide-react';
import {
  DEFAULT_INTERACTIVE_CONFIG,
  DEFAULT_PANEL_SCALES,
  DEFAULT_SLIDE_EXTRAS,
  DEFAULT_SLIDE_TEXT_SIZES,
  EventMetadata,
  InteractiveCardStyle,
  InteractiveImageAnimation,
  InteractiveInviteConfig,
  InteractivePanelBlur,
  InteractivePanelBorderStyle,
  InteractivePanelPadding,
  InteractivePanelRadius,
  InteractivePanelScales,
  InteractiveSealSize,
  InteractiveSlideExtras,
  InteractiveSlideTextSizes,
  InteractiveTextAlign,
  InteractiveTextScale,
  InteractiveTextShadow,
  InteractiveThemeId,
  InteractiveVerticalAlign,
  PerSlideStyleOverride,
  Recipient,
} from '../types';
import {
  isFirestoreRsvpConfigured,
  publishGuestInvitesToCloud,
  publishInviteConfigToCloud,
} from '../utils/firebaseRsvp';
import { compressAudioForInvite, isAudioFile } from '../utils/audioCompressor';
import {
  STUDIO_FONTS,
  ensureAllStudioFontsLoaded,
  getStudioFontCssFamily,
} from '../utils/fonts';
import {
  InteractiveInvitePage,
  PreviewDirectDragPatch,
  PreviewEditTarget,
  PreviewJumpTarget,
  getHexContrastRatio,
  getRelativeLuminance,
} from './InteractiveInvitePage';
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
  onOpenGuestLinks?: () => void;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
}

type StudioSectionTab = 'media' | 'seal' | 'style' | 'slides';
type SurfaceToneMode = 'dark' | 'light';

interface SurfacePalettePreset {
  id: string;
  mode: SurfaceToneMode;
  label: string;
  swatchBg: string;
  swatchAccent: string;
  theme: InteractiveThemeId;
  titleColor: string;
  bodyColor: string;
  accentColor: string;
  panelBgColor: string;
  panelOpacity: number;
  panelBorderColor: string;
  panelBorderStyle: InteractivePanelBorderStyle;
  buttonColor: string;
  buttonTextColor: string;
  secondaryButtonColor: string;
  secondaryButtonTextColor: string;
  textShadow: InteractiveTextShadow;
  overlayDarkness: number;
  coverOverlayDarkness: number;
}

const SURFACE_PALETTES: SurfacePalettePreset[] = [
  {
    id: 'dark-gold',
    mode: 'dark',
    label: 'Hitam Emas',
    swatchBg: '#13120F',
    swatchAccent: '#F3D88B',
    theme: 'gold-dark',
    titleColor: '#F3D88B',
    bodyColor: '#FDFBF7',
    accentColor: '#E6C775',
    panelBgColor: '#13120F',
    panelOpacity: 82,
    panelBorderColor: '#D4AF37',
    panelBorderStyle: 'thin',
    buttonColor: '#DFB454',
    buttonTextColor: '#151109',
    secondaryButtonColor: '#1B1811',
    secondaryButtonTextColor: '#FCE9B2',
    textShadow: 'soft',
    overlayDarkness: 55,
    coverOverlayDarkness: 0,
  },
  {
    id: 'dark-navy',
    mode: 'dark',
    label: 'Navy Emas',
    swatchBg: '#0E162B',
    swatchAccent: '#E8C56E',
    theme: 'navy-gold',
    titleColor: '#F5DF98',
    bodyColor: '#F8FAFC',
    accentColor: '#E8C56E',
    panelBgColor: '#0E162B',
    panelOpacity: 84,
    panelBorderColor: '#E8C56E',
    panelBorderStyle: 'thin',
    buttonColor: '#E8C56E',
    buttonTextColor: '#0E162B',
    secondaryButtonColor: '#162344',
    secondaryButtonTextColor: '#F5DF98',
    textShadow: 'soft',
    overlayDarkness: 55,
    coverOverlayDarkness: 0,
  },
  {
    id: 'dark-mono',
    mode: 'dark',
    label: 'Hitam Minimalis',
    swatchBg: '#111114',
    swatchAccent: '#FFFFFF',
    theme: 'gold-dark',
    titleColor: '#FFFFFF',
    bodyColor: '#F1F5F9',
    accentColor: '#CBD5E1',
    panelBgColor: '#111114',
    panelOpacity: 82,
    panelBorderColor: '#64748B',
    panelBorderStyle: 'thin',
    buttonColor: '#FFFFFF',
    buttonTextColor: '#111114',
    secondaryButtonColor: '#1E1E24',
    secondaryButtonTextColor: '#F8FAFC',
    textShadow: 'soft',
    overlayDarkness: 55,
    coverOverlayDarkness: 0,
  },
  {
    id: 'light-gold',
    mode: 'light',
    label: 'Putih Emas',
    swatchBg: '#FFFFFF',
    swatchAccent: '#8A5A10',
    theme: 'emerald-light',
    titleColor: '#151109',
    bodyColor: '#1E293B',
    accentColor: '#8A5A10',
    panelBgColor: '#FFFFFF',
    panelOpacity: 86,
    panelBorderColor: '#D4AF37',
    panelBorderStyle: 'thin',
    buttonColor: '#151109',
    buttonTextColor: '#FCE9B2',
    secondaryButtonColor: '#FFFFFF',
    secondaryButtonTextColor: '#151109',
    textShadow: 'none',
    overlayDarkness: 35,
    coverOverlayDarkness: 0,
  },
  {
    id: 'light-teal',
    mode: 'light',
    label: 'Putih Tosca',
    swatchBg: '#FFFFFF',
    swatchAccent: '#1F9B96',
    theme: 'emerald-light',
    titleColor: '#1B1B4B',
    bodyColor: '#1E293B',
    accentColor: '#157A76',
    panelBgColor: '#FFFFFF',
    panelOpacity: 88,
    panelBorderColor: '#9FE2D7',
    panelBorderStyle: 'thin',
    buttonColor: '#1F9B96',
    buttonTextColor: '#FFFFFF',
    secondaryButtonColor: '#FFFFFF',
    secondaryButtonTextColor: '#157A76',
    textShadow: 'none',
    overlayDarkness: 35,
    coverOverlayDarkness: 0,
  },
  {
    id: 'light-cream',
    mode: 'light',
    label: 'Krem Navy',
    swatchBg: '#FFFBF0',
    swatchAccent: '#1B1B4B',
    theme: 'emerald-light',
    titleColor: '#1B1B4B',
    bodyColor: '#292524',
    accentColor: '#9A6B16',
    panelBgColor: '#FFFBF0',
    panelOpacity: 88,
    panelBorderColor: '#D6B872',
    panelBorderStyle: 'thin',
    buttonColor: '#1B1B4B',
    buttonTextColor: '#FFFBF0',
    secondaryButtonColor: '#FFFBF0',
    secondaryButtonTextColor: '#1B1B4B',
    textShadow: 'none',
    overlayDarkness: 30,
    coverOverlayDarkness: 0,
  },
];

async function detectImageSrcTone(src: string): Promise<SurfaceToneMode | null> {
  if (!src) return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image load failed'));
      el.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 48, 48);
    const data = ctx.getImageData(0, 0, 48, 48).data;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 16) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      count += 1;
    }
    const avg = count > 0 ? sum / count : 60;
    return avg > 145 ? 'light' : 'dark';
  } catch {
    return null;
  }
}

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
    const isLandscapeBg = maxWidth >= 500 && natW > natH;
    const scale = isLandscapeBg
      ? Math.min(1, 960 / natW, 560 / natH)
      : Math.min(1, maxWidth / natW);
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

async function compressSlide1Image(
  file: File,
  targetW = 540,
  targetH = 360,
  maxDataUrlLen = 78000
): Promise<{ dataUrl: string; sizeKb: number; format: 'PNG' | 'WebP' | 'JPEG' }> {
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
    const targetRatio = targetW / targetH; // 1.5:1 (3:2)
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
        // Contain-fit transparent PNG cleanly inside 1.5:1 without cropping any graphic edge
        const fitScale = Math.min(cw / srcW, ch / srcH);
        const dw = Math.max(1, Math.round(srcW * fitScale));
        const dh = Math.max(1, Math.round(srcH * fitScale));
        const dx = Math.round((cw - dw) / 2);
        const dy = Math.round((ch - dh) / 2);
        cctx.drawImage(img, dx, dy, dw, dh);
      } else {
        // Center-crop opaque photos cleanly to exact 1.5:1 (3:2) aspect ratio without stretching
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
  onOpenGuestLinks,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const coverImageInputRef = useRef<HTMLInputElement | null>(null);
  const openImageInputRef = useRef<HTMLInputElement | null>(null);
  const sealImageInputRef = useRef<HTMLInputElement | null>(null);
  const slide1BannerInputRef = useRef<HTMLInputElement | null>(null);
  const bgAudioInputRef = useRef<HTMLInputElement | null>(null);

  const [sectionTab, setSectionTab] = useState<StudioSectionTab>('media');
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    'media-visual': true,
    'media-focal': false,
    'media-audio': false,
    'cover-seal': true,
    'cover-text': false,
    'cover-layout': false,
    'style-fonts': true,
    'style-colors': false,
    'style-panel': false,
    'slide1-image': false,
  });
  const toggleAccordion = (key: string) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const [audioCompressing, setAudioCompressing] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioClipLimitSec, setAudioClipLimitSec] = useState<30 | 45 | 60>(45);

  useEffect(() => {
    ensureAllStudioFontsLoaded();
  }, []);
  const [mobilePane, setMobilePane] = useState<'editor' | 'preview'>('editor');
  const [activeTextSlideTab, setActiveTextSlideTab] = useState<
    'slide1' | 'slide2' | 'slide3'
  >('slide1');

  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedSignature, setPublishedSignature] = useState<string | null>(
    null
  );
  const [localVideoName, setLocalVideoName] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewJumpTarget, setPreviewJumpTarget] =
    useState<PreviewJumpTarget | null>(null);
  const [previewEditMode, setPreviewEditMode] = useState(false);
  const [selectedEditTarget, setSelectedEditTarget] =
    useState<PreviewEditTarget | null>(null);
  const [quickEditTab, setQuickEditTab] = useState<'text' | 'color' | 'layout'>(
    'color'
  );
  const [detectedToneSuggestion, setDetectedToneSuggestion] = useState<{
    mode: SurfaceToneMode;
    sourceLabel: string;
  } | null>(null);
  const [detectingTone, setDetectingTone] = useState(false);

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

  const currentSlideExtras: InteractiveSlideExtras = {
    ...DEFAULT_SLIDE_EXTRAS,
    ...(config.slideExtras ?? {}),
  };

  const updateSlideExtras = (
    patch: Partial<InteractiveSlideExtras>,
    jump?: { phase: 'sealed' | 'story'; slide?: 0 | 1 | 2 }
  ) => {
    onChangeConfig({
      ...config,
      slideExtras: { ...currentSlideExtras, ...patch },
    });
    if (jump) {
      jumpPreviewTo(jump.phase, jump.slide);
    }
  };

  const jumpForSlideKey = (key: 'cover' | 'slide1' | 'slide2' | 'slide3') => {
    if (key === 'cover') jumpPreviewTo('sealed');
    else if (key === 'slide1') jumpPreviewTo('story', 0);
    else if (key === 'slide2') jumpPreviewTo('story', 1);
    else jumpPreviewTo('story', 2);
  };

  const updatePerSlideStyle = (
    slideKey: 'cover' | 'slide1' | 'slide2' | 'slide3',
    patch: Partial<PerSlideStyleOverride>,
    skipJump = false
  ) => {
    const prevAll = config.slideStyles ?? {};
    const merged: PerSlideStyleOverride = {
      ...(prevAll[slideKey] ?? {}),
      ...patch,
    };
    const cleaned: PerSlideStyleOverride = {};
    if (merged.headingFont) cleaned.headingFont = merged.headingFont;
    if (merged.bodyFont) cleaned.bodyFont = merged.bodyFont;
    if (merged.titleColor) cleaned.titleColor = merged.titleColor;
    if (merged.bodyColor) cleaned.bodyColor = merged.bodyColor;
    if (merged.accentColor) cleaned.accentColor = merged.accentColor;
    if (merged.textAlign) cleaned.textAlign = merged.textAlign;
    if (merged.textShadow) cleaned.textShadow = merged.textShadow;
    if (merged.panelBgColor) cleaned.panelBgColor = merged.panelBgColor;
    if (
      typeof merged.panelOpacity === 'number' &&
      Number.isFinite(merged.panelOpacity) &&
      merged.panelOpacity >= 0
    ) {
      cleaned.panelOpacity = Math.min(100, Math.max(0, Math.round(merged.panelOpacity)));
    }
    if (merged.panelBorderColor) cleaned.panelBorderColor = merged.panelBorderColor;
    if (merged.panelBorderStyle) cleaned.panelBorderStyle = merged.panelBorderStyle;
    if (merged.panelRadius) cleaned.panelRadius = merged.panelRadius;
    if (merged.panelBlur) cleaned.panelBlur = merged.panelBlur;
    if (
      typeof merged.panelWidth === 'number' &&
      Number.isFinite(merged.panelWidth) &&
      merged.panelWidth >= 75
    ) {
      cleaned.panelWidth = Math.min(100, Math.max(75, Math.round(merged.panelWidth)));
    }
    if (merged.panelPadding) cleaned.panelPadding = merged.panelPadding;
    if (
      typeof merged.panelOffsetY === 'number' &&
      Number.isFinite(merged.panelOffsetY) &&
      merged.panelOffsetY !== 0
    ) {
      cleaned.panelOffsetY = Math.min(60, Math.max(-60, Math.round(merged.panelOffsetY)));
    }
    if (merged.buttonColor) cleaned.buttonColor = merged.buttonColor;
    if (merged.buttonTextColor) cleaned.buttonTextColor = merged.buttonTextColor;
    if (merged.secondaryButtonColor)
      cleaned.secondaryButtonColor = merged.secondaryButtonColor;
    if (merged.badgeBgColor) cleaned.badgeBgColor = merged.badgeBgColor;

    const nextAll = { ...prevAll };
    if (Object.keys(cleaned).length > 0) {
      nextAll[slideKey] = cleaned;
    } else {
      delete nextAll[slideKey];
    }
    onChangeConfig({ ...config, slideStyles: nextAll });
    if (!skipJump) {
      jumpForSlideKey(slideKey);
    }
  };

  const handleDirectDragChange = (patch: PreviewDirectDragPatch) => {
    if (patch.slidePanelOffsetY) {
      updatePerSlideStyle(
        patch.slidePanelOffsetY.slide,
        { panelOffsetY: patch.slidePanelOffsetY.offsetY },
        true
      );
      return;
    }
    const next: InteractiveInviteConfig = { ...config };
    if (typeof patch.sealOffsetX === 'number') next.sealOffsetX = patch.sealOffsetX;
    if (typeof patch.sealOffsetY === 'number') next.sealOffsetY = patch.sealOffsetY;
    if (typeof patch.coverTopOffsetY === 'number')
      next.coverTopOffsetY = patch.coverTopOffsetY;
    if (typeof patch.coverBottomOffsetY === 'number')
      next.coverBottomOffsetY = patch.coverBottomOffsetY;
    onChangeConfig(next);
  };

  const openFullSettingsForTarget = (target: PreviewEditTarget) => {
    setMobilePane('editor');
    if (target === 'cover-seal') {
      setSectionTab('seal');
      setOpenAccordions((p) => ({ ...p, 'cover-seal': true }));
    } else if (target === 'cover-top' || target === 'cover-bottom') {
      setSectionTab('seal');
      setOpenAccordions((p) => ({
        ...p,
        'cover-text': true,
        'slide-style-cover': true,
      }));
    } else if (
      target === 'slide1-organizer' ||
      target === 'slide1-header' ||
      target === 'slide1-banner' ||
      target === 'slide1-panel' ||
      target === 'slide1-welcome'
    ) {
      setSectionTab('slides');
      setActiveTextSlideTab('slide1');
      setOpenAccordions((p) => ({ ...p, 'slide-style-slide1': true }));
    } else if (
      target === 'slide2-header' ||
      target === 'slide2-countdown' ||
      target === 'slide2-panel' ||
      target === 'slide2-buttons'
    ) {
      setSectionTab('slides');
      setActiveTextSlideTab('slide2');
      setOpenAccordions((p) => ({ ...p, 'slide-style-slide2': true }));
    } else if (target === 'story-nav') {
      setSectionTab('style');
      setOpenAccordions((p) => ({ ...p, 'style-colors': true }));
    } else {
      setSectionTab('slides');
      setActiveTextSlideTab('slide3');
      setOpenAccordions((p) => ({ ...p, 'slide-style-slide3': true }));
    }
  };

  const resetPerSlideStyle = (
    slideKey: 'cover' | 'slide1' | 'slide2' | 'slide3'
  ) => {
    const nextAll = { ...(config.slideStyles ?? {}) };
    delete nextAll[slideKey];
    onChangeConfig({ ...config, slideStyles: nextAll });
    jumpForSlideKey(slideKey);
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

  const renderOpenBgFocalControl = (idPrefix: string) => {
    const posX = Math.min(100, Math.max(0, Math.round(Number(config.openBgPosX ?? 50))));
    const posY = Math.min(100, Math.max(0, Math.round(Number(config.openBgPosY ?? 50))));
    const bgPreviewSrc =
      config.mediaMode === 'image'
        ? config.openImageDataUrl || config.coverImageDataUrl
        : config.openBgUrl || '/media/gold-envelope-open.webp';

    if (!bgPreviewSrc) return null;

    const updateFocalFromPointer = (
      e: React.PointerEvent<HTMLDivElement>,
      force = false
    ) => {
      if (!force && e.buttons !== 1 && e.pointerType === 'mouse') return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nextX = Math.min(
        100,
        Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 100))
      );
      const nextY = Math.min(
        100,
        Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 100))
      );
      onChangeConfig({
        ...config,
        openBgPosX: nextX,
        openBgPosY: nextY,
      });
      jumpPreviewTo('story', 1);
    };

    return (
      <div className="rounded-xl border border-[#DDEEF3] bg-[#F4FBFD] p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11.5px] font-bold text-[#1B1B4B]">
              Geser Area Tampil Gambar Latar (Slide 1–3 / Video)
            </div>
            <div className="text-[10.5px] text-[#757E96]">
              Ketuk/seret titik emas pada foto atau geser slider untuk memilih bagian gambar yang muncul di layar video.
            </div>
          </div>
          {(posX !== 50 || posY !== 50) && (
            <button
              type="button"
              onClick={() => {
                onChangeConfig({
                  ...config,
                  openBgPosX: 50,
                  openBgPosY: 50,
                });
                jumpPreviewTo('story', 1);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#B2E3F0] bg-white text-[10.5px] font-semibold text-[#157A76] hover:bg-[#E3F5FA]"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Tengah (50%, 50%)</span>
            </button>
          )}
        </div>

        {/* Interactive 2D Focal-Point Picker */}
        <div className="flex justify-center">
          <div
            role="slider"
            tabIndex={0}
            aria-label="Titik fokus gambar latar belakang video"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={posX}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              updateFocalFromPointer(e, true);
            }}
            onPointerMove={(e) => updateFocalFromPointer(e, false)}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            className="relative inline-block max-w-full rounded-xl overflow-hidden border border-[#B2E3F0] bg-[#0E0E10] shadow-xs touch-none select-none cursor-crosshair"
          >
            <img
              src={bgPreviewSrc}
              alt="Pratinjau area gambar latar belakang"
              draggable={false}
              className="block max-h-40 w-auto max-w-full object-contain pointer-events-none"
            />
            {/* Crosshair guides */}
            <div
              aria-hidden="true"
              style={{ left: `${posX}%` }}
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#FCE9B2]/75"
            />
            <div
              aria-hidden="true"
              style={{ top: `${posY}%` }}
              className="pointer-events-none absolute left-0 right-0 h-px bg-[#FCE9B2]/75"
            />
            {/* Glowing gold focal dot */}
            <div
              aria-hidden="true"
              style={{
                left: `${posX}%`,
                top: `${posY}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="pointer-events-none absolute w-6 h-6 rounded-full border-2 border-[#FCE9B2] bg-[#D4AF37]/45 shadow-[0_0_0_2px_rgba(0,0,0,0.55)] flex items-center justify-center"
            >
              <span className="w-2 h-2 rounded-full bg-[#FCE9B2]" />
            </div>
          </div>
        </div>

        {/* Quick focal presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: 'Kiri', x: 10, y: posY },
            { label: 'Tengah X', x: 50, y: posY },
            { label: 'Kanan', x: 90, y: posY },
            { label: 'Atas', x: posX, y: 15 },
            { label: 'Bawah', x: posX, y: 85 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onChangeConfig({
                  ...config,
                  openBgPosX: preset.x,
                  openBgPosY: preset.y,
                });
                jumpPreviewTo('story', 1);
              }}
              className="px-2.5 py-1 rounded-full bg-white border border-[#DDEEF3] hover:border-[#1F9B96] text-[10.5px] font-semibold text-[#1B1B4B] transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Precision X & Y sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`${idPrefix}-open-bg-x`}
              className="flex items-center justify-between text-[11px] font-semibold text-[#1B1B4B] mb-1"
            >
              <span>Bagian Kiri / Kanan (X)</span>
              <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums">
                {posX}%
              </span>
            </label>
            <input
              id={`${idPrefix}-open-bg-x`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={posX}
              onChange={(e) => {
                onChangeConfig({
                  ...config,
                  openBgPosX: Number(e.target.value),
                });
                jumpPreviewTo('story', 1);
              }}
              className="w-full accent-[#1F9B96]"
            />
          </div>

          <div>
            <label
              htmlFor={`${idPrefix}-open-bg-y`}
              className="flex items-center justify-between text-[11px] font-semibold text-[#1B1B4B] mb-1"
            >
              <span>Bagian Atas / Bawah (Y)</span>
              <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums">
                {posY}%
              </span>
            </label>
            <input
              id={`${idPrefix}-open-bg-y`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={posY}
              onChange={(e) => {
                onChangeConfig({
                  ...config,
                  openBgPosY: Number(e.target.value),
                });
                jumpPreviewTo('story', 1);
              }}
              className="w-full accent-[#1F9B96]"
            />
          </div>
        </div>
      </div>
    );
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

  const activeHeadingFont = config.headingFont || 'Manrope';
  const activeBodyFont = config.bodyFont || 'Manrope';

  type NumericSlideExtraField =
    | 'coverNameSize'
    | 'coverInstitutionSize'
    | 'slide1TitleSize'
    | 'slide1RecipientSize'
    | 'slide1InstitutionSize'
    | 'slide2TitleSize'
    | 'slide2DetailSize';

  const renderExtraSizeStepper = (
    field: NumericSlideExtraField,
    label: string,
    fallbackPx: number,
    min: number,
    max: number,
    jump: { phase: 'sealed' | 'story'; slide?: 0 | 1 | 2 }
  ) => {
    const raw = Number(currentSlideExtras[field] ?? 0);
    const isAuto = !Number.isFinite(raw) || raw <= 0;
    const step = (delta: number) => {
      const base = isAuto ? fallbackPx : raw;
      const next = Math.min(max, Math.max(min, base + delta));
      updateSlideExtras({ [field]: next }, jump);
    };
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-[#DDEEF3] bg-white px-2.5 py-1.5">
        <span className="text-[11px] font-semibold text-[#1B1B4B] truncate">
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {!isAuto && (
            <button
              type="button"
              onClick={() => updateSlideExtras({ [field]: 0 }, jump)}
              className="px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold text-[#157A76] bg-[#EDF8FB] hover:bg-[#DCF5F1]"
              title="Kembalikan ke ukuran otomatis"
            >
              Auto
            </button>
          )}
          <span className="inline-flex items-center gap-0.5 rounded-full border border-[#DDEEF3] bg-[#FAFEFD] px-1 py-0.5">
            <button
              type="button"
              disabled={!isAuto && raw <= min}
              onClick={() => step(-1)}
              aria-label={`Perkecil ${label}`}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[#5A647B] hover:bg-[#EDF8FB] hover:text-[#157A76] active:scale-90 disabled:opacity-35"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <span className="min-w-[32px] text-center text-[10.5px] font-bold text-[#1B1B4B] tabular-nums select-none">
              {isAuto ? 'Auto' : `${raw}px`}
            </span>
            <button
              type="button"
              disabled={!isAuto && raw >= max}
              onClick={() => step(1)}
              aria-label={`Perbesar ${label}`}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[#5A647B] hover:bg-[#EDF8FB] hover:text-[#157A76] active:scale-90 disabled:opacity-35"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      </div>
    );
  };

  const renderPerSlideStyleBox = (
    slideKey: 'cover' | 'slide1' | 'slide2' | 'slide3',
    label: string
  ) => {
    const accKey = `slide-style-${slideKey}`;
    const isOpen = Boolean(openAccordions[accKey]);
    const ov = config.slideStyles?.[slideKey] ?? {};
    const overrideCount = Object.values(ov).filter(
      (v) => v !== undefined && v !== ''
    ).length;

    return (
      <div className="rounded-xl border border-[#DDEEF3] bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => {
            toggleAccordion(accKey);
            jumpForSlideKey(slideKey);
          }}
          aria-expanded={isOpen}
          className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-[#F4FBFD] transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Palette className="w-3.5 h-3.5 text-[#1F9B96] shrink-0" />
            <span className="text-[11.5px] font-bold text-[#1B1B4B] truncate">
              Gaya Teks Khusus {label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                overrideCount > 0
                  ? 'bg-[#DCF5F1] text-[#157A76]'
                  : 'bg-[#F4FBFD] text-[#757E96] border border-[#DDEEF3]'
              }`}
            >
              {overrideCount > 0 ? `Kustom (${overrideCount})` : 'Ikuti Induk'}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#757E96] transition-transform duration-200 ${
                isOpen ? 'rotate-180 text-[#1F9B96]' : ''
              }`}
            />
          </div>
        </button>

        {isOpen && (
          <div className="px-3 pb-3 pt-2.5 border-t border-[#EDF5F8] bg-[#FAFEFD] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10.5px] text-[#757E96] leading-snug">
                Ubah font, warna, atau perataan khusus di {label} saja. Biarkan kosong untuk mengikuti tab Huruf &amp; Warna.
              </p>
              {overrideCount > 0 && (
                <button
                  type="button"
                  onClick={() => resetPerSlideStyle(slideKey)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#B2E3F0] bg-white text-[10px] font-semibold text-[#157A76] hover:bg-[#E3F5FA] shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset ke Gaya Induk</span>
                </button>
              )}
            </div>

            {/* Per-slide Font Overrides */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor={`studio-${slideKey}-heading-font`}
                  className="block text-[10.5px] font-semibold text-[#5A647B] mb-1"
                >
                  Font Judul ({label})
                </label>
                <select
                  id={`studio-${slideKey}-heading-font`}
                  value={ov.headingFont ?? ''}
                  onChange={(e) =>
                    updatePerSlideStyle(slideKey, {
                      headingFont: e.target.value,
                    })
                  }
                  style={
                    ov.headingFont
                      ? { fontFamily: getStudioFontCssFamily(ov.headingFont) }
                      : undefined
                  }
                  className="w-full rounded-lg border border-[#DDEEF3] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                >
                  <option value="">Ikuti Induk ({activeHeadingFont})</option>
                  {STUDIO_FONTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor={`studio-${slideKey}-body-font`}
                  className="block text-[10.5px] font-semibold text-[#5A647B] mb-1"
                >
                  Font Isi ({label})
                </label>
                <select
                  id={`studio-${slideKey}-body-font`}
                  value={ov.bodyFont ?? ''}
                  onChange={(e) =>
                    updatePerSlideStyle(slideKey, {
                      bodyFont: e.target.value,
                    })
                  }
                  style={
                    ov.bodyFont
                      ? { fontFamily: getStudioFontCssFamily(ov.bodyFont) }
                      : undefined
                  }
                  className="w-full rounded-lg border border-[#DDEEF3] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                >
                  <option value="">Ikuti Induk ({activeBodyFont})</option>
                  {STUDIO_FONTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Per-slide 3-Zone Color Overrides */}
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  {
                    key: 'titleColor' as const,
                    label: 'Judul',
                    fallback: config.titleColor || '#F3D88B',
                  },
                  {
                    key: 'bodyColor' as const,
                    label: 'Isi',
                    fallback: config.bodyColor || '#FDFBF7',
                  },
                  {
                    key: 'accentColor' as const,
                    label: 'Aksen',
                    fallback: config.accentColor || '#E6C775',
                  },
                ] as const
              ).map((c) => {
                const val = ov[c.key] || '';
                return (
                  <div
                    key={c.key}
                    className="rounded-lg border border-[#DDEEF3] bg-white px-2 py-1.5 flex items-center justify-between gap-1"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-[#1B1B4B] truncate">
                        {c.label}
                      </div>
                      <div className="text-[9.5px] font-mono text-[#757E96] truncate">
                        {val || 'Induk'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {val && (
                        <button
                          type="button"
                          onClick={() =>
                            updatePerSlideStyle(slideKey, { [c.key]: '' })
                          }
                          title={`Ikuti warna ${c.label} induk`}
                          className="text-[10px] font-bold text-[#757E96] hover:text-[#B83B5E] px-1"
                        >
                          ×
                        </button>
                      )}
                      <input
                        type="color"
                        aria-label={`Warna ${c.label} khusus ${label}`}
                        value={val || c.fallback}
                        onChange={(e) =>
                          updatePerSlideStyle(slideKey, {
                            [c.key]: e.target.value,
                          })
                        }
                        className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-slide Alignment & Shadow */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <div className="text-[10.5px] font-semibold text-[#5A647B] mb-1">
                  Perataan ({label})
                </div>
                <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-white p-0.5 border border-[#DDEEF3]">
                  {(
                    [
                      { id: '', label: 'Induk' },
                      { id: 'center', label: 'Tengah' },
                      { id: 'left', label: 'Kiri' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id || 'inherit'}
                      type="button"
                      onClick={() =>
                        updatePerSlideStyle(slideKey, {
                          textAlign: opt.id as InteractiveTextAlign | '',
                        })
                      }
                      className={`py-1 rounded-md text-[10px] font-bold ${
                        (ov.textAlign ?? '') === opt.id
                          ? 'bg-[#1F9B96] text-white'
                          : 'text-[#5A647B] hover:text-[#1B1B4B]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10.5px] font-semibold text-[#5A647B] mb-1">
                  Bayangan ({label})
                </div>
                <div className="grid grid-cols-4 gap-0.5 rounded-lg bg-white p-0.5 border border-[#DDEEF3]">
                  {(
                    [
                      { id: '', label: 'Induk' },
                      { id: 'none', label: 'Off' },
                      { id: 'soft', label: 'Halus' },
                      { id: 'strong', label: 'Kuat' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id || 'inherit'}
                      type="button"
                      onClick={() =>
                        updatePerSlideStyle(slideKey, {
                          textShadow: opt.id as InteractiveTextShadow | '',
                        })
                      }
                      className={`py-1 rounded-md text-[10px] font-bold ${
                        (ov.textShadow ?? '') === opt.id
                          ? 'bg-[#1F9B96] text-white'
                          : 'text-[#5A647B] hover:text-[#1B1B4B]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Per-slide Panel Styling Override (Slide 1, 2, 3) */}
            {slideKey !== 'cover' && (
              <div className="pt-2.5 border-t border-[#E5F1F5] space-y-2.5">
                <div className="text-[10.5px] font-bold text-[#1B1B4B]">
                  Kotak Panel Khusus {label}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* Panel BG Color */}
                  <div className="rounded-lg border border-[#DDEEF3] bg-white px-2 py-1.5 flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-[#1B1B4B] truncate">
                        Latar Panel
                      </div>
                      <div className="text-[9.5px] font-mono text-[#757E96] truncate">
                        {ov.panelBgColor || 'Induk'}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {ov.panelBgColor && (
                        <button
                          type="button"
                          onClick={() =>
                            updatePerSlideStyle(slideKey, { panelBgColor: '' })
                          }
                          className="text-[10px] font-bold text-[#757E96] hover:text-[#B83B5E] px-0.5"
                        >
                          ×
                        </button>
                      )}
                      <input
                        type="color"
                        aria-label={`Warna latar panel ${label}`}
                        value={ov.panelBgColor || config.panelBgColor || '#13120F'}
                        onChange={(e) =>
                          updatePerSlideStyle(slideKey, {
                            panelBgColor: e.target.value,
                          })
                        }
                        className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                      />
                    </div>
                  </div>

                  {/* Panel Border Color */}
                  <div className="rounded-lg border border-[#DDEEF3] bg-white px-2 py-1.5 flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-[#1B1B4B] truncate">
                        Bingkai
                      </div>
                      <div className="text-[9.5px] font-mono text-[#757E96] truncate">
                        {ov.panelBorderColor || 'Induk'}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {ov.panelBorderColor && (
                        <button
                          type="button"
                          onClick={() =>
                            updatePerSlideStyle(slideKey, {
                              panelBorderColor: '',
                            })
                          }
                          className="text-[10px] font-bold text-[#757E96] hover:text-[#B83B5E] px-0.5"
                        >
                          ×
                        </button>
                      )}
                      <input
                        type="color"
                        aria-label={`Warna bingkai panel ${label}`}
                        value={
                          ov.panelBorderColor ||
                          currentSlideExtras.panelBorderColor ||
                          '#D4AF37'
                        }
                        onChange={(e) =>
                          updatePerSlideStyle(slideKey, {
                            panelBorderColor: e.target.value,
                          })
                        }
                        className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                      />
                    </div>
                  </div>

                  {/* Panel Opacity Override */}
                  <div className="rounded-lg border border-[#DDEEF3] bg-white px-2 py-1.5 flex flex-col justify-center">
                    <div className="flex items-center justify-between text-[10px] font-bold text-[#1B1B4B]">
                      <span>Kepekatan</span>
                      <span className="text-[#1F9B96] tabular-nums">
                        {typeof ov.panelOpacity === 'number'
                          ? `${ov.panelOpacity}%`
                          : 'Induk'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={
                        typeof ov.panelOpacity === 'number'
                          ? ov.panelOpacity
                          : config.panelOpacity ?? 85
                      }
                      onChange={(e) =>
                        updatePerSlideStyle(slideKey, {
                          panelOpacity: Number(e.target.value),
                        })
                      }
                      className="w-full accent-[#1F9B96] h-3.5"
                    />
                  </div>

                  {/* Panel Width Override */}
                  <div className="rounded-lg border border-[#DDEEF3] bg-white px-2 py-1.5 flex flex-col justify-center">
                    <div className="flex items-center justify-between text-[10px] font-bold text-[#1B1B4B]">
                      <span>Lebar</span>
                      <span className="text-[#1F9B96] tabular-nums">
                        {typeof ov.panelWidth === 'number' && ov.panelWidth >= 75
                          ? `${ov.panelWidth}%`
                          : 'Induk'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={75}
                      max={100}
                      step={1}
                      value={
                        typeof ov.panelWidth === 'number' && ov.panelWidth >= 75
                          ? ov.panelWidth
                          : currentSlideExtras.panelWidth
                      }
                      onChange={(e) =>
                        updatePerSlideStyle(slideKey, {
                          panelWidth: Number(e.target.value),
                        })
                      }
                      className="w-full accent-[#1F9B96] h-3.5"
                    />
                  </div>
                </div>

                {/* Border Style, Radius, Padding, Vertical Y */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <div className="text-[10px] font-semibold text-[#5A647B] mb-1">
                      Garis Bingkai
                    </div>
                    <div className="grid grid-cols-4 gap-0.5 rounded-lg bg-white p-0.5 border border-[#DDEEF3]">
                      {(
                        [
                          { id: '', label: 'Induk' },
                          { id: 'none', label: 'Off' },
                          { id: 'thin', label: 'Tipis' },
                          { id: 'bold', label: 'Tegas' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id || 'inherit'}
                          type="button"
                          onClick={() =>
                            updatePerSlideStyle(slideKey, {
                              panelBorderStyle:
                                opt.id as InteractivePanelBorderStyle | '',
                            })
                          }
                          className={`py-1 rounded-md text-[9.5px] font-bold ${
                            (ov.panelBorderStyle ?? '') === opt.id
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
                    <div className="text-[10px] font-semibold text-[#5A647B] mb-1">
                      Sudut &amp; Padding
                    </div>
                    <div className="grid grid-cols-4 gap-0.5 rounded-lg bg-white p-0.5 border border-[#DDEEF3]">
                      {(
                        [
                          { id: '', label: 'Induk' },
                          { id: 'compact', label: 'Rapat' },
                          { id: 'normal', label: 'Pas' },
                          { id: 'spacious', label: 'Lega' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id || 'inherit'}
                          type="button"
                          onClick={() =>
                            updatePerSlideStyle(slideKey, {
                              panelPadding:
                                opt.id as InteractivePanelPadding | '',
                            })
                          }
                          className={`py-1 rounded-md text-[9.5px] font-bold ${
                            (ov.panelPadding ?? '') === opt.id
                              ? 'bg-[#1F9B96] text-white'
                              : 'text-[#5A647B]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#DDEEF3] bg-white px-2 py-1 flex flex-col justify-center">
                    <div className="flex items-center justify-between text-[10px] font-bold text-[#1B1B4B]">
                      <span>Geser Y ({label})</span>
                      <span className="text-[#1F9B96] tabular-nums">
                        {(ov.panelOffsetY ?? 0) > 0
                          ? `+${ov.panelOffsetY}px`
                          : `${ov.panelOffsetY ?? 0}px`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-60}
                      max={60}
                      step={2}
                      value={ov.panelOffsetY ?? 0}
                      onChange={(e) =>
                        updatePerSlideStyle(slideKey, {
                          panelOffsetY: Number(e.target.value),
                        })
                      }
                      className="w-full accent-[#1F9B96] h-3.5"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Per-slide Button Color Override (Cover, Slide 2, Slide 3) */}
            {(slideKey === 'cover' ||
              slideKey === 'slide2' ||
              slideKey === 'slide3') && (
              <div className="pt-2 border-t border-[#E5F1F5] grid grid-cols-2 gap-2">
                {slideKey === 'slide2' ? (
                  <div className="col-span-2 rounded-lg border border-[#DDEEF3] bg-white px-2.5 py-1.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10.5px] font-bold text-[#1B1B4B]">
                        Warna Tombol Peta &amp; Kalender (Slide 2)
                      </div>
                      <div className="text-[9.5px] font-mono text-[#757E96]">
                        {ov.secondaryButtonColor || 'Ikuti Induk'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {ov.secondaryButtonColor && (
                        <button
                          type="button"
                          onClick={() =>
                            updatePerSlideStyle(slideKey, {
                              secondaryButtonColor: '',
                            })
                          }
                          className="text-[10px] font-bold text-[#757E96] hover:text-[#B83B5E] px-1"
                        >
                          ×
                        </button>
                      )}
                      <input
                        type="color"
                        aria-label="Warna tombol sekunder Slide 2"
                        value={
                          ov.secondaryButtonColor ||
                          currentSlideExtras.secondaryButtonColor ||
                          '#1B1811'
                        }
                        onChange={(e) =>
                          updatePerSlideStyle(slideKey, {
                            secondaryButtonColor: e.target.value,
                          })
                        }
                        className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-[#DDEEF3] bg-white px-2 py-1.5 flex items-center justify-between gap-1">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-[#1B1B4B] truncate">
                          Latar Tombol
                        </div>
                        <div className="text-[9.5px] font-mono text-[#757E96] truncate">
                          {ov.buttonColor || 'Induk'}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {ov.buttonColor && (
                          <button
                            type="button"
                            onClick={() =>
                              updatePerSlideStyle(slideKey, { buttonColor: '' })
                            }
                            className="text-[10px] font-bold text-[#757E96] hover:text-[#B83B5E] px-0.5"
                          >
                            ×
                          </button>
                        )}
                        <input
                          type="color"
                          aria-label={`Warna latar tombol ${label}`}
                          value={ov.buttonColor || config.buttonColor || '#DFB454'}
                          onChange={(e) =>
                            updatePerSlideStyle(slideKey, {
                              buttonColor: e.target.value,
                            })
                          }
                          className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                        />
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#DDEEF3] bg-white px-2 py-1.5 flex items-center justify-between gap-1">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-[#1B1B4B] truncate">
                          Teks Tombol
                        </div>
                        <div className="text-[9.5px] font-mono text-[#757E96] truncate">
                          {ov.buttonTextColor || 'Auto'}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {ov.buttonTextColor && (
                          <button
                            type="button"
                            onClick={() =>
                              updatePerSlideStyle(slideKey, {
                                buttonTextColor: '',
                              })
                            }
                            className="text-[10px] font-bold text-[#757E96] hover:text-[#B83B5E] px-0.5"
                          >
                            ×
                          </button>
                        )}
                        <input
                          type="color"
                          aria-label={`Warna teks tombol ${label}`}
                          value={
                            ov.buttonTextColor ||
                            currentSlideExtras.buttonTextColor ||
                            '#151109'
                          }
                          onChange={(e) =>
                            updatePerSlideStyle(slideKey, {
                              buttonTextColor: e.target.value,
                            })
                          }
                          className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderAccordionCard = (
    id: string,
    title: string,
    badge: React.ReactNode,
    children: React.ReactNode,
    subtitle?: string
  ) => {
    const isOpen = Boolean(openAccordions[id]);
    return (
      <div className="rounded-[20px] border border-[#E5F1F5] bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => toggleAccordion(id)}
          aria-expanded={isOpen}
          className="w-full px-4 py-3 flex items-center justify-between gap-2.5 text-left hover:bg-[#FAFEFD] transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-display font-bold text-[#1B1B4B] leading-snug truncate">
              {title}
            </div>
            {subtitle && (
              <div className="text-[11px] text-[#757E96] truncate mt-0.5">
                {subtitle}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {badge}
            <ChevronDown
              className={`w-4 h-4 text-[#757E96] transition-transform duration-200 ${
                isOpen ? 'rotate-180 text-[#1F9B96]' : ''
              }`}
            />
          </div>
        </button>
        {isOpen && (
          <div className="px-4 pb-4 pt-2 border-t border-[#EDF5F8] space-y-3.5">
            {children}
          </div>
        )}
      </div>
    );
  };

  const currentSurfaceMode: SurfaceToneMode =
    config.theme === 'emerald-light' ? 'light' : 'dark';

  const applySurfacePalette = (palette: SurfacePalettePreset) => {
    // Strip ONLY conflicting color/shadow overrides inside per-slide slideStyles;
    // keep per-slide fonts, alignment, panel width/radius/padding/blur/offsetY 100% intact!
    const nextSlideStyles = { ...(config.slideStyles ?? {}) };
    (['cover', 'slide1', 'slide2', 'slide3'] as const).forEach((key) => {
      const ov = nextSlideStyles[key];
      if (!ov) return;
      const kept: PerSlideStyleOverride = {};
      if (ov.headingFont) kept.headingFont = ov.headingFont;
      if (ov.bodyFont) kept.bodyFont = ov.bodyFont;
      if (ov.textAlign) kept.textAlign = ov.textAlign;
      if (ov.panelRadius) kept.panelRadius = ov.panelRadius;
      if (ov.panelBlur) kept.panelBlur = ov.panelBlur;
      if (typeof ov.panelWidth === 'number' && ov.panelWidth >= 75) {
        kept.panelWidth = ov.panelWidth;
      }
      if (ov.panelPadding) kept.panelPadding = ov.panelPadding;
      if (typeof ov.panelOffsetY === 'number' && ov.panelOffsetY !== 0) {
        kept.panelOffsetY = ov.panelOffsetY;
      }
      if (Object.keys(kept).length > 0) {
        nextSlideStyles[key] = kept;
      } else {
        delete nextSlideStyles[key];
      }
    });

    onChangeConfig({
      ...config,
      theme: palette.theme,
      titleColor: palette.titleColor,
      bodyColor: palette.bodyColor,
      accentColor: palette.accentColor,
      panelBgColor: palette.panelBgColor,
      panelOpacity: palette.panelOpacity,
      buttonColor: palette.buttonColor,
      textShadow: palette.textShadow,
      overlayDarkness: palette.overlayDarkness,
      coverOverlayDarkness: palette.coverOverlayDarkness,
      slideStyles: nextSlideStyles,
      slideExtras: {
        ...currentSlideExtras,
        panelBorderColor: palette.panelBorderColor,
        panelBorderStyle: palette.panelBorderStyle,
        buttonTextColor: palette.buttonTextColor,
        secondaryButtonColor: palette.secondaryButtonColor,
        secondaryButtonTextColor: palette.secondaryButtonTextColor,
      },
    });
    setDetectedToneSuggestion(null);
    onNotify?.(
      `Mode ${palette.mode === 'light' ? 'Light' : 'Dark'} (${palette.label}) diterapkan — font, ukuran & posisi tetap utuh.`,
      'success'
    );
  };

  const applyDefaultSurfaceMode = (mode: SurfaceToneMode) => {
    const target = SURFACE_PALETTES.find((p) => p.mode === mode);
    if (target) applySurfacePalette(target);
  };

  const handleAutoDetectToneFromCurrentMedia = async () => {
    const src =
      config.mediaMode === 'image'
        ? config.openImageDataUrl || config.coverImageDataUrl
        : config.openBgUrl || config.posterUrl;
    if (!src) {
      onNotify?.('Belum ada gambar atau video latar untuk dideteksi.', 'error');
      return;
    }
    setDetectingTone(true);
    try {
      const detected = await detectImageSrcTone(src);
      if (!detected) {
        onNotify?.(
          'Tidak dapat membaca kecerahan latar ini (URL eksternal dibatasi CORS). Pilih Mode Dark atau Light secara manual.',
          'error'
        );
        return;
      }
      applyDefaultSurfaceMode(detected);
    } finally {
      setDetectingTone(false);
    }
  };

  const renderDarkLightQuickBar = () => {
    const activePalettes = SURFACE_PALETTES.filter(
      (p) => p.mode === currentSurfaceMode
    );
    return (
      <div className="rounded-[20px] border border-[#DDEEF3] bg-white p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[12.5px] font-display font-bold text-[#1B1B4B]">
              Mode Warna Latar (Cepat 1-Klik)
            </div>
            <div className="text-[10.5px] text-[#757E96]">
              Sesuaikan cepat untuk video/gambar gelap atau terang — font &amp; posisi tetap aman.
            </div>
          </div>
          <button
            type="button"
            disabled={detectingTone}
            onClick={() => void handleAutoDetectToneFromCurrentMedia()}
            title="Deteksi otomatis kecerahan latar video/gambar saat ini"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#B2E3F0] bg-[#F4FBFD] hover:bg-[#E3F5FA] text-[10.5px] font-bold text-[#157A76] disabled:opacity-50 shrink-0"
          >
            {detectingTone ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            <span>Deteksi Latar</span>
          </button>
        </div>

        {/* Auto-Detected Tone Suggestion Banner after Upload */}
        {detectedToneSuggestion &&
          detectedToneSuggestion.mode !== currentSurfaceMode && (
            <div className="rounded-xl border border-[#F3D34F] bg-[#FFFBEB] px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#7A5908] leading-snug">
                {detectedToneSuggestion.sourceLabel} terdeteksi{' '}
                <strong>
                  {detectedToneSuggestion.mode === 'light' ? 'terang (Light)' : 'gelap (Dark)'}
                </strong>
                . Terapkan penyesuaian warna otomatis?
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setDetectedToneSuggestion(null)}
                  className="px-2.5 py-1 rounded-full border border-[#F4DF89] bg-white text-[10.5px] font-semibold text-[#5A647B]"
                >
                  Abaikan
                </button>
                <button
                  type="button"
                  onClick={() => applyDefaultSurfaceMode(detectedToneSuggestion.mode)}
                  className="px-3 py-1 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[10.5px] font-bold"
                >
                  Terapkan Mode {detectedToneSuggestion.mode === 'light' ? 'Light' : 'Dark'}
                </button>
              </div>
            </div>
          )}

        {/* Primary Dark vs Light Mode Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => applyDefaultSurfaceMode('dark')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-[12px] font-bold transition-all ${
              currentSurfaceMode === 'dark'
                ? 'bg-[#13120F] border-[#D4AF37] text-[#FCE9B2] ring-2 ring-[#1F9B96]/35 shadow-xs'
                : 'bg-[#F8FAFC] border-[#DDEEF3] text-[#475569] hover:border-[#1B1B4B]/40'
            }`}
          >
            <Moon className="w-4 h-4 shrink-0" />
            <span>Mode Dark (Latar Gelap)</span>
          </button>
          <button
            type="button"
            onClick={() => applyDefaultSurfaceMode('light')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-[12px] font-bold transition-all ${
              currentSurfaceMode === 'light'
                ? 'bg-[#FFFDF7] border-[#1F9B96] text-[#1B1B4B] ring-2 ring-[#1F9B96]/30 shadow-xs'
                : 'bg-[#F8FAFC] border-[#DDEEF3] text-[#475569] hover:border-[#1F9B96]/50'
            }`}
          >
            <Sun className="w-4 h-4 text-[#D97706] shrink-0" />
            <span>Mode Light (Latar Terang)</span>
          </button>
        </div>

        {/* 3 Quick Sub-Nuances for Active Mode */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[10.5px] font-semibold text-[#757E96] mr-0.5">
            Nuansa {currentSurfaceMode === 'light' ? 'Light' : 'Dark'}:
          </span>
          {activePalettes.map((pal) => {
            const isActive =
              (config.titleColor || '').toLowerCase() ===
                pal.titleColor.toLowerCase() &&
              (config.panelBgColor || '').toLowerCase() ===
                pal.panelBgColor.toLowerCase() &&
              (config.buttonColor || '').toLowerCase() ===
                pal.buttonColor.toLowerCase();
            return (
              <button
                key={pal.id}
                type="button"
                onClick={() => applySurfacePalette(pal)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all ${
                  isActive
                    ? 'border-[#1F9B96] bg-[#DCF5F1] text-[#157A76]'
                    : 'border-[#DDEEF3] bg-[#FAFEFD] text-[#1B1B4B] hover:border-[#1F9B96]/60'
                }`}
              >
                <span
                  style={{
                    backgroundColor: pal.swatchBg,
                    borderColor: pal.swatchAccent,
                  }}
                  className="w-3 h-3 rounded-full border-2 shrink-0"
                />
                <span>{pal.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
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
      const detectedMode: SurfaceToneMode =
        res.suggestedTheme === 'emerald-light' ? 'light' : 'dark';
      if (target === 'cover') {
        onChangeConfig({
          ...config,
          mediaMode: 'image',
          coverImageDataUrl: res.dataUrl,
        });
        setDetectedToneSuggestion({
          mode: detectedMode,
          sourceLabel: 'Gambar sampul baru',
        });
        onNotify?.(
          `Gambar sampul diramu (${res.sizeKb} KB ${res.format} · terdeteksi latar ${detectedMode === 'light' ? 'terang' : 'gelap'}).`,
          'success'
        );
      } else {
        onChangeConfig({
          ...config,
          mediaMode: 'image',
          openImageDataUrl: res.dataUrl,
        });
        setDetectedToneSuggestion({
          mode: detectedMode,
          sourceLabel: 'Gambar latar isi baru',
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
      const res = await compressSlide1Image(file);
      onChangeConfig({
        ...config,
        slide1BannerDataUrl: res.dataUrl,
      });
      jumpPreviewTo('story', 0);
      onNotify?.(
        `Gambar Slide 1 (1,5:1) terkompresi otomatis ${res.sizeKb} KB ${res.format} — hemat kuota & cepat dimuat!`,
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

  const handleUploadBgAudio = async (file?: File) => {
    if (!file) return;
    if (!isAudioFile(file)) {
      onNotify?.(
        'Pilih berkas audio .MP3, .WAV, .M4A, .OGG, atau .AAC.',
        'error'
      );
      return;
    }
    setAudioCompressing(true);
    setAudioProgress(5);
    try {
      const res = await compressAudioForInvite(file, {
        maxDurationSec: audioClipLimitSec,
        onProgress: setAudioProgress,
      });
      onChangeConfig({
        ...config,
        bgAudioDataUrl: res.dataUrl,
        bgAudioName: file.name.slice(0, 80),
        bgAudioUrl: '',
        bgAudioDurationSec: res.durationSec,
      });
      const savingsNote = res.passthrough
        ? `${res.sizeKb} KB (langsung siap · hemat kuota!)`
        : `${res.originalSizeKb} KB → ${res.sizeKb} KB MP3 (${res.bitrateKbps} kbps · ${res.durationSec} dtk${res.trimmed ? ' · loop halus' : ''})`;
      onNotify?.(
        `Audio "${file.name}" siap dipakai: ${savingsNote}`,
        'success'
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal memproses berkas audio.',
        'error'
      );
    } finally {
      setAudioCompressing(false);
      setAudioProgress(0);
      if (bgAudioInputRef.current) bgAudioInputRef.current.value = '';
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
      const detectedMode: SurfaceToneMode =
        result.suggestedTheme === 'emerald-light' ? 'light' : 'dark';
      setLocalVideoName(file.name);
      onChangeConfig({
        ...config,
        mediaMode: 'video',
        videoUrl: result.videoBlobUrl,
        posterUrl: result.posterDataUrl || config.posterUrl,
        openBgUrl: result.openBgDataUrl || config.openBgUrl,
      });
      setDetectedToneSuggestion({
        mode: detectedMode,
        sourceLabel: `Video "${file.name}"`,
      });
      setPreviewKey((k) => k + 1);
      onNotify?.(
        `Video "${file.name}" (${result.durationSec.toFixed(1)} dtk) berhasil diramu — terdeteksi latar ${detectedMode === 'light' ? 'terang' : 'gelap'}.`,
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

  const handlePublishToCloud = async (): Promise<boolean> => {
    if (!cloudConfigured || publishing) return true;
    setPublishing(true);
    try {
      await publishInviteConfigToCloud(eventId, config, metadata);
      const guestCount =
        recipients.length > 0
          ? await publishGuestInvitesToCloud(eventId, recipients)
          : 0;
      setPublishedSignature(currentConfigSignature);
      onNotify?.(
        isUsingLocalBlob
          ? `Teks, tema, & ${guestCount} link pendek tamu diterbitkan ke Cloud!`
          : `Pengaturan & ${guestCount} link pendek tamu (/v/...) berhasil diterbitkan ke Cloud!`,
        'success'
      );
      return true;
    } catch (err) {
      onNotify?.(
        err instanceof Error
          ? err.message
          : 'Gagal menerbitkan pengaturan ke Cloud Firestore.',
        'error'
      );
      return false;
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishAndOpenLinks = async () => {
    if (cloudConfigured && hasUnpublishedChanges) {
      const ok = await handlePublishToCloud();
      if (!ok) return;
    }
    onOpenGuestLinks?.();
  };

  const STUDIO_TABS: {
    id: StudioSectionTab;
    label: string;
    icon: React.ReactNode;
    onEnter?: () => void;
  }[] = [
    {
      id: 'media',
      label: 'Latar & Audio',
      icon: <Film className="w-3.5 h-3.5" />,
    },
    {
      id: 'seal',
      label: 'Sampul & Segel',
      icon: <Shield className="w-3.5 h-3.5" />,
      onEnter: () => jumpPreviewTo('sealed'),
    },
    {
      id: 'slides',
      label: 'Isi Slide',
      icon: <Type className="w-3.5 h-3.5" />,
      onEnter: () =>
        jumpPreviewTo(
          'story',
          activeTextSlideTab === 'slide2'
            ? 1
            : activeTextSlideTab === 'slide3'
              ? 2
              : 0
        ),
    },
    {
      id: 'style',
      label: 'Huruf & Warna',
      icon: <Palette className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="space-y-3.5 sm:space-y-4">
      {/* Slim Online Save & Share Bar */}
      <div
        className={`rounded-2xl border px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 ${
          cloudConfigured && hasUnpublishedChanges
            ? 'border-[#F3D34F] bg-[#FFFBEB]'
            : 'border-[#B5E9E0] bg-[#E0F6F2]/75'
        }`}
      >
        <div className="text-[12px] font-semibold">
          {cloudConfigured && hasUnpublishedChanges ? (
            <span className="text-[#785A07]">
              Perubahan belum disimpan online
            </span>
          ) : (
            <span className="text-[#157A76]">
              Desain tersimpan online ✓
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cloudConfigured && (
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
              <span>
                {publishing
                  ? 'Menyimpan...'
                  : hasUnpublishedChanges
                    ? 'Simpan Online'
                    : 'Perbarui Online'}
              </span>
            </button>
          )}
          {onOpenGuestLinks && (
            <button
              type="button"
              disabled={publishing}
              onClick={() => void handlePublishAndOpenLinks()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#F9DE6C] hover:bg-[#F3D34F] text-[#1B1B4B] text-[11.5px] font-extrabold transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Bagikan Link ({recipients.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

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

          {/* TAB 1: LATAR & AUDIO (CLEAN ACCORDION) */}
          {sectionTab === 'media' && (
            <div className="space-y-3">
              {renderDarkLightQuickBar()}
              {renderAccordionCard(
                'media-visual',
                'Visual Sampul, Latar Isi & Animasi 3D',
                <span className="px-2 py-0.5 rounded-full bg-[#E3F5FA] text-[10.5px] font-bold text-[#167F7B]">
                  {config.mediaMode === 'image' ? 'Gambar 3D' : 'Video MP4'}
                </span>,
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11.5px] text-[#757E96]">
                      Pilih unggah gambar (animasi 3D · 100% gratis) atau video MP4.
                    </span>

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
                </>,
                'Gambar sampul, latar terbuka, efek 3D & kecepatan'
              )}

              {/* Accordion 2: Focal-Point Crop Pan (ONE single clean home!) */}
              {renderAccordionCard(
                'media-focal',
                'Geser Area Tampil Gambar Latar',
                <span className="px-2 py-0.5 rounded-full bg-[#F4FBFD] border border-[#DDEEF3] text-[10.5px] font-bold text-[#1B1B4B] tabular-nums">
                  {config.openBgPosX ?? 50}%, {config.openBgPosY ?? 50}%
                </span>,
                renderOpenBgFocalControl('media') ?? (
                  <p className="text-[11.5px] text-[#757E96]">
                    Unggah gambar latar terlebih dahulu untuk memilih titik fokus area tampilnya.
                  </p>
                ),
                'Pilih bagian kiri/kanan/atas/bawah gambar latar di video'
              )}

              {/* Accordion 3: Background Audio MP3 */}
              {renderAccordionCard(
                'media-audio',
                'Audio / Musik Latar Undangan (MP3)',
                config.bgAudioDataUrl ? (
                  <span className="px-2 py-0.5 rounded-full bg-[#DCF5F1] text-[10.5px] font-bold text-[#157A76] tabular-nums">
                    Aktif · ~{Math.max(1, Math.round((config.bgAudioDataUrl.length * 3) / 4 / 1024))} KB
                  </span>
                ) : config.bgAudioUrl ? (
                  <span className="px-2 py-0.5 rounded-full bg-[#DCF5F1] text-[10.5px] font-bold text-[#157A76]">
                    URL Aktif
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-[#F4FBFD] border border-[#DDEEF3] text-[10.5px] font-semibold text-[#757E96]">
                    Opsional
                  </span>
                ),
                <div className="space-y-3">
                <div className="rounded-2xl border border-dashed border-[#B5E4F1] bg-[#F4FBFD] p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-[#E3F5FA] border border-[#B2E3F0] flex items-center justify-center text-[#167F7B] shrink-0">
                        <Music className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-bold text-[#1B1B4B] truncate">
                          Musik Latar Undangan
                        </div>
                        <p className="text-[11px] text-[#757E96] mt-0.5 truncate">
                          {config.bgAudioDataUrl
                            ? `${config.bgAudioName || 'Audio Terunggah'}${config.bgAudioDurationSec ? ` · ${config.bgAudioDurationSec} dtk` : ''}`
                            : 'Unggah MP3 / WAV / M4A (dikompres otomatis).'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {(config.bgAudioDataUrl || config.bgAudioUrl) && (
                        <button
                          type="button"
                          onClick={() =>
                            onChangeConfig({
                              ...config,
                              bgAudioDataUrl: '',
                              bgAudioName: '',
                              bgAudioUrl: '',
                              bgAudioDurationSec: 0,
                            })
                          }
                          aria-label="Hapus audio latar"
                          className="p-2 rounded-full text-[#757E96] hover:text-[#B83B5E] hover:bg-[#FDE8EE]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <input
                        ref={bgAudioInputRef}
                        type="file"
                        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
                        className="hidden"
                        onChange={(e) =>
                          void handleUploadBgAudio(e.target.files?.[0])
                        }
                      />
                      <button
                        type="button"
                        disabled={audioCompressing || analyzing}
                        onClick={() => bgAudioInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[11.5px] font-semibold disabled:opacity-50"
                      >
                        {audioCompressing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {audioCompressing
                            ? `Kompresi ${audioProgress}%`
                            : config.bgAudioDataUrl
                              ? 'Ganti Audio'
                              : 'Upload Audio'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {audioCompressing && (
                    <div className="space-y-1">
                      <div className="h-1.5 w-full rounded-full bg-[#DDEEF3] overflow-hidden">
                        <div
                          style={{ width: `${audioProgress}%` }}
                          className="h-full bg-[#1F9B96] transition-all duration-150"
                        />
                      </div>
                      <div className="text-[10.5px] text-[#167F7B] font-medium">
                        Mengompresi audio ke MP3 ringan (Mono 22 kHz + fade loop halus)...
                      </div>
                    </div>
                  )}

                  {/* Clip duration selector + Volume slider */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <span className="block text-[11px] font-semibold text-[#1B1B4B] mb-1">
                        Durasi Maksimal Auto-Kompres (Loop)
                      </span>
                      <div className="grid grid-cols-3 gap-1">
                        {([30, 45, 60] as const).map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setAudioClipLimitSec(sec)}
                            className={`py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                              audioClipLimitSec === sec
                                ? 'bg-[#1F9B96] border-[#1F9B96] text-white'
                                : 'bg-white border-[#DDEEF3] text-[#1B1B4B] hover:border-[#1F9B96]'
                            }`}
                          >
                            {sec} dtk
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="studio-bg-audio-volume"
                        className="flex items-center justify-between text-[11px] font-semibold text-[#1B1B4B] mb-1"
                      >
                        <span className="inline-flex items-center gap-1">
                          <Volume2 className="w-3.5 h-3.5 text-[#1F9B96]" />
                          <span>Volume Musik</span>
                        </span>
                        <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums">
                          {config.bgAudioVolume ?? 75}%
                        </span>
                      </label>
                      <input
                        id="studio-bg-audio-volume"
                        type="range"
                        min={10}
                        max={100}
                        step={5}
                        value={config.bgAudioVolume ?? 75}
                        onChange={(e) =>
                          onChangeConfig({
                            ...config,
                            bgAudioVolume: Number(e.target.value),
                          })
                        }
                        className="w-full accent-[#1F9B96]"
                      />
                    </div>
                  </div>

                  {/* Native Audio Test Player */}
                  {(config.bgAudioDataUrl || config.bgAudioUrl) && (
                    <div className="rounded-xl bg-white border border-[#DDEEF3] p-2">
                      <audio
                        key={config.bgAudioDataUrl || config.bgAudioUrl}
                        src={config.bgAudioDataUrl || config.bgAudioUrl}
                        controls
                        preload="metadata"
                        className="w-full h-9"
                      />
                    </div>
                  )}

                  {/* Optional External Audio URL */}
                  <div>
                    <label
                      htmlFor="studio-bg-audio-url"
                      className="block text-[11px] font-semibold text-[#1B1B4B] mb-1"
                    >
                      Atau URL Audio Online Langsung (Opsional · .mp3 / .m4a)
                    </label>
                    <input
                      id="studio-bg-audio-url"
                      type="url"
                      value={config.bgAudioUrl ?? ''}
                      onChange={(e) =>
                        onChangeConfig({
                          ...config,
                          bgAudioUrl: e.target.value,
                          ...(e.target.value.trim()
                            ? { bgAudioDataUrl: '', bgAudioName: '', bgAudioDurationSec: 0 }
                            : {}),
                        })
                      }
                      placeholder="https://contoh.com/musik-undangan.mp3"
                      className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[11.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                    />
                  </div>
                </div>
              </div>,
                'Auto kompres MP3 <= 300 KB · hemat kuota Firebase'
              )}
            </div>
          )}

          {/* TAB 2: SAMPUL & SEGEL 3D (ALL COVER SETTINGS IN ONE PLACE) */}
          {sectionTab === 'seal' && (
            <div className="space-y-3">
              {renderAccordionCard(
                'cover-seal',
                'Logo Segel Emas 3D (Wax Seal)',
                <span
                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                    config.showSeal !== false
                      ? 'bg-[#FFF7D6] text-[#9A7409]'
                      : 'bg-[#F4FBFD] text-[#757E96]'
                  }`}
                >
                  {config.showSeal !== false ? 'Aktif' : 'Sembunyi'}
                </span>,
                <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11.5px] text-[#757E96]">
                  Atur ukuran, posisi X/Y, atau ganti logo segel pembuka di sampul.
                </p>
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
                </>,
                'Ukuran, posisi X/Y & logo kustom segel pembuka'
              )}

              {/* Accordion 2: Cover Text & Panel Scale */}
              {renderAccordionCard(
                'cover-text',
                'Teks & Ukuran Sampul',
                <span className="px-2 py-0.5 rounded-full bg-[#F4FBFD] border border-[#DDEEF3] text-[10.5px] font-bold text-[#1B1B4B] tabular-nums">
                  Box {currentPanelScales.cover}%
                </span>,
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
                        onChange={(e) => {
                          onChangeConfig({ ...config, coverBadge: e.target.value });
                          jumpPreviewTo('sealed');
                        }}
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
                        onChange={(e) => {
                          onChangeConfig({
                            ...config,
                            openButtonText: e.target.value,
                          });
                          jumpPreviewTo('sealed');
                        }}
                        placeholder="Sentuh Segel untuk Membuka"
                        className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B]"
                      />
                    </div>
                  </div>

                  {/* Per-Slide Cover Sizes: Nama Tamu & Instansi + Lebar Tombol */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {renderExtraSizeStepper(
                      'coverNameSize',
                      'Ukuran Nama Tamu',
                      22,
                      12,
                      34,
                      { phase: 'sealed' }
                    )}
                    {renderExtraSizeStepper(
                      'coverInstitutionSize',
                      'Ukuran Instansi / Jabatan',
                      13,
                      10,
                      24,
                      { phase: 'sealed' }
                    )}
                  </div>

                  <div className="rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 flex items-center gap-3">
                    <span className="text-[11px] font-semibold text-[#1B1B4B] shrink-0">
                      Lebar Tombol Pembuka
                    </span>
                    <input
                      type="range"
                      min={60}
                      max={100}
                      step={2}
                      value={currentSlideExtras.coverButtonWidth}
                      onChange={(e) =>
                        updateSlideExtras(
                          { coverButtonWidth: Number(e.target.value) },
                          { phase: 'sealed' }
                        )
                      }
                      className="flex-1 accent-[#1F9B96]"
                    />
                    <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums w-9 text-right">
                      {currentSlideExtras.coverButtonWidth}%
                    </span>
                  </div>

                  {/* Per-Slide Cover Visibility Toggles */}
                  <div className="rounded-xl border border-[#DDEEF3] bg-[#FAFEFD] px-3 py-2.5 space-y-2">
                    <div className="text-[11px] font-bold text-[#1B1B4B]">
                      Elemen Tampil di Sampul
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#1B1B4B] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={currentSlideExtras.showCoverBadge !== false}
                          onChange={(e) =>
                            updateSlideExtras(
                              { showCoverBadge: e.target.checked },
                              { phase: 'sealed' }
                            )
                          }
                          className="w-4 h-4 accent-[#1F9B96] rounded"
                        />
                        <span>Label Atas</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#1B1B4B] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={
                            currentSlideExtras.showCoverInstitution !== false
                          }
                          onChange={(e) =>
                            updateSlideExtras(
                              { showCoverInstitution: e.target.checked },
                              { phase: 'sealed' }
                            )
                          }
                          className="w-4 h-4 accent-[#1F9B96] rounded"
                        />
                        <span>Instansi Tamu</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#1B1B4B] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={currentSlideExtras.showCoverQuickRsvp !== false}
                          onChange={(e) =>
                            updateSlideExtras(
                              { showCoverQuickRsvp: e.target.checked },
                              { phase: 'sealed' }
                            )
                          }
                          className="w-4 h-4 accent-[#1F9B96] rounded"
                        />
                        <span>Link RSVP Cepat</span>
                      </label>
                    </div>

                    {currentSlideExtras.showCoverQuickRsvp !== false && (
                      <div className="pt-1">
                        <label
                          htmlFor="studio-cover-quick-rsvp"
                          className="block text-[11px] font-semibold text-[#5A647B] mb-1"
                        >
                          Teks Link RSVP Cepat (Bawah Sampul)
                        </label>
                        <input
                          id="studio-cover-quick-rsvp"
                          type="text"
                          maxLength={60}
                          value={currentSlideExtras.coverQuickRsvpText}
                          onChange={(e) =>
                            updateSlideExtras(
                              { coverQuickRsvpText: e.target.value },
                              { phase: 'sealed' }
                            )
                          }
                          placeholder="Langsung ke Konfirmasi RSVP"
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-1.5 text-[12px] text-[#1B1B4B]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Per-Slide Style Override for Cover */}
                  {renderPerSlideStyleBox('cover', 'Sampul')}
                </>,
                'Label atas, tombol, ukuran, elemen & gaya khusus sampul'
              )}

              {/* Accordion 3: Cover Position & Clean Brightness */}
              {renderAccordionCard(
                'cover-layout',
                'Posisi Teks Sampul & Pencahayaan',
                <span className="px-2 py-0.5 rounded-full bg-[#F4FBFD] border border-[#DDEEF3] text-[10.5px] font-bold text-[#1B1B4B] tabular-nums">
                  {(config.coverOverlayDarkness ?? 0) === 0
                    ? 'Bersih 0%'
                    : `Gelap ${config.coverOverlayDarkness}%`}
                </span>,
                <>
                  {((config.coverOverlayDarkness ?? 0) !== 0 ||
                    (config.coverTopOffsetY ?? 0) !== 0 ||
                    (config.coverBottomOffsetY ?? 0) !== 0) && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          onChangeConfig({
                            ...config,
                            coverOverlayDarkness: 0,
                            coverTopOffsetY: 0,
                            coverBottomOffsetY: 0,
                          });
                          jumpPreviewTo('sealed');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#B2E3F0] bg-[#F4FBFD] text-[10.5px] font-semibold text-[#157A76]"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Sampul</span>
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label
                        htmlFor="studio-cover-darkness"
                        className="flex items-center justify-between text-[11px] font-semibold text-[#1B1B4B] mb-1"
                      >
                        <span>Gelap Sampul</span>
                        <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums">
                          {(config.coverOverlayDarkness ?? 0) === 0
                            ? '0% (Bersih)'
                            : `${config.coverOverlayDarkness}%`}
                        </span>
                      </label>
                      <input
                        id="studio-cover-darkness"
                        type="range"
                        min={0}
                        max={70}
                        step={5}
                        value={config.coverOverlayDarkness ?? 0}
                        onChange={(e) => {
                          onChangeConfig({
                            ...config,
                            coverOverlayDarkness: Number(e.target.value),
                          });
                          jumpPreviewTo('sealed');
                        }}
                        className="w-full accent-[#1F9B96]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="studio-cover-top-y"
                        className="flex items-center justify-between text-[11px] font-semibold text-[#1B1B4B] mb-1"
                      >
                        <span>Geser Teks Atas</span>
                        <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums">
                          {(config.coverTopOffsetY ?? 0) > 0
                            ? `+${config.coverTopOffsetY}px`
                            : `${config.coverTopOffsetY ?? 0}px`}
                        </span>
                      </label>
                      <input
                        id="studio-cover-top-y"
                        type="range"
                        min={-40}
                        max={80}
                        step={2}
                        value={config.coverTopOffsetY ?? 0}
                        onChange={(e) => {
                          onChangeConfig({
                            ...config,
                            coverTopOffsetY: Number(e.target.value),
                          });
                          jumpPreviewTo('sealed');
                        }}
                        className="w-full accent-[#1F9B96]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="studio-cover-bottom-y"
                        className="flex items-center justify-between text-[11px] font-semibold text-[#1B1B4B] mb-1"
                      >
                        <span>Geser Tombol Bawah</span>
                        <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums">
                          {(config.coverBottomOffsetY ?? 0) > 0
                            ? `+${config.coverBottomOffsetY}px`
                            : `${config.coverBottomOffsetY ?? 0}px`}
                        </span>
                      </label>
                      <input
                        id="studio-cover-bottom-y"
                        type="range"
                        min={-80}
                        max={40}
                        step={2}
                        value={config.coverBottomOffsetY ?? 0}
                        onChange={(e) => {
                          onChangeConfig({
                            ...config,
                            coverBottomOffsetY: Number(e.target.value),
                          });
                          jumpPreviewTo('sealed');
                        }}
                        className="w-full accent-[#1F9B96]"
                      />
                    </div>
                  </div>
                </>,
                'Geser posisi teks atas/bawah & redup latar sampul opsional'
              )}
            </div>
          )}

          {/* TAB 4: HURUF, WARNA & KOTAK PANEL (ZERO DUPLICATION, CLEAN ACCORDION) */}
          {sectionTab === 'style' && (
            <div className="space-y-3">
              {renderDarkLightQuickBar()}
              {/* Accordion 1: Compact 12-Font Selector & Readability */}
              {renderAccordionCard(
                'style-fonts',
                'Jenis Huruf (12 Font) & Keterbacaan',
                <span className="px-2 py-0.5 rounded-full bg-[#E3F5FA] text-[10.5px] font-bold text-[#167F7B] max-w-[140px] truncate">
                  {activeHeadingFont === activeBodyFont
                    ? activeHeadingFont
                    : `${activeHeadingFont} · ${activeBodyFont}`}
                </span>,
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label
                          htmlFor="studio-heading-font"
                          className="text-[11.5px] font-semibold text-[#1B1B4B]"
                        >
                          Font Judul Utama
                        </label>
                        {activeHeadingFont !== activeBodyFont && (
                          <button
                            type="button"
                            onClick={() =>
                              onChangeConfig({
                                ...config,
                                bodyFont: activeHeadingFont,
                              })
                            }
                            className="text-[10.5px] font-semibold text-[#1F9B96] hover:underline"
                          >
                            Samakan ke Isi
                          </button>
                        )}
                      </div>
                      <select
                        id="studio-heading-font"
                        value={activeHeadingFont}
                        onChange={(e) =>
                          onChangeConfig({
                            ...config,
                            headingFont: e.target.value,
                          })
                        }
                        style={{
                          fontFamily: getStudioFontCssFamily(activeHeadingFont),
                        }}
                        className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[13px] font-bold text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                      >
                        {STUDIO_FONTS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label} — {f.sampleTag}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label
                          htmlFor="studio-body-font"
                          className="text-[11.5px] font-semibold text-[#1B1B4B]"
                        >
                          Font Teks Isi &amp; Detail
                        </label>
                        {activeHeadingFont !== activeBodyFont && (
                          <button
                            type="button"
                            onClick={() =>
                              onChangeConfig({
                                ...config,
                                headingFont: activeBodyFont,
                              })
                            }
                            className="text-[10.5px] font-semibold text-[#1F9B96] hover:underline"
                          >
                            Samakan ke Judul
                          </button>
                        )}
                      </div>
                      <select
                        id="studio-body-font"
                        value={activeBodyFont}
                        onChange={(e) =>
                          onChangeConfig({
                            ...config,
                            bodyFont: e.target.value,
                          })
                        }
                        style={{
                          fontFamily: getStudioFontCssFamily(activeBodyFont),
                        }}
                        className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[13px] font-semibold text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                      >
                        {STUDIO_FONTS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label} — {f.sampleTag}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Live Typography Specimen Preview (Adapts to Light & Dark Surface Mode) */}
                  <div
                    style={{
                      backgroundColor:
                        config.panelBgColor ||
                        (currentSurfaceMode === 'light' ? '#FFFFFF' : '#13120F'),
                      borderColor:
                        currentSlideExtras.panelBorderColor ||
                        (currentSurfaceMode === 'light'
                          ? '#CBD5E1'
                          : 'rgba(212,175,55,0.35)'),
                    }}
                    className="rounded-xl border px-3.5 py-2.5 text-center space-y-0.5 transition-colors"
                  >
                    <div
                      style={{
                        fontFamily: getStudioFontCssFamily(activeHeadingFont),
                        color:
                          config.titleColor ||
                          (currentSurfaceMode === 'light' ? '#151109' : '#F3D88B'),
                      }}
                      className="text-[15px] font-extrabold leading-snug"
                    >
                      {metadata.eventName || 'Undangan Resmi Acara'}
                    </div>
                    <div
                      style={{
                        fontFamily: getStudioFontCssFamily(activeBodyFont),
                        color:
                          config.bodyColor ||
                          (currentSurfaceMode === 'light' ? '#1E293B' : '#FDFBF7'),
                        fontWeight: config.textBold ? 700 : 400,
                      }}
                      className="text-[11.5px] opacity-90"
                    >
                      Kepada Yth. Bapak/Ibu Tamu Undangan
                    </div>
                  </div>

                  {/* Readability Strip: Scale, Shadow, Bold, Alignment */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <div className="text-[10.5px] font-semibold text-[#5A647B] mb-1">
                        Skala Teks
                      </div>
                      <div className="grid grid-cols-3 gap-0.5 rounded-xl bg-[#F4FBFD] p-0.5 border border-[#DDEEF3]">
                        {(
                          [
                            { id: 'sm', label: 'S' },
                            { id: 'md', label: 'M' },
                            { id: 'lg', label: 'L' },
                          ] as { id: InteractiveTextScale; label: string }[]
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              onChangeConfig({ ...config, textScale: opt.id })
                            }
                            className={`py-1 rounded-lg text-[11px] font-bold ${
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
                      <div className="text-[10.5px] font-semibold text-[#5A647B] mb-1">
                        Bayangan Teks
                      </div>
                      <div className="grid grid-cols-3 gap-0.5 rounded-xl bg-[#F4FBFD] p-0.5 border border-[#DDEEF3]">
                        {(
                          [
                            { id: 'none', label: 'Off' },
                            { id: 'soft', label: 'Halus' },
                            { id: 'strong', label: 'Kuat' },
                          ] as { id: InteractiveTextShadow; label: string }[]
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              onChangeConfig({ ...config, textShadow: opt.id })
                            }
                            className={`py-1 rounded-lg text-[10px] font-bold ${
                              (config.textShadow ?? 'soft') === opt.id
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
                      <div className="text-[10.5px] font-semibold text-[#5A647B] mb-1">
                        Ketebalan Isi
                      </div>
                      <div className="grid grid-cols-2 gap-0.5 rounded-xl bg-[#F4FBFD] p-0.5 border border-[#DDEEF3]">
                        <button
                          type="button"
                          onClick={() =>
                            onChangeConfig({ ...config, textBold: false })
                          }
                          className={`py-1 rounded-lg text-[10.5px] font-semibold ${
                            !config.textBold
                              ? 'bg-[#1F9B96] text-white'
                              : 'text-[#5A647B]'
                          }`}
                        >
                          Normal
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeConfig({ ...config, textBold: true })
                          }
                          className={`py-1 rounded-lg text-[10.5px] font-bold ${
                            config.textBold
                              ? 'bg-[#1F9B96] text-white'
                              : 'text-[#5A647B]'
                          }`}
                        >
                          Tebal
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10.5px] font-semibold text-[#5A647B] mb-1">
                        Perataan
                      </div>
                      <div className="grid grid-cols-2 gap-0.5 rounded-xl bg-[#F4FBFD] p-0.5 border border-[#DDEEF3]">
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
                            className={`py-1 rounded-lg text-[10.5px] font-semibold ${
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
                </>,
                'Pilih font Judul & Isi, bayangan, ketebalan, serta skala'
              )}

              {/* Accordion 2: 4-Zone Colors with Live Color Dot Summary */}
              {renderAccordionCard(
                'style-colors',
                'Warna Teks & Tombol',
                <div className="flex items-center gap-1" aria-hidden="true">
                  {[
                    config.titleColor || '#F3D88B',
                    config.bodyColor || '#FDFBF7',
                    config.accentColor || '#E6C775',
                    config.buttonColor || '#DFB454',
                  ].map((hex, idx) => (
                    <span
                      key={idx}
                      style={{ backgroundColor: hex }}
                      className="w-3.5 h-3.5 rounded-full border border-[#CBD5E1]"
                    />
                  ))}
                </div>,
                <>
                  {(() => {
                    const defaultPanelHex =
                      config.theme === 'emerald-light'
                        ? '#FFFFFF'
                        : config.theme === 'navy-gold'
                          ? '#0E162B'
                          : '#13120F';
                    const effPanelHex = config.panelBgColor || defaultPanelHex;
                    const effBodyHex =
                      config.bodyColor ||
                      (getRelativeLuminance(effPanelHex) > 0.42
                        ? '#1E293B'
                        : '#FDFBF7');
                    const contrast = getHexContrastRatio(effBodyHex, effPanelHex);
                    const isLowContrast =
                      (config.panelOpacity ?? 85) >= 25 &&
                      Boolean(config.bodyColor) &&
                      contrast < 3.0;
                    if (!isLowContrast) return null;
                    const isLightPanel = getRelativeLuminance(effPanelHex) > 0.42;
                    return (
                      <div className="rounded-xl border border-[#F3D34F] bg-[#FFFBEB] px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-[#7A5908] leading-snug">
                          Warna teks isi terlalu mirip dengan warna kotak panel (kontras {contrast.toFixed(1)}:1).
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeConfig({
                              ...config,
                              titleColor: isLightPanel ? '#151109' : '#F3D88B',
                              bodyColor: isLightPanel ? '#1E293B' : '#FDFBF7',
                              accentColor: isLightPanel ? '#8A5A10' : '#E6C775',
                            })
                          }
                          className="px-2.5 py-1 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[10.5px] font-bold shrink-0"
                        >
                          Perbaiki Kontras Otomatis
                        </button>
                      </div>
                    );
                  })()}

                  {(config.titleColor ||
                    config.bodyColor ||
                    config.accentColor ||
                    config.buttonColor ||
                    currentSlideExtras.buttonTextColor ||
                    currentSlideExtras.secondaryButtonColor ||
                    currentSlideExtras.secondaryButtonTextColor) && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          onChangeConfig({
                            ...config,
                            titleColor: '',
                            bodyColor: '',
                            accentColor: '',
                            buttonColor: '',
                            slideExtras: {
                              ...currentSlideExtras,
                              buttonTextColor: '',
                              secondaryButtonColor: '',
                              secondaryButtonTextColor: '',
                            },
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#B2E3F0] bg-[#F4FBFD] text-[10.5px] font-semibold text-[#157A76]"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Semua Warna</span>
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(
                      [
                        {
                          key: 'titleColor' as const,
                          label: 'Judul Utama',
                          fallbackHex: '#F3D88B',
                        },
                        {
                          key: 'bodyColor' as const,
                          label: 'Teks Isi & Nama',
                          fallbackHex: '#FDFBF7',
                        },
                        {
                          key: 'accentColor' as const,
                          label: 'Aksen & Label',
                          fallbackHex: '#E6C775',
                        },
                        {
                          key: 'buttonColor' as const,
                          label: 'Tombol Pembuka & RSVP',
                          fallbackHex: '#DFB454',
                        },
                      ] as const
                    ).map((slot) => {
                      const val = config[slot.key] || '';
                      return (
                        <div
                          key={slot.key}
                          className="rounded-xl border border-[#DDEEF3] bg-[#FAFEFD] p-2.5 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-[11px] font-bold text-[#1B1B4B] truncate">
                              {slot.label}
                            </span>
                            <label className="inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                              <span className="text-[10px] font-mono text-[#757E96] uppercase">
                                {val || 'Tema'}
                              </span>
                              <input
                                type="color"
                                aria-label={`Pilih warna ${slot.label}`}
                                value={val || slot.fallbackHex}
                                onChange={(e) =>
                                  onChangeConfig({
                                    ...config,
                                    [slot.key]: e.target.value,
                                  })
                                }
                                className="w-6 h-6 rounded-md border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                              />
                            </label>
                          </div>

                          <div className="flex items-center justify-between gap-1">
                            {[
                              { hex: '#F3D88B', name: 'Emas' },
                              { hex: '#FFFFFF', name: 'Putih' },
                              { hex: '#FDFBF7', name: 'Krem' },
                              { hex: '#1F9B96', name: 'Tosca' },
                              { hex: '#1B1B4B', name: 'Navy' },
                              { hex: '#151109', name: 'Hitam' },
                              { hex: '#8B1E3F', name: 'Marun' },
                            ].map((sw) => {
                              const isSelected =
                                val.toLowerCase() === sw.hex.toLowerCase();
                              return (
                                <button
                                  key={sw.hex}
                                  type="button"
                                  title={`${slot.label}: ${sw.name}`}
                                  aria-label={`Set ${slot.label} ke ${sw.name}`}
                                  onClick={() =>
                                    onChangeConfig({
                                      ...config,
                                      [slot.key]: sw.hex,
                                    })
                                  }
                                  style={{ backgroundColor: sw.hex }}
                                  className={`w-5 h-5 rounded-full border transition-transform active:scale-90 ${
                                    isSelected
                                      ? 'ring-2 ring-[#1F9B96] ring-offset-1 border-[#1F9B96]'
                                      : 'border-[#CBD5E1]'
                                  }`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Extended Button Colors: Primary Text, Secondary Peta/Kalender BG & Text */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-[#EDF5F8]">
                    {(
                      [
                        {
                          field: 'buttonTextColor' as const,
                          label: 'Teks Tombol Utama',
                          fallback: '#151109',
                        },
                        {
                          field: 'secondaryButtonColor' as const,
                          label: 'Tombol Peta/Kalender',
                          fallback: '#1B1811',
                        },
                        {
                          field: 'secondaryButtonTextColor' as const,
                          label: 'Teks Peta/Kalender',
                          fallback: '#FCE9B2',
                        },
                      ] as const
                    ).map((slot) => {
                      const val = currentSlideExtras[slot.field] || '';
                      return (
                        <div
                          key={slot.field}
                          className="rounded-xl border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-2 flex items-center justify-between gap-1.5"
                        >
                          <div className="min-w-0">
                            <div className="text-[10.5px] font-bold text-[#1B1B4B] truncate">
                              {slot.label}
                            </div>
                            <div className="text-[9.5px] font-mono text-[#757E96] uppercase">
                              {val || 'Auto'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {val && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateSlideExtras({ [slot.field]: '' })
                                }
                                title="Reset ke otomatis"
                                className="text-[10.5px] font-bold text-[#757E96] hover:text-[#B83B5E] px-0.5"
                              >
                                ×
                              </button>
                            )}
                            <input
                              type="color"
                              aria-label={`Pilih warna ${slot.label}`}
                              value={val || slot.fallback}
                              onChange={(e) =>
                                updateSlideExtras({
                                  [slot.field]: e.target.value,
                                })
                              }
                              className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>,
                'Atur warna judul, isi, label aksen & semua tombol'
              )}

              {/* Accordion 3: Theme, Panel Box & Position */}
              {renderAccordionCard(
                'style-panel',
                'Tema Dasar, Kotak Panel & Posisi',
                <span className="px-2 py-0.5 rounded-full bg-[#F4FBFD] border border-[#DDEEF3] text-[10.5px] font-bold text-[#1B1B4B] tabular-nums">
                  {(config.panelPosition ?? 'center') === 'top'
                    ? 'Atas'
                    : (config.panelPosition ?? 'center') === 'bottom'
                      ? 'Bawah'
                      : 'Tengah'}{' '}
                  · {config.panelOpacity ?? 85}%
                </span>,
                <>
                  {/* Base Theme Swatches */}
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

                  {/* Card Style + Panel Color + Panel Opacity */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <div className="text-[11px] font-semibold text-[#1B1B4B] mb-1">
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
                            className={`py-1 rounded-lg text-[10.5px] font-semibold ${
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

                    <div className="rounded-xl border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-2 flex flex-col justify-between">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[11px] font-semibold text-[#1B1B4B]">
                          Warna Kotak
                        </span>
                        <div className="flex items-center gap-1">
                          {config.panelBgColor && (
                            <button
                              type="button"
                              onClick={() =>
                                onChangeConfig({ ...config, panelBgColor: '' })
                              }
                              className="text-[10px] font-semibold text-[#157A76] hover:underline"
                            >
                              Reset
                            </button>
                          )}
                          <input
                            type="color"
                            aria-label="Pilih warna kotak panel"
                            value={config.panelBgColor || '#13120F'}
                            onChange={(e) =>
                              onChangeConfig({
                                ...config,
                                panelBgColor: e.target.value,
                              })
                            }
                            className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-1.5">
                        {['#13120F', '#0E162B', '#0F4C49', '#FFFFFF', '#FFFBF0'].map(
                          (hex) => (
                            <button
                              key={hex}
                              type="button"
                              onClick={() =>
                                onChangeConfig({ ...config, panelBgColor: hex })
                              }
                              style={{ backgroundColor: hex }}
                              className={`w-4.5 h-4.5 rounded-full border ${
                                (config.panelBgColor || '').toLowerCase() ===
                                hex.toLowerCase()
                                  ? 'ring-2 ring-[#1F9B96] border-[#1F9B96]'
                                  : 'border-[#CBD5E1]'
                              }`}
                            />
                          )
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-2 flex flex-col justify-center">
                      <label
                        htmlFor="studio-panel-opacity"
                        className="flex items-center justify-between text-[11px] font-semibold text-[#1B1B4B] mb-1"
                      >
                        <span>Kepekatan</span>
                        <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums">
                          {(config.panelOpacity ?? 85) === 0
                            ? '0%'
                            : `${config.panelOpacity ?? 85}%`}
                        </span>
                      </label>
                      <input
                        id="studio-panel-opacity"
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={config.panelOpacity ?? 85}
                        onChange={(e) =>
                          onChangeConfig({
                            ...config,
                            panelOpacity: Number(e.target.value),
                          })
                        }
                        className="w-full accent-[#1F9B96]"
                      />
                    </div>
                  </div>

                  {/* Extended Global Panel Dimensions, Border, Radius, Blur & Padding */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 border-t border-[#EDF5F8]">
                    {/* Border Color + Style */}
                    <div className="rounded-xl border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-semibold text-[#1B1B4B]">
                          Bingkai Panel
                        </span>
                        <div className="flex items-center gap-1">
                          {currentSlideExtras.panelBorderColor && (
                            <button
                              type="button"
                              onClick={() =>
                                updateSlideExtras({ panelBorderColor: '' })
                              }
                              className="text-[10px] font-semibold text-[#157A76] hover:underline"
                            >
                              Reset
                            </button>
                          )}
                          <input
                            type="color"
                            aria-label="Pilih warna bingkai panel"
                            value={currentSlideExtras.panelBorderColor || '#D4AF37'}
                            onChange={(e) =>
                              updateSlideExtras({
                                panelBorderColor: e.target.value,
                              })
                            }
                            className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1 rounded-lg bg-white p-0.5 border border-[#DDEEF3]">
                        {(
                          [
                            { id: 'none', label: 'Off' },
                            { id: 'thin', label: 'Tipis' },
                            { id: 'bold', label: 'Tegas' },
                          ] as { id: InteractivePanelBorderStyle; label: string }[]
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              updateSlideExtras({ panelBorderStyle: opt.id })
                            }
                            className={`py-1 rounded-md text-[10px] font-semibold ${
                              currentSlideExtras.panelBorderStyle === opt.id
                                ? 'bg-[#1F9B96] text-white'
                                : 'text-[#5A647B]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Radius + Blur */}
                    <div className="rounded-xl border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-2 space-y-1.5">
                      <div className="text-[11px] font-semibold text-[#1B1B4B]">
                        Sudut &amp; Blur Kaca
                      </div>
                      <div className="grid grid-cols-3 gap-1 rounded-lg bg-white p-0.5 border border-[#DDEEF3]">
                        {(
                          [
                            { id: 'sm', label: 'Tajam' },
                            { id: 'md', label: 'Sedang' },
                            { id: 'lg', label: 'Bulat' },
                          ] as { id: InteractivePanelRadius; label: string }[]
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              updateSlideExtras({ panelRadius: opt.id })
                            }
                            className={`py-1 rounded-md text-[10px] font-semibold ${
                              currentSlideExtras.panelRadius === opt.id
                                ? 'bg-[#1F9B96] text-white'
                                : 'text-[#5A647B]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-1 rounded-lg bg-white p-0.5 border border-[#DDEEF3]">
                        {(
                          [
                            { id: 'none', label: 'No Blur' },
                            { id: 'soft', label: 'Halus' },
                            { id: 'strong', label: 'Kuat' },
                          ] as { id: InteractivePanelBlur; label: string }[]
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              updateSlideExtras({ panelBlur: opt.id })
                            }
                            className={`py-1 rounded-md text-[9.5px] font-semibold ${
                              currentSlideExtras.panelBlur === opt.id
                                ? 'bg-[#1F9B96] text-white'
                                : 'text-[#5A647B]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Panel Width & Padding */}
                    <div className="rounded-xl border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-2 space-y-1.5">
                      <label
                        htmlFor="studio-panel-width"
                        className="flex items-center justify-between text-[11px] font-semibold text-[#1B1B4B]"
                      >
                        <span>Lebar Panel</span>
                        <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums">
                          {currentSlideExtras.panelWidth}%
                        </span>
                      </label>
                      <input
                        id="studio-panel-width"
                        type="range"
                        min={75}
                        max={100}
                        step={1}
                        value={currentSlideExtras.panelWidth}
                        onChange={(e) =>
                          updateSlideExtras({ panelWidth: Number(e.target.value) })
                        }
                        className="w-full accent-[#1F9B96]"
                      />
                      <div className="grid grid-cols-3 gap-1 rounded-lg bg-white p-0.5 border border-[#DDEEF3]">
                        {(
                          [
                            { id: 'compact', label: 'Rapat' },
                            { id: 'normal', label: 'Normal' },
                            { id: 'spacious', label: 'Lega' },
                          ] as { id: InteractivePanelPadding; label: string }[]
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              updateSlideExtras({ panelPadding: opt.id })
                            }
                            className={`py-0.5 rounded-md text-[10px] font-semibold ${
                              currentSlideExtras.panelPadding === opt.id
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

                  {/* Safe-Zone Panel Position & Story Overlay Darkness */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-[#EDF5F8]">
                    <div>
                      <div className="text-[11px] font-semibold text-[#1B1B4B] mb-1">
                        Posisi Panel Slide
                      </div>
                      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F4FBFD] p-1 border border-[#DDEEF3]">
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
                            className={`py-1 rounded-lg text-[10.5px] font-semibold ${
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
                        className="flex items-center justify-between text-[11px] font-semibold text-[#1B1B4B] mb-1"
                      >
                        <span>Geser Halus Panel</span>
                        <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums">
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
                        className="flex items-center justify-between text-[11px] font-semibold text-[#1B1B4B] mb-1"
                      >
                        <span>Gelap Latar Isi</span>
                        <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums">
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
                </>,
                'Tema dasar, warna & transparansi kotak, posisi vertikal'
              )}
            </div>
          )}

          {/* TAB 3: ISI SLIDE (SLIDE 1 · SLIDE 2 · RSVP — CLEAN & DIRECT) */}
          {sectionTab === 'slides' && (
            <div className="rounded-[20px] border border-[#E5F1F5] bg-white p-4 sm:p-5 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#1F9B96]" />
                  <h3 className="font-display font-bold text-[14.5px] text-[#1B1B4B]">
                    Edit Isi, Gambar &amp; Durasi Slide
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F4FBFD] p-1 border border-[#DDEEF3] w-full sm:w-auto">
                  {(
                    [
                      {
                        id: 'slide1',
                        label: 'Slide 1',
                        slide: 0 as const,
                      },
                      {
                        id: 'slide2',
                        label: 'Slide 2',
                        slide: 1 as const,
                      },
                      {
                        id: 'slide3',
                        label: 'Slide 3 (RSVP)',
                        slide: 2 as const,
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTextSlideTab(tab.id);
                        jumpPreviewTo('story', tab.slide);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap ${
                        activeTextSlideTab === tab.id
                          ? 'bg-[#1F9B96] text-white shadow-xs'
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
                {activeTextSlideTab === 'slide1' && (
                  <>
                    {renderPanelScaleBar('slide1', 'Slide 1')}

                    {/* 1.5:1 (3:2) Auto-Compressed Slide 1 Image Uploader */}
                    <div className="rounded-xl border border-dashed border-[#B5E4F1] bg-white p-3 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11.5px] font-bold text-[#1B1B4B]">
                            Gambar Slide 1 (Rasio 1,5:1 · Auto Kompres)
                          </div>
                          <div className="text-[10.5px] text-[#757E96]">
                            {config.slide1BannerDataUrl
                              ? `Aktif · ~${Math.max(1, Math.round((config.slide1BannerDataUrl.length * 3) / 4 / 1024))} KB ${config.slide1BannerDataUrl.startsWith('data:image/png') ? 'PNG Transparan' : 'WebP'} (1,5:1 · hemat kuota Firebase)`
                              : 'Mendukung JPG & PNG (transparan/solid) beresolusi 1,5:1 (540×360). Tampil di bawah nama acara.'}
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
                                  slide1BannerOffsetX: 0,
                                  slide1BannerOffsetY: 0,
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
                                : 'Upload Gambar 1,5:1'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {config.slide1BannerDataUrl && (
                        <div className="space-y-3 pt-1">
                          <div className="w-52 sm:w-60 aspect-[3/2] mx-auto rounded-lg overflow-hidden border border-[#DDEEF3] bg-[#0E0E10]">
                            <img
                              src={config.slide1BannerDataUrl}
                              alt="Pratinjau gambar Slide 1 (1,5:1)"
                              className={`w-full h-full block ${
                                config.slide1BannerDataUrl.startsWith('data:image/png')
                                  ? 'object-contain p-1'
                                  : 'object-cover'
                              }`}
                            />
                          </div>

                          {/* Geser Posisi Gambar Slide 1 (X / Y) */}
                          <div className="rounded-xl bg-[#F4FBFD] border border-[#DDEEF3] p-2.5 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-[11px] font-bold text-[#1B1B4B]">
                                  Geser Posisi Gambar Slide 1
                                </div>
                                <div className="text-[10px] text-[#757E96]">
                                  Bisa geser slider di bawah atau seret langsung gambar pada pratinjau HP.
                                </div>
                              </div>
                              {((config.slide1BannerOffsetX ?? 0) !== 0 ||
                                (config.slide1BannerOffsetY ?? 0) !== 0) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onChangeConfig({
                                      ...config,
                                      slide1BannerOffsetX: 0,
                                      slide1BannerOffsetY: 0,
                                    });
                                    jumpPreviewTo('story', 0);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#B2E3F0] bg-white text-[10.5px] font-semibold text-[#157A76] hover:bg-[#E3F5FA]"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Reset (0, 0)</span>
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label
                                  htmlFor="studio-banner-offset-x"
                                  className="flex items-center justify-between text-[11px] font-semibold text-[#1B1B4B] mb-1"
                                >
                                  <span>Kiri / Kanan (X)</span>
                                  <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums">
                                    {(config.slide1BannerOffsetX ?? 0) > 0
                                      ? `+${config.slide1BannerOffsetX}px`
                                      : `${config.slide1BannerOffsetX ?? 0}px`}
                                  </span>
                                </label>
                                <input
                                  id="studio-banner-offset-x"
                                  type="range"
                                  min={-80}
                                  max={80}
                                  step={1}
                                  value={config.slide1BannerOffsetX ?? 0}
                                  onChange={(e) => {
                                    onChangeConfig({
                                      ...config,
                                      slide1BannerOffsetX: Number(e.target.value),
                                    });
                                    jumpPreviewTo('story', 0);
                                  }}
                                  className="w-full accent-[#1F9B96]"
                                />
                              </div>

                              <div>
                                <label
                                  htmlFor="studio-banner-offset-y"
                                  className="flex items-center justify-between text-[11px] font-semibold text-[#1B1B4B] mb-1"
                                >
                                  <span>Atas / Bawah (Y)</span>
                                  <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums">
                                    {(config.slide1BannerOffsetY ?? 0) > 0
                                      ? `+${config.slide1BannerOffsetY}px`
                                      : `${config.slide1BannerOffsetY ?? 0}px`}
                                  </span>
                                </label>
                                <input
                                  id="studio-banner-offset-y"
                                  type="range"
                                  min={-80}
                                  max={80}
                                  step={1}
                                  value={config.slide1BannerOffsetY ?? 0}
                                  onChange={(e) => {
                                    onChangeConfig({
                                      ...config,
                                      slide1BannerOffsetY: Number(e.target.value),
                                    });
                                    jumpPreviewTo('story', 0);
                                  }}
                                  className="w-full accent-[#1F9B96]"
                                />
                              </div>
                            </div>
                          </div>
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

                    {/* Slide 1 Distinctive Sizes, Banner Width & Visibility */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {renderExtraSizeStepper(
                        'slide1TitleSize',
                        'Judul Acara',
                        21,
                        14,
                        34,
                        { phase: 'story', slide: 0 }
                      )}
                      {renderExtraSizeStepper(
                        'slide1RecipientSize',
                        'Nama Tamu',
                        18,
                        12,
                        30,
                        { phase: 'story', slide: 0 }
                      )}
                      {renderExtraSizeStepper(
                        'slide1InstitutionSize',
                        'Instansi',
                        12,
                        10,
                        22,
                        { phase: 'story', slide: 0 }
                      )}
                    </div>

                    {config.slide1BannerDataUrl && (
                      <div className="rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 flex items-center gap-3">
                        <span className="text-[11px] font-semibold text-[#1B1B4B] shrink-0">
                          Lebar Gambar Slide 1
                        </span>
                        <input
                          type="range"
                          min={50}
                          max={100}
                          step={2}
                          value={currentSlideExtras.slide1BannerWidth}
                          onChange={(e) =>
                            updateSlideExtras(
                              { slide1BannerWidth: Number(e.target.value) },
                              { phase: 'story', slide: 0 }
                            )
                          }
                          className="flex-1 accent-[#1F9B96]"
                        />
                        <span className="text-[10.5px] font-bold text-[#1F9B96] tabular-nums w-9 text-right">
                          {currentSlideExtras.slide1BannerWidth}%
                        </span>
                      </div>
                    )}

                    <div className="rounded-xl border border-[#DDEEF3] bg-white px-3 py-2.5 space-y-1.5">
                      <div className="text-[11px] font-bold text-[#1B1B4B]">
                        Elemen Tampil di Slide 1
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#1B1B4B] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={
                              currentSlideExtras.showSlide1Organizer !== false
                            }
                            onChange={(e) =>
                              updateSlideExtras(
                                { showSlide1Organizer: e.target.checked },
                                { phase: 'story', slide: 0 }
                              )
                            }
                            className="w-4 h-4 accent-[#1F9B96] rounded"
                          />
                          <span>Lencana Penyelenggara</span>
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#1B1B4B] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={currentSlideExtras.showSlide1Code !== false}
                            onChange={(e) =>
                              updateSlideExtras(
                                { showSlide1Code: e.target.checked },
                                { phase: 'story', slide: 0 }
                              )
                            }
                            className="w-4 h-4 accent-[#1F9B96] rounded"
                          />
                          <span>Kode Undangan</span>
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#1B1B4B] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={
                              currentSlideExtras.showSlide1Welcome !== false
                            }
                            onChange={(e) =>
                              updateSlideExtras(
                                { showSlide1Welcome: e.target.checked },
                                { phase: 'story', slide: 0 }
                              )
                            }
                            className="w-4 h-4 accent-[#1F9B96] rounded"
                          />
                          <span>Kalimat Sambutan</span>
                        </label>
                      </div>
                    </div>

                    {renderPerSlideStyleBox('slide1', 'Slide 1')}
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

                    {/* Slide 2 Distinctive Controls: Detail Size, Button Labels & Visibility */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="studio-slide2-maps-btn"
                          className="block text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                        >
                          Teks Tombol Peta
                        </label>
                        <input
                          id="studio-slide2-maps-btn"
                          type="text"
                          maxLength={40}
                          value={currentSlideExtras.slide2MapsButtonText}
                          onChange={(e) =>
                            updateSlideExtras(
                              { slide2MapsButtonText: e.target.value },
                              { phase: 'story', slide: 1 }
                            )
                          }
                          placeholder="Buka Peta"
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12px] text-[#1B1B4B]"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="studio-slide2-cal-btn"
                          className="block text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                        >
                          Teks Tombol Kalender
                        </label>
                        <input
                          id="studio-slide2-cal-btn"
                          type="text"
                          maxLength={40}
                          value={currentSlideExtras.slide2CalendarButtonText}
                          onChange={(e) =>
                            updateSlideExtras(
                              { slide2CalendarButtonText: e.target.value },
                              { phase: 'story', slide: 1 }
                            )
                          }
                          placeholder="Kalender"
                          className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12px] text-[#1B1B4B]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {renderExtraSizeStepper(
                        'slide2TitleSize',
                        'Ukuran Judul Acara',
                        16,
                        14,
                        32,
                        { phase: 'story', slide: 1 }
                      )}
                      {renderExtraSizeStepper(
                        'slide2DetailSize',
                        'Ukuran Tanggal & Lokasi',
                        13,
                        10,
                        22,
                        { phase: 'story', slide: 1 }
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                      <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#1B1B4B] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={currentSlideExtras.showSlide2Title !== false}
                          onChange={(e) =>
                            updateSlideExtras(
                              { showSlide2Title: e.target.checked },
                              { phase: 'story', slide: 1 }
                            )
                          }
                          className="w-4 h-4 accent-[#1F9B96] rounded"
                        />
                        <span>Judul Acara</span>
                      </label>
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

                    {renderPerSlideStyleBox('slide2', 'Slide 2')}
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

                    {/* Slide 3 Distinctive Controls: Submit Text, Represented Toggle, Custom RSVP Choice Labels */}
                    <div className="rounded-xl border border-[#DDEEF3] bg-white p-3 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[11.5px] font-bold text-[#1B1B4B]">
                            Opsi &amp; Label Tombol Form RSVP
                          </div>
                          <div className="text-[10.5px] text-[#757E96]">
                            Sesuaikan untuk acara dinas, adat, atau umum (matikan &ldquo;Diwakilkan&rdquo; jika non-dinas).
                          </div>
                        </div>
                        <label className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#1B1B4B] cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={
                              currentSlideExtras.showRepresentedOption !== false
                            }
                            onChange={(e) =>
                              updateSlideExtras(
                                { showRepresentedOption: e.target.checked },
                                { phase: 'story', slide: 2 }
                              )
                            }
                            className="w-4 h-4 accent-[#1F9B96] rounded"
                          />
                          <span>Opsi Diwakilkan</span>
                        </label>
                      </div>

                      <div
                        className={`grid grid-cols-1 gap-2.5 ${
                          currentSlideExtras.showRepresentedOption !== false
                            ? 'sm:grid-cols-3'
                            : 'sm:grid-cols-2'
                        }`}
                      >
                        <div>
                          <label
                            htmlFor="studio-rsvp-attending"
                            className="block text-[10.5px] font-semibold text-[#5A647B] mb-1"
                          >
                            Label Opsi Hadir
                          </label>
                          <input
                            id="studio-rsvp-attending"
                            type="text"
                            maxLength={40}
                            value={currentSlideExtras.rsvpAttendingLabel}
                            onChange={(e) =>
                              updateSlideExtras(
                                { rsvpAttendingLabel: e.target.value },
                                { phase: 'story', slide: 2 }
                              )
                            }
                            placeholder="Hadir Langsung"
                            className="w-full rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                          />
                        </div>
                        {currentSlideExtras.showRepresentedOption !== false && (
                          <div>
                            <label
                              htmlFor="studio-rsvp-represented"
                              className="block text-[10.5px] font-semibold text-[#5A647B] mb-1"
                            >
                              Label Opsi Diwakilkan
                            </label>
                            <input
                              id="studio-rsvp-represented"
                              type="text"
                              maxLength={40}
                              value={currentSlideExtras.rsvpRepresentedLabel}
                              onChange={(e) =>
                                updateSlideExtras(
                                  { rsvpRepresentedLabel: e.target.value },
                                  { phase: 'story', slide: 2 }
                                )
                              }
                              placeholder="Diwakilkan"
                              className="w-full rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                            />
                          </div>
                        )}
                        <div>
                          <label
                            htmlFor="studio-rsvp-declined"
                            className="block text-[10.5px] font-semibold text-[#5A647B] mb-1"
                          >
                            Label Opsi Berhalangan
                          </label>
                          <input
                            id="studio-rsvp-declined"
                            type="text"
                            maxLength={40}
                            value={currentSlideExtras.rsvpDeclinedLabel}
                            onChange={(e) =>
                              updateSlideExtras(
                                { rsvpDeclinedLabel: e.target.value },
                                { phase: 'story', slide: 2 }
                              )
                            }
                            placeholder="Belum Dapat Hadir"
                            className="w-full rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                          />
                        </div>
                      </div>

                      {/* Editable RSVP Option Descriptions */}
                      <div
                        className={`grid grid-cols-1 gap-2 ${
                          currentSlideExtras.showRepresentedOption !== false
                            ? 'sm:grid-cols-3'
                            : 'sm:grid-cols-2'
                        }`}
                      >
                        <input
                          type="text"
                          maxLength={80}
                          aria-label="Deskripsi opsi Hadir"
                          value={currentSlideExtras.rsvpAttendingDesc}
                          onChange={(e) =>
                            updateSlideExtras(
                              { rsvpAttendingDesc: e.target.value },
                              { phase: 'story', slide: 2 }
                            )
                          }
                          placeholder="Deskripsi Hadir..."
                          className="w-full rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-1 text-[11px] text-[#5A647B]"
                        />
                        {currentSlideExtras.showRepresentedOption !== false && (
                          <input
                            type="text"
                            maxLength={80}
                            aria-label="Deskripsi opsi Diwakilkan"
                            value={currentSlideExtras.rsvpRepresentedDesc}
                            onChange={(e) =>
                              updateSlideExtras(
                                { rsvpRepresentedDesc: e.target.value },
                                { phase: 'story', slide: 2 }
                              )
                            }
                            placeholder="Deskripsi Diwakilkan..."
                            className="w-full rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-1 text-[11px] text-[#5A647B]"
                          />
                        )}
                        <input
                          type="text"
                          maxLength={80}
                          aria-label="Deskripsi opsi Berhalangan"
                          value={currentSlideExtras.rsvpDeclinedDesc}
                          onChange={(e) =>
                            updateSlideExtras(
                              { rsvpDeclinedDesc: e.target.value },
                              { phase: 'story', slide: 2 }
                            )
                          }
                          placeholder="Deskripsi Berhalangan..."
                          className="w-full rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-1 text-[11px] text-[#5A647B]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label
                            htmlFor="studio-slide3-submit"
                            className="block text-[10.5px] font-semibold text-[#5A647B] mb-1"
                          >
                            Teks Tombol Kirim RSVP
                          </label>
                          <input
                            id="studio-slide3-submit"
                            type="text"
                            maxLength={60}
                            value={currentSlideExtras.slide3SubmitText}
                            onChange={(e) =>
                              updateSlideExtras(
                                { slide3SubmitText: e.target.value },
                                { phase: 'story', slide: 2 }
                              )
                            }
                            placeholder="Kirim Konfirmasi Kehadiran"
                            className="w-full rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="studio-rsvp-note-label"
                            className="block text-[10.5px] font-semibold text-[#5A647B] mb-1"
                          >
                            Label Kolom Catatan
                          </label>
                          <input
                            id="studio-rsvp-note-label"
                            type="text"
                            maxLength={50}
                            value={currentSlideExtras.rsvpNoteLabel}
                            onChange={(e) =>
                              updateSlideExtras(
                                { rsvpNoteLabel: e.target.value },
                                { phase: 'story', slide: 2 }
                              )
                            }
                            placeholder="Catatan (Opsional)"
                            className="w-full rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="studio-footer-text"
                            className="block text-[10.5px] font-semibold text-[#5A647B] mb-1"
                          >
                            Teks Footer Bawah
                          </label>
                          <input
                            id="studio-footer-text"
                            type="text"
                            maxLength={40}
                            value={currentSlideExtras.footerText}
                            onChange={(e) =>
                              updateSlideExtras(
                                { footerText: e.target.value },
                                { phase: 'story', slide: 2 }
                              )
                            }
                            placeholder="Kosongkan agar sembunyi"
                            className="w-full rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                          />
                        </div>
                      </div>
                    </div>

                    {renderPerSlideStyleBox('slide3', 'Slide 3 RSVP')}
                  </>
                )}
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

          {/* Quick Phase Jump Bar + Direct Preview Edit Mode Switcher */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-white p-1 border border-[#DDEEF3]">
              <button
                type="button"
                onClick={() => {
                  setPreviewEditMode(false);
                  setSelectedEditTarget(null);
                }}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl text-[11px] font-bold transition-all ${
                  !previewEditMode
                    ? 'bg-[#1F9B96] text-white shadow-xs'
                    : 'text-[#5A647B] hover:text-[#1B1B4B]'
                }`}
              >
                <Play className="w-3 h-3" />
                <span>Mode Tes Tamu</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewEditMode(true)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl text-[11px] font-bold transition-all ${
                  previewEditMode
                    ? 'bg-[#0EA5E9] text-white shadow-xs'
                    : 'text-[#5A647B] hover:text-[#1B1B4B]'
                }`}
              >
                <MousePointerClick className="w-3.5 h-3.5" />
                <span>Edit Langsung di Preview</span>
              </button>
            </div>

            {previewEditMode && (
              <div className="rounded-xl bg-[#E0F2FE] border border-[#7DD3FC] px-3 py-1.5 text-[10.5px] font-semibold text-[#0369A1] leading-snug">
                Ketuk elemen di layar HP untuk ubah warna/ukuran, atau seret langsung Segel 3D, Teks Sampul, Gambar &amp; Panel (ada garis bantu tengah otomatis).
              </div>
            )}

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
                  onClick={() => {
                    jumpPreviewTo(btn.phase, btn.slide);
                    setSelectedEditTarget(null);
                  }}
                  className="py-1.5 px-1 rounded-xl text-[11px] font-semibold text-[#1B1B4B] hover:bg-[#DCF5F1] hover:text-[#157A76] active:scale-95 transition-all truncate"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          <InteractiveInvitePage
            key={`${previewKey}-${previewRecipient.id}`}
            embeddedPreview
            previewJumpTarget={previewJumpTarget}
            previewEditMode={previewEditMode}
            selectedEditTarget={selectedEditTarget}
            onSelectEditTarget={(target) => setSelectedEditTarget(target)}
            onDirectDragChange={handleDirectDragChange}
            onUpdateSlide1BannerOffset={(offsetX, offsetY) => {
              onChangeConfig({
                ...config,
                slide1BannerOffsetX: offsetX,
                slide1BannerOffsetY: offsetY,
              });
            }}
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

          {/* Live 3-Tab Quick Edit Inspector for ANY Element in Direct Preview Edit Mode */}
          {previewEditMode && selectedEditTarget && (() => {
            const TARGET_LABELS: Record<PreviewEditTarget, string> = {
              'cover-top': 'Teks Atas Sampul',
              'cover-seal': 'Segel Emas 3D',
              'cover-bottom': 'Tombol Bawah Sampul',
              'slide1-organizer': 'Lencana Penyelenggara',
              'slide1-header': 'Judul Acara Slide 1',
              'slide1-banner': 'Gambar Slide 1',
              'slide1-panel': 'Kotak Panel Slide 1',
              'slide1-welcome': 'Sambutan Bawah Slide 1',
              'slide2-header': 'Judul Slide 2',
              'slide2-countdown': 'Kotak Hitung Mundur',
              'slide2-panel': 'Kotak Panel Slide 2',
              'slide2-buttons': 'Tombol Peta, Kalender & WA',
              'slide3-panel': 'Kotak Panel RSVP (Slide 3)',
              'story-nav': 'Bar Navigasi & Footer',
            };

            const targetSlideKey: 'cover' | 'slide1' | 'slide2' | 'slide3' =
              selectedEditTarget.startsWith('cover-')
                ? 'cover'
                : selectedEditTarget.startsWith('slide1-')
                  ? 'slide1'
                  : selectedEditTarget.startsWith('slide2-')
                    ? 'slide2'
                    : 'slide3';

            const ov = config.slideStyles?.[targetSlideKey] ?? {};
            const isPanelLike =
              selectedEditTarget === 'slide1-panel' ||
              selectedEditTarget === 'slide2-panel' ||
              selectedEditTarget === 'slide2-countdown' ||
              selectedEditTarget === 'slide3-panel';

            const defaultPanelHex =
              config.theme === 'emerald-light'
                ? '#FFFFFF'
                : config.theme === 'navy-gold'
                  ? '#0E162B'
                  : '#13120F';
            const effPanelHex =
              ov.panelBgColor || config.panelBgColor || defaultPanelHex;
            const effPanelOpacity =
              typeof ov.panelOpacity === 'number'
                ? ov.panelOpacity
                : config.panelOpacity ?? 85;
            const isLightPanel = getRelativeLuminance(effPanelHex) > 0.42;
            const effBodyHex =
              ov.bodyColor ||
              config.bodyColor ||
              (isLightPanel ? '#1E293B' : '#FDFBF7');
            const panelContrast = getHexContrastRatio(effBodyHex, effPanelHex);
            const showContrastAlert =
              isPanelLike &&
              effPanelOpacity >= 25 &&
              Boolean(ov.bodyColor || config.bodyColor) &&
              panelContrast < 3.0;

            const applyAutoContrastForSlide = () => {
              updatePerSlideStyle(
                targetSlideKey,
                {
                  titleColor: isLightPanel ? '#151109' : '#FCE9B2',
                  bodyColor: isLightPanel ? '#1E293B' : '#FDFBF7',
                  accentColor: isLightPanel ? '#8A5A10' : '#E6C775',
                },
                true
              );
            };

            return (
              <div className="rounded-2xl border-2 border-[#38BDF8] bg-white p-3 space-y-2.5 shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-[#0EA5E9] shrink-0" />
                    <span className="text-[11.5px] font-bold text-[#1B1B4B] truncate">
                      {TARGET_LABELS[selectedEditTarget]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openFullSettingsForTarget(selectedEditTarget)}
                      className="px-2 py-0.5 rounded-full bg-[#E0F2FE] hover:bg-[#BAE6FD] text-[10px] font-bold text-[#0369A1]"
                    >
                      Detail →
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedEditTarget(null)}
                      aria-label="Tutup Quick Edit"
                      className="px-1.5 py-0.5 rounded-full text-[11px] font-bold text-[#757E96] hover:bg-[#F4FBFD]"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* 3 Mini Inspector Tabs */}
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F4FBFD] p-0.5 border border-[#DDEEF3]">
                  {(
                    [
                      { id: 'text', label: 'Teks & Font' },
                      { id: 'color', label: 'Warna' },
                      { id: 'layout', label: 'Ukuran & Posisi' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setQuickEditTab(t.id)}
                      className={`py-1 rounded-lg text-[10.5px] font-bold transition-colors ${
                        quickEditTab === t.id
                          ? 'bg-[#0EA5E9] text-white shadow-xs'
                          : 'text-[#5A647B] hover:text-[#1B1B4B]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* TAB 1: TEKS & FONT */}
                {quickEditTab === 'text' && (
                  <div className="space-y-2">
                    {selectedEditTarget === 'cover-top' && (
                      <>
                        <input
                          type="text"
                          maxLength={60}
                          value={config.coverBadge}
                          onChange={(e) =>
                            onChangeConfig({ ...config, coverBadge: e.target.value })
                          }
                          placeholder="Label Atas Sampul (mis. Undangan Resmi)"
                          className="w-full rounded-lg border border-[#DDEEF3] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          {renderExtraSizeStepper('coverNameSize', 'Nama', 22, 12, 34, {
                            phase: 'sealed',
                          })}
                          {renderExtraSizeStepper(
                            'coverInstitutionSize',
                            'Instansi',
                            13,
                            10,
                            24,
                            { phase: 'sealed' }
                          )}
                        </div>
                      </>
                    )}

                    {selectedEditTarget === 'cover-bottom' && (
                      <>
                        <div className="grid grid-cols-1 gap-1.5">
                          <input
                            type="text"
                            maxLength={60}
                            value={config.openButtonText}
                            onChange={(e) =>
                              onChangeConfig({
                                ...config,
                                openButtonText: e.target.value,
                              })
                            }
                            placeholder="Teks Tombol Pembuka"
                            className="w-full rounded-lg border border-[#DDEEF3] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                          />
                          <input
                            type="text"
                            maxLength={60}
                            value={currentSlideExtras.coverQuickRsvpText}
                            onChange={(e) =>
                              updateSlideExtras({
                                coverQuickRsvpText: e.target.value,
                              })
                            }
                            placeholder="Teks Link RSVP Cepat"
                            className="w-full rounded-lg border border-[#DDEEF3] px-2.5 py-1.5 text-[11px] text-[#1B1B4B]"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10.5px] font-semibold text-[#5A647B]">
                            Ukuran Teks Tombol
                          </span>
                          {renderSizeStepper('openButtonText', 'Tombol', 10, 18)}
                        </div>
                      </>
                    )}

                    {selectedEditTarget === 'slide1-header' && (
                      <>
                        <input
                          type="text"
                          maxLength={80}
                          value={config.slide1Heading}
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              slide1Heading: e.target.value,
                            })
                          }
                          placeholder="Kalimat Pembuka Atas"
                          className="w-full rounded-lg border border-[#DDEEF3] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                        />
                        {renderExtraSizeStepper('slide1TitleSize', 'Ukuran Judul Acara', 21, 14, 34, {
                          phase: 'story',
                          slide: 0,
                        })}
                      </>
                    )}

                    {selectedEditTarget === 'slide1-panel' && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {renderExtraSizeStepper(
                          'slide1RecipientSize',
                          'Nama',
                          18,
                          12,
                          30,
                          { phase: 'story', slide: 0 }
                        )}
                        {renderExtraSizeStepper(
                          'slide1InstitutionSize',
                          'Instansi',
                          12,
                          10,
                          22,
                          { phase: 'story', slide: 0 }
                        )}
                      </div>
                    )}

                    {selectedEditTarget === 'slide1-welcome' && (
                      <>
                        <textarea
                          rows={2}
                          maxLength={300}
                          value={config.welcomeNote}
                          onChange={(e) =>
                            onChangeConfig({ ...config, welcomeNote: e.target.value })
                          }
                          className="w-full rounded-lg border border-[#DDEEF3] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-[10.5px] font-semibold text-[#5A647B]">
                            Ukuran Teks Sambutan
                          </span>
                          {renderSizeStepper('welcomeNote', 'Sambutan', 9, 18)}
                        </div>
                      </>
                    )}

                    {selectedEditTarget === 'slide2-header' && (
                      <>
                        <input
                          type="text"
                          maxLength={80}
                          value={config.slide2Heading}
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              slide2Heading: e.target.value,
                            })
                          }
                          placeholder="Judul Bagian Slide 2"
                          className="w-full rounded-lg border border-[#DDEEF3] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                        />
                        {renderExtraSizeStepper('slide2TitleSize', 'Ukuran Judul Acara', 16, 14, 32, {
                          phase: 'story',
                          slide: 1,
                        })}
                      </>
                    )}

                    {selectedEditTarget === 'slide2-panel' && (
                      <>
                        {renderExtraSizeStepper(
                          'slide2DetailSize',
                          'Ukuran Tanggal & Lokasi',
                          13,
                          10,
                          22,
                          { phase: 'story', slide: 1 }
                        )}
                        <input
                          type="text"
                          value={config.dresscode}
                          onChange={(e) =>
                            onChangeConfig({ ...config, dresscode: e.target.value })
                          }
                          placeholder="Dresscode / Catatan Pakaian (opsional)"
                          className="w-full rounded-lg border border-[#DDEEF3] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                        />
                      </>
                    )}

                    {selectedEditTarget === 'slide2-buttons' && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          maxLength={40}
                          value={currentSlideExtras.slide2MapsButtonText}
                          onChange={(e) =>
                            updateSlideExtras({
                              slide2MapsButtonText: e.target.value,
                            })
                          }
                          placeholder="Teks Tombol Peta"
                          className="w-full rounded-lg border border-[#DDEEF3] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                        />
                        <input
                          type="text"
                          maxLength={40}
                          value={currentSlideExtras.slide2CalendarButtonText}
                          onChange={(e) =>
                            updateSlideExtras({
                              slide2CalendarButtonText: e.target.value,
                            })
                          }
                          placeholder="Teks Tombol Kalender"
                          className="w-full rounded-lg border border-[#DDEEF3] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                        />
                      </div>
                    )}

                    {selectedEditTarget === 'slide3-panel' && (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          maxLength={80}
                          value={config.slide3Heading}
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              slide3Heading: e.target.value,
                            })
                          }
                          placeholder="Judul Form RSVP"
                          className="w-full rounded-lg border border-[#DDEEF3] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                        />
                        <input
                          type="text"
                          maxLength={60}
                          value={currentSlideExtras.slide3SubmitText}
                          onChange={(e) =>
                            updateSlideExtras({ slide3SubmitText: e.target.value })
                          }
                          placeholder="Teks Tombol Kirim RSVP"
                          className="w-full rounded-lg border border-[#DDEEF3] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                        />
                      </div>
                    )}

                    {selectedEditTarget === 'story-nav' && (
                      <div>
                        <label className="block text-[10.5px] font-semibold text-[#5A647B] mb-1">
                          Teks Footer Bawah (Kosongkan untuk sembunyi)
                        </label>
                        <input
                          type="text"
                          maxLength={40}
                          value={currentSlideExtras.footerText}
                          onChange={(e) =>
                            updateSlideExtras({ footerText: e.target.value })
                          }
                          placeholder="Ranah Invite"
                          className="w-full rounded-lg border border-[#DDEEF3] px-2.5 py-1.5 text-[11.5px] text-[#1B1B4B]"
                        />
                      </div>
                    )}

                    {/* Universal Per-Slide Font Selector (except seal/banner) */}
                    {selectedEditTarget !== 'cover-seal' &&
                      selectedEditTarget !== 'slide1-banner' && (
                        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-[#EDF5F8]">
                          <select
                            aria-label="Font Judul Slide"
                            value={ov.headingFont ?? ''}
                            onChange={(e) =>
                              updatePerSlideStyle(
                                targetSlideKey,
                                { headingFont: e.target.value },
                                true
                              )
                            }
                            className="w-full rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2 py-1 text-[11px] font-semibold text-[#1B1B4B]"
                          >
                            <option value="">Font Judul (Induk)</option>
                            {STUDIO_FONTS.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                          <select
                            aria-label="Font Isi Slide"
                            value={ov.bodyFont ?? ''}
                            onChange={(e) =>
                              updatePerSlideStyle(
                                targetSlideKey,
                                { bodyFont: e.target.value },
                                true
                              )
                            }
                            className="w-full rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2 py-1 text-[11px] font-semibold text-[#1B1B4B]"
                          >
                            <option value="">Font Isi (Induk)</option>
                            {STUDIO_FONTS.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                  </div>
                )}

                {/* TAB 2: WARNA (+ LOW CONTRAST GUARD & AUTO-CONTRAST) */}
                {quickEditTab === 'color' && (
                  <div className="space-y-2">
                    {showContrastAlert && (
                      <div className="rounded-xl border border-[#F3D34F] bg-[#FFFBEB] px-2.5 py-1.5 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold text-[#7A5908] leading-snug">
                          Teks samar di atas panel ({panelContrast.toFixed(1)}:1)
                        </span>
                        <button
                          type="button"
                          onClick={applyAutoContrastForSlide}
                          className="px-2 py-0.5 rounded-full bg-[#1F9B96] text-white text-[10px] font-bold shrink-0"
                        >
                          Auto Kontras
                        </button>
                      </div>
                    )}

                    {/* Text 3-Zone Colors */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          {
                            key: 'titleColor' as const,
                            label: 'Judul',
                            fallback: config.titleColor || '#F3D88B',
                          },
                          {
                            key: 'bodyColor' as const,
                            label: 'Teks Isi',
                            fallback: config.bodyColor || '#FDFBF7',
                          },
                          {
                            key: 'accentColor' as const,
                            label: 'Aksen',
                            fallback: config.accentColor || '#E6C775',
                          },
                        ] as const
                      ).map((c) => {
                        const val = ov[c.key] || '';
                        return (
                          <div
                            key={c.key}
                            className="rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2 py-1.5 flex items-center justify-between gap-1"
                          >
                            <span className="text-[10px] font-bold text-[#1B1B4B] truncate">
                              {c.label}
                            </span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {val && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updatePerSlideStyle(
                                      targetSlideKey,
                                      { [c.key]: '' },
                                      true
                                    )
                                  }
                                  className="text-[10px] font-bold text-[#757E96] hover:text-[#B83B5E]"
                                >
                                  ×
                                </button>
                              )}
                              <input
                                type="color"
                                value={val || c.fallback}
                                onChange={(e) =>
                                  updatePerSlideStyle(
                                    targetSlideKey,
                                    { [c.key]: e.target.value },
                                    true
                                  )
                                }
                                className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Organizer Pill BG Color */}
                    {selectedEditTarget === 'slide1-organizer' && (
                      <div className="rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2.5 py-1.5 flex items-center justify-between">
                        <span className="text-[10.5px] font-bold text-[#1B1B4B]">
                          Warna Latar Pil Penyelenggara
                        </span>
                        <div className="flex items-center gap-1">
                          {ov.badgeBgColor && (
                            <button
                              type="button"
                              onClick={() =>
                                updatePerSlideStyle(
                                  'slide1',
                                  { badgeBgColor: '' },
                                  true
                                )
                              }
                              className="text-[10px] font-bold text-[#757E96] hover:text-[#B83B5E]"
                            >
                              Reset
                            </button>
                          )}
                          <input
                            type="color"
                            value={ov.badgeBgColor || '#15130E'}
                            onChange={(e) =>
                              updatePerSlideStyle(
                                'slide1',
                                { badgeBgColor: e.target.value },
                                true
                              )
                            }
                            className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                          />
                        </div>
                      </div>
                    )}

                    {/* Panel Colors (Panel BG + Border + 1-click Auto Kontras) */}
                    {isPanelLike && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2 py-1.5 flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold text-[#1B1B4B]">
                            Latar Panel
                          </span>
                          <div className="flex items-center gap-0.5">
                            {ov.panelBgColor && (
                              <button
                                type="button"
                                onClick={() =>
                                  updatePerSlideStyle(
                                    targetSlideKey,
                                    { panelBgColor: '' },
                                    true
                                  )
                                }
                                className="text-[10px] font-bold text-[#757E96] hover:text-[#B83B5E]"
                              >
                                ×
                              </button>
                            )}
                            <input
                              type="color"
                              value={effPanelHex}
                              onChange={(e) =>
                                updatePerSlideStyle(
                                  targetSlideKey,
                                  { panelBgColor: e.target.value },
                                  true
                                )
                              }
                              className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                            />
                          </div>
                        </div>
                        <div className="rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2 py-1.5 flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold text-[#1B1B4B]">
                            Bingkai Panel
                          </span>
                          <div className="flex items-center gap-0.5">
                            {ov.panelBorderColor && (
                              <button
                                type="button"
                                onClick={() =>
                                  updatePerSlideStyle(
                                    targetSlideKey,
                                    { panelBorderColor: '' },
                                    true
                                  )
                                }
                                className="text-[10px] font-bold text-[#757E96] hover:text-[#B83B5E]"
                              >
                                ×
                              </button>
                            )}
                            <input
                              type="color"
                              value={
                                ov.panelBorderColor ||
                                currentSlideExtras.panelBorderColor ||
                                '#D4AF37'
                              }
                              onChange={(e) =>
                                updatePerSlideStyle(
                                  targetSlideKey,
                                  { panelBorderColor: e.target.value },
                                  true
                                )
                              }
                              className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Button Colors (Cover Bottom, Slide 2 Buttons, Slide 3 RSVP, Story Nav) */}
                    {(selectedEditTarget === 'cover-bottom' ||
                      selectedEditTarget === 'slide2-buttons' ||
                      selectedEditTarget === 'slide3-panel' ||
                      selectedEditTarget === 'story-nav') && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2 py-1.5 flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold text-[#1B1B4B]">
                            {selectedEditTarget === 'slide2-buttons'
                              ? 'Tombol Peta/Kal'
                              : 'Latar Tombol'}
                          </span>
                          <input
                            type="color"
                            value={
                              selectedEditTarget === 'slide2-buttons'
                                ? ov.secondaryButtonColor ||
                                  currentSlideExtras.secondaryButtonColor ||
                                  '#1B1811'
                                : ov.buttonColor || config.buttonColor || '#DFB454'
                            }
                            onChange={(e) =>
                              selectedEditTarget === 'slide2-buttons'
                                ? updatePerSlideStyle(
                                    'slide2',
                                    { secondaryButtonColor: e.target.value },
                                    true
                                  )
                                : updatePerSlideStyle(
                                    targetSlideKey,
                                    { buttonColor: e.target.value },
                                    true
                                  )
                            }
                            className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                          />
                        </div>
                        <div className="rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2 py-1.5 flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold text-[#1B1B4B]">
                            Teks Tombol
                          </span>
                          <input
                            type="color"
                            value={
                              selectedEditTarget === 'slide2-buttons'
                                ? currentSlideExtras.secondaryButtonTextColor ||
                                  '#FCE9B2'
                                : ov.buttonTextColor ||
                                  currentSlideExtras.buttonTextColor ||
                                  '#151109'
                            }
                            onChange={(e) =>
                              selectedEditTarget === 'slide2-buttons'
                                ? updateSlideExtras({
                                    secondaryButtonTextColor: e.target.value,
                                  })
                                : updatePerSlideStyle(
                                    targetSlideKey,
                                    { buttonTextColor: e.target.value },
                                    true
                                  )
                            }
                            className="w-5 h-5 rounded border border-[#C5E0EA] cursor-pointer p-0 bg-transparent"
                          />
                        </div>
                      </div>
                    )}

                    {/* Quick Auto-Contrast Helper for Panels */}
                    {isPanelLike && !showContrastAlert && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={applyAutoContrastForSlide}
                          className="text-[10px] font-bold text-[#157A76] hover:underline"
                        >
                          Sesuaikan Kontras Teks ke Panel Otomatis
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: UKURAN & POSISI */}
                {quickEditTab === 'layout' && (
                  <div className="space-y-2">
                    {selectedEditTarget === 'cover-seal' && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-1 rounded-lg bg-[#F4FBFD] p-0.5 border border-[#DDEEF3]">
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
                              onClick={() =>
                                onChangeConfig({ ...config, sealSize: sz.id })
                              }
                              className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold ${
                                (config.sealSize ?? 'md') === sz.id
                                  ? 'bg-[#0EA5E9] text-white'
                                  : 'text-[#5A647B]'
                              }`}
                            >
                              {sz.label}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeConfig({
                              ...config,
                              sealOffsetX: 0,
                              sealOffsetY: 0,
                            })
                          }
                          className="px-2.5 py-1 rounded-full border border-[#DDEEF3] bg-[#F4FBFD] text-[10px] font-semibold text-[#157A76]"
                        >
                          Reset Tengah (0, 0)
                        </button>
                      </div>
                    )}

                    {selectedEditTarget === 'cover-top' && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-semibold text-[#5A647B] shrink-0">
                          Geser Y: {config.coverTopOffsetY ?? 0}px
                        </span>
                        <input
                          type="range"
                          min={-40}
                          max={80}
                          step={2}
                          value={config.coverTopOffsetY ?? 0}
                          onChange={(e) =>
                            onChangeConfig({
                              ...config,
                              coverTopOffsetY: Number(e.target.value),
                            })
                          }
                          className="flex-1 accent-[#0EA5E9]"
                        />
                      </div>
                    )}

                    {selectedEditTarget === 'cover-bottom' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10.5px] font-semibold text-[#5A647B] shrink-0">
                            Lebar Tombol: {currentSlideExtras.coverButtonWidth}%
                          </span>
                          <input
                            type="range"
                            min={60}
                            max={100}
                            step={2}
                            value={currentSlideExtras.coverButtonWidth}
                            onChange={(e) =>
                              updateSlideExtras({
                                coverButtonWidth: Number(e.target.value),
                              })
                            }
                            className="flex-1 accent-[#0EA5E9]"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10.5px] font-semibold text-[#5A647B] shrink-0">
                            Geser Y: {config.coverBottomOffsetY ?? 0}px
                          </span>
                          <input
                            type="range"
                            min={-80}
                            max={40}
                            step={2}
                            value={config.coverBottomOffsetY ?? 0}
                            onChange={(e) =>
                              onChangeConfig({
                                ...config,
                                coverBottomOffsetY: Number(e.target.value),
                              })
                            }
                            className="flex-1 accent-[#0EA5E9]"
                          />
                        </div>
                      </div>
                    )}

                    {selectedEditTarget === 'slide1-banner' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10.5px] font-semibold text-[#5A647B] shrink-0">
                            Lebar Gambar: {currentSlideExtras.slide1BannerWidth}%
                          </span>
                          <input
                            type="range"
                            min={50}
                            max={100}
                            step={2}
                            value={currentSlideExtras.slide1BannerWidth}
                            onChange={(e) =>
                              updateSlideExtras({
                                slide1BannerWidth: Number(e.target.value),
                              })
                            }
                            className="flex-1 accent-[#0EA5E9]"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10.5px] text-[#5A647B]">
                          <span>
                            Posisi: ({config.slide1BannerOffsetX ?? 0}px,{' '}
                            {config.slide1BannerOffsetY ?? 0}px)
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onChangeConfig({
                                ...config,
                                slide1BannerOffsetX: 0,
                                slide1BannerOffsetY: 0,
                              })
                            }
                            className="px-2 py-0.5 rounded-full border border-[#DDEEF3] bg-[#F4FBFD] text-[10px] font-semibold text-[#157A76]"
                          >
                            Reset (0, 0)
                          </button>
                        </div>
                      </div>
                    )}

                    {isPanelLike && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="flex justify-between text-[10px] font-semibold text-[#5A647B]">
                              <span>Kepekatan</span>
                              <span className="text-[#0EA5E9] font-bold tabular-nums">
                                {effPanelOpacity}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={effPanelOpacity}
                              onChange={(e) =>
                                updatePerSlideStyle(
                                  targetSlideKey,
                                  { panelOpacity: Number(e.target.value) },
                                  true
                                )
                              }
                              className="w-full accent-[#0EA5E9]"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[10px] font-semibold text-[#5A647B]">
                              <span>Lebar Panel</span>
                              <span className="text-[#0EA5E9] font-bold tabular-nums">
                                {typeof ov.panelWidth === 'number' &&
                                ov.panelWidth >= 75
                                  ? `${ov.panelWidth}%`
                                  : `${currentSlideExtras.panelWidth}%`}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={75}
                              max={100}
                              step={1}
                              value={
                                typeof ov.panelWidth === 'number' &&
                                ov.panelWidth >= 75
                                  ? ov.panelWidth
                                  : currentSlideExtras.panelWidth
                              }
                              onChange={(e) =>
                                updatePerSlideStyle(
                                  targetSlideKey,
                                  { panelWidth: Number(e.target.value) },
                                  true
                                )
                              }
                              className="w-full accent-[#0EA5E9]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] font-semibold text-[#5A647B] mb-0.5">
                              Sudut Kotak
                            </div>
                            <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-[#F4FBFD] p-0.5 border border-[#DDEEF3]">
                              {(
                                [
                                  { id: 'sm', label: 'Tajam' },
                                  { id: 'md', label: 'Pas' },
                                  { id: 'lg', label: 'Bulat' },
                                ] as const
                              ).map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() =>
                                    updatePerSlideStyle(
                                      targetSlideKey,
                                      { panelRadius: opt.id },
                                      true
                                    )
                                  }
                                  className={`py-0.5 rounded text-[9.5px] font-bold ${
                                    (ov.panelRadius ||
                                      currentSlideExtras.panelRadius) === opt.id
                                      ? 'bg-[#0EA5E9] text-white'
                                      : 'text-[#5A647B]'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold text-[#5A647B] mb-0.5">
                              Padding Dalam
                            </div>
                            <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-[#F4FBFD] p-0.5 border border-[#DDEEF3]">
                              {(
                                [
                                  { id: 'compact', label: 'Rapat' },
                                  { id: 'normal', label: 'Pas' },
                                  { id: 'spacious', label: 'Lega' },
                                ] as const
                              ).map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() =>
                                    updatePerSlideStyle(
                                      targetSlideKey,
                                      { panelPadding: opt.id },
                                      true
                                    )
                                  }
                                  className={`py-0.5 rounded text-[9.5px] font-bold ${
                                    (ov.panelPadding ||
                                      currentSlideExtras.panelPadding) === opt.id
                                      ? 'bg-[#0EA5E9] text-white'
                                      : 'text-[#5A647B]'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-[#5A647B] shrink-0">
                            Geser Y: {ov.panelOffsetY ?? 0}px
                          </span>
                          <input
                            type="range"
                            min={-60}
                            max={60}
                            step={2}
                            value={ov.panelOffsetY ?? 0}
                            onChange={(e) =>
                              updatePerSlideStyle(
                                targetSlideKey,
                                { panelOffsetY: Number(e.target.value) },
                                true
                              )
                            }
                            className="flex-1 accent-[#0EA5E9]"
                          />
                        </div>
                      </div>
                    )}

                    {/* Universal Alignment & Box Scale */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#EDF5F8]">
                      <div>
                        <div className="text-[10px] font-semibold text-[#5A647B] mb-0.5">
                          Perataan Teks
                        </div>
                        <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-[#F4FBFD] p-0.5 border border-[#DDEEF3]">
                          {(
                            [
                              { id: 'center', label: 'Tengah' },
                              { id: 'left', label: 'Kiri' },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                updatePerSlideStyle(
                                  targetSlideKey,
                                  { textAlign: opt.id },
                                  true
                                )
                              }
                              className={`py-0.5 rounded text-[10px] font-bold ${
                                (ov.textAlign || config.textAlign || 'center') ===
                                opt.id
                                  ? 'bg-[#0EA5E9] text-white'
                                  : 'text-[#5A647B]'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-1 rounded-lg border border-[#DDEEF3] bg-[#FAFEFD] px-2 py-1">
                        <span className="text-[10px] font-semibold text-[#5A647B]">
                          Skala Box
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => stepPanelScale(targetSlideKey, -5)}
                            className="w-5 h-5 rounded-full bg-white border border-[#DDEEF3] flex items-center justify-center text-[#1B1B4B]"
                          >
                            -
                          </button>
                          <span className="text-[10px] font-bold tabular-nums w-8 text-center">
                            {currentPanelScales[targetSlideKey]}%
                          </span>
                          <button
                            type="button"
                            onClick={() => stepPanelScale(targetSlideKey, 5)}
                            className="w-5 h-5 rounded-full bg-white border border-[#DDEEF3] flex items-center justify-center text-[#1B1B4B]"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
