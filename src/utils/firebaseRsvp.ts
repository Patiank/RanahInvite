import {
  DEFAULT_INTERACTIVE_CONFIG,
  DEFAULT_PANEL_SCALES,
  DEFAULT_SLIDE_EXTRAS,
  DEFAULT_SLIDE_TEXT_SIZES,
  EventMetadata,
  InteractiveCardStyle,
  InteractiveFontPreset,
  InteractiveImageAnimation,
  InteractiveInviteConfig,
  InteractiveMediaMode,
  InteractivePanelScales,
  InteractiveSealSize,
  InteractiveScrollVideoMode,
  InteractiveSlideExtras,
  InteractiveSlideStyles,
  InteractiveSlideTextSizes,
  InteractiveStoryNavMode,
  InteractiveTextAlign,
  InteractiveTextScale,
  InteractiveTextShadow,
  InteractiveThemeId,
  InteractiveVerticalAlign,
  PerSlideStyleOverride,
  Recipient,
  RsvpStatus,
} from '../types';
import {
  CloudVideoSlot,
  MAX_VIDEO_CHUNKS,
  decodeBase64ChunksToBlob,
  encodeBlobToBase64Chunks,
  isCloudVideoUrl,
  loadVideoBlobFromCache,
  parseCloudVideoUrl,
  saveVideoBlobToCache,
} from './videoCompressor';

export interface CloudGuestInviteCard {
  code: string;
  salutation: string;
  recipientName: string;
  institution: string;
  updatedAt: number;
}

export interface CloudInviteConfigResult {
  config: Partial<InteractiveInviteConfig>;
  eventMeta?: Partial<EventMetadata>;
  hasCloudAudio?: boolean;
}

export interface CloudRsvpRecord {
  invitationCode: string;
  status: Exclude<RsvpStatus, 'pending'>;
  representative: string;
  note: string;
  updatedAt: number;
}

interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

function readFirebaseConfig(): FirebaseWebConfig | null {
  const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
  const authDomain = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
  const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const appId = (import.meta.env.VITE_FIREBASE_APP_ID || '').trim();

  if (!apiKey || !projectId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    appId,
  };
}

export function isFirestoreRsvpConfigured(): boolean {
  return readFirebaseConfig() !== null;
}

export function sanitizeFirestoreId(
  raw: string,
  maxLen: number,
  fallback = 'default'
): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[\/\\?#%[\]]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, maxLen);
  return cleaned || fallback;
}

let cachedDbPromise: Promise<
  import('firebase/firestore/lite').Firestore | null
> | null = null;

export async function getLiteFirestore() {
  const config = readFirebaseConfig();
  if (!config) return null;

  if (!cachedDbPromise) {
    cachedDbPromise = (async () => {
      const [{ initializeApp, getApps, getApp }, { getFirestore }] =
        await Promise.all([
          import('firebase/app'),
          import('firebase/firestore/lite'),
        ]);
      const app = getApps().length > 0 ? getApp() : initializeApp(config);
      return getFirestore(app);
    })();
  }

  return cachedDbPromise;
}

export async function fetchSingleRsvpFromCloud(
  eventId: string,
  invitationCode: string
): Promise<CloudRsvpRecord | null> {
  const db = await getLiteFirestore();
  if (!db) return null;

  const { doc, getDoc } = await import('firebase/firestore/lite');
  const safeEventId = sanitizeFirestoreId(eventId, 80);
  const safeCode = sanitizeFirestoreId(invitationCode, 40);

  const snap = await getDoc(doc(db, 'events', safeEventId, 'rsvps', safeCode));
  if (!snap.exists()) return null;

  const data = snap.data();
  if (
    data.status !== 'attending' &&
    data.status !== 'represented' &&
    data.status !== 'declined'
  ) {
    return null;
  }

  return {
    invitationCode: String(data.invitationCode || safeCode),
    status: data.status,
    representative: typeof data.representative === 'string' ? data.representative : '',
    note: typeof data.note === 'string' ? data.note : '',
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
  };
}

export async function submitRsvpToCloud(
  eventId: string,
  invitationCode: string,
  data: {
    status: 'attending' | 'represented' | 'declined';
    representative?: string;
    note?: string;
    updatedAt?: number;
  }
): Promise<boolean> {
  const db = await getLiteFirestore();
  if (!db) return false;

  const { doc, setDoc } = await import('firebase/firestore/lite');
  const safeEventId = sanitizeFirestoreId(eventId, 80);
  const safeCode = sanitizeFirestoreId(invitationCode, 40);

  const record: CloudRsvpRecord = {
    invitationCode: safeCode,
    status: data.status,
    representative: (data.representative ?? '').trim().slice(0, 120),
    note: (data.note ?? '').trim().slice(0, 240),
    updatedAt: Math.floor(data.updatedAt ?? Date.now()),
  };

  await setDoc(doc(db, 'events', safeEventId, 'rsvps', safeCode), record);
  return true;
}

export async function syncEventRsvpsFromCloud(
  eventId: string,
  lastSyncedAt: number
): Promise<{ updates: CloudRsvpRecord[]; maxUpdatedAt: number }> {
  const db = await getLiteFirestore();
  if (!db) return { updates: [], maxUpdatedAt: lastSyncedAt };

  const { collection, getDocs, limit, orderBy, query, where } = await import(
    'firebase/firestore/lite'
  );
  const safeEventId = sanitizeFirestoreId(eventId, 80);
  const colRef = collection(db, 'events', safeEventId, 'rsvps');

  const q = query(
    colRef,
    where('updatedAt', '>', Math.floor(lastSyncedAt)),
    orderBy('updatedAt', 'asc'),
    limit(500)
  );

  const snapshot = await getDocs(q);
  const updates: CloudRsvpRecord[] = [];
  let maxUpdatedAt = lastSyncedAt;

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (
      data.status !== 'attending' &&
      data.status !== 'represented' &&
      data.status !== 'declined'
    ) {
      return;
    }
    const updatedAt =
      typeof data.updatedAt === 'number' ? data.updatedAt : Date.now();
    if (updatedAt > maxUpdatedAt) {
      maxUpdatedAt = updatedAt;
    }
    updates.push({
      invitationCode: String(data.invitationCode || docSnap.id),
      status: data.status,
      representative:
        typeof data.representative === 'string' ? data.representative : '',
      note: typeof data.note === 'string' ? data.note : '',
      updatedAt,
    });
  });

  return { updates, maxUpdatedAt };
}

function isSafeCloudUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/media/')) return true;
  if (isCloudVideoUrl(trimmed)) return true;
  return /^https?:\/\//i.test(trimmed);
}

const inFlightCloudVideoFetches = new Map<string, Promise<Blob | null>>();

