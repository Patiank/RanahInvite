import { InteractiveThemeId } from '../types';

export type CloudVideoSlot = 'intro' | 'scroll';

export interface CloudVideoDescriptor {
  slot: CloudVideoSlot;
  chunks: number;
  mime: string;
  hash: string;
  kb: number;
}

export interface CompressedVideoResult {
  slot: CloudVideoSlot;
  cloudVideoUrl: string;
  previewBlobUrl: string;
  blob: Blob;
  mimeType: string;
  contentHash: string;
  chunkCount: number;
  frameCount?: number;
  originalSizeKb: number;
  finalSizeKb: number;
  passthrough: boolean;
  durationSec: number;
  posterDataUrl: string;
  openBgDataUrl: string;
  suggestedTheme: InteractiveThemeId;
  estimatedMonthlyOpens: number;
}

export const WEBP_FRAMES_MIME = 'video/x-webp-frames';

/**
 * Each Firestore chunk doc holds at most 660,000 Base64 chars (~495 KB binary),
 * comfortably under Firestore's 1 MiB document cap and 700,000-char rule limit.
 * Up to 8 chunks = ~3.85 MB compressed video per slot.
 */
export const VIDEO_CHUNK_CHAR_LIMIT = 660_000;
export const MAX_VIDEO_CHUNKS = 8;
export const MAX_CLOUD_VIDEO_BYTES = Math.floor(
  ((VIDEO_CHUNK_CHAR_LIMIT * MAX_VIDEO_CHUNKS) * 3) / 4
); // ~3,960,000 bytes (~3.77 MiB)
const PASSTHROUGH_MP4_LIMIT_BYTES = Math.round(2.2 * 1024 * 1024); // <= 2.2 MB MP4 passes through untouched
const TARGET_COMPRESSED_BYTES = Math.round(1.9 * 1024 * 1024); // Target ~1.9 MB for frugal Spark Plan quota
const TARGET_WEBP_FRAMES_BYTES = Math.round(2.0 * 1024 * 1024); // Target ~2.0 MB for ultra-smooth Slide 1-3 WebP frames
const MAX_COMPRESS_DURATION_SEC = 20;

const VIDEO_CACHE_DB_NAME = 'ranahinvite_video_cache_v1';
const VIDEO_CACHE_STORE = 'videos';
const VIDEO_CACHE_MAX_ITEMS = 12;

// Fast in-memory blob & stable ObjectURL maps so re-renders and same-session previews have 0ms latency
const memoryBlobMap = new Map<string, Blob>();
const memoryObjectUrlMap = new Map<string, string>();
const memoryFramesCacheMap = new Map<string, (ImageBitmap | HTMLImageElement)[]>();

export function isCloudVideoUrl(url?: string | null): boolean {
  return typeof url === 'string' && url.trim().startsWith('cloud-video://');
}

export function isWebpFramesMime(mime?: string | null): boolean {
  return (mime || '').split(';')[0].trim().toLowerCase() === WEBP_FRAMES_MIME;
}

export function normalizeVideoMimeType(rawMime: string): string {
  const base = (rawMime || '').split(';')[0].trim().toLowerCase();
  if (base === WEBP_FRAMES_MIME) return WEBP_FRAMES_MIME;
  if (base === 'video/webm') return 'video/webm';
  return 'video/mp4';
}

export function peekCachedVideoObjectUrl(key?: string | null): string {
  if (!key) return '';
  const trimmed = key.trim();
  const existing = memoryObjectUrlMap.get(trimmed);
  if (existing) return existing;
  const memBlob = memoryBlobMap.get(trimmed);
  if (memBlob) {
    const url = URL.createObjectURL(memBlob);
    memoryObjectUrlMap.set(trimmed, url);
    return url;
  }
  return '';
}

export function getOrCreateCachedVideoObjectUrl(key: string, blob: Blob): string {
  const trimmed = key.trim();
  const existing = memoryObjectUrlMap.get(trimmed);
  if (existing) return existing;
  memoryBlobMap.set(trimmed, blob);
  const url = URL.createObjectURL(blob);
  memoryObjectUrlMap.set(trimmed, url);
  return url;
}

export function peekCachedWebpFrames(
  key?: string | null
): (ImageBitmap | HTMLImageElement)[] | null {
  if (!key) return null;
  return memoryFramesCacheMap.get(key.trim()) ?? null;
}

