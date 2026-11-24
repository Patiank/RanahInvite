import {
  DEFAULT_INTERACTIVE_CONFIG,
  DEFAULT_PANEL_SCALES,
  DEFAULT_SLIDE_TEXT_SIZES,
  EventMetadata,
  InteractiveCardStyle,
  InteractiveFontPreset,
  InteractiveImageAnimation,
  InteractiveInviteConfig,
  InteractiveMediaMode,
  InteractivePanelScales,
  InteractiveSealSize,
  InteractiveSlideTextSizes,
  InteractiveTextAlign,
  InteractiveTextScale,
  InteractiveThemeId,
  InteractiveVerticalAlign,
  Recipient,
  RsvpStatus,
} from '../types';

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

async function getLiteFirestore() {
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
  return /^https?:\/\//i.test(trimmed);
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

  const payload = {
    mediaMode: config.mediaMode === 'image' ? 'image' : 'video',
    imageAnimation: validAnims.includes(config.imageAnimation)
      ? config.imageAnimation
      : 'wax-seal-open',
    coverImageDataUrl: safeImageDataUrl(config.coverImageDataUrl, 300000),
    openImageDataUrl: safeImageDataUrl(config.openImageDataUrl, 260000),
    theme: validThemes.includes(config.theme) ? config.theme : 'gold-dark',
    fontPreset: validFonts.includes(config.fontPreset)
      ? config.fontPreset
      : 'modern',
    textScale: validScales.includes(config.textScale) ? config.textScale : 'md',
    overlayDarkness: clampInt(config.overlayDarkness, 60, 20, 90),
    videoUrl: cloudVideoUrl,
    posterUrl: cloudPosterUrl,
    openBgUrl: cloudOpenBgUrl,
    videoSpeed: clampNum(config.videoSpeed, 1, 0.75, 2.5),
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
    welcomeNote: (config.welcomeNote || '').trim().slice(0, 300),
    slide2Heading: (config.slide2Heading || '').trim().slice(0, 80),
    slide2ExtraNote: (config.slide2ExtraNote || '').trim().slice(0, 240),
    slide3Heading: (config.slide3Heading || '').trim().slice(0, 80),
    slide3SuccessTitle: (config.slide3SuccessTitle || '').trim().slice(0, 80),
    slide3SuccessNote: (config.slide3SuccessNote || '').trim().slice(0, 240),
    textSizes,
    panelScales,
    dresscode: (config.dresscode || '').trim().slice(0, 120),
    mapsUrl: (config.mapsUrl || '').trim().slice(0, 500),
    showCountdown: Boolean(config.showCountdown),
    showCalendarButton: config.showCalendarButton !== false,
    contactName: (config.contactName || '').trim().slice(0, 80),
    contactPhone: (config.contactPhone || '').trim().slice(0, 30),
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
    await setDoc(doc(db, 'events', safeEventId, 'config', 'invite'), payload);
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
    theme,
    fontPreset: validFonts.includes(data.fontPreset) ? data.fontPreset : 'modern',
    textScale: validScales.includes(data.textScale) ? data.textScale : 'md',
    overlayDarkness:
      typeof data.overlayDarkness === 'number' ? data.overlayDarkness : 60,
    videoUrl: typeof data.videoUrl === 'string' && data.videoUrl ? data.videoUrl : DEFAULT_INTERACTIVE_CONFIG.videoUrl,
    posterUrl: typeof data.posterUrl === 'string' && data.posterUrl ? data.posterUrl : DEFAULT_INTERACTIVE_CONFIG.posterUrl,
    openBgUrl: typeof data.openBgUrl === 'string' && data.openBgUrl ? data.openBgUrl : DEFAULT_INTERACTIVE_CONFIG.openBgUrl,
    videoSpeed: typeof data.videoSpeed === 'number' ? data.videoSpeed : 1,
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
    dresscode: typeof data.dresscode === 'string' ? data.dresscode : '',
    mapsUrl: typeof data.mapsUrl === 'string' ? data.mapsUrl : '',
    showCountdown: typeof data.showCountdown === 'boolean' ? data.showCountdown : true,
    showCalendarButton:
      typeof data.showCalendarButton === 'boolean' ? data.showCalendarButton : true,
    contactName: typeof data.contactName === 'string' ? data.contactName : '',
    contactPhone: typeof data.contactPhone === 'string' ? data.contactPhone : '',
  };

  const eventMeta: Partial<EventMetadata> = {
    eventName: typeof data.eventName === 'string' ? data.eventName : undefined,
    date: typeof data.eventDate === 'string' ? data.eventDate : undefined,
    time: typeof data.eventTime === 'string' ? data.eventTime : undefined,
    location: typeof data.eventLocation === 'string' ? data.eventLocation : undefined,
    organizer: typeof data.eventOrganizer === 'string' ? data.eventOrganizer : undefined,
  };

  return { config, eventMeta };
}

export async function fetchInviteConfigFromCloud(
  eventId: string
): Promise<Partial<InteractiveInviteConfig> | null> {
  const res = await fetchInviteConfigWithMetaFromCloud(eventId);
  return res ? res.config : null;
}

async function ensureAdminAuthToken(): Promise<void> {
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
    await user.getIdToken();
  }
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