async function uploadCloudVideoSlotIfNeeded(
  db: import('firebase/firestore/lite').Firestore,
  safeEventId: string,
  cloudUrl: string
): Promise<void> {
  const desc = parseCloudVideoUrl(cloudUrl);
  if (!desc) return;

  const { doc, getDoc, writeBatch } = await import('firebase/firestore/lite');
  const firstChunkRef = doc(
    db,
    'events',
    safeEventId,
    'videoChunks',
    `${desc.slot}_0`
  );
  const firstSnap = await getDoc(firstChunkRef);
  const prevTotalChunks = firstSnap.exists()
    ? Number(firstSnap.data().totalChunks || 0)
    : 0;
  if (
    firstSnap.exists() &&
    firstSnap.data().contentHash === desc.hash &&
    prevTotalChunks === desc.chunks &&
    typeof firstSnap.data().data === 'string' &&
    firstSnap.data().data.length > 0
  ) {
    // Video binary with exact same hash is already published in Firestore -> 0 writes!
    return;
  }

  const blob = await loadVideoBlobFromCache(cloudUrl);
  if (!blob) {
    throw new Error(
      `Berkas ${
        desc.slot === 'intro' ? 'Video 1 (Pembuka)' : 'Video 2 (Latar Gulir)'
      } belum ada di cache browser ini. Silakan klik tombol Upload Video terlebih dahulu.`
    );
  }

  const chunks = await encodeBlobToBase64Chunks(blob);
  if (chunks.length > MAX_VIDEO_CHUNKS) {
    throw new Error(
      'Ukuran video setelah kompresi melebihi batas maksimal hemat kuota Firestore.'
    );
  }

  const now = Math.floor(Date.now());
  const mimeType = desc.mime;
  const totalChunks = chunks.length;

  // Write in small batches (<= 4 chunks ~2.6 MB per batch) to stay well under Firestore request limits
  const WRITE_BATCH_SIZE = 4;
  for (let start = 0; start < totalChunks; start += WRITE_BATCH_SIZE) {
    const batch = writeBatch(db);
    const end = Math.min(totalChunks, start + WRITE_BATCH_SIZE);
    for (let idx = start; idx < end; idx++) {
      const chunkRef = doc(
        db,
        'events',
        safeEventId,
        'videoChunks',
        `${desc.slot}_${idx}`
      );
      batch.set(chunkRef, {
        slot: desc.slot as CloudVideoSlot,
        chunkIndex: idx,
        totalChunks,
        mimeType,
        contentHash: desc.hash,
        data: chunks[idx],
        updatedAt: now,
      });
    }
    await batch.commit();
  }

  // Reclaim storage if previous video had more trailing chunks
  if (prevTotalChunks > totalChunks) {
    const cleanupBatch = writeBatch(db);
    for (
      let idx = totalChunks;
      idx < Math.min(MAX_VIDEO_CHUNKS, prevTotalChunks);
      idx++
    ) {
      const staleRef = doc(
        db,
        'events',
        safeEventId,
        'videoChunks',
        `${desc.slot}_${idx}`
      );
      cleanupBatch.set(staleRef, {
        slot: desc.slot as CloudVideoSlot,
        chunkIndex: idx,
        totalChunks,
        mimeType,
        contentHash: desc.hash,
        data: '',
        updatedAt: now,
      });
    }
    await cleanupBatch.commit();
  }
}

export async function fetchCloudVideoFromCloud(
  eventId: string,
  cloudUrl: string
): Promise<Blob | null> {
  const desc = parseCloudVideoUrl(cloudUrl);
  if (!desc || !eventId) return null;

  const cached = await loadVideoBlobFromCache(cloudUrl);
  if (cached) return cached;

  const cacheKey = `${eventId}::${cloudUrl}`;
  const pending = inFlightCloudVideoFetches.get(cacheKey);
  if (pending) return pending;

  const task = (async (): Promise<Blob | null> => {
    try {
      const db = await getLiteFirestore();
      if (!db) return null;
      const { doc, getDoc } = await import('firebase/firestore/lite');
      const safeEventId = sanitizeFirestoreId(eventId, 80);

      const snaps = await Promise.all(
        Array.from({ length: desc.chunks }, (_, idx) =>
          getDoc(
            doc(
              db,
              'events',
              safeEventId,
              'videoChunks',
              `${desc.slot}_${idx}`
            )
          )
        )
      );

      const parts: string[] = [];
      let detectedMime = desc.mime;
      for (let i = 0; i < snaps.length; i++) {
        const snap = snaps[i];
        if (!snap.exists()) return null;
        const d = snap.data();
        if (
          typeof d.data !== 'string' ||
          d.data.length === 0 ||
          (d.contentHash && d.contentHash !== desc.hash)
        ) {
          return null;
        }
        if (typeof d.mimeType === 'string' && d.mimeType.startsWith('video/')) {
          detectedMime = d.mimeType;
        }
        parts.push(d.data);
      }

      const blob = decodeBase64ChunksToBlob(parts, detectedMime);
      await saveVideoBlobToCache(cloudUrl, blob);
      return blob;
    } catch (err) {
      console.warn('Gagal mengunduh cache video undangan:', err);
      return null;
    } finally {
      inFlightCloudVideoFetches.delete(cacheKey);
    }
  })();

  inFlightCloudVideoFetches.set(cacheKey, task);
  return task;
}

