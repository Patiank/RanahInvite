import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
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
  EventMetadata,
  InteractiveImageAnimation,
  InteractiveInviteConfig,
  InteractiveThemeId,
  Recipient,
} from '../types';
import {
  isFirestoreRsvpConfigured,
  publishInviteConfigToCloud,
} from '../utils/firebaseRsvp';
import { buildInteractiveInviteUrl, buildWhatsAppInviteText } from '../utils/rsvp';
import { InteractiveInvitePage } from './InteractiveInvitePage';
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
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<number | null>(null);
  const [localVideoName, setLocalVideoName] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

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
      onNotify?.(
        isUsingLocalBlob
          ? 'Pengaturan teks & tema diterbitkan ke Cloud! (Video tetap memakai preset online karena video lokal belum memiliki URL publik.)'
          : 'Pengaturan Undangan Video Interaktif berhasil diterbitkan ke Cloud!',
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

  const handleCopyPreviewLink = async () => {
    try {
      const url = buildInteractiveInviteUrl(eventId, metadata, previewRecipient);
      await navigator.clipboard.writeText(url);
      onNotify?.('Link Undangan Video Interaktif disalin ke clipboard.', 'success');
    } catch {
      onNotify?.('Gagal menyalin link.', 'error');
    }
  };

  const handleCopyWhatsAppMessage = async () => {
    try {
      const text = buildWhatsAppInviteText(
        eventId,
        metadata,
        previewRecipient,
        config.whatsappTemplate
      );
      await navigator.clipboard.writeText(text);
      onNotify?.(
        `Pesan WhatsApp personal untuk "${previewRecipient.recipientName}" disalin!`,
        'success'
      );
    } catch {
      onNotify?.('Gagal menyalin pesan WhatsApp.', 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Settings & Auto-Composer Panel */}
      <div className="xl:col-span-7 space-y-5">
        {/* Card 1: Source Mode Switcher (Upload Image -> Cinema Animation OR Video Intro) */}
        <div className="rounded-[22px] border border-[#E5F1F5] bg-white p-5 space-y-4">
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

        {/* Card 2: Visual Theme, Speed & Slide Timing */}
        <div className="rounded-[22px] border border-[#E5F1F5] bg-white p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4.5 h-4.5 text-[#1F9B96]" />
            <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
              2. Tema, Laju Video & Durasi Story
            </h3>
          </div>

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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="studio-video-speed"
                className="block text-[12px] font-semibold text-[#1B1B4B] mb-1"
              >
                Laju Video
              </label>
              <select
                id="studio-video-speed"
                value={config.videoSpeed}
                onChange={(e) =>
                  onChangeConfig({ ...config, videoSpeed: Number(e.target.value) })
                }
                className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] font-medium text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              >
                <option value={1}>1,0× (Normal)</option>
                <option value={1.25}>1,25× (Lebih Cepat)</option>
                <option value={1.5}>1,5× (Sigap)</option>
                <option value={1.75}>1,75× (Ekstra Cepat)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="studio-slide-duration"
                className="block text-[12px] font-semibold text-[#1B1B4B] mb-1"
              >
                Auto-Play Slide
              </label>
              <select
                id="studio-slide-duration"
                value={config.slideDurationSec}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    slideDurationSec: Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[12.5px] font-medium text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              >
                <option value={4}>4 detik / slide</option>
                <option value={6}>6 detik / slide</option>
                <option value={8}>8 detik / slide</option>
                <option value={0}>Manual (Tanpa Auto-Play)</option>
              </select>
            </div>

            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[#1B1B4B] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.showCountdown}
                  onChange={(e) =>
                    onChangeConfig({ ...config, showCountdown: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#1F9B96] rounded"
                />
                <span>Hitung Mundur</span>
              </label>
            </div>
          </div>
        </div>

        {/* Card 3: Texts, Maps, Dresscode & WhatsApp Template */}
        <div className="rounded-[22px] border border-[#E5F1F5] bg-white p-5 space-y-3.5">
          <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
            3. Teks Undangan, Lokasi & Template WhatsApp
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="studio-cover-badge"
                className="block text-[12px] font-semibold text-[#1B1B4B] mb-1"
              >
                Label Atas Sampul
              </label>
              <input
                id="studio-cover-badge"
                type="text"
                value={config.coverBadge}
                onChange={(e) =>
                  onChangeConfig({ ...config, coverBadge: e.target.value })
                }
                placeholder="Undangan Resmi"
                className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
            </div>

            <div>
              <label
                htmlFor="studio-open-btn"
                className="block text-[12px] font-semibold text-[#1B1B4B] mb-1"
              >
                Teks Tombol Pembuka
              </label>
              <input
                id="studio-open-btn"
                type="text"
                value={config.openButtonText}
                onChange={(e) =>
                  onChangeConfig({ ...config, openButtonText: e.target.value })
                }
                placeholder="Sentuh Segel untuk Membuka"
                className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="studio-welcome-note"
              className="block text-[12px] font-semibold text-[#1B1B4B] mb-1"
            >
              Kalimat Sambutan (Slide 1)
            </label>
            <textarea
              id="studio-welcome-note"
              rows={2}
              value={config.welcomeNote}
              onChange={(e) =>
                onChangeConfig({ ...config, welcomeNote: e.target.value })
              }
              className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2 text-[12.5px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
            />
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

      {/* Right: Live 9:16 Smartphone Preview */}
      <div className="xl:col-span-5 xl:sticky xl:top-4 rounded-[24px] border border-[#E5F1F5] bg-[#F4FBFD] p-4 space-y-3.5">
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

        <InteractiveInvitePage
          key={`${previewKey}-${previewRecipient.id}`}
          embeddedPreview
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
  );
};