export function buildCloudVideoUrl(
  desc: CloudVideoDescriptor & { frames?: number }
): string {
  const safeSlot: CloudVideoSlot = desc.slot === 'scroll' ? 'scroll' : 'intro';
  const safeChunks = Math.min(MAX_VIDEO_CHUNKS, Math.max(1, Math.round(desc.chunks)));
  const safeMime = normalizeVideoMimeType(desc.mime);
  const safeHash = (desc.hash || 'v1').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'v1';
  const safeKb = Math.max(1, Math.round(desc.kb));
  const framesPart =
    desc.frames && desc.frames > 0 ? `&frames=${Math.round(desc.frames)}` : '';
  return `cloud-video://${safeSlot}?chunks=${safeChunks}&mime=${encodeURIComponent(
    safeMime
  )}&hash=${safeHash}&kb=${safeKb}${framesPart}`;
}

export function parseCloudVideoUrl(
  url?: string | null
): (CloudVideoDescriptor & { frames?: number }) | null {
  if (!isCloudVideoUrl(url)) return null;
  const trimmed = (url || '').trim();
  const match = /^cloud-video:\/\/(intro|scroll)\?(.+)$/i.exec(trimmed);
  if (!match) return null;
  const slot = match[1].toLowerCase() === 'scroll' ? 'scroll' : 'intro';
  const params = new URLSearchParams(match[2]);
  const chunks = Number(params.get('chunks') || '0');
  const hash = (params.get('hash') || '').trim();
  const mime = normalizeVideoMimeType(params.get('mime') || 'video/mp4');
  const kb = Number(params.get('kb') || '0');
  const frames = Number(params.get('frames') || '0');
  if (!Number.isInteger(chunks) || chunks < 1 || chunks > MAX_VIDEO_CHUNKS || !hash) {
    return null;
  }
  return {
    slot,
    chunks,
    mime,
    hash,
    kb: Number.isFinite(kb) && kb > 0 ? Math.round(kb) : chunks * 480,
    ...(Number.isFinite(frames) && frames > 0 ? { frames: Math.round(frames) } : {}),
  };
}

/** Estimate how many first-time opens fit inside Firestore's 10 GiB/month Spark Plan egress */
export function estimateMonthlyOpensForKb(totalVideoKb: number): number {
  if (totalVideoKb <= 0) return 99999;
  const base64Mb = (totalVideoKb * 1.34) / 1024;
  return Math.max(50, Math.floor(10240 / Math.max(0.1, base64Mb)));
}

function openVideoCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(VIDEO_CACHE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VIDEO_CACHE_STORE)) {
          db.createObjectStore(VIDEO_CACHE_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveVideoBlobToCache(key: string, blob: Blob): Promise<void> {
  memoryBlobMap.set(key, blob);
  const db = await openVideoCacheDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(VIDEO_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(VIDEO_CACHE_STORE);
      store.put({ key, blob, savedAt: Date.now(), sizeBytes: blob.size });

      // Prune oldest entries if cache grows beyond VIDEO_CACHE_MAX_ITEMS
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const rows = (getAllReq.result || []) as { key: string; savedAt: number }[];
        if (rows.length > VIDEO_CACHE_MAX_ITEMS) {
          rows.sort((a, b) => a.savedAt - b.savedAt);
          const toDelete = rows.slice(0, rows.length - VIDEO_CACHE_MAX_ITEMS);
          for (const row of toDelete) {
            if (row.key !== key) store.delete(row.key);
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore IndexedDB quota/private-mode errors gracefully
  } finally {
    db.close();
  }
}

export async function loadVideoBlobFromCache(key: string): Promise<Blob | null> {
  const mem = memoryBlobMap.get(key);
  if (mem) return mem;

  const db = await openVideoCacheDb();
  if (!db) return null;
  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      const tx = db.transaction(VIDEO_CACHE_STORE, 'readonly');
      const store = tx.objectStore(VIDEO_CACHE_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const rec = req.result as { blob?: Blob } | undefined;
        resolve(rec?.blob instanceof Blob ? rec.blob : null);
      };
      req.onerror = () => resolve(null);
    });
    if (blob) {
      memoryBlobMap.set(key, blob);
    }
    return blob;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function computeFastVideoHash(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const bytes = new Uint8Array(digest);
      let hex = '';
      for (let i = 0; i < 8; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
      }
      return hex;
    }
  } catch {
    // fallback below
  }
  // FNV-1a fallback
  const view = new Uint8Array(buf);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const step = Math.max(1, Math.floor(view.length / 4096));
  for (let i = 0; i < view.length; i += step) {
    h1 ^= view[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= view[view.length - 1 - i];
    h2 = Math.imul(h2, 0x01000193);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0')
  );
}

export function encodeBlobToBase64Chunks(blob: Blob): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx < 0) {
        reject(new Error('Gagal menyandikan video untuk penyimpanan Cloud.'));
        return;
      }
      const rawBase64 = dataUrl.slice(commaIdx + 1);
      const chunks: string[] = [];
      for (let i = 0; i < rawBase64.length; i += VIDEO_CHUNK_CHAR_LIMIT) {
        chunks.push(rawBase64.slice(i, i + VIDEO_CHUNK_CHAR_LIMIT));
      }
      resolve(chunks);
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas video.'));
    reader.readAsDataURL(blob);
  });
}