export async function publishInviteConfigToCloud(
  eventId: string,
  config: InteractiveInviteConfig,
  metadata?: EventMetadata
): Promise<boolean> {
  const db = await getLiteFirestore();
  if (!db) return false;

  // Ensure Firebase Auth token is ready and belongs to an allowlisted admin
  const [{ getApps }, { getAuth }] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ]);
  const app = getApps()[0];
  if (app) {
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user) {
      throw new Error(
        'Sesi login admin belum aktif. Silakan muat ulang halaman dan masuk dengan akun Google admin.'
      );
    }
    // Refresh ID token if needed so Firestore Lite always sends a valid verified-email token
    await user.getIdToken();
  }

  const { doc, setDoc } = await import('firebase/firestore/lite');
  const safeEventId = sanitizeFirestoreId(eventId, 80);

  // Never send local blob:/data: URLs to Firestore; fall back to default preset if local-only
  const cloudVideoUrl = isSafeCloudUrl(config.videoUrl)
    ? config.videoUrl.trim().slice(0, 500)
    : DEFAULT_INTERACTIVE_CONFIG.videoUrl;
  const cloudPosterUrl = isSafeCloudUrl(config.posterUrl)
    ? config.posterUrl.trim().slice(0, 500)
    : DEFAULT_INTERACTIVE_CONFIG.posterUrl;
  const cloudOpenBgUrl = isSafeCloudUrl(config.openBgUrl)
    ? config.openBgUrl.trim().slice(0, 500)
    : DEFAULT_INTERACTIVE_CONFIG.openBgUrl;

  const validThemes: InteractiveThemeId[] = [
    'gold-dark',
    'emerald-light',
    'navy-gold',
  ];
  const validAnims: InteractiveImageAnimation[] = [
    'wax-seal-open',
    'gate-split',
    'curtain-up',
    'ken-burns',
  ];
  const validFonts: InteractiveFontPreset[] = [
    'modern',
    'classic',
    'ceremonial',
    'editorial',
  ];
  const validScales: InteractiveTextScale[] = ['sm', 'md', 'lg'];
  const validAligns: InteractiveVerticalAlign[] = ['top', 'center', 'bottom'];
  const validCards: InteractiveCardStyle[] = ['solid', 'glass', 'minimal'];
  const validTextAligns: InteractiveTextAlign[] = ['center', 'left'];
  const validSealSizes: InteractiveSealSize[] = ['sm', 'md', 'lg'];

  const clampInt = (
    val: unknown,
    fallback: number,
    min: number,
    max: number
  ): number => {
    const n = Math.round(Number(val));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  const clampNum = (
    val: unknown,
    fallback: number,
    min: number,
    max: number
  ): number => {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Number(Math.min(max, Math.max(min, n)).toFixed(2));
  };
  const safeImageDataUrl = (val: unknown, maxLen: number): string => {
    if (typeof val !== 'string') return '';
    const trimmed = val.trim();
    if (!trimmed.startsWith('data:image/')) return '';
    return trimmed.slice(0, maxLen);
  };

  const rawSizes = config.textSizes ?? DEFAULT_SLIDE_TEXT_SIZES;
  const textSizes: InteractiveSlideTextSizes = {
    coverBadge: clampInt(rawSizes.coverBadge, DEFAULT_SLIDE_TEXT_SIZES.coverBadge, 8, 28),
    openButtonText: clampInt(
      rawSizes.openButtonText,
      DEFAULT_SLIDE_TEXT_SIZES.openButtonText,
      8,
      28
    ),
    slide1Heading: clampInt(
      rawSizes.slide1Heading,
      DEFAULT_SLIDE_TEXT_SIZES.slide1Heading,
      8,
      28
    ),
    welcomeNote: clampInt(
      rawSizes.welcomeNote,
      DEFAULT_SLIDE_TEXT_SIZES.welcomeNote,
      8,
      28
    ),
    slide2Heading: clampInt(
      rawSizes.slide2Heading,
      DEFAULT_SLIDE_TEXT_SIZES.slide2Heading,
      8,
      28
    ),
    slide2ExtraNote: clampInt(
      rawSizes.slide2ExtraNote,
      DEFAULT_SLIDE_TEXT_SIZES.slide2ExtraNote,
      8,
      28
    ),
    slide3Heading: clampInt(
      rawSizes.slide3Heading,
      DEFAULT_SLIDE_TEXT_SIZES.slide3Heading,
      8,
      28
    ),
    slide3SuccessTitle: clampInt(
      rawSizes.slide3SuccessTitle,
      DEFAULT_SLIDE_TEXT_SIZES.slide3SuccessTitle,
      8,
      28
    ),
    slide3SuccessNote: clampInt(
      rawSizes.slide3SuccessNote,
      DEFAULT_SLIDE_TEXT_SIZES.slide3SuccessNote,
      8,
      28
    ),
  };
  const rawPanelScales = config.panelScales ?? DEFAULT_PANEL_SCALES;
  const panelScales: InteractivePanelScales = {
    cover: clampInt(rawPanelScales.cover, DEFAULT_PANEL_SCALES.cover, 75, 115),
    slide1: clampInt(rawPanelScales.slide1, DEFAULT_PANEL_SCALES.slide1, 75, 115),
    slide2: clampInt(rawPanelScales.slide2, DEFAULT_PANEL_SCALES.slide2, 75, 115),
    slide3: clampInt(rawPanelScales.slide3, DEFAULT_PANEL_SCALES.slide3, 75, 115),
  };

  const safeHexColor = (val?: unknown): string => {
    if (typeof val !== 'string') return '';
    const trimmed = val.trim();
    return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : '';
  };

  const sanitizePerSlideStyle = (
    raw?: PerSlideStyleOverride
  ): PerSlideStyleOverride => {
    if (!raw || typeof raw !== 'object') return {};
    const out: PerSlideStyleOverride = {};
    if (typeof raw.headingFont === 'string' && raw.headingFont.trim()) {
      out.headingFont = raw.headingFont.trim().slice(0, 32);
    }
    if (typeof raw.bodyFont === 'string' && raw.bodyFont.trim()) {
      out.bodyFont = raw.bodyFont.trim().slice(0, 32);
    }
    const tc = safeHexColor(raw.titleColor);
    if (tc) out.titleColor = tc;
    const bc = safeHexColor(raw.bodyColor);
    if (bc) out.bodyColor = bc;
    const ac = safeHexColor(raw.accentColor);
    if (ac) out.accentColor = ac;
    if (raw.textAlign === 'center' || raw.textAlign === 'left') {
      out.textAlign = raw.textAlign;
    }
    if (
      raw.textShadow === 'none' ||
      raw.textShadow === 'soft' ||
      raw.textShadow === 'strong'
    ) {
      out.textShadow = raw.textShadow;
    }
    const pbg = safeHexColor(raw.panelBgColor);
    if (pbg) out.panelBgColor = pbg;
    if (typeof raw.panelOpacity === 'number' && Number.isFinite(raw.panelOpacity)) {
      out.panelOpacity = clampInt(raw.panelOpacity, 85, 0, 100);
    }
    const pbc = safeHexColor(raw.panelBorderColor);
    if (pbc) out.panelBorderColor = pbc;
    if (
      raw.panelBorderStyle === 'none' ||
      raw.panelBorderStyle === 'thin' ||
      raw.panelBorderStyle === 'bold'
    ) {
      out.panelBorderStyle = raw.panelBorderStyle;
    }
    if (
      raw.panelRadius === 'sm' ||
      raw.panelRadius === 'md' ||
      raw.panelRadius === 'lg'
    ) {
      out.panelRadius = raw.panelRadius;
    }
    if (
      raw.panelBlur === 'none' ||
      raw.panelBlur === 'soft' ||
      raw.panelBlur === 'strong'
    ) {
      out.panelBlur = raw.panelBlur;
    }
    if (
      typeof raw.panelWidth === 'number' &&
      Number.isFinite(raw.panelWidth) &&
      raw.panelWidth > 0
    ) {
      out.panelWidth = clampInt(raw.panelWidth, 100, 75, 100);
    }
    if (
      raw.panelPadding === 'compact' ||
      raw.panelPadding === 'normal' ||
      raw.panelPadding === 'spacious'
    ) {
      out.panelPadding = raw.panelPadding;
    }
    if (
      typeof raw.panelOffsetY === 'number' &&
      Number.isFinite(raw.panelOffsetY) &&
      raw.panelOffsetY !== 0
    ) {
      out.panelOffsetY = clampInt(raw.panelOffsetY, 0, -60, 60);
    }
    const btnc = safeHexColor(raw.buttonColor);
    if (btnc) out.buttonColor = btnc;
    const btntc = safeHexColor(raw.buttonTextColor);
    if (btntc) out.buttonTextColor = btntc;
    const sbc = safeHexColor(raw.secondaryButtonColor);
    if (sbc) out.secondaryButtonColor = sbc;
    const badgeBg = safeHexColor(raw.badgeBgColor);
    if (badgeBg) out.badgeBgColor = badgeBg;
    return out;
  };

  const rawSlideStyles = config.slideStyles ?? {};
  const slideStyles: InteractiveSlideStyles = {
    cover: sanitizePerSlideStyle(rawSlideStyles.cover),
    slide1: sanitizePerSlideStyle(rawSlideStyles.slide1),
    slide2: sanitizePerSlideStyle(rawSlideStyles.slide2),
    slide3: sanitizePerSlideStyle(rawSlideStyles.slide3),
  };

  const rawExtras = { ...DEFAULT_SLIDE_EXTRAS, ...(config.slideExtras ?? {}) };
  const slideExtras: InteractiveSlideExtras = {
    coverNameSize: clampInt(rawExtras.coverNameSize, 0, 0, 34),
    coverInstitutionSize: clampInt(rawExtras.coverInstitutionSize, 0, 0, 24),
    showCoverBadge: rawExtras.showCoverBadge !== false,
    showCoverInstitution: rawExtras.showCoverInstitution !== false,
    showCoverQuickRsvp: rawExtras.showCoverQuickRsvp !== false,
    coverQuickRsvpText: (rawExtras.coverQuickRsvpText || '').trim().slice(0, 60),
    coverButtonWidth: clampInt(rawExtras.coverButtonWidth, 100, 60, 100),
    slide1TitleSize: clampInt(rawExtras.slide1TitleSize, 0, 0, 34),
    slide1RecipientSize: clampInt(rawExtras.slide1RecipientSize, 0, 0, 30),
    slide1InstitutionSize: clampInt(rawExtras.slide1InstitutionSize, 0, 0, 22),
    slide1BannerWidth: clampInt(rawExtras.slide1BannerWidth, 100, 50, 100),
    showSlide1Organizer: rawExtras.showSlide1Organizer !== false,
    showSlide1Code: rawExtras.showSlide1Code !== false,
    showSlide1Welcome: rawExtras.showSlide1Welcome !== false,
    showSlide2Title: rawExtras.showSlide2Title !== false,
    slide2TitleSize: clampInt(rawExtras.slide2TitleSize, 0, 0, 32),
    slide2DetailSize: clampInt(rawExtras.slide2DetailSize, 0, 0, 22),
    slide2MapsButtonText: (rawExtras.slide2MapsButtonText || '').trim().slice(0, 40),
    slide2CalendarButtonText: (rawExtras.slide2CalendarButtonText || '').trim().slice(0, 40),
    slide3SubmitText: (rawExtras.slide3SubmitText || '').trim().slice(0, 60),
    showRepresentedOption: rawExtras.showRepresentedOption !== false,
    rsvpAttendingLabel: (rawExtras.rsvpAttendingLabel || '').trim().slice(0, 50),
    rsvpAttendingDesc: (rawExtras.rsvpAttendingDesc || '').trim().slice(0, 80),
    rsvpRepresentedLabel: (rawExtras.rsvpRepresentedLabel || '').trim().slice(0, 50),
    rsvpRepresentedDesc: (rawExtras.rsvpRepresentedDesc || '').trim().slice(0, 80),
    rsvpDeclinedLabel: (rawExtras.rsvpDeclinedLabel || '').trim().slice(0, 50),
    rsvpDeclinedDesc: (rawExtras.rsvpDeclinedDesc || '').trim().slice(0, 80),
    rsvpNoteLabel: (rawExtras.rsvpNoteLabel || '').trim().slice(0, 50),
    footerText: typeof rawExtras.footerText === 'string' ? rawExtras.footerText.trim().slice(0, 40) : 'Ranah Invite',
    panelBorderColor: safeHexColor(rawExtras.panelBorderColor),
    panelBorderStyle:
      rawExtras.panelBorderStyle === 'none' || rawExtras.panelBorderStyle === 'bold'
        ? rawExtras.panelBorderStyle
        : 'thin',
    panelRadius:
      rawExtras.panelRadius === 'sm' || rawExtras.panelRadius === 'md'
        ? rawExtras.panelRadius
        : 'lg',
    panelBlur:
      rawExtras.panelBlur === 'none' || rawExtras.panelBlur === 'strong'
        ? rawExtras.panelBlur
        : 'soft',
    panelWidth: clampInt(rawExtras.panelWidth, 100, 75, 100),
    panelPadding:
      rawExtras.panelPadding === 'compact' || rawExtras.panelPadding === 'spacious'
        ? rawExtras.panelPadding
        : 'normal',
    buttonTextColor: safeHexColor(rawExtras.buttonTextColor),
    secondaryButtonColor: safeHexColor(rawExtras.secondaryButtonColor),
    secondaryButtonTextColor: safeHexColor(rawExtras.secondaryButtonTextColor),
    textAnimation:
      rawExtras.textAnimation === 'blur-reveal' ||
      rawExtras.textAnimation === 'zoom-focus' ||
      rawExtras.textAnimation === 'fade-up' ||
      rawExtras.textAnimation === 'none'
        ? rawExtras.textAnimation
        : 'cinematic-title',
  };

  const payload = {
    mediaMode: config.mediaMode === 'image' ? 'image' : 'video',
    imageAnimation: validAnims.includes(config.imageAnimation)
      ? config.imageAnimation
      : 'wax-seal-open',
    coverImageDataUrl: safeImageDataUrl(config.coverImageDataUrl, 300000),
    openImageDataUrl: safeImageDataUrl(config.openImageDataUrl, 260000),
    openBgPosX: clampInt(config.openBgPosX, 50, 0, 100),
    openBgPosY: clampInt(config.openBgPosY, 50, 0, 100),
    theme: validThemes.includes(config.theme) ? config.theme : 'gold-dark',
    fontPreset: validFonts.includes(config.fontPreset)
      ? config.fontPreset
      : 'modern',
    headingFont: (config.headingFont || 'Manrope').trim().slice(0, 32),
    bodyFont: (config.bodyFont || 'Manrope').trim().slice(0, 32),
    textShadow: (['none', 'soft', 'strong'] as InteractiveTextShadow[]).includes(
      config.textShadow
    )
      ? config.textShadow
      : 'soft',
    textBold: Boolean(config.textBold),
    titleColor: safeHexColor(config.titleColor),
    bodyColor: safeHexColor(config.bodyColor),
    accentColor: safeHexColor(config.accentColor),
    panelBgColor: safeHexColor(config.panelBgColor),
    panelOpacity: clampInt(config.panelOpacity, 85, 0, 100),
    buttonColor: safeHexColor(config.buttonColor),
    coverOverlayDarkness: clampInt(config.coverOverlayDarkness, 0, 0, 70),
    coverTopOffsetY: clampInt(config.coverTopOffsetY, 0, -40, 80),
    coverBottomOffsetY: clampInt(config.coverBottomOffsetY, 0, -80, 40),
    textScale: validScales.includes(config.textScale) ? config.textScale : 'md',
    overlayDarkness: clampInt(config.overlayDarkness, 60, 20, 90),
    videoUrl: cloudVideoUrl,
    posterUrl: cloudPosterUrl,
    openBgUrl: cloudOpenBgUrl,
    videoSpeed: clampNum(config.videoSpeed, 1, 0.75, 2.5),
    storyNavMode: (config.storyNavMode === 'scroll'
      ? 'scroll'
      : 'slides') as InteractiveStoryNavMode,
    scrollVideoUrl:
      isSafeCloudUrl(config.scrollVideoUrl || '')
        ? (config.scrollVideoUrl || '').trim().slice(0, 500)
        : '',
    scrollVideoMode: (config.scrollVideoMode === 'follow'
      ? 'follow'
      : 'scrub') as InteractiveScrollVideoMode,
    scrollVideoStartSec: clampNum(config.scrollVideoStartSec, 0, 0, 120),
    slideDurationSec: clampInt(config.slideDurationSec, 6, 0, 20),
    slide1DurationSec: clampInt(config.slide1DurationSec, 5, 0, 30),
    slide2DurationSec: clampInt(config.slide2DurationSec, 8, 0, 30),
    openAnimDurationSec: clampNum(config.openAnimDurationSec, 1.5, 0.8, 3.0),
    panelPosition: validAligns.includes(config.panelPosition)
      ? config.panelPosition
      : 'center',
    panelOffsetY: clampInt(config.panelOffsetY, 0, -15, 15),
    cardStyle: validCards.includes(config.cardStyle) ? config.cardStyle : 'solid',
    textAlign: validTextAligns.includes(config.textAlign)
      ? config.textAlign
      : 'center',
    showSeal: config.showSeal !== false,
    customSealDataUrl: safeImageDataUrl(config.customSealDataUrl, 120000),
    sealSize: validSealSizes.includes(config.sealSize) ? config.sealSize : 'md',
    sealOffsetX: clampInt(config.sealOffsetX, 0, -35, 35),
    sealOffsetY: clampInt(config.sealOffsetY, 0, -35, 35),
    coverBadge: (config.coverBadge || '').trim().slice(0, 60),
    openButtonText: (config.openButtonText || '').trim().slice(0, 60),
    slide1Heading: (config.slide1Heading || '').trim().slice(0, 80),
    slide1BannerDataUrl: safeImageDataUrl(config.slide1BannerDataUrl, 90000),
    slide1BannerOffsetX: clampInt(config.slide1BannerOffsetX, 0, -80, 80),
    slide1BannerOffsetY: clampInt(config.slide1BannerOffsetY, 0, -80, 80),
    welcomeNote: (config.welcomeNote || '').trim().slice(0, 300),
    slide2Heading: (config.slide2Heading || '').trim().slice(0, 80),
    slide2ExtraNote: (config.slide2ExtraNote || '').trim().slice(0, 240),
    slide3Heading: (config.slide3Heading || '').trim().slice(0, 80),
    slide3SuccessTitle: (config.slide3SuccessTitle || '').trim().slice(0, 80),
    slide3SuccessNote: (config.slide3SuccessNote || '').trim().slice(0, 240),
    textSizes,
    panelScales,
    slideStyles,
    slideExtras,
    dresscode: (config.dresscode || '').trim().slice(0, 120),
    mapsUrl: (config.mapsUrl || '').trim().slice(0, 500),
    showCountdown: Boolean(config.showCountdown),
    showCalendarButton: config.showCalendarButton !== false,
    contactName: (config.contactName || '').trim().slice(0, 80),
    contactPhone: (config.contactPhone || '').trim().slice(0, 30),
    bgAudioEnabled: Boolean(
      config.bgAudioDataUrl &&
        config.bgAudioDataUrl.trim().startsWith('data:audio/')
    ),
    bgAudioName: (config.bgAudioName || '').trim().slice(0, 80),
    bgAudioUrl: (config.bgAudioUrl || '').trim().slice(0, 500),
    bgAudioVolume: clampInt(config.bgAudioVolume, 75, 10, 100),
    ...(metadata
      ? {
          eventName: (metadata.eventName || '').trim().slice(0, 160),
          eventDate: (metadata.date || '').trim().slice(0, 80),
          eventTime: (metadata.time || '').trim().slice(0, 80),
          eventLocation: (metadata.location || '').trim().slice(0, 200),
          eventOrganizer: (metadata.organizer || '').trim().slice(0, 160),
        }
      : {}),
    updatedAt: Math.floor(Date.now()),
  };

  try {
    if (isCloudVideoUrl(cloudVideoUrl)) {
      await uploadCloudVideoSlotIfNeeded(db, safeEventId, cloudVideoUrl);
    }
    if (isCloudVideoUrl(payload.scrollVideoUrl)) {
      await uploadCloudVideoSlotIfNeeded(db, safeEventId, payload.scrollVideoUrl);
    }
    await setDoc(doc(db, 'events', safeEventId, 'config', 'invite'), payload);
    const trimmedAudio = (config.bgAudioDataUrl || '').trim();
    if (trimmedAudio.startsWith('data:audio/') && trimmedAudio.length <= 420000) {
      await setDoc(doc(db, 'events', safeEventId, 'config', 'audio'), {
        audioDataUrl: trimmedAudio,
        durationSec: clampInt(config.bgAudioDurationSec, 0, 0, 180),
        updatedAt: Math.floor(Date.now()),
      });
    }
    return true;
  } catch (err) {
    const user = app ? getAuth(app).currentUser : null;
    const msg = err instanceof Error ? err.message : String(err);
    const diag = `[user=${user?.email ?? 'none'}, verified=${String(
      user?.emailVerified ?? false
    )}, eid=${safeEventId}, keys=${Object.keys(payload).length}, img=${
      payload.coverImageDataUrl.length
    }/${payload.openImageDataUrl.length}/${payload.customSealDataUrl.length}]`;
    throw new Error(`${msg} ${diag}`);
  }
}

