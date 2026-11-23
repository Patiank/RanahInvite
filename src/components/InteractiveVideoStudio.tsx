import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Copy,
  Film,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
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
  publishInviteConfigToCloud,
} from '../utils/firebaseRsvp';
import { buildInteractiveInviteUrl, buildWhatsAppInviteText } from '../utils/rsvp';
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

async function compressImageToWebp(
  file: File,
  maxWidth = 540,
  maxDataUrlLen = 260000
): Promise<{
  dataUrl: string;
  sizeKb: number;
  suggestedTheme: InteractiveThemeId;
}> {
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Berkas gambar tidak valid.'));
      el.src = blobUrl;
    });

    const scale = Math.min(1, maxWidth / (img.naturalWidth || maxWidth));
    const w = Math.max(1, Math.round((img.naturalWidth || maxWidth) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || 960) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Kanvas browser tidak tersedia.');
    ctx.drawImage(img, 0, 0, w, h);

    // Sample luminance to suggest high-contrast text theme
    const sample = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < sample.length; i += 64) {
      sum += 0.299 * sample[i] + 0.587 * sample[i + 1] + 0.114 * sample[i + 2];
      count += 1;
    }
    const avgLum = count > 0 ? sum / count : 40;
    const suggestedTheme: InteractiveThemeId =
      avgLum > 150 ? 'emerald-light' : 'gold-dark';

    let dataUrl = '';
    for (const q of [0.78, 0.66, 0.54, 0.42]) {
      dataUrl = canvas.toDataURL('image/webp', q);
      if (dataUrl.length <= maxDataUrlLen) break;
    }
    if (dataUrl.length > maxDataUrlLen) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    }

    const approxBytes = Math.round((dataUrl.length * 3) / 4);
    return {
      dataUrl,
      sizeKb: Math.max(1, Math.round(approxBytes / 1024)),
      suggestedTheme,
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
      if (!ctx) {
        return { dataUrl: '', avgLuminance: 40 };
      }
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
      reject(new Error('Format video tidak dapat dibaca browser. Gunakan .MP4 (H.264) atau .WEBM.'));
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
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<number | null>(null);
  const [publishedSignature, setPublishedSignature] = useState<string | null>(
    null
  );
  const [mobilePane, setMobilePane] = useState<'editor' | 'preview'>('editor');
  const [activeTextSlideTab, setActiveTextSlideTab] = useState<
    'cover' | 'slide1' | 'slide2' | 'slide3'
  >('cover');
  const [localVideoName, setLocalVideoName] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewJumpTarget, setPreviewJumpTarget] =
    useState<PreviewJumpTarget | null>(null);

  const currentConfigSignature = useMemo(() => JSON.stringify(config), [config]);
  const hasUnpublishedChanges =
    publishedSignature === null || publishedSignature !== currentConfigSignature;

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

  const stepPanelScale = (
    target: keyof InteractivePanelScales,
    delta: number
  ) => {
    const next = Math.min(115, Math.max(75, currentPanelScales[target] + delta));
    onChangeConfig({
      ...config,
      panelScales: {
        ...currentPanelScales,
        [target]: next,
      },
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
              title="Reset ukuran panel ke 100%"
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-[#157A76] bg-[#EDF8FB] hover:bg-[#DCF5F1] transition-colors"
            >
              Reset
            </button>
          )}
          <span
            className="inline-flex items-center gap-0.5 rounded-full border border-[#DDEEF3] bg-[#FAFEFD] px-1 py-0.5"
            title={`Ukuran Panel Box ${label}`}
          >
            <button
              type="button"
              disabled={val <= 75}
              onClick={() => stepPanelScale(target, -5)}
              aria-label={`Perkecil panel box ${label}`}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[#5A647B] hover:bg-[#EDF8FB] hover:text-[#157A76] active:scale-90 disabled:opacity-35 transition-colors"
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
              className="w-5 h-5 rounded-full flex items-center justify-center text-[#5A647B] hover:bg-[#EDF8FB] hover:text-[#157A76] active:scale-90 disabled:opacity-35 transition-colors"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      </div>
    );
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
      textSizes: {
        ...currentTextSizes,
        [field]: next,
      },
    });
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
          className="w-5 h-5 rounded-full flex items-center justify-center text-[#5A647B] hover:bg-[#EDF8FB] hover:text-[#157A76] active:scale-90 disabled:opacity-35 transition-colors"
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
          className="w-5 h-5 rounded-full flex items-center justify-center text-[#5A647B] hover:bg-[#EDF8FB] hover:text-[#157A76] active:scale-90 disabled:opacity-35 transition-colors"
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

  const handleUploadCustomSeal = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
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
        `Segel 3D kustom terpasang (${res.sizeKb} KB WebP · siap terbit online).`,
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

  const previewRecipient = useMemo(
    () =>
      recipients.find((r) => r.id === previewRecipientId) ??
      recipients[0] ??
      SAMPLE_PREVIEW_RECIPIENT,
    [recipients, previewRecipientId]
  );

  const isUsingLocalBlob = config.videoUrl.startsWith('blob:');
  const cloudConfigured = isFirestoreRsvpConfigured();

  const handleUploadCoverImage = async (
    target: 'cover' | 'open',
    file?: File
  ) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onNotify?.('Pilih berkas gambar .JPG, .PNG, atau .WEBP.', 'error');
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
          `Gambar sampul diramu (${res.sizeKb} KB WebP · 100% siap terbit online gratis!).`,
          'success'
        );
      } else {
        onChangeConfig({
          ...config,
          mediaMode: 'image',
          openImageDataUrl: res.dataUrl,
        });
        onNotify?.(
          `Gambar latar isi berhasil dipasang (${res.sizeKb} KB WebP).`,
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

  const handleUploadLocalVideo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      onNotify?.('Pilih berkas video berformat .MP4 atau .WEBM.', 'error');
      return;
    }

    setAnalyzing(true);
    try {
      const result = await analyzeAndExtractVideoFrames(file);
      setLocalVideoName(
        `${file.name} (${result.durationSec.toFixed(1)} dtk · ${(file.size / 1024 / 1024).toFixed(2)} MB)`
      );
      onChangeConfig({
        ...config,
        videoUrl: result.videoBlobUrl,
        posterUrl: result.posterDataUrl || config.posterUrl,
        openBgUrl: result.openBgDataUrl || config.openBgUrl,
        theme: result.suggestedTheme,
      });
      setPreviewKey((k) => k + 1);
      onNotify?.(
        `Video diramu otomatis! Frame awal, frame akhir, & tema kontras (${
          result.suggestedTheme === 'emerald-light' ? 'Terang' : 'Gelap Emas'
        }) langsung diterapkan.`,
        'success'
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal memproses video.',
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
      videoUrl: DEFAULT_INTERACTIVE_CONFIG.videoUrl,
      posterUrl: DEFAULT_INTERACTIVE_CONFIG.posterUrl,
      openBgUrl: DEFAULT_INTERACTIVE_CONFIG.openBgUrl,
      theme: 'gold-dark',
    });
    setPreviewKey((k) => k + 1);
    onNotify?.('Preset Amplop Hitam Segel Emas diaktifkan.', 'success');
  };

  const handlePublishToCloud = async () => {
    if (!cloudConfigured || publishing) return;
    setPublishing(true);
    try {
      await publishInviteConfigToCloud(eventId, config);
      setPublishedAt(Date.now());
      setPublishedSignature(currentConfigSignature);
      onNotify?.(
        isUsingLocalBlob
          ? 'Pengaturan teks & tema diterbitkan ke Cloud! (Video tetap memakai preset online karena video lokal belum memiliki URL publik.)'
          : 'Pengaturan berhasil diterbitkan ke Cloud! Tautan tamu kini 100% sama dengan pratinjau.',
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

  const ensurePublishedForGuestParity = async () => {
    if (!cloudConfigured || !hasUnpublishedChanges) return;
    setPublishing(true);
    try {
      const ok = await publishInviteConfigToCloud(eventId, config);
      if (ok) {
        setPublishedAt(Date.now());
        setPublishedSignature(currentConfigSignature);
      }
    } catch {
      // Non-fatal: still allow copying link
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyPreviewLink = async () => {
    try {
      await ensurePublishedForGuestParity();
      const url = buildInteractiveInviteUrl(eventId, metadata, previewRecipient);
      await navigator.clipboard.writeText(url);
      onNotify?.(
        'Pengaturan disinkronkan ke Cloud & link Undangan Interaktif disalin!',
        'success'
      );
    } catch {
      onNotify?.('Gagal menyalin link.', 'error');
    }
  };

  const handleCopyWhatsAppMessage = async () => {
    try {
      await ensurePublishedForGuestParity();
      const text = buildWhatsAppInviteText(
        eventId,
        metadata,
        previewRecipient,
        config.whatsappTemplate
      );
      await navigator.clipboard.writeText(text);
      onNotify?.(
        `Pengaturan disinkronkan ke Cloud & pesan WA untuk "${previewRecipient.recipientName}" disalin!`,
        'success'
      );
    } catch {
      onNotify?.('Gagal menyalin pesan WhatsApp.', 'error');
    }
  };

  return (
    <div className="space-y-3.5 sm:space-y-5">
      {/* Unsaved Cloud Sync Banner (guarantees 1:1 parity between preview & guest link) */}
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

      {/* Mobile Tab Switcher: Instant 1-tap toggle between Editor & Live Phone Preview */}
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

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* Left: Settings & Auto-Composer Panel */}
        <div
          className={`xl:col-span-7 space-y-3.5 sm:space-y-5 ${
            mobilePane === 'preview' ? 'hidden xl:block' : 'block'
          }`}
        >
          {/* Card 1: Source Mode Switcher (Upload Image -> Cinema Animation OR Video Intro) */}
          <div className="rounded-[20px] sm:rounded-[22px] border border-[#E5F1F5] bg-white p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-[#171512] text-[#FCE9B2] flex items-center justify-center">
                {config.mediaMode === 'image' ? (
                  <ImageIcon className="w-4 h-4" />
                ) : (
                  <Film className="w-4 h-4" />
                )}
              </span>
              <div>
                <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
                  1. Sumber Visual Pembuka
                </h3>
                <p className="text-[11.5px] text-[#757E96]">
                  Pilih unggah gambar (langsung jadi animasi 60fps & 100% online gratis) atau video pembuka.
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#F4FBFD] border border-[#E5F1F5]">
              <button
                type="button"
                onClick={() => {
                  onChangeConfig({ ...config, mediaMode: 'image' });
                  setPreviewKey((k) => k + 1);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-semibold transition-colors whitespace-nowrap ${
                  config.mediaMode === 'image'
                    ? 'bg-[#1F9B96] text-white shadow-xs'
                    : 'text-[#757E96] hover:text-[#1B1B4B]'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Dari Gambar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeConfig({ ...config, mediaMode: 'video' });
                  setPreviewKey((k) => k + 1);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-semibold transition-colors whitespace-nowrap ${
                  config.mediaMode === 'video'
                    ? 'bg-[#171512] text-[#FCE9B2] shadow-xs'
                    : 'text-[#757E96] hover:text-[#1B1B4B]'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Dari Video</span>
              </button>
            </div>
          </div>

          {config.mediaMode === 'image' ? (
            <div className="space-y-4">
              {/* Upload Cover Image */}
              <div className="rounded-2xl border border-dashed border-[#B5E4F1] bg-[#F4FBFD] p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {config.coverImageDataUrl ? (
                    <img
                      src={config.coverImageDataUrl}
                      alt="Pratinjau gambar sampul"
                      className="w-12 h-20 rounded-xl object-cover border border-[#DDEEF3] shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-20 rounded-xl border border-[#DDEEF3] bg-white flex items-center justify-center text-[#1F9B96]/60 shrink-0">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-[#1B1B4B]">
                      Gambar Sampul Pembuka (Wajib)
                    </div>
                    <p className="text-[11.5px] text-[#757E96] mt-0.5">
                      {config.coverImageDataUrl
                        ? `Terkompresi otomatis ~${Math.max(1, Math.round((config.coverImageDataUrl.length * 3) / 4 / 1024))} KB WebP · Siap terbit online gratis!`
                        : 'Unggah 1 gambar (.JPG / .PNG / .WEBP) — sistem otomatis mengompresi & menganimasikannya.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={coverImageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) =>
                      void handleUploadCoverImage('cover', e.target.files?.[0])
                    }
                  />
                  <button
                    type="button"
                    disabled={analyzing}
                    onClick={() => coverImageInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[12.5px] font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {analyzing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    <span>
                      {config.coverImageDataUrl ? 'Ganti Gambar' : 'Upload Gambar'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Optional Open Background Image */}
              <div className="rounded-2xl border border-[#E5F1F5] bg-[#FAFEFD] p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {config.openImageDataUrl ? (
                    <img
                      src={config.openImageDataUrl}
                      alt="Pratinjau gambar latar isi"
                      className="w-10 h-16 rounded-lg object-cover border border-[#DDEEF3] shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-16 rounded-lg border border-dashed border-[#DDEEF3] bg-white flex items-center justify-center text-[#757E96]/60 shrink-0">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold text-[#1B1B4B]">
                      Gambar Latar Isi Setelah Terbuka (Opsional)
                    </div>
                    <p className="text-[11px] text-[#757E96] mt-0.5">
                      {config.openImageDataUrl
                        ? `Aktif (~${Math.max(1, Math.round((config.openImageDataUrl.length * 3) / 4 / 1024))} KB WebP)`
                        : 'Kosongkan untuk otomatis memakai gambar sampul di atas sebagai latar Story.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {config.openImageDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        onChangeConfig({ ...config, openImageDataUrl: '' });
                        setPreviewKey((k) => k + 1);
                      }}
                      title="Hapus gambar latar isi"
                      aria-label="Hapus gambar latar isi"
                      className="p-2 rounded-full text-[#757E96] hover:text-[#B83B5E] hover:bg-[#FDE8EE] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <input
                    ref={openImageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) =>
                      void handleUploadCoverImage('open', e.target.files?.[0])
                    }
                  />
                  <button
                    type="button"
                    disabled={analyzing}
                    onClick={() => openImageInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#DDEEF3] bg-white hover:bg-[#F4FBFD] text-[12px] font-semibold text-[#1B1B4B] transition-colors whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#1F9B96]" />
                    <span>Pilih Latar Isi</span>
                  </button>
                </div>
              </div>

              {/* 4 Built-in 60fps Cinematic Opening Animations */}
              <div>
                <div className="text-[12px] font-semibold text-[#1B1B4B] mb-2">
                  Efek Animasi Pembuka (60fps · Tanpa File Video)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: 'wax-seal-open',
                        title: 'Segel Emas & Terbuka',
                        desc: 'Segel menguap + lipatan atas-bawah terbuka',
                      },
                      {
                        id: 'gate-split',
                        title: 'Gerbang Terbuka',
                        desc: 'Membelah mulus ke kiri & kanan',
                      },
                      {
                        id: 'curtain-up',
                        title: 'Tirai Sinematik Naik',
                        desc: 'Sampul meluncur ke atas berbingkai emas',
                      },
                      {
                        id: 'ken-burns',
                        title: 'Ken Burns Cinema Zoom',
                        desc: 'Kamera zoom-in halus ke dalam undangan',
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
                          setPreviewKey((k) => k + 1);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          active
                            ? 'border-[#1F9B96] bg-[#DCF5F1]/60 ring-2 ring-[#1F9B96]/15'
                            : 'border-[#E5F1F5] bg-white hover:border-[#B5E4F1]'
                        }`}
                      >
                        <div className="text-[12.5px] font-bold text-[#1B1B4B]">
                          {anim.title}
                        </div>
                        <div className="text-[11px] text-[#757E96] mt-0.5 leading-snug">
                          {anim.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleUseDefaultPreset}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#DDEEF3] bg-[#F4FBFD] text-[11.5px] font-semibold text-[#1B1B4B] hover:bg-[#E3F5FA] transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#1F9B96]" />
                  <span>Preset Segel Emas</span>
                </button>
              </div>

              <div className="rounded-2xl border border-dashed border-[#B5E4F1] bg-[#F4FBFD] p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-[#1B1B4B]">
                    {localVideoName
                      ? `Video Lokal Aktif: ${localVideoName}`
                      : config.videoUrl === DEFAULT_INTERACTIVE_CONFIG.videoUrl
                        ? 'Aktif: Preset Amplop Hitam Segel Emas (3,87 dtk · 613 KB)'
                        : 'Aktif: URL Video Online Kustom'}
                  </div>
                  <p className="text-[11.5px] text-[#757E96] mt-0.5">
                    Disarankan rasio vertikal 9:16, durasi 3–8 detik, format MP4 (H.264).
                  </p>
                </div>

                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm"
                    className="hidden"
                    onChange={(e) => void handleUploadLocalVideo(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    disabled={analyzing}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[12.5px] font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Meramu Video...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Upload & Ramu Video</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {isUsingLocalBlob && (
                <div className="rounded-2xl border border-[#F3D34F] bg-[#FFFBEB] px-4 py-3 text-[12px] text-[#5C4506] leading-relaxed">
                  <strong className="font-bold text-[#1B1B4B]">Mode 100% Gratis (Spark Plan):</strong>{' '}
                  Video lokal di atas langsung bisa dipratinjau di simulator HP sebelah kanan. Untuk menyebarkan video kustom online tanpa upgrade Blaze, tempelkan URL `.mp4` online di bawah ini — atau beralih ke tab <strong>Dari Gambar</strong> untuk 1-klik terbit online gratis!
                </div>
              )}

              <div>
                <label
                  htmlFor="studio-video-url"
                  className="block text-[12px] font-semibold text-[#1B1B4B] mb-1.5"
                >
                  URL Video Online Langsung (Opsional · .mp4 / .webm)
                </label>
                <input
                  id="studio-video-url"
                  type="url"
                  value={isUsingLocalBlob ? '' : config.videoUrl}
                  onChange={(e) => {
                    setLocalVideoName(null);
                    onChangeConfig({ ...config, videoUrl: e.target.value });
                  }}
                  placeholder="/media/gold-envelope-intro.mp4?v=2 atau https://.../intro.mp4"
                  className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Card 2: Style Presets, Theme, Typography, Safe-Zone Panel Position & 3D Seal */}
        <div className="rounded-[20px] sm:rounded-[22px] border border-[#E5F1F5] bg-white p-3.5 sm:p-5 space-y-4 sm:space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4.5 h-4.5 text-[#1F9B96]" />
              <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
                2. Tema, Font, Posisi Panel & Segel 3D
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => applyStylePreset('dinas')}
                className="px-2.5 py-1 rounded-full border border-[#DDEEF3] bg-[#F4FBFD] hover:bg-[#E3F5FA] text-[11px] font-semibold text-[#1B1B4B] transition-colors"
              >
                Preset Dinas
              </button>
              <button
                type="button"
                onClick={() => applyStylePreset('adat')}
                className="px-2.5 py-1 rounded-full border border-[#F3D34F]/70 bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[11px] font-semibold text-[#6E5108] transition-colors"
              >
                Preset Adat Minang
              </button>
              <button
                type="button"
                onClick={() => applyStylePreset('gala')}
                className="px-2.5 py-1 rounded-full border border-[#DDEEF3] bg-[#F4FBFD] hover:bg-[#E3F5FA] text-[11px] font-semibold text-[#1B1B4B] transition-colors"
              >
                Preset Gala VIP
              </button>
            </div>
          </div>

          {/* Color Theme */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {(
              [
                {
                  id: 'gold-dark',
                  label: 'Black & Gold Luxury',
                  swatch: 'bg-[#13120F] border-[#D4AF37] text-[#FCE9B2]',
                },
                {
                  id: 'emerald-light',
                  label: 'Zamrud Sumbar (Terang)',
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
                className={`px-3.5 py-2.5 rounded-2xl border text-[12px] font-bold transition-all text-left flex items-center justify-between gap-2 ${
                  t.swatch
                } ${
                  config.theme === t.id
                    ? 'ring-2 ring-[#1F9B96] shadow-xs'
                    : 'opacity-75 hover:opacity-100'
                }`}
              >
                <span className="truncate">{t.label}</span>
                {config.theme === t.id && <Check className="w-4 h-4 shrink-0" />}
              </button>
            ))}
          </div>

          {/* Font Pairing */}
          <div>
            <div className="text-[12px] font-semibold text-[#1B1B4B] mb-2">
              Gaya Font Undangan
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  {
                    id: 'modern',
                    label: 'Modern Resmi',
                    sample: 'Manrope',
                    fontFamily: "'Manrope', sans-serif",
                  },
                  {
                    id: 'classic',
                    label: 'Klasik Elegan',
                    sample: 'Playfair Display',
                    fontFamily: "'Playfair Display', serif",
                  },
                  {
                    id: 'ceremonial',
                    label: 'Seremonial Adat',
                    sample: 'Cinzel + Lora',
                    fontFamily: "'Cinzel', serif",
                  },
                  {
                    id: 'editorial',
                    label: 'Editorial VIP',
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
                    className={`p-2.5 rounded-2xl border text-left transition-all ${
                      active
                        ? 'border-[#1F9B96] bg-[#DCF5F1]/60 ring-2 ring-[#1F9B96]/15'
                        : 'border-[#E5F1F5] bg-white hover:border-[#B5E4F1]'
                    }`}
                  >
                    <div
                      style={{ fontFamily: f.fontFamily }}
                      className="text-[14px] font-bold text-[#1B1B4B] leading-tight"
                    >
                      Aa · {f.label}
                    </div>
                    <div className="text-[10.5px] text-[#757E96] mt-0.5 truncate">
                      {f.sample}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Text Scale, Card Style & Alignment */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-[12px] font-semibold text-[#1B1B4B] mb-1.5">
                Ukuran Teks
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
                    onClick={() => onChangeConfig({ ...config, textScale: opt.id })}
                    className={`py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors ${
                      (config.textScale ?? 'md') === opt.id
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
              <div className="text-[12px] font-semibold text-[#1B1B4B] mb-1.5">
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
                    onClick={() => onChangeConfig({ ...config, cardStyle: opt.id })}
                    className={`py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors ${
                      (config.cardStyle ?? 'solid') === opt.id
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
              <div className="text-[12px] font-semibold text-[#1B1B4B] mb-1.5">
                Perataan Teks
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#F4FBFD] p-1 border border-[#DDEEF3]">
                {(
                  [
                    { id: 'center', label: 'Tengah' },
                    { id: 'left', label: 'Rata Kiri' },
                  ] as { id: InteractiveTextAlign; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeConfig({ ...config, textAlign: opt.id })}
                    className={`py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors ${
                      (config.textAlign ?? 'center') === opt.id
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

          {/* Safe-Zone Panel Position & Overlay Darkness */}
          <div className="rounded-2xl border border-[#E5F1F5] bg-[#FAFEFD] p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div>
                <div className="text-[12px] font-semibold text-[#1B1B4B] mb-1.5">
                  Posisi Vertikal Panel (Zona Aman)
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
                      onClick={() => {
                        onChangeConfig({ ...config, panelPosition: pos.id });
                        jumpPreviewTo('story', 0);
                      }}
                      className={`py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors ${
                        (config.panelPosition ?? 'center') === pos.id
                          ? 'bg-[#1F9B96] text-white'
                          : 'text-[#5A647B] hover:text-[#1B1B4B]'
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
                  className="flex items-center justify-between text-[12px] font-semibold text-[#1B1B4B] mb-1"
                >
                  <span>Geser Halus Panel</span>
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
                  className="flex items-center justify-between text-[12px] font-semibold text-[#1B1B4B] mb-1"
                >
                  <span>Gelap Latar (Kontras)</span>
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

          {/* 3D Gold Wax Seal Customization */}
          <div className="rounded-2xl border border-[#E5F1F5] bg-[#FAFEFD] p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-[12.5px] font-bold text-[#1B1B4B] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.showSeal !== false}
                  onChange={(e) => {
                    onChangeConfig({ ...config, showSeal: e.target.checked });
                    jumpPreviewTo('sealed');
                  }}
                  className="w-4 h-4 accent-[#1F9B96] rounded"
                />
                <span>Tampilkan Segel Emas 3D di Sampul</span>
              </label>

              <div className="flex items-center gap-1.5">
                {config.customSealDataUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      onChangeConfig({ ...config, customSealDataUrl: '' });
                      jumpPreviewTo('sealed');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#DDEEF3] bg-white text-[11px] font-semibold text-[#5A647B] hover:text-[#1B1B4B]"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Default Sumbar</span>
                  </button>
                )}
                <input
                  ref={sealImageInputRef}
                  type="file"
                  accept="image/png,image/webp,image/jpeg"
                  className="hidden"
                  onChange={(e) => void handleUploadCustomSeal(e.target.files?.[0])}
                />
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={() => sealImageInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#DDEEF3] bg-white hover:bg-[#F4FBFD] text-[11.5px] font-semibold text-[#1B1B4B] transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-[#1F9B96]" />
                  <span>
                    {config.customSealDataUrl ? 'Ganti Logo Segel' : 'Upload Segel Sendiri'}
                  </span>
                </button>
              </div>
            </div>

            {config.showSeal !== false && (
              <div className="space-y-3 pt-1">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex-1 min-w-[160px]">
                    <div className="text-[11.5px] font-semibold text-[#1B1B4B] mb-1">
                      Ukuran Segel 3D
                    </div>
                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 border border-[#DDEEF3]">
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
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#DDEEF3] bg-white hover:bg-[#F4FBFD] text-[11px] font-semibold text-[#157A76]"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Tengah (0, 0)</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="studio-seal-offset-x"
                      className="flex items-center justify-between text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                    >
                      <span>Posisi Kiri / Kanan Segel (X)</span>
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
                      className="flex items-center justify-between text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
                    >
                      <span>Posisi Atas / Bawah Segel (Y)</span>
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
        </div>

        {/* Card 3: Timing, Texts, Calendar, Contact LO & WhatsApp Template */}
        <div className="rounded-[20px] sm:rounded-[22px] border border-[#E5F1F5] bg-white p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
          <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
            3. Durasi Tampil, Info Acara & Template WhatsApp
          </h3>

          {/* Per-Slide Durations & Opening 3D Speed */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
                className="w-full rounded-xl border border-[#DDEEF3] bg-white px-2.5 py-2 text-[12px] font-medium text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              >
                <option value={3}>3 detik</option>
                <option value={5}>5 detik</option>
                <option value={7}>7 detik</option>
                <option value={10}>10 detik</option>
                <option value={0}>Manual</option>
              </select>
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
                className="w-full rounded-xl border border-[#DDEEF3] bg-white px-2.5 py-2 text-[12px] font-medium text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              >
                <option value={5}>5 detik</option>
                <option value={8}>8 detik</option>
                <option value={12}>12 detik</option>
                <option value={15}>15 detik</option>
                <option value={0}>Manual</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="studio-anim-dur"
                className="block text-[11.5px] font-semibold text-[#1B1B4B] mb-1"
              >
                Animasi 3D
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
                className="w-full rounded-xl border border-[#DDEEF3] bg-white px-2.5 py-2 text-[12px] font-medium text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
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
                Laju Video
              </label>
              <select
                id="studio-video-speed"
                value={config.videoSpeed}
                onChange={(e) =>
                  onChangeConfig({ ...config, videoSpeed: Number(e.target.value) })
                }
                className="w-full rounded-xl border border-[#DDEEF3] bg-white px-2.5 py-2 text-[12px] font-medium text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              >
                <option value={1}>1,0×</option>
                <option value={1.25}>1,25×</option>
                <option value={1.5}>1,5×</option>
                <option value={1.75}>1,75×</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 pt-0.5">
            <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[#1B1B4B] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.showCountdown}
                onChange={(e) =>
                  onChangeConfig({ ...config, showCountdown: e.target.checked })
                }
                className="w-4 h-4 accent-[#1F9B96] rounded"
              />
              <span>Tampilkan Hitung Mundur</span>
            </label>

            <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[#1B1B4B] cursor-pointer select-none">
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
              <span>Tombol Simpan ke Kalender</span>
            </label>
          </div>

          {/* Per-Slide Editable Text Tabs (auto-syncs phone preview to active slide) */}
          <div className="rounded-2xl border border-[#E5F1F5] bg-[#FAFEFD] p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[12px] font-bold text-[#1B1B4B]">
                Edit Teks Masing-Masing Slide
              </div>
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-white p-1 border border-[#DDEEF3] w-full sm:w-auto">
                {(
                  [
                    { id: 'cover', label: 'Sampul', phase: 'sealed' as const },
                    { id: 'slide1', label: 'Slide 1', phase: 'story' as const, slide: 0 as const },
                    { id: 'slide2', label: 'Slide 2', phase: 'story' as const, slide: 1 as const },
                    { id: 'slide3', label: 'Slide 3 RSVP', phase: 'story' as const, slide: 2 as const },
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
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
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

            {activeTextSlideTab === 'cover' && (
              <div className="space-y-3">
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
                      {renderSizeStepper('coverBadge', 'Label Atas Sampul', 8, 18)}
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
                      className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
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
                      {renderSizeStepper('openButtonText', 'Teks Tombol Pembuka', 10, 18)}
                    </div>
                    <input
                      id="studio-open-btn"
                      type="text"
                      maxLength={60}
                      value={config.openButtonText}
                      onChange={(e) =>
                        onChangeConfig({ ...config, openButtonText: e.target.value })
                      }
                      placeholder="Sentuh Segel untuk Membuka"
                      className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTextSlideTab === 'slide1' && (
              <div className="space-y-3">
                {renderPanelScaleBar('slide1', 'Slide 1')}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label
                      htmlFor="studio-slide1-heading"
                      className="text-[11.5px] font-semibold text-[#1B1B4B]"
                    >
                      Kalimat Pembuka Atas (Slide 1)
                    </label>
                    {renderSizeStepper('slide1Heading', 'Kalimat Pembuka Atas', 8, 18)}
                  </div>
                  <input
                    id="studio-slide1-heading"
                    type="text"
                    maxLength={80}
                    value={config.slide1Heading ?? DEFAULT_INTERACTIVE_CONFIG.slide1Heading}
                    onChange={(e) =>
                      onChangeConfig({ ...config, slide1Heading: e.target.value })
                    }
                    placeholder="Dengan Hormat Mengundang"
                    className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label
                      htmlFor="studio-welcome-note"
                      className="text-[11.5px] font-semibold text-[#1B1B4B]"
                    >
                      Kalimat Sambutan Bawah (Slide 1)
                    </label>
                    {renderSizeStepper('welcomeNote', 'Kalimat Sambutan', 9, 18)}
                  </div>
                  <textarea
                    id="studio-welcome-note"
                    rows={2}
                    maxLength={300}
                    value={config.welcomeNote}
                    onChange={(e) =>
                      onChangeConfig({ ...config, welcomeNote: e.target.value })
                    }
                    className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                  />
                </div>
              </div>
            )}

            {activeTextSlideTab === 'slide2' && (
              <div className="space-y-3">
                {renderPanelScaleBar('slide2', 'Slide 2')}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label
                      htmlFor="studio-slide2-heading"
                      className="text-[11.5px] font-semibold text-[#1B1B4B]"
                    >
                      Judul Bagian (Slide 2)
                    </label>
                    {renderSizeStepper('slide2Heading', 'Judul Bagian Slide 2', 8, 18)}
                  </div>
                  <input
                    id="studio-slide2-heading"
                    type="text"
                    maxLength={80}
                    value={config.slide2Heading ?? DEFAULT_INTERACTIVE_CONFIG.slide2Heading}
                    onChange={(e) =>
                      onChangeConfig({ ...config, slide2Heading: e.target.value })
                    }
                    placeholder="Pelaksanaan Kegiatan"
                    className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label
                      htmlFor="studio-slide2-extra"
                      className="text-[11.5px] font-semibold text-[#1B1B4B]"
                    >
                      Catatan / Agenda Tambahan (Opsional · Slide 2)
                    </label>
                    {renderSizeStepper('slide2ExtraNote', 'Catatan Tambahan Slide 2', 9, 18)}
                  </div>
                  <textarea
                    id="studio-slide2-extra"
                    rows={2}
                    maxLength={240}
                    value={config.slide2ExtraNote ?? ''}
                    onChange={(e) =>
                      onChangeConfig({ ...config, slide2ExtraNote: e.target.value })
                    }
                    placeholder="Contoh: Registrasi dibuka 30 menit sebelum acara dimulai."
                    className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                  />
                </div>
              </div>
            )}

            {activeTextSlideTab === 'slide3' && (
              <div className="space-y-3">
                {renderPanelScaleBar('slide3', 'Slide 3 RSVP')}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label
                        htmlFor="studio-slide3-heading"
                        className="text-[11.5px] font-semibold text-[#1B1B4B]"
                      >
                        Judul Form RSVP (Slide 3)
                      </label>
                      {renderSizeStepper('slide3Heading', 'Judul Form RSVP', 11, 24)}
                    </div>
                    <input
                      id="studio-slide3-heading"
                      type="text"
                      maxLength={80}
                      value={config.slide3Heading ?? DEFAULT_INTERACTIVE_CONFIG.slide3Heading}
                      onChange={(e) =>
                        onChangeConfig({ ...config, slide3Heading: e.target.value })
                      }
                      placeholder="Konfirmasi Kehadiran"
                      className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
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
                      {renderSizeStepper('slide3SuccessTitle', 'Judul Setelah Terkirim', 11, 24)}
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
                      placeholder="Konfirmasi Kehadiran Tercatat"
                      className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
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
                    {renderSizeStepper('slide3SuccessNote', 'Pesan Terima Kasih', 9, 18)}
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
                    placeholder="Terima kasih, konfirmasi Anda telah tersimpan secara online untuk panitia."
                    className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="studio-dresscode"
                className="block text-[12px] font-semibold text-[#1B1B4B] mb-1"
              >
                Dresscode / Pakaian (Opsional)
              </label>
              <input
                id="studio-dresscode"
                type="text"
                value={config.dresscode}
                onChange={(e) =>
                  onChangeConfig({ ...config, dresscode: e.target.value })
                }
                placeholder="Contoh: Batik / Pakaian Nasional"
                className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
            </div>

            <div>
              <label
                htmlFor="studio-maps-url"
                className="block text-[12px] font-semibold text-[#1B1B4B] mb-1"
              >
                Link Google Maps Presisi (Opsional)
              </label>
              <input
                id="studio-maps-url"
                type="url"
                value={config.mapsUrl}
                onChange={(e) =>
                  onChangeConfig({ ...config, mapsUrl: e.target.value })
                }
                placeholder="https://maps.app.goo.gl/..."
                className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="studio-contact-name"
                className="block text-[12px] font-semibold text-[#1B1B4B] mb-1"
              >
                Nama Narahubung / LO (Opsional)
              </label>
              <input
                id="studio-contact-name"
                type="text"
                value={config.contactName ?? ''}
                onChange={(e) =>
                  onChangeConfig({ ...config, contactName: e.target.value })
                }
                placeholder="Contoh: Ibu Rina (Protokol)"
                className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
            </div>

            <div>
              <label
                htmlFor="studio-contact-phone"
                className="block text-[12px] font-semibold text-[#1B1B4B] mb-1"
              >
                No. WhatsApp Narahubung (Opsional)
              </label>
              <input
                id="studio-contact-phone"
                type="tel"
                value={config.contactPhone ?? ''}
                onChange={(e) =>
                  onChangeConfig({ ...config, contactPhone: e.target.value })
                }
                placeholder="Contoh: 081234567890"
                className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="studio-wa-template"
                className="text-[12px] font-semibold text-[#1B1B4B]"
              >
                Template Pesan WhatsApp
              </label>
              <button
                type="button"
                onClick={() =>
                  onChangeConfig({
                    ...config,
                    whatsappTemplate: DEFAULT_INTERACTIVE_CONFIG.whatsappTemplate,
                  })
                }
                className="text-[11px] font-semibold text-[#1F9B96] hover:underline"
              >
                Reset Default
              </button>
            </div>
            <textarea
              id="studio-wa-template"
              rows={4}
              value={config.whatsappTemplate}
              onChange={(e) =>
                onChangeConfig({ ...config, whatsappTemplate: e.target.value })
              }
              className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2 text-[12px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
            />
            <p className="text-[11px] text-[#757E96] mt-1">
              Variabel otomatis: <code>{'{sapaan}'}</code>, <code>{'{nama}'}</code>,{' '}
              <code>{'{instansi}'}</code>, <code>{'{acara}'}</code>,{' '}
              <code>{'{tanggal}'}</code>, <code>{'{waktu}'}</code>,{' '}
              <code>{'{lokasi}'}</code>, <code>{'{link}'}</code>
            </p>
          </div>

          {/* Publish & Quick Copy Actions */}
          <div className="pt-2 flex flex-wrap items-center gap-2.5">
            {cloudConfigured && (
              <button
                type="button"
                disabled={publishing}
                onClick={() => void handlePublishToCloud()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[13px] font-semibold transition-colors shadow-xs disabled:opacity-50"
              >
                {publishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menerbitkan...</span>
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-4 h-4" />
                    <span>
                      {publishedAt ? 'Perbarui di Cloud' : 'Terbitkan Pengaturan ke Cloud'}
                    </span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleCopyWhatsAppMessage()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#F9DE6C] hover:bg-[#F3D34F] text-[#1B1B4B] text-[12.5px] font-bold transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Salin Pesan WA</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCopyPreviewLink()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#DDEEF3] bg-white hover:bg-[#F4FBFD] text-[#1B1B4B] text-[12.5px] font-semibold transition-colors"
            >
              <span>Salin Link</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right: Live 9:18 Android Smartphone Preview */}
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

        {/* Quick Phase Jump Bar for Live Editing */}
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