export function decodeBase64ChunksToBlob(
  chunks: string[],
  mimeType: string
): Blob {
  const fullBase64 = chunks.join('');
  const binaryStr = atob(fullBase64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: normalizeVideoMimeType(mimeType) });
}

function pickBestRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    // MP4 H.264 first — universally playable on iPhone Safari + Android Chrome
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1.4D401E',
    'video/mp4;codecs=avc1',
    'video/mp4',
    // WebM fallback for browsers without MP4 MediaRecorder
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // continue
    }
  }
  return '';
}

interface VideoInspection {
  durationSec: number;
  width: number;
  height: number;
  posterDataUrl: string;
  openBgDataUrl: string;
  suggestedTheme: InteractiveThemeId;
}

function inspectVideoFile(blob: Blob): Promise<VideoInspection> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = objectUrl;

    let posterDataUrl = '';
    let step: 'first' | 'last' = 'first';

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      URL.revokeObjectURL(objectUrl);
    };

    const captureFrame = (): { dataUrl: string; avgLuminance: number } => {
      const vw = video.videoWidth || 540;
      const vh = video.videoHeight || 960;
      const scale = Math.min(1, 540 / Math.max(vw, 1), 960 / Math.max(vh, 1));
      const cw = Math.max(160, Math.round(vw * scale));
      const ch = Math.max(160, Math.round(vh * scale));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { dataUrl: '', avgLuminance: 40 };
      ctx.drawImage(video, 0, 0, cw, ch);
      let avgLuminance = 40;
      try {
        const pixels = ctx.getImageData(0, 0, cw, ch).data;
        let sum = 0;
        let count = 0;
        for (let i = 0; i < pixels.length; i += 64) {
          sum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
          count++;
        }
        avgLuminance = count > 0 ? sum / count : 40;
      } catch {
        // ignore
      }
      const dataUrl = canvas.toDataURL('image/webp', 0.8);
      return { dataUrl, avgLuminance };
    };

    video.onerror = () => {
      cleanup();
      reject(
        new Error(
          'Format video tidak dapat dibaca browser. Gunakan .MP4 (H.264) atau .WEBM.'
        )
      );
    };

    video.onloadedmetadata = () => {
      const dur = Number.isFinite(video.duration) ? video.duration : 1;
      video.currentTime = Math.min(0.05, Math.max(0, dur * 0.02));
    };

    video.onseeked = () => {
      if (step === 'first') {
        posterDataUrl = captureFrame().dataUrl;
        step = 'last';
        const dur = Number.isFinite(video.duration) ? video.duration : 1;
        video.currentTime = Math.max(0, dur - 0.15);
      } else {
        const { dataUrl: openBgDataUrl, avgLuminance } = captureFrame();
        const durationSec = Number.isFinite(video.duration) ? video.duration : 0;
        const width = video.videoWidth || 540;
        const height = video.videoHeight || 960;
        cleanup();
        resolve({
          durationSec,
          width,
          height,
          posterDataUrl,
          openBgDataUrl,
          suggestedTheme: avgLuminance > 150 ? 'emerald-light' : 'gold-dark',
        });
      }
    };
  });
}