export async function fetchInviteConfigWithMetaFromCloud(
  eventId: string
): Promise<CloudInviteConfigResult | null> {
  const db = await getLiteFirestore();
  if (!db || !eventId) return null;

  const { doc, getDoc } = await import('firebase/firestore/lite');
  const safeEventId = sanitizeFirestoreId(eventId, 80);
  const snap = await getDoc(doc(db, 'events', safeEventId, 'config', 'invite'));
  if (!snap.exists()) return null;

  const data = snap.data();
  const validThemes: InteractiveThemeId[] = [
    'gold-dark',
    'emerald-light',
    'navy-gold',
  ];
  const theme: InteractiveThemeId = validThemes.includes(data.theme)
    ? data.theme
    : 'gold-dark';
  const mediaMode: InteractiveMediaMode =
    data.mediaMode === 'image' ? 'image' : 'video';
  const validAnims: InteractiveImageAnimation[] = [
    'wax-seal-open',
    'gate-split',
    'curtain-up',
    'ken-burns',
  ];
  const imageAnimation: InteractiveImageAnimation = validAnims.includes(
    data.imageAnimation
  )
    ? data.imageAnimation
    : 'wax-seal-open';
  const validFonts: InteractiveFontPreset[] = [
    'modern',
    'classic',
    'ceremonial',
    'editorial',
  ];
  const validScales: InteractiveTextScale[] = ['sm', 'md', 'lg'];
  const validAligns: InteractiveVerticalAlign[] = ['top', 'center', 'bottom'];
  const validCards: InteractiveCardStyle[] = ['solid', 'glass', 'minimal'];
  const validTextAligns: InteractiveTextAlign[] = ['center', 'left'];
  const validSealSizes: InteractiveSealSize[] = ['sm', 'md', 'lg'];

  const legacySlideSec =
    typeof data.slideDurationSec === 'number' ? data.slideDurationSec : 6;

  const config: Partial<InteractiveInviteConfig> = {
    mediaMode,
    imageAnimation,
    coverImageDataUrl:
      typeof data.coverImageDataUrl === 'string' ? data.coverImageDataUrl : '',
    openImageDataUrl:
      typeof data.openImageDataUrl === 'string' ? data.openImageDataUrl : '',
    openBgPosX: typeof data.openBgPosX === 'number' ? data.openBgPosX : 50,
    openBgPosY: typeof data.openBgPosY === 'number' ? data.openBgPosY : 50,
    theme,
    fontPreset: validFonts.includes(data.fontPreset) ? data.fontPreset : 'modern',
    headingFont:
      typeof data.headingFont === 'string' && data.headingFont.trim()
        ? data.headingFont.trim().slice(0, 32)
        : '',
    bodyFont:
      typeof data.bodyFont === 'string' && data.bodyFont.trim()
        ? data.bodyFont.trim().slice(0, 32)
        : '',
    textShadow:
      data.textShadow === 'none' ||
      data.textShadow === 'soft' ||
      data.textShadow === 'strong'
        ? data.textShadow
        : 'soft',
    textBold: data.textBold === true,
    titleColor:
      typeof data.titleColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.titleColor)
        ? data.titleColor
        : '',
    bodyColor:
      typeof data.bodyColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.bodyColor)
        ? data.bodyColor
        : '',
    accentColor:
      typeof data.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.accentColor)
        ? data.accentColor
        : '',
    panelBgColor:
      typeof data.panelBgColor === 'string' &&
      /^#[0-9a-fA-F]{6}$/.test(data.panelBgColor)
        ? data.panelBgColor
        : '',
    panelOpacity:
      typeof data.panelOpacity === 'number'
        ? Math.min(100, Math.max(0, Math.round(data.panelOpacity)))
        : 85,
    buttonColor:
      typeof data.buttonColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.buttonColor)
        ? data.buttonColor
        : '',
    coverOverlayDarkness:
      typeof data.coverOverlayDarkness === 'number'
        ? Math.min(70, Math.max(0, Math.round(data.coverOverlayDarkness)))
        : 0,
    coverTopOffsetY:
      typeof data.coverTopOffsetY === 'number'
        ? Math.min(80, Math.max(-40, Math.round(data.coverTopOffsetY)))
        : 0,
    coverBottomOffsetY:
      typeof data.coverBottomOffsetY === 'number'
        ? Math.min(40, Math.max(-80, Math.round(data.coverBottomOffsetY)))
        : 0,
    textScale: validScales.includes(data.textScale) ? data.textScale : 'md',
    overlayDarkness:
      typeof data.overlayDarkness === 'number' ? data.overlayDarkness : 60,
    videoUrl: typeof data.videoUrl === 'string' && data.videoUrl ? data.videoUrl : DEFAULT_INTERACTIVE_CONFIG.videoUrl,
    posterUrl: typeof data.posterUrl === 'string' && data.posterUrl ? data.posterUrl : DEFAULT_INTERACTIVE_CONFIG.posterUrl,
    openBgUrl: typeof data.openBgUrl === 'string' && data.openBgUrl ? data.openBgUrl : DEFAULT_INTERACTIVE_CONFIG.openBgUrl,
    videoSpeed: typeof data.videoSpeed === 'number' ? data.videoSpeed : 1,
    storyNavMode:
      data.storyNavMode === 'scroll' ? 'scroll' : 'slides',
    scrollVideoUrl:
      typeof data.scrollVideoUrl === 'string'
        ? data.scrollVideoUrl.trim().slice(0, 500)
        : '',
    scrollVideoMode:
      data.scrollVideoMode === 'follow' ? 'follow' : 'scrub',
    scrollVideoStartSec:
      typeof data.scrollVideoStartSec === 'number' &&
      Number.isFinite(data.scrollVideoStartSec)
        ? Math.min(120, Math.max(0, Number(data.scrollVideoStartSec.toFixed(2))))
        : 0,
    slideDurationSec: legacySlideSec,
    slide1DurationSec:
      typeof data.slide1DurationSec === 'number'
        ? data.slide1DurationSec
        : legacySlideSec,
    slide2DurationSec:
      typeof data.slide2DurationSec === 'number'
        ? data.slide2DurationSec
        : Math.min(30, legacySlideSec > 0 ? legacySlideSec + 2 : 0),
    openAnimDurationSec:
      typeof data.openAnimDurationSec === 'number'
        ? data.openAnimDurationSec
        : 1.5,
    panelPosition: validAligns.includes(data.panelPosition)
      ? data.panelPosition
      : 'center',
    panelOffsetY:
      typeof data.panelOffsetY === 'number' ? data.panelOffsetY : 0,
    cardStyle: validCards.includes(data.cardStyle) ? data.cardStyle : 'solid',
    textAlign: validTextAligns.includes(data.textAlign)
      ? data.textAlign
      : 'center',
    showSeal: typeof data.showSeal === 'boolean' ? data.showSeal : true,
    customSealDataUrl:
      typeof data.customSealDataUrl === 'string' ? data.customSealDataUrl : '',
    sealSize: validSealSizes.includes(data.sealSize) ? data.sealSize : 'md',
    sealOffsetX: typeof data.sealOffsetX === 'number' ? data.sealOffsetX : 0,
    sealOffsetY: typeof data.sealOffsetY === 'number' ? data.sealOffsetY : 0,
    coverBadge: typeof data.coverBadge === 'string' ? data.coverBadge : DEFAULT_INTERACTIVE_CONFIG.coverBadge,
    openButtonText: typeof data.openButtonText === 'string' ? data.openButtonText : DEFAULT_INTERACTIVE_CONFIG.openButtonText,
    slide1Heading: typeof data.slide1Heading === 'string' ? data.slide1Heading : DEFAULT_INTERACTIVE_CONFIG.slide1Heading,
    slide1BannerDataUrl:
      typeof data.slide1BannerDataUrl === 'string' ? data.slide1BannerDataUrl : '',
    slide1BannerOffsetX:
      typeof data.slide1BannerOffsetX === 'number' ? data.slide1BannerOffsetX : 0,
    slide1BannerOffsetY:
      typeof data.slide1BannerOffsetY === 'number' ? data.slide1BannerOffsetY : 0,
    welcomeNote: typeof data.welcomeNote === 'string' ? data.welcomeNote : DEFAULT_INTERACTIVE_CONFIG.welcomeNote,
    slide2Heading: typeof data.slide2Heading === 'string' ? data.slide2Heading : DEFAULT_INTERACTIVE_CONFIG.slide2Heading,
    slide2ExtraNote: typeof data.slide2ExtraNote === 'string' ? data.slide2ExtraNote : '',
    slide3Heading: typeof data.slide3Heading === 'string' ? data.slide3Heading : DEFAULT_INTERACTIVE_CONFIG.slide3Heading,
    slide3SuccessTitle: typeof data.slide3SuccessTitle === 'string' ? data.slide3SuccessTitle : DEFAULT_INTERACTIVE_CONFIG.slide3SuccessTitle,
    slide3SuccessNote: typeof data.slide3SuccessNote === 'string' ? data.slide3SuccessNote : DEFAULT_INTERACTIVE_CONFIG.slide3SuccessNote,
    textSizes:
      data.textSizes && typeof data.textSizes === 'object'
        ? {
            coverBadge:
              typeof data.textSizes.coverBadge === 'number'
                ? data.textSizes.coverBadge
                : DEFAULT_SLIDE_TEXT_SIZES.coverBadge,
            openButtonText:
              typeof data.textSizes.openButtonText === 'number'
                ? data.textSizes.openButtonText
                : DEFAULT_SLIDE_TEXT_SIZES.openButtonText,
            slide1Heading:
              typeof data.textSizes.slide1Heading === 'number'
                ? data.textSizes.slide1Heading
                : DEFAULT_SLIDE_TEXT_SIZES.slide1Heading,
            welcomeNote:
              typeof data.textSizes.welcomeNote === 'number'
                ? data.textSizes.welcomeNote
                : DEFAULT_SLIDE_TEXT_SIZES.welcomeNote,
            slide2Heading:
              typeof data.textSizes.slide2Heading === 'number'
                ? data.textSizes.slide2Heading
                : DEFAULT_SLIDE_TEXT_SIZES.slide2Heading,
            slide2ExtraNote:
              typeof data.textSizes.slide2ExtraNote === 'number'
                ? data.textSizes.slide2ExtraNote
                : DEFAULT_SLIDE_TEXT_SIZES.slide2ExtraNote,
            slide3Heading:
              typeof data.textSizes.slide3Heading === 'number'
                ? data.textSizes.slide3Heading
                : DEFAULT_SLIDE_TEXT_SIZES.slide3Heading,
            slide3SuccessTitle:
              typeof data.textSizes.slide3SuccessTitle === 'number'
                ? data.textSizes.slide3SuccessTitle
                : DEFAULT_SLIDE_TEXT_SIZES.slide3SuccessTitle,
            slide3SuccessNote:
              typeof data.textSizes.slide3SuccessNote === 'number'
                ? data.textSizes.slide3SuccessNote
                : DEFAULT_SLIDE_TEXT_SIZES.slide3SuccessNote,
          }
        : { ...DEFAULT_SLIDE_TEXT_SIZES },
    panelScales:
      data.panelScales && typeof data.panelScales === 'object'
        ? {
            cover:
              typeof data.panelScales.cover === 'number'
                ? data.panelScales.cover
                : DEFAULT_PANEL_SCALES.cover,
            slide1:
              typeof data.panelScales.slide1 === 'number'
                ? data.panelScales.slide1
                : DEFAULT_PANEL_SCALES.slide1,
            slide2:
              typeof data.panelScales.slide2 === 'number'
                ? data.panelScales.slide2
                : DEFAULT_PANEL_SCALES.slide2,
            slide3:
              typeof data.panelScales.slide3 === 'number'
                ? data.panelScales.slide3
                : DEFAULT_PANEL_SCALES.slide3,
          }
        : { ...DEFAULT_PANEL_SCALES },
    slideStyles:
      data.slideStyles && typeof data.slideStyles === 'object'
        ? (data.slideStyles as InteractiveSlideStyles)
        : {},
    slideExtras:
      data.slideExtras && typeof data.slideExtras === 'object'
        ? {
            ...DEFAULT_SLIDE_EXTRAS,
            ...(data.slideExtras as Partial<InteractiveSlideExtras>),
          }
        : { ...DEFAULT_SLIDE_EXTRAS },
    dresscode: typeof data.dresscode === 'string' ? data.dresscode : '',
    mapsUrl: typeof data.mapsUrl === 'string' ? data.mapsUrl : '',
    showCountdown: typeof data.showCountdown === 'boolean' ? data.showCountdown : true,
    showCalendarButton:
      typeof data.showCalendarButton === 'boolean' ? data.showCalendarButton : true,
    contactName: typeof data.contactName === 'string' ? data.contactName : '',
    contactPhone: typeof data.contactPhone === 'string' ? data.contactPhone : '',
    bgAudioName: typeof data.bgAudioName === 'string' ? data.bgAudioName : '',
    bgAudioUrl: typeof data.bgAudioUrl === 'string' ? data.bgAudioUrl : '',
    bgAudioVolume:
      typeof data.bgAudioVolume === 'number'
        ? Math.min(100, Math.max(10, Math.round(data.bgAudioVolume)))
        : 75,
  };

  const eventMeta: Partial<EventMetadata> = {
    eventName: typeof data.eventName === 'string' ? data.eventName : undefined,
    date: typeof data.eventDate === 'string' ? data.eventDate : undefined,
    time: typeof data.eventTime === 'string' ? data.eventTime : undefined,
    location: typeof data.eventLocation === 'string' ? data.eventLocation : undefined,
    organizer: typeof data.eventOrganizer === 'string' ? data.eventOrganizer : undefined,
  };

  return {
    config,
    eventMeta,
    hasCloudAudio: data.bgAudioEnabled === true,
  };
}

