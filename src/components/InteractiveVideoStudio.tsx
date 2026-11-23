import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  CloudUpload,
  Copy,
  Film,
  Loader2,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  DEFAULT_INTERACTIVE_CONFIG,
  EventMetadata,
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
        {/* Card 1: Auto-Composer Video Source */}
        <div className="rounded-[22px] border border-[#E5F1F5] bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-[#171512] text-[#FCE9B2] flex items-center justify-center">
                <Film className="w-4 h-4" />
              </span>
              <div>
                <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
                  1. Auto-Composer Video Pembuka
                </h3>
                <p className="text-[11.5px] text-[#757E96]">
                  Unggah video pembuka (.MP4/.WEBM) — sistem otomatis mengekstrak frame awal, frame akhir, & kontras warna.
                </p>
              </div>
            </div>

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
              Video lokal di atas langsung bisa dipratinjau di simulator HP sebelah kanan. Agar video kustom Anda bisa diputar di HP tamu secara online tanpa upgrade Blaze, unggah file `.mp4` tersebut ke hosting gratis (mis. Cloudflare R2 / Cloudinary / GitHub Releases) lalu tempelkan URL langsungnya di bawah ini — atau gunakan <strong>Preset Segel Emas</strong> yang sudah online.
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