function transcodeVideoInBrowser(
  sourceBlob: Blob,
  opts: {
    maxWidth: number;
    maxHeight: number;
    videoBitsPerSecond: number;
    maxDurationSec: number;
    mimeType: string;
    onProgress?: (pct: number) => void;
  }
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(sourceBlob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = objectUrl;

    let rafId: number | null = null;
    let recorder: MediaRecorder | null = null;
    let finished = false;

    const cleanup = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      video.pause();
      video.src = '';
      URL.revokeObjectURL(objectUrl);
    };

    video.onerror = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error('Gagal membaca sumber video saat kompresi otomatis.'));
    };

    video.onloadedmetadata = () => {
      const vw = video.videoWidth || 540;
      const vh = video.videoHeight || 960;
      const scale = Math.min(1, opts.maxWidth / vw, opts.maxHeight / vh);
      // H.264 requires even dimensions
      const cw = Math.max(160, Math.floor((vw * scale) / 2) * 2);
      const ch = Math.max(160, Math.floor((vh * scale) / 2) * 2);

      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        finished = true;
        cleanup();
        reject(new Error('Canvas tidak tersedia untuk kompresi video.'));
        return;
      }

      const effectiveDuration = Math.min(
        opts.maxDurationSec,
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 10
      );

      const stream = canvas.captureStream(24);
      const chunks: BlobPart[] = [];

      try {
        recorder = new MediaRecorder(stream, {
          mimeType: opts.mimeType || undefined,
          videoBitsPerSecond: opts.videoBitsPerSecond,
        });
      } catch {
        try {
          recorder = new MediaRecorder(stream, {
            videoBitsPerSecond: opts.videoBitsPerSecond,
          });
        } catch (err) {
          finished = true;
          cleanup();
          reject(
            err instanceof Error
              ? err
              : new Error('Browser tidak mendukung kompresi video otomatis.')
          );
          return;
        }
      }

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = () => {
        if (finished) return;
        finished = true;
        cleanup();
        const outMime = normalizeVideoMimeType(
          recorder?.mimeType || opts.mimeType || 'video/mp4'
        );
        resolve(new Blob(chunks, { type: outMime }));
      };

      recorder.onerror = () => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('Terjadi kendala saat mengompres video.'));
      };

      const stopRecording = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        video.pause();
        if (recorder && recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      const drawLoop = () => {
        if (finished) return;
        ctx.drawImage(video, 0, 0, cw, ch);
        const pct = Math.min(
          98,
          Math.max(1, Math.round((video.currentTime / Math.max(0.2, effectiveDuration)) * 100))
        );
        opts.onProgress?.(pct);

        if (video.ended || video.currentTime >= effectiveDuration - 0.04) {
          stopRecording();
          return;
        }
        rafId = requestAnimationFrame(drawLoop);
      };

      video.onended = () => stopRecording();

      const beginCapture = () => {
        if (finished) return;
        video.onseeked = null;
        recorder!.start(250);
        ctx.drawImage(video, 0, 0, cw, ch);

        const playPromise = video.play();
        if (playPromise) {
          playPromise
            .then(() => {
              rafId = requestAnimationFrame(drawLoop);
            })
            .catch(() => {
              finished = true;
              cleanup();
              reject(
                new Error(
                  'Browser memblokir pemutaran otomatis saat kompresi. Coba klik Upload sekali lagi.'
                )
              );
            });
        } else {
          rafId = requestAnimationFrame(drawLoop);
        }
      };

      video.onseeked = beginCapture;
      video.currentTime = 0;
      if (video.readyState >= 2 && video.currentTime === 0 && !video.seeking) {
        beginCapture();
      }
    };
  });
}

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Gagal membuat frame WebP.'));
      },
      'image/webp',
      quality
    );
  });
}

/** Packs raw WebP frame buffers cleanly into one compact binary Blob (0% base64 double overhead) */
export async function packWebpFramesToBlob(frameBlobs: Blob[]): Promise<Blob> {
  const buffers = await Promise.all(frameBlobs.map((b) => b.arrayBuffer()));
  const headerBytes = 4 + buffers.length * 4;
  let totalBytes = headerBytes;
  for (const buf of buffers) totalBytes += buf.byteLength;

  const out = new Uint8Array(totalBytes);
  const view = new DataView(out.buffer);
  view.setUint32(0, buffers.length, true);

  let offset = headerBytes;
  for (let i = 0; i < buffers.length; i++) {
    const src = new Uint8Array(buffers[i]);
    view.setUint32(4 + i * 4, src.byteLength, true);
    out.set(src, offset);
    offset += src.byteLength;
  }

  return new Blob([out], { type: WEBP_FRAMES_MIME });
}