export async function fetchInviteAudioFromCloud(
  eventId: string
): Promise<{ audioDataUrl: string; durationSec: number } | null> {
  const db = await getLiteFirestore();
  if (!db || !eventId) return null;

  const { doc, getDoc } = await import('firebase/firestore/lite');
  const safeEventId = sanitizeFirestoreId(eventId, 80);
  const snap = await getDoc(doc(db, 'events', safeEventId, 'config', 'audio'));
  if (!snap.exists()) return null;

  const data = snap.data();
  const audioDataUrl =
    typeof data.audioDataUrl === 'string' &&
    data.audioDataUrl.startsWith('data:audio/')
      ? data.audioDataUrl
      : '';
  if (!audioDataUrl) return null;

  return {
    audioDataUrl,
    durationSec: typeof data.durationSec === 'number' ? data.durationSec : 0,
  };
}

export async function fetchInviteConfigFromCloud(
  eventId: string
): Promise<Partial<InteractiveInviteConfig> | null> {
  const res = await fetchInviteConfigWithMetaFromCloud(eventId);
  return res ? res.config : null;
}

export async function ensureAdminAuthToken(): Promise<string> {
  const [{ getApps }, { getAuth }] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ]);
  const app = getApps()[0];
  if (!app) {
    throw new Error(
      'Layanan Firebase belum terinisialisasi. Silakan muat ulang halaman.'
    );
  }
  const auth = getAuth(app);
  const user = auth.currentUser;
  if (!user) {
    throw new Error(
      'Sesi login admin belum aktif. Silakan muat ulang halaman dan masuk dengan akun Google admin.'
    );
  }
  await user.getIdToken();
  return user.email || '';
}

