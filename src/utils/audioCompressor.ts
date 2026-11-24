export interface CompressedAudioResult {
  dataUrl: string;
  sizeKb: number;
  originalSizeKb: number;
  durationSec: number;
  bitrateKbps: number;
  trimmed: boolean;
  passthrough: boolean;
}

export function isAudioFile(file: File): boolean {
  return (
    file.type.startsWith('audio/') ||
    /\.(mp3|wav|m4a|aac|ogg|oga|webm|flac|opus)$/i.test(file.name)
  );
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca berkas audio.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas audio.'));
    reader.readAsDataURL(file);
  });
}

function probeAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    el.preload = 'metadata';
    const done = (dur: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 0);
    };
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(0);
    el.src = url;
  });
}

async function encodeMonoPcmToMp3(
  samples: Float32Array,
  sampleRate: number,
  kbps: number,
  onProgress?: (pct: number) => void
): Promise<Uint8Array> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const encoder = new Mp3Encoder(1, sampleRate, kbps);

  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  }

  const blockSize = 1152;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const totalBlocks = Math.max(1, Math.ceil(int16.length / blockSize));

  for (let i = 0, blockIdx = 0; i < int16.length; i += blockSize, blockIdx += 1) {
    const slice = int16.subarray(i, Math.min(i + blockSize, int16.length));
    const encoded = encoder.encodeBuffer(slice);
    if (encoded.length > 0) {
      chunks.push(encoded);
      totalBytes += encoded.length;
    }

    // Yield periodically so UI stays 60fps & responsive during compression
    if (blockIdx % 140 === 0) {
      if (onProgress) {
        onProgress(Math.min(95, 25 + Math.round((blockIdx / totalBlocks) * 70)));
      }
      await new Promise<void>((r) => window.setTimeout(r, 0));
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    chunks.push(flushed);
    totalBytes += flushed.length;
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/**
 * Auto-compresses any uploaded audio file (.mp3/.wav/.m4a/.ogg/.flac) into a
 * universally playable, ultra-lightweight MP3 data URL sized cleanly for
 * Firebase Spark Plan Firestore storage (<= 400,000 base64 chars / ~300 KB).
 */
export async function compressAudioForInvite(
  file: File,
  options?: {
    maxDurationSec?: number;
    maxDataUrlLen?: number;
    onProgress?: (pct: number) => void;
  }
): Promise<CompressedAudioResult> {
  const maxDurationSec = Math.min(60, Math.max(15, options?.maxDurationSec ?? 45));
  const maxDataUrlLen = options?.maxDataUrlLen ?? 400000;
  const onProgress = options?.onProgress;
  const originalSizeKb = Math.max(1, Math.round(file.size / 1024));

  onProgress?.(5);

  // Fast passthrough if the user already uploaded a tiny universal .mp3 or .m4a
  const isUniversalCompressed =
    file.type === 'audio/mpeg' ||
    file.type === 'audio/mp3' ||
    file.type === 'audio/mp4' ||
    file.type === 'audio/x-m4a' ||
    /\.(mp3|m4a)$/i.test(file.name);

  if (isUniversalCompressed && file.size > 0 && file.size * 1.35 + 40 <= maxDataUrlLen) {
    const [rawDataUrl, dur] = await Promise.all([
      readFileAsDataUrl(file),
      probeAudioDuration(file),
    ]);
    if (rawDataUrl.startsWith('data:audio/') && rawDataUrl.length <= maxDataUrlLen) {
      onProgress?.(100);
      return {
        dataUrl: rawDataUrl,
        sizeKb: Math.max(1, Math.round((rawDataUrl.length * 3) / 4 / 1024)),
        originalSizeKb,
        durationSec: Math.min(180, dur),
        bitrateKbps: dur > 0 ? Math.round((file.size * 8) / 1000 / dur) : 48,
        trimmed: false,
        passthrough: true,
      };
    }
  }

  if (file.size > 25 * 1024 * 1024) {
    throw new Error('Ukuran file audio terlalu besar (maksimal 25 MB).');
  }

  onProgress?.(12);
  const arrayBuffer = await file.arrayBuffer();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Browser ini belum mendukung pemrosesan Web Audio.');
  }

  const decodeCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    throw new Error(
      'Format audio tidak dapat didekode. Gunakan berkas .MP3, .WAV, .M4A, atau .OGG.'
    );
  } finally {
    void decodeCtx.close().catch(() => {});
  }

  const trimmed = decoded.duration > maxDurationSec + 0.5;
  const clipDurationSec = Math.min(decoded.duration, maxDurationSec);
  if (clipDurationSec <= 0.2) {
    throw new Error('Durasi audio terlalu pendek.');
  }

  onProgress?.(20);

  // Downmix & resample cleanly to 22,050 Hz Mono using OfflineAudioContext
  const targetSampleRate = 22050;
  const targetLength = Math.max(1, Math.ceil(clipDurationSec * targetSampleRate));
  const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start(0, 0, clipDurationSec);
  const rendered = await offlineCtx.startRendering();
  const mono = new Float32Array(rendered.getChannelData(0));

  // Normalize peak gently to 0.92 & apply smooth fade-in (1.0s) + fade-out (2.0s) for seamless looping
  let peak = 0;
  for (let i = 0; i < mono.length; i += 1) {
    const abs = Math.abs(mono[i]);
    if (abs > peak) peak = abs;
  }
  const gain = peak > 0.01 ? Math.min(2.2, 0.92 / peak) : 1;
  const fadeInSamples = Math.min(
    Math.floor(targetSampleRate * 1.0),
    Math.floor(mono.length * 0.15)
  );
  const fadeOutSamples = Math.min(
    Math.floor(targetSampleRate * 2.0),
    Math.floor(mono.length * 0.25)
  );

  for (let i = 0; i < mono.length; i += 1) {
    let sample = mono[i] * gain;
    if (i < fadeInSamples) {
      sample *= i / fadeInSamples;
    } else if (i > mono.length - fadeOutSamples) {
      sample *= (mono.length - i) / fadeOutSamples;
    }
    mono[i] = sample;
  }

  // Pick optimal MP3 bitrate ladder to stay cleanly under Firestore quota (~300 KB)
  const preferredLadder =
    clipDurationSec <= 32
      ? [48, 40, 32, 24]
      : clipDurationSec <= 48
        ? [40, 32, 24]
        : [32, 24];

  let chosenDataUrl = '';
  let chosenKbps = preferredLadder[preferredLadder.length - 1];

  for (const kbps of preferredLadder) {
    const mp3Bytes = await encodeMonoPcmToMp3(
      mono,
      targetSampleRate,
      kbps,
      onProgress
    );
    const candidate = `data:audio/mpeg;base64,${uint8ArrayToBase64(mp3Bytes)}`;
    chosenDataUrl = candidate;
    chosenKbps = kbps;
    if (candidate.length <= maxDataUrlLen) {
      break;
    }
  }

  if (chosenDataUrl.length > maxDataUrlLen) {
    // Hard safety trim to 25s @ 24kbps (~75 KB) if a clip somehow stayed oversized
    const shortSamples = mono.subarray(
      0,
      Math.min(mono.length, targetSampleRate * 25)
    );
    const mp3Bytes = await encodeMonoPcmToMp3(shortSamples, targetSampleRate, 24);
    chosenDataUrl = `data:audio/mpeg;base64,${uint8ArrayToBase64(mp3Bytes)}`;
    chosenKbps = 24;
  }

  onProgress?.(100);
  const approxBytes = Math.round((chosenDataUrl.length * 3) / 4);
  return {
    dataUrl: chosenDataUrl,
    sizeKb: Math.max(1, Math.round(approxBytes / 1024)),
    originalSizeKb,
    durationSec: Math.round(clipDurationSec),
    bitrateKbps: chosenKbps,
    trimmed,
    passthrough: false,
  };
}