/** Unpacks a packed WebP frames Blob into hardware-ready ImageBitmap or HTMLImageElement frames */
export async function unpackWebpFramesFromBlob(
  packedBlob: Blob,
  cacheKey?: string
): Promise<(ImageBitmap | HTMLImageElement)[]> {
  if (cacheKey) {
    const cached = memoryFramesCacheMap.get(cacheKey.trim());
    if (cached && cached.length > 0) return cached;
  }

  const ab = await packedBlob.arrayBuffer();
  const view = new DataView(ab);
  if (ab.byteLength < 8) return [];
  const count = view.getUint32(0, true);
  if (count <= 0 || count > 240) return [];

  const headerBytes = 4 + count * 4;
  if (ab.byteLength < headerBytes) return [];

  let offset = headerBytes;
  const frameBlobs: Blob[] = [];
  for (let i = 0; i < count; i++) {
    const len = view.getUint32(4 + i * 4, true);
    if (len <= 0 || offset + len > ab.byteLength) break;
    const slice = ab.slice(offset, offset + len);
    frameBlobs.push(new Blob([slice], { type: 'image/webp' }));
    offset += len;
  }

  const decoded: (ImageBitmap | HTMLImageElement)[] = await Promise.all(
    frameBlobs.map(async (fb) => {
      if (typeof createImageBitmap === 'function') {
        try {
          return await createImageBitmap(fb);
        } catch {
          // fallback to HTMLImageElement below
        }
      }
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(fb);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Gagal mendekode frame WebP.'));
        };
        img.src = url;
      });
    })
  );

  if (cacheKey && decoded.length > 0) {
    memoryFramesCacheMap.set(cacheKey.trim(), decoded);
  }
  return decoded;
}

/**
 * Extracts evenly-spaced WebP frames from Video 2 for ultra-smooth 60fps Apple-style
 * finger-scroll playback on all smartphones (iOS Safari + Android Chrome), packed cleanly
 * into ~1.4-2.0 MB for minimal Firebase Spark Plan bandwidth.
 */