export async function publishSingleGuestInviteToCloud(
  eventId: string,
  recipient: Recipient
): Promise<boolean> {
  const db = await getLiteFirestore();
  if (!db) return false;
  await ensureAdminAuthToken();

  const { doc, setDoc } = await import('firebase/firestore/lite');
  const safeEventId = sanitizeFirestoreId(eventId, 80, 'default');
  const safeCode = sanitizeFirestoreId(recipient.invitationCode, 40, 'RI-001');
  const card: CloudGuestInviteCard = {
    code: safeCode,
    salutation: (recipient.salutation || 'Kepada Yth.').trim().slice(0, 60),
    recipientName: (recipient.recipientName || 'Tamu Undangan').trim().slice(0, 120),
    institution: (recipient.institution || '').trim().slice(0, 160),
    updatedAt: Math.floor(Date.now()),
  };
  await setDoc(doc(db, 'events', safeEventId, 'invites', safeCode), card);
  return true;
}

export async function publishGuestInvitesToCloud(
  eventId: string,
  recipients: Recipient[]
): Promise<number> {
  const db = await getLiteFirestore();
  if (!db || recipients.length === 0) return 0;
  await ensureAdminAuthToken();

  const { doc, writeBatch } = await import('firebase/firestore/lite');
  const safeEventId = sanitizeFirestoreId(eventId, 80, 'default');
  const now = Math.floor(Date.now());

  // Deduplicate by sanitized invitation code so each code maps to one clean doc per batch
  const deduped = new Map<string, CloudGuestInviteCard>();
  for (const r of recipients) {
    const safeCode = sanitizeFirestoreId(r.invitationCode, 40, 'RI-001');
    deduped.set(safeCode, {
      code: safeCode,
      salutation: (r.salutation || 'Kepada Yth.').trim().slice(0, 60),
      recipientName: (r.recipientName || 'Tamu Undangan').trim().slice(0, 120),
      institution: (r.institution || '').trim().slice(0, 160),
      updatedAt: now,
    });
  }

  const cards = Array.from(deduped.values());
  const CHUNK = 400;
  let written = 0;
  for (let i = 0; i < cards.length; i += CHUNK) {
    const slice = cards.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const card of slice) {
      batch.set(doc(db, 'events', safeEventId, 'invites', card.code), card);
      written += 1;
    }
    await batch.commit();
  }
  return written;
}

export async function fetchGuestInviteFromCloud(
  eventId: string,
  invitationCode: string
): Promise<CloudGuestInviteCard | null> {
  const db = await getLiteFirestore();
  if (!db || !eventId || !invitationCode) return null;

  const { doc, getDoc } = await import('firebase/firestore/lite');
  const safeEventId = sanitizeFirestoreId(eventId, 80, 'default');
  const safeCode = sanitizeFirestoreId(invitationCode, 40, 'RI-001');
  let snap = await getDoc(doc(db, 'events', safeEventId, 'invites', safeCode));
  if (!snap.exists() && safeCode !== safeCode.toUpperCase()) {
    snap = await getDoc(
      doc(db, 'events', safeEventId, 'invites', safeCode.toUpperCase())
    );
  }
  if (!snap.exists()) return null;

  const data = snap.data();
  return {
    code: typeof data.code === 'string' ? data.code : safeCode,
    salutation: typeof data.salutation === 'string' ? data.salutation : 'Kepada Yth.',
    recipientName: typeof data.recipientName === 'string' ? data.recipientName : '',
    institution: typeof data.institution === 'string' ? data.institution : '',
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
  };
}

export interface CloudMasterBankRecord {
  version: 1;
  isDefault: boolean;
  entryCount: number;
  entriesJson: string;
  updatedAt: number;
  updatedBy: string;
}