export async function compressScrollVideoToWebpFrames(
  file: File,
  onProgress?: (percent: number, stage: string) => void
): Promise<CompressedVideoResult> {
  const originalSizeKb = Math.max(1, Math.round(file.size / 1024));
  onProgress?.(5, 'Menganalisis Video 2...');
  const info = await inspectVideoFile(file);

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;

  const extractPass = async (
    targetFrames: number,
    maxW: number,
    maxH: number,
    quality: number
  ): Promise<Blob[]> => {
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 1) {
        resolve();
        return;
      }
      video.onloadedmetadata = () => resolve();
      video.onerror = () =>
        reject(new Error('Gagal membaca Video 2 saat ekstraksi frame WebP.'));
    });

    const dur = Math.max(0.5, Number.isFinite(video.duration) ? video.duration : 5);
    const vw = video.videoWidth || 540;
    const vh = video.videoHeight || 960;
    const scale = Math.min(1, maxW / vw, maxH / vh);
    const cw = Math.max(180, Math.round(vw * scale));
    const ch = Math.max(180, Math.round(vh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas tidak tersedia.');

    const frames: Blob[] = [];
    for (let i = 0; i < targetFrames; i++) {
      const ratio = targetFrames > 1 ? i / (targetFrames - 1) : 0;
      const t = Math.min(Math.max(0, dur - 0.03), ratio * Math.max(0.1, dur - 0.03));

      await new Promise<void>((resolve) => {
        let done = false;
        const finishSeek = () => {
          if (done) return;
          done = true;
          video.onseeked = null;
          resolve();
        };
        const timer = window.setTimeout(finishSeek, 350);
        video.onseeked = () => {
          window.clearTimeout(timer);
          finishSeek();
        };
        video.currentTime = t;
      });

      ctx.drawImage(video, 0, 0, cw, ch);
      const webpBlob = await canvasToWebpBlob(canvas, quality);
      frames.push(webpBlob);

      const pct = 12 + Math.round(((i + 1) / targetFrames) * 74);
      onProgress?.(pct, `Membuat frame WebP ${i + 1}/${targetFrames}...`);
    }
    return frames;
  };

  try {
    const desiredCount = Math.min(
      76,
      Math.max(36, Math.round(Math.min(8, Math.max(3, info.durationSec || 5)) * 12))
    );
    let frameBlobs = await extractPass(desiredCount, 460, 820, 0.68);
    let packedBlob = await packWebpFramesToBlob(frameBlobs);

    if (packedBlob.size > TARGET_WEBP_FRAMES_BYTES) {
      onProgress?.(88, 'Mengoptimalkan kualitas WebP agar ekstra hemat...');
      frameBlobs = await extractPass(
        Math.min(60, desiredCount),
        400,
        712,
        packedBlob.size > MAX_CLOUD_VIDEO_BYTES ? 0.48 : 0.56
      );
      packedBlob = await packWebpFramesToBlob(frameBlobs);
    }

    if (packedBlob.size > MAX_CLOUD_VIDEO_BYTES) {
      onProgress?.(92, 'Menyesuaikan batas ukuran hemat kuota...');
      frameBlobs = await extractPass(44, 360, 640, 0.48);
      packedBlob = await packWebpFramesToBlob(frameBlobs);
    }

    if (packedBlob.size > MAX_CLOUD_VIDEO_BYTES) {
      throw new Error(
        `Paket frame WebP (${(packedBlob.size / (1024 * 1024)).toFixed(1)} MB) masih melebihi batas hemat kuota 3,7 MB.`
      );
    }

    onProgress?.(96, 'Menyiapkan cache instan 60fps...');
    const contentHash = await computeFastVideoHash(packedBlob);
    const base64EstimatedChars = Math.ceil((packedBlob.size * 4) / 3);
    const chunkCount = Math.min(
      MAX_VIDEO_CHUNKS,
      Math.max(1, Math.ceil(base64EstimatedChars / VIDEO_CHUNK_CHAR_LIMIT))
    );
    const finalSizeKb = Math.max(1, Math.round(packedBlob.size / 1024));
    const cloudVideoUrl = buildCloudVideoUrl({
      slot: 'scroll',
      chunks: chunkCount,
      mime: WEBP_FRAMES_MIME,
      hash: contentHash,
      kb: finalSizeKb,
      frames: frameBlobs.length,
    });

    await saveVideoBlobToCache(cloudVideoUrl, packedBlob);
    await unpackWebpFramesFromBlob(packedBlob, cloudVideoUrl);
    const previewBlobUrl = getOrCreateCachedVideoObjectUrl(cloudVideoUrl, packedBlob);
    onProgress?.(100, `${frameBlobs.length} frame WebP siap (${finalSizeKb} KB)!`);

    return {
      slot: 'scroll',
      cloudVideoUrl,
      previewBlobUrl,
      blob: packedBlob,
      mimeType: WEBP_FRAMES_MIME,
      contentHash,
      chunkCount,
      frameCount: frameBlobs.length,
      originalSizeKb,
      finalSizeKb,
      passthrough: false,
      durationSec: info.durationSec,
      posterDataUrl: info.posterDataUrl,
      openBgDataUrl: info.openBgDataUrl,
      suggestedTheme: info.suggestedTheme,
      estimatedMonthlyOpens: estimateMonthlyOpensForKb(finalSizeKb),
    };
  } finally {
    video.pause();
    video.src = '';
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Compresses an uploaded video directly inside the admin browser so it stays tiny
 * and frugal for Firebase Spark Plan Firestore storage (<= 3.7 MB max, target ~1.9 MB).
 * Small MP4 files (<= 2.2 MB) pass through untouched at 100% original quality.
 */
export async function compressVideoForInvite(
  file: File,
  slot: CloudVideoSlot,
  onProgress?: (percent: number, stage: string) => void
): Promise<CompressedVideoResult> {
  const originalSizeKb = Math.max(1, Math.round(file.size / 1024));
  onProgress?.(5, 'Menganalisis video...');

  const info = await inspectVideoFile(file);
  const isAlreadyMp4 =
    file.type.toLowerCase() === 'video/mp4' || /\.mp4$/i.test(file.name);

  let finalBlob: Blob = file;
  let passthrough = false;

  if (isAlreadyMp4 && file.size <= PASSTHROUGH_MP4_LIMIT_BYTES) {
    passthrough = true;
    onProgress?.(85, 'Video sudah ringkas (langsung siap · hemat kuota!)');
  } else {
    const recorderMime = pickBestRecorderMimeType();
    if (!recorderMime) {
      if (file.size <= MAX_CLOUD_VIDEO_BYTES) {
        passthrough = true;
        onProgress?.(85, 'Memakai file video asli...');
      } else {
        throw new Error(
          `Video berukuran ${(file.size / (1024 * 1024)).toFixed(1)} MB melebihi batas hemat kuota (3,7 MB) dan browser ini belum mendukung kompresi otomatis. Gunakan Chrome/Edge terbaru atau perkecil video di bawah 3,5 MB.`
        );
      }
    } else {
      const effectiveDur = Math.max(
        1,
        Math.min(MAX_COMPRESS_DURATION_SEC, info.durationSec || 8)
      );
      const targetBps = Math.min(
        1_350_000,
        Math.max(420_000, Math.floor((TARGET_COMPRESSED_BYTES * 8) / effectiveDur))
      );

      onProgress?.(10, 'Mengompres video otomatis agar hemat kuota...');
      const pass1 = await transcodeVideoInBrowser(file, {
        maxWidth: 540,
        maxHeight: 960,
        videoBitsPerSecond: targetBps,
        maxDurationSec: MAX_COMPRESS_DURATION_SEC,
        mimeType: recorderMime,
        onProgress: (p) =>
          onProgress?.(10 + Math.round(p * 0.72), `Mengompres video... ${p}%`),
      });

      if (pass1.size <= MAX_CLOUD_VIDEO_BYTES) {
        finalBlob =
          isAlreadyMp4 && file.size < pass1.size && file.size <= MAX_CLOUD_VIDEO_BYTES
            ? file
            : pass1;
        if (finalBlob === file) passthrough = true;
      } else {
        // Extra frugal pass for longer / high-motion videos
        onProgress?.(82, 'Menyesuaikan ukuran ekstra hemat...');
        const pass2Bps = Math.max(
          300_000,
          Math.floor((1.65 * 1024 * 1024 * 8) / Math.min(16, effectiveDur))
        );
        const pass2 = await transcodeVideoInBrowser(file, {
          maxWidth: 420,
          maxHeight: 746,
          videoBitsPerSecond: pass2Bps,
          maxDurationSec: 16,
          mimeType: recorderMime,
          onProgress: (p) =>
            onProgress?.(82 + Math.round(p * 0.12), `Kompresi hemat... ${p}%`),
        });
        finalBlob = pass2;
      }
    }
  }

  if (finalBlob.size > MAX_CLOUD_VIDEO_BYTES) {
    throw new Error(
      `Ukuran video setelah kompresi masih ${(finalBlob.size / (1024 * 1024)).toFixed(1)} MB (batas maksimal 3,7 MB untuk kuota gratis Firebase). Coba potong durasi video menjadi 5–15 detik.`
    );
  }

  onProgress?.(95, 'Menyiapkan cache lokal & kode hemat kuota...');
  const mimeType = normalizeVideoMimeType(finalBlob.type || file.type || 'video/mp4');
  const contentHash = await computeFastVideoHash(finalBlob);
  const base64EstimatedChars = Math.ceil((finalBlob.size * 4) / 3);
  const chunkCount = Math.min(
    MAX_VIDEO_CHUNKS,
    Math.max(1, Math.ceil(base64EstimatedChars / VIDEO_CHUNK_CHAR_LIMIT))
  );
  const finalSizeKb = Math.max(1, Math.round(finalBlob.size / 1024));
  const cloudVideoUrl = buildCloudVideoUrl({
    slot,
    chunks: chunkCount,
    mime: mimeType,
    hash: contentHash,
    kb: finalSizeKb,
  });

  await saveVideoBlobToCache(cloudVideoUrl, finalBlob);
  const previewBlobUrl = getOrCreateCachedVideoObjectUrl(cloudVideoUrl, finalBlob);
  onProgress?.(100, 'Siap diterbitkan online!');

  return {
    slot,
    cloudVideoUrl,
    previewBlobUrl,
    blob: finalBlob,
    mimeType,
    contentHash,
    chunkCount,
    originalSizeKb,
    finalSizeKb,
    passthrough,
    durationSec: info.durationSec,
    posterDataUrl: info.posterDataUrl,
    openBgDataUrl: info.openBgDataUrl,
    suggestedTheme: info.suggestedTheme,
    estimatedMonthlyOpens: estimateMonthlyOpensForKb(finalSizeKb),
  };
}