const MASTER_BANK_MAX_JSON_BYTES = 850_000;
const MASTER_BANK_MAX_ENTRIES = 5000;

function getUtf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}

export async function fetchMasterBankFromCloud(): Promise<CloudMasterBankRecord | null> {
  const db = await getLiteFirestore();
  if (!db) return null;
  await ensureAdminAuthToken();

  const { doc, getDoc } = await import('firebase/firestore/lite');
  const snap = await getDoc(doc(db, 'studio', 'masterBank'));
  if (!snap.exists()) return null;

  const data = snap.data();
  const isDefault = data.isDefault === true;
  const entriesJson = typeof data.entriesJson === 'string' ? data.entriesJson : '';
  const entryCount =
    typeof data.entryCount === 'number' && Number.isFinite(data.entryCount)
      ? Math.max(0, Math.floor(data.entryCount))
      : 0;
  const updatedAt =
    typeof data.updatedAt === 'number' && Number.isFinite(data.updatedAt) && data.updatedAt > 0
      ? Math.floor(data.updatedAt)
      : Date.now();
  const updatedBy = typeof data.updatedBy === 'string' ? data.updatedBy : '';

  return {
    version: 1,
    isDefault,
    entryCount,
    entriesJson,
    updatedAt,
    updatedBy,
  };
}

export async function saveMasterBankToCloud(
  entriesJson: string,
  entryCount: number,
  updatedAt?: number
): Promise<{ updatedAt: number; updatedBy: string } | null> {
  const db = await getLiteFirestore();
  if (!db) return null;
  const adminEmail = await ensureAdminAuthToken();
  if (!adminEmail) {
    throw new Error('Akun admin tidak memiliki email terverifikasi untuk menyimpan Bank Daftar.');
  }

  const safeCount = Math.floor(entryCount);
  if (safeCount < 1 || safeCount > MASTER_BANK_MAX_ENTRIES) {
    throw new Error(
      `Jumlah tujuan Bank Daftar harus antara 1 hingga ${MASTER_BANK_MAX_ENTRIES.toLocaleString('id-ID')} entri.`
    );
  }

  const byteLen = getUtf8ByteLength(entriesJson);
  if (byteLen > MASTER_BANK_MAX_JSON_BYTES || entriesJson.length < 2) {
    throw new Error(
      'Ukuran data Bank Daftar melebihi batas penyimpanan Cloud (850 KB). Kurangi jumlah entri atau bersihkan teks yang terlalu panjang.'
    );
  }

  const { doc, setDoc } = await import('firebase/firestore/lite');
  const safeUpdatedAt = Math.floor(updatedAt ?? Date.now());
  const payload: CloudMasterBankRecord = {
    version: 1,
    isDefault: false,
    entryCount: safeCount,
    entriesJson,
    updatedAt: safeUpdatedAt,
    updatedBy: adminEmail.slice(0, 120),
  };

  await setDoc(doc(db, 'studio', 'masterBank'), payload);
  return { updatedAt: safeUpdatedAt, updatedBy: payload.updatedBy };
}

export async function resetMasterBankInCloud(
  updatedAt?: number
): Promise<{ updatedAt: number; updatedBy: string } | null> {
  const db = await getLiteFirestore();
  if (!db) return null;
  const adminEmail = await ensureAdminAuthToken();
  if (!adminEmail) {
    throw new Error('Akun admin tidak memiliki email terverifikasi untuk mereset Bank Daftar.');
  }

  const { doc, setDoc } = await import('firebase/firestore/lite');
  const safeUpdatedAt = Math.floor(updatedAt ?? Date.now());
  const payload: CloudMasterBankRecord = {
    version: 1,
    isDefault: true,
    entryCount: 0,
    entriesJson: '',
    updatedAt: safeUpdatedAt,
    updatedBy: adminEmail.slice(0, 120),
  };

  await setDoc(doc(db, 'studio', 'masterBank'), payload);
  return { updatedAt: safeUpdatedAt, updatedBy: payload.updatedBy };
}
