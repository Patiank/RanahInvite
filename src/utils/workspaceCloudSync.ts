import {
  DEFAULT_INTERACTIVE_CONFIG,
  DEFAULT_PANEL_SCALES,
  DEFAULT_RSVP_RECEIPT_CONFIG,
  DEFAULT_SLIDE_EXTRAS,
  DEFAULT_SLIDE_TEXT_SIZES,
  InteractiveInviteConfig,
  SavedEventRecord,
  TemplateImages,
} from '../types';
import {
  ensureAdminAuthToken,
  getLiteFirestore,
  isFirestoreRsvpConfigured,
  sanitizeFirestoreId,
} from './firebaseRsvp';

export type WorkspaceAssetKind = 'tpl1' | 'tpl2' | 'videoMedia' | 'videoAudio';

export interface WorkspaceIndexEntry {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  isCompleted: boolean;
  deleted?: boolean;
  assetsVersion?: number;
}

interface CloudWorkspaceIndexDoc {
  version: 1;
  activeEventId: string;
  eventCount: number;
  eventsJson: string;
  updatedAt: number;
  updatedBy: string;
}

interface CloudWorkspaceEventDoc {
  version: 1;
  eventId: string;
  deleted: boolean;
  payloadJson: string;
  assetsVersion: number;
  updatedAt: number;
  updatedBy: string;
}

interface CloudWorkspaceAssetDoc {
  version: 1;
  assetId: string;
  eventId: string;
  kind: WorkspaceAssetKind;
  contentHash: string;
  data: string;
  updatedAt: number;
  updatedBy: string;
}

interface StrippedEventPayload {
  id: string;
  metadata: SavedEventRecord['metadata'];
  templatesMeta: {
    activeTemplateId: string;
    pageCount: 1 | 2;
    page1Width: number;
    page1Height: number;
    page2Width?: number;
    page2Height?: number;
  };
  overlays: SavedEventRecord['overlays'];
  recipients: SavedEventRecord['recipients'];
  interactiveConfigLight?: Omit<
    InteractiveInviteConfig,
    | 'coverImageDataUrl'
    | 'openImageDataUrl'
    | 'customSealDataUrl'
    | 'slide1BannerDataUrl'
    | 'bgAudioDataUrl'
  >;
  isCompleted: boolean;
  createdAt: number;
  updatedAt: number;
  assetHashes: Record<WorkspaceAssetKind, string>;
}

interface VideoMediaAssetBundle {
  coverImageDataUrl?: string;
  openImageDataUrl?: string;
  customSealDataUrl?: string;
  slide1BannerDataUrl?: string;
}

interface LocalSyncCacheState {
  lastSyncedAt: number;
  syncedEventUpdatedAt: Record<string, number>;
  syncedAssetHashes: Record<string, Partial<Record<WorkspaceAssetKind, string>>>;
  deletedTombstones: Record<string, number>;
}

export interface WorkspaceCloudSyncResult {
  events: SavedEventRecord[];
  activeEventId: string;
  changedLocally: boolean;
  pulledCount: number;
  pushedCount: number;
  deletedCount: number;
  readsUsed: number;
  writesUsed: number;
  syncedAt: number;
}

const SYNC_CACHE_LS_KEY = 'ranahinvite_workspace_cloud_sync_v1';
const MAX_INDEX_JSON_BYTES = 148_000;
const MAX_EVENT_JSON_BYTES = 840_000;
const MAX_ASSET_DATA_BYTES = 760_000;
const MAX_SINGLE_TEMPLATE_BYTES = 480_000;
const MAX_EVENTS_IN_INDEX = 200;

function getUtf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}

/** Fast deterministic non-crypto hash (dual 32-bit FNV-1a) for change detection */
export function computeContentHash(input: string): string {
  if (!input) return '';
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i & 255);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0)
    .toString(16)
    .padStart(8, '0')}-${input.length.toString(36)}`;
}

function buildAssetDocId(safeEventId: string, kind: WorkspaceAssetKind): string {
  return `${safeEventId}__${kind}`.slice(0, 110);
}

function readLocalSyncCache(): LocalSyncCacheState {
  const empty: LocalSyncCacheState = {
    lastSyncedAt: 0,
    syncedEventUpdatedAt: {},
    syncedAssetHashes: {},
    deletedTombstones: {},
  };
  if (typeof window === 'undefined' || !window.localStorage) return empty;
  try {
    const raw = window.localStorage.getItem(SYNC_CACHE_LS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<LocalSyncCacheState>;
    return {
      lastSyncedAt: typeof parsed.lastSyncedAt === 'number' ? parsed.lastSyncedAt : 0,
      syncedEventUpdatedAt:
        parsed.syncedEventUpdatedAt && typeof parsed.syncedEventUpdatedAt === 'object'
          ? parsed.syncedEventUpdatedAt
          : {},
      syncedAssetHashes:
        parsed.syncedAssetHashes && typeof parsed.syncedAssetHashes === 'object'
          ? parsed.syncedAssetHashes
          : {},
      deletedTombstones:
        parsed.deletedTombstones && typeof parsed.deletedTombstones === 'object'
          ? parsed.deletedTombstones
          : {},
    };
  } catch {
    return empty;
  }
}

function writeLocalSyncCache(state: LocalSyncCacheState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(SYNC_CACHE_LS_KEY, JSON.stringify(state));
  } catch {
    // Ignore localStorage quota failures
  }
}

export function recordDeletedEventTombstone(eventId: string, deletedAt = Date.now()): void {
  const safeId = sanitizeFirestoreId(eventId, 80);
  const cache = readLocalSyncCache();
  cache.deletedTombstones[safeId] = deletedAt;
  delete cache.syncedEventUpdatedAt[safeId];
  delete cache.syncedAssetHashes[safeId];
  writeLocalSyncCache(cache);
}

export function getLastWorkspaceCloudSyncAt(): number {
  return readLocalSyncCache().lastSyncedAt;
}

/**
 * Compress large PNG/JPEG template data URLs so each Firestore asset slot
 * stays well under 1 MiB while preserving crisp A4 print sharpness.
 */
async function compressImageDataUrlIfNeeded(
  dataUrl: string,
  maxBytes = MAX_SINGLE_TEMPLATE_BYTES,
  maxDimension = 1600
): Promise<string> {
  if (!dataUrl || typeof dataUrl !== 'string') return '';
  if (getUtf8ByteLength(dataUrl) <= maxBytes) return dataUrl;
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return dataUrl.slice(0, maxBytes);
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const srcW = img.naturalWidth || 1240;
        const srcH = img.naturalHeight || 1754;
        const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
        const targetW = Math.max(320, Math.round(srcW * scale));
        const targetH = Math.max(320, Math.round(srcH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const qualities = [0.86, 0.76, 0.66, 0.56, 0.45, 0.36];
        for (const q of qualities) {
          const candidate = canvas.toDataURL('image/jpeg', q);
          if (getUtf8ByteLength(candidate) <= maxBytes) {
            resolve(candidate);
            return;
          }
        }

        // Last resort: downscale 75% and export moderate JPEG
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = Math.max(320, Math.round(targetW * 0.72));
        smallCanvas.height = Math.max(320, Math.round(targetH * 0.72));
        const sctx = smallCanvas.getContext('2d');
        if (sctx) {
          sctx.fillStyle = '#FFFFFF';
          sctx.fillRect(0, 0, smallCanvas.width, smallCanvas.height);
          sctx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
          resolve(smallCanvas.toDataURL('image/jpeg', 0.6));
          return;
        }
        resolve(canvas.toDataURL('image/jpeg', 0.36));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function extractEventAssets(event: SavedEventRecord): Promise<{
  slots: Record<WorkspaceAssetKind, string>;
  hashes: Record<WorkspaceAssetKind, string>;
}> {
  const tpl1 = event.templates.page1DataUrl
    ? await compressImageDataUrlIfNeeded(
        event.templates.page1DataUrl,
        MAX_SINGLE_TEMPLATE_BYTES,
        1600
      )
    : '';
  const tpl2 =
    event.templates.pageCount === 2 && event.templates.page2DataUrl
      ? await compressImageDataUrlIfNeeded(
          event.templates.page2DataUrl,
          MAX_SINGLE_TEMPLATE_BYTES,
          1600
        )
      : '';

  const ic = event.interactiveConfig;
  let videoMediaStr = '';
  if (
    ic &&
    (ic.coverImageDataUrl ||
      ic.openImageDataUrl ||
      ic.customSealDataUrl ||
      ic.slide1BannerDataUrl)
  ) {
    const bundle: VideoMediaAssetBundle = {
      coverImageDataUrl: ic.coverImageDataUrl || '',
      openImageDataUrl: ic.openImageDataUrl || '',
      customSealDataUrl: ic.customSealDataUrl || '',
      slide1BannerDataUrl: ic.slide1BannerDataUrl || '',
    };
    videoMediaStr = JSON.stringify(bundle);
    if (getUtf8ByteLength(videoMediaStr) > MAX_ASSET_DATA_BYTES) {
      bundle.coverImageDataUrl = await compressImageDataUrlIfNeeded(
        bundle.coverImageDataUrl || '',
        260_000,
        1080
      );
      bundle.openImageDataUrl = await compressImageDataUrlIfNeeded(
        bundle.openImageDataUrl || '',
        220_000,
        1080
      );
      bundle.customSealDataUrl = await compressImageDataUrlIfNeeded(
        bundle.customSealDataUrl || '',
        110_000,
        512
      );
      bundle.slide1BannerDataUrl = await compressImageDataUrlIfNeeded(
        bundle.slide1BannerDataUrl || '',
        85_000,
        800
      );
      videoMediaStr = JSON.stringify(bundle);
    }
  }

  let videoAudioStr = ic?.bgAudioDataUrl || '';
  if (getUtf8ByteLength(videoAudioStr) > MAX_ASSET_DATA_BYTES) {
    // Safety guard: audio uploader already compresses <= 300 KB MP3
    videoAudioStr = '';
  }

  const slots: Record<WorkspaceAssetKind, string> = {
    tpl1,
    tpl2,
    videoMedia: videoMediaStr,
    videoAudio: videoAudioStr,
  };

  const hashes: Record<WorkspaceAssetKind, string> = {
    tpl1: computeContentHash(tpl1),
    tpl2: computeContentHash(tpl2),
    videoMedia: computeContentHash(videoMediaStr),
    videoAudio: computeContentHash(videoAudioStr),
  };

  return { slots, hashes };
}

function extractRawLocalAssetHashes(
  event?: SavedEventRecord
): Record<WorkspaceAssetKind, string> {
  if (!event) {
    return { tpl1: '', tpl2: '', videoMedia: '', videoAudio: '' };
  }
  const ic = event.interactiveConfig;
  const videoMediaStr =
    ic &&
    (ic.coverImageDataUrl ||
      ic.openImageDataUrl ||
      ic.customSealDataUrl ||
      ic.slide1BannerDataUrl)
      ? JSON.stringify({
          coverImageDataUrl: ic.coverImageDataUrl || '',
          openImageDataUrl: ic.openImageDataUrl || '',
          customSealDataUrl: ic.customSealDataUrl || '',
          slide1BannerDataUrl: ic.slide1BannerDataUrl || '',
        })
      : '';
  return {
    tpl1: computeContentHash(event.templates.page1DataUrl || ''),
    tpl2: computeContentHash(
      event.templates.pageCount === 2 ? event.templates.page2DataUrl || '' : ''
    ),
    videoMedia: computeContentHash(videoMediaStr),
    videoAudio: computeContentHash(ic?.bgAudioDataUrl || ''),
  };
}

function buildStrippedPayload(
  event: SavedEventRecord,
  assetHashes: Record<WorkspaceAssetKind, string>
): StrippedEventPayload {
  let interactiveConfigLight: StrippedEventPayload['interactiveConfigLight'];
  if (event.interactiveConfig) {
    const {
      coverImageDataUrl: _c,
      openImageDataUrl: _o,
      customSealDataUrl: _s,
      slide1BannerDataUrl: _b,
      bgAudioDataUrl: _a,
      ...rest
    } = event.interactiveConfig;
    interactiveConfigLight = rest;
  }

  return {
    id: event.id,
    metadata: { ...event.metadata },
    templatesMeta: {
      activeTemplateId: event.templates.activeTemplateId,
      pageCount: event.templates.pageCount,
      page1Width: event.templates.page1Width,
      page1Height: event.templates.page1Height,
      page2Width: event.templates.page2Width,
      page2Height: event.templates.page2Height,
    },
    overlays: event.overlays.map((o) => ({ ...o })),
    recipients: event.recipients.map((r) => ({
      ...r,
      status: r.status === 'generating' ? 'ready' : r.status,
    })),
    interactiveConfigLight,
    isCompleted: Boolean(event.isCompleted),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    assetHashes,
  };
}

function computeLocalEventFingerprint(event: SavedEventRecord): string {
  // Lightweight signature covering everything except transient PDF render status
  const ic = event.interactiveConfig;
  return computeContentHash(
    JSON.stringify({
      id: event.id,
      metadata: event.metadata,
      tplMeta: {
        id: event.templates.activeTemplateId,
        c: event.templates.pageCount,
        w1: event.templates.page1Width,
        h1: event.templates.page1Height,
        h1Data: computeContentHash(event.templates.page1DataUrl || ''),
        h2Data: computeContentHash(event.templates.page2DataUrl || ''),
      },
      overlays: event.overlays,
      recipients: event.recipients.map((r) => ({
        id: r.id,
        s: r.salutation,
        n: r.recipientName,
        i: r.institution,
        p: r.placeLabel,
        g: r.group,
        c: r.invitationCode,
        rs: r.rsvpStatus,
        rr: r.rsvpRepresentative,
        rn: r.rsvpNote,
        ra: r.rsvpAt,
      })),
      ic: ic
        ? {
            ...ic,
            coverImageDataUrl: computeContentHash(ic.coverImageDataUrl || ''),
            openImageDataUrl: computeContentHash(ic.openImageDataUrl || ''),
            customSealDataUrl: computeContentHash(ic.customSealDataUrl || ''),
            slide1BannerDataUrl: computeContentHash(ic.slide1BannerDataUrl || ''),
            bgAudioDataUrl: computeContentHash(ic.bgAudioDataUrl || ''),
          }
        : undefined,
      done: event.isCompleted,
    })
  );
}

export function computeWorkspaceContentSignature(
  events: SavedEventRecord[],
  activeEventId: string
): string {
  return computeContentHash(
    JSON.stringify({
      activeEventId,
      events: events.map((ev) => ({
        id: ev.id,
        fp: computeLocalEventFingerprint(ev),
      })),
    })
  );
}

async function fetchWorkspaceIndexDoc(): Promise<CloudWorkspaceIndexDoc | null> {
  const db = await getLiteFirestore();
  if (!db) return null;
  await ensureAdminAuthToken();
  const { doc, getDoc } = await import('firebase/firestore/lite');
  const snap = await getDoc(doc(db, 'studio', 'workspaceIndex'));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    version: 1,
    activeEventId: typeof data.activeEventId === 'string' ? data.activeEventId : '',
    eventCount: typeof data.eventCount === 'number' ? data.eventCount : 0,
    eventsJson: typeof data.eventsJson === 'string' ? data.eventsJson : '[]',
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
  };
}

function parseIndexEntries(eventsJson: string): WorkspaceIndexEntry[] {
  try {
    const parsed = JSON.parse(eventsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is WorkspaceIndexEntry => {
        return (
          Boolean(item) &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          item.id.trim().length > 0
        );
      })
      .map((item) => ({
        id: sanitizeFirestoreId(item.id, 80),
        name: typeof item.name === 'string' ? item.name.slice(0, 140) : 'Acara',
        updatedAt:
          typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
            ? Math.floor(item.updatedAt)
            : Date.now(),
        createdAt:
          typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
            ? Math.floor(item.createdAt)
            : Date.now(),
        isCompleted: Boolean(item.isCompleted),
        deleted: Boolean(item.deleted),
        assetsVersion:
          typeof item.assetsVersion === 'number' && Number.isFinite(item.assetsVersion)
            ? Math.floor(item.assetsVersion)
            : 0,
      }));
  } catch {
    return [];
  }
}

async function pullSingleEventFromCloud(
  eventId: string,
  existingLocal?: SavedEventRecord
): Promise<{ event: SavedEventRecord | null; reads: number; assetHashes: Record<WorkspaceAssetKind, string> }> {
  const db = await getLiteFirestore();
  if (!db) {
    return {
      event: null,
      reads: 0,
      assetHashes: { tpl1: '', tpl2: '', videoMedia: '', videoAudio: '' },
    };
  }
  const { doc, getDoc } = await import('firebase/firestore/lite');
  const safeId = sanitizeFirestoreId(eventId, 80);
  const snap = await getDoc(doc(db, 'studio', 'workspace', 'events', safeId));
  let reads = 1;

  if (!snap.exists()) {
    return {
      event: null,
      reads,
      assetHashes: { tpl1: '', tpl2: '', videoMedia: '', videoAudio: '' },
    };
  }
  const data = snap.data() as Partial<CloudWorkspaceEventDoc>;
  if (data.deleted || !data.payloadJson) {
    return {
      event: null,
      reads,
      assetHashes: { tpl1: '', tpl2: '', videoMedia: '', videoAudio: '' },
    };
  }

  let payload: StrippedEventPayload;
  try {
    payload = JSON.parse(data.payloadJson) as StrippedEventPayload;
  } catch {
    return {
      event: null,
      reads,
      assetHashes: { tpl1: '', tpl2: '', videoMedia: '', videoAudio: '' },
    };
  }

  const targetHashes: Record<WorkspaceAssetKind, string> = {
    tpl1: payload.assetHashes?.tpl1 || '',
    tpl2: payload.assetHashes?.tpl2 || '',
    videoMedia: payload.assetHashes?.videoMedia || '',
    videoAudio: payload.assetHashes?.videoAudio || '',
  };

  const localHashes = extractRawLocalAssetHashes(existingLocal);
  const syncCache = readLocalSyncCache();
  const cachedHashes = syncCache.syncedAssetHashes[safeId] || {};

  // Only fetch asset docs whose hash changed compared to local copy (0 reads for unchanged images!)
  const resolvedAssets: Record<WorkspaceAssetKind, string> = {
    tpl1: existingLocal?.templates.page1DataUrl || '',
    tpl2: existingLocal?.templates.page2DataUrl || '',
    videoMedia: '',
    videoAudio: existingLocal?.interactiveConfig?.bgAudioDataUrl || '',
  };

  const kinds: WorkspaceAssetKind[] = ['tpl1', 'tpl2', 'videoMedia', 'videoAudio'];
  const fetchPromises: Promise<void>[] = [];

  for (const kind of kinds) {
    const wantedHash = targetHashes[kind];
    if (!wantedHash) {
      resolvedAssets[kind] = '';
      continue;
    }
    const localMatches =
      Boolean(existingLocal) &&
      (localHashes[kind] === wantedHash || cachedHashes[kind] === wantedHash);
    if (localMatches) {
      if (kind === 'videoMedia' && existingLocal?.interactiveConfig) {
        resolvedAssets.videoMedia = JSON.stringify({
          coverImageDataUrl: existingLocal.interactiveConfig.coverImageDataUrl || '',
          openImageDataUrl: existingLocal.interactiveConfig.openImageDataUrl || '',
          customSealDataUrl: existingLocal.interactiveConfig.customSealDataUrl || '',
          slide1BannerDataUrl: existingLocal.interactiveConfig.slide1BannerDataUrl || '',
        });
      }
      continue;
    }

    const assetDocId = buildAssetDocId(safeId, kind);
    fetchPromises.push(
      getDoc(doc(db, 'studio', 'workspace', 'assets', assetDocId)).then((assetSnap) => {
        reads += 1;
        if (assetSnap.exists()) {
          const assetData = assetSnap.data() as Partial<CloudWorkspaceAssetDoc>;
          resolvedAssets[kind] = typeof assetData.data === 'string' ? assetData.data : '';
        }
      })
    );
  }

  if (fetchPromises.length > 0) {
    await Promise.all(fetchPromises);
  }

  let videoMediaBundle: VideoMediaAssetBundle = {};
  if (resolvedAssets.videoMedia) {
    try {
      videoMediaBundle = JSON.parse(resolvedAssets.videoMedia) as VideoMediaAssetBundle;
    } catch {
      videoMediaBundle = {};
    }
  }

  const templates: TemplateImages = {
    activeTemplateId: payload.templatesMeta?.activeTemplateId || 'custom-upload',
    pageCount: payload.templatesMeta?.pageCount === 2 ? 2 : 1,
    page1DataUrl: resolvedAssets.tpl1 || existingLocal?.templates.page1DataUrl || '',
    page1Width: payload.templatesMeta?.page1Width || 1240,
    page1Height: payload.templatesMeta?.page1Height || 1754,
    page2DataUrl:
      payload.templatesMeta?.pageCount === 2
        ? resolvedAssets.tpl2 || existingLocal?.templates.page2DataUrl || null
        : null,
    page2Width: payload.templatesMeta?.page2Width || payload.templatesMeta?.page1Width || 1240,
    page2Height: payload.templatesMeta?.page2Height || payload.templatesMeta?.page1Height || 1754,
  };

  let interactiveConfig: InteractiveInviteConfig | undefined;
  if (payload.interactiveConfigLight || resolvedAssets.videoMedia || resolvedAssets.videoAudio) {
    const light = payload.interactiveConfigLight;
    interactiveConfig = {
      ...DEFAULT_INTERACTIVE_CONFIG,
      ...(light || {}),
      textSizes: {
        ...DEFAULT_SLIDE_TEXT_SIZES,
        ...(light?.textSizes ?? {}),
      },
      panelScales: {
        ...DEFAULT_PANEL_SCALES,
        ...(light?.panelScales ?? {}),
      },
      slideStyles: light?.slideStyles ?? {},
      slideExtras: {
        ...DEFAULT_SLIDE_EXTRAS,
        ...(light?.slideExtras ?? {}),
        rsvpReceipt: {
          ...DEFAULT_RSVP_RECEIPT_CONFIG,
          ...(light?.slideExtras?.rsvpReceipt ?? {}),
        },
      },
      coverImageDataUrl: videoMediaBundle.coverImageDataUrl || '',
      openImageDataUrl: videoMediaBundle.openImageDataUrl || '',
      customSealDataUrl: videoMediaBundle.customSealDataUrl || '',
      slide1BannerDataUrl: videoMediaBundle.slide1BannerDataUrl || '',
      bgAudioDataUrl: resolvedAssets.videoAudio || '',
    };
  }

  const reconstructed: SavedEventRecord = {
    id: payload.id || safeId,
    metadata: payload.metadata,
    templates,
    overlays: Array.isArray(payload.overlays) ? payload.overlays : [],
    recipients: Array.isArray(payload.recipients) ? payload.recipients : [],
    interactiveConfig,
    isCompleted: Boolean(payload.isCompleted),
    createdAt: payload.createdAt || data.updatedAt || Date.now(),
    updatedAt: Math.max(payload.updatedAt || 0, data.updatedAt || 0) || Date.now(),
  };

  return { event: reconstructed, reads, assetHashes: targetHashes };
}

async function pushSingleEventToCloud(
  event: SavedEventRecord,
  adminEmail: string,
  previousAssetHashes: Partial<Record<WorkspaceAssetKind, string>>
): Promise<{ writes: number; assetHashes: Record<WorkspaceAssetKind, string>; assetsVersion: number }> {
  const db = await getLiteFirestore();
  if (!db) {
    return {
      writes: 0,
      assetHashes: { tpl1: '', tpl2: '', videoMedia: '', videoAudio: '' },
      assetsVersion: 0,
    };
  }

  const { doc, setDoc } = await import('firebase/firestore/lite');
  const safeId = sanitizeFirestoreId(event.id, 80);
  const now = Math.floor(event.updatedAt || Date.now());
  const safeEmail = adminEmail.slice(0, 120);

  const { slots, hashes } = await extractEventAssets(event);
  let writes = 0;
  let anyAssetChanged = false;

  const kinds: WorkspaceAssetKind[] = ['tpl1', 'tpl2', 'videoMedia', 'videoAudio'];
  const assetWrites: Promise<void>[] = [];

  for (const kind of kinds) {
    const nextHash = hashes[kind];
    const prevHash = previousAssetHashes[kind] || '';
    if (nextHash === prevHash) continue; // Unchanged asset -> 0 writes!

    anyAssetChanged = true;
    const assetDocId = buildAssetDocId(safeId, kind);
    const assetPayload: CloudWorkspaceAssetDoc = {
      version: 1,
      assetId: assetDocId,
      eventId: safeId,
      kind,
      contentHash: nextHash.slice(0, 64),
      data: slots[kind],
      updatedAt: now,
      updatedBy: safeEmail,
    };
    assetWrites.push(
      setDoc(doc(db, 'studio', 'workspace', 'assets', assetDocId), assetPayload).then(() => {
        writes += 1;
      })
    );
  }

  if (assetWrites.length > 0) {
    await Promise.all(assetWrites);
  }

  const stripped = buildStrippedPayload(event, hashes);
  let payloadJson = JSON.stringify(stripped);

  if (getUtf8ByteLength(payloadJson) > MAX_EVENT_JSON_BYTES) {
    throw new Error(
      `Ukuran data teks/tamu event "${event.metadata.eventName}" melebihi batas 840 KB per dokumen Cloud.`
    );
  }

  const assetsVersion = anyAssetChanged ? now : 0;
  const eventDocPayload: CloudWorkspaceEventDoc = {
    version: 1,
    eventId: safeId,
    deleted: false,
    payloadJson,
    assetsVersion,
    updatedAt: now,
    updatedBy: safeEmail,
  };

  await setDoc(doc(db, 'studio', 'workspace', 'events', safeId), eventDocPayload);
  writes += 1;

  return { writes, assetHashes: hashes, assetsVersion };
}

async function markEventDeletedInCloud(
  eventId: string,
  deletedAt: number,
  adminEmail: string
): Promise<number> {
  const db = await getLiteFirestore();
  if (!db) return 0;
  const { doc, setDoc } = await import('firebase/firestore/lite');
  const safeId = sanitizeFirestoreId(eventId, 80);
  const payload: CloudWorkspaceEventDoc = {
    version: 1,
    eventId: safeId,
    deleted: true,
    payloadJson: '',
    assetsVersion: 0,
    updatedAt: Math.floor(deletedAt),
    updatedBy: adminEmail.slice(0, 120),
  };
  await setDoc(doc(db, 'studio', 'workspace', 'events', safeId), payload);
  return 1;
}

/**
 * Ultra-frugal bidirectional sync between local IndexedDB workspace and Cloud Firestore.
 *
 * Quota profile:
 * - Opening app when already up-to-date: 1 read, 0 writes.
 * - Opening app on a new PC with N events: 1 index read + only changed events & assets.
 * - Saving edits to 1 event (text/guests/layout only): 1 event write + 1 index write (0 asset writes).
 */
export async function syncWorkspaceWithCloud(params: {
  localEvents: SavedEventRecord[];
  localActiveEventId: string;
  isUntouchedFreshBrowser?: boolean;
  pushLocalChanges?: boolean;
}): Promise<WorkspaceCloudSyncResult | null> {
  if (!isFirestoreRsvpConfigured()) return null;
  const adminEmail = await ensureAdminAuthToken();
  if (!adminEmail) return null;

  const {
    localEvents,
    localActiveEventId,
    isUntouchedFreshBrowser = false,
    pushLocalChanges = true,
  } = params;

  const cache = readLocalSyncCache();
  let readsUsed = 0;
  let writesUsed = 0;
  let pulledCount = 0;
  let pushedCount = 0;
  let deletedCount = 0;
  let changedLocally = false;

  // Step 1: Read lightweight singleton index (1 read!)
  const cloudIndexDoc = await fetchWorkspaceIndexDoc();
  readsUsed += 1;
  const cloudEntries = cloudIndexDoc ? parseIndexEntries(cloudIndexDoc.eventsJson) : [];
  const cloudMap = new Map<string, WorkspaceIndexEntry>();
  for (const entry of cloudEntries) {
    cloudMap.set(entry.id, entry);
  }

  const activeCloudEntries = cloudEntries.filter((e) => !e.deleted);

  // If this is a brand-new browser/PC with only an untouched default starter event
  // and Cloud already has real events, replace the placeholder cleanly with Cloud events!
  const localMap = new Map<string, SavedEventRecord>();
  if (!(isUntouchedFreshBrowser && activeCloudEntries.length > 0)) {
    for (const ev of localEvents) {
      localMap.set(sanitizeFirestoreId(ev.id, 80), ev);
    }
  } else {
    changedLocally = true;
  }

  const allIds = new Set<string>([
    ...localMap.keys(),
    ...cloudMap.keys(),
    ...Object.keys(cache.deletedTombstones),
  ]);

  const mergedEvents: SavedEventRecord[] = [];
  const nextIndexEntries: WorkspaceIndexEntry[] = [];
  let indexNeedsWrite = !cloudIndexDoc && pushLocalChanges && localMap.size > 0;

  for (const id of allIds) {
    const localEv = localMap.get(id);
    const cloudEntry = cloudMap.get(id);
    const localDeletedAt = cache.deletedTombstones[id] || 0;

    // Case 1: Deleted locally more recently than Cloud
    if (!localEv && localDeletedAt > 0 && (!cloudEntry || localDeletedAt > cloudEntry.updatedAt)) {
      if (pushLocalChanges && (!cloudEntry || !cloudEntry.deleted)) {
        writesUsed += await markEventDeletedInCloud(id, localDeletedAt, adminEmail);
        deletedCount += 1;
        indexNeedsWrite = true;
      }
      nextIndexEntries.push({
        id,
        name: cloudEntry?.name || 'Dihapus',
        updatedAt: localDeletedAt,
        createdAt: cloudEntry?.createdAt || localDeletedAt,
        isCompleted: false,
        deleted: true,
        assetsVersion: 0,
      });
      continue;
    }

    // Case 2: Deleted in Cloud more recently than local
    if (cloudEntry?.deleted && (!localEv || cloudEntry.updatedAt >= localEv.updatedAt)) {
      if (localEv) {
        changedLocally = true;
        deletedCount += 1;
      }
      cache.deletedTombstones[id] = Math.max(localDeletedAt, cloudEntry.updatedAt);
      delete cache.syncedEventUpdatedAt[id];
      delete cache.syncedAssetHashes[id];
      nextIndexEntries.push(cloudEntry);
      continue;
    }

    // Case 3: Exists in Cloud and is NEWER than local (or missing locally) -> PULL
    if (cloudEntry && !cloudEntry.deleted && (!localEv || cloudEntry.updatedAt > localEv.updatedAt)) {
      const pulled = await pullSingleEventFromCloud(id, localEv);
      readsUsed += pulled.reads;
      if (pulled.event) {
        mergedEvents.push(pulled.event);
        pulledCount += 1;
        changedLocally = true;
        cache.syncedEventUpdatedAt[id] = pulled.event.updatedAt;
        cache.syncedAssetHashes[id] = pulled.assetHashes;
        delete cache.deletedTombstones[id];
        nextIndexEntries.push({
          id,
          name: pulled.event.metadata.eventName.slice(0, 140),
          updatedAt: pulled.event.updatedAt,
          createdAt: pulled.event.createdAt,
          isCompleted: pulled.event.isCompleted,
          deleted: false,
          assetsVersion: cloudEntry.assetsVersion || 0,
        });
      }
      continue;
    }

    // Case 4: Exists locally and is NEWER than Cloud (or missing in Cloud) -> PUSH
    if (localEv) {
      const needsPush =
        pushLocalChanges &&
        (!cloudEntry ||
          cloudEntry.deleted ||
          localEv.updatedAt > cloudEntry.updatedAt ||
          cache.syncedEventUpdatedAt[id] !== localEv.updatedAt);

      if (needsPush) {
        const pushed = await pushSingleEventToCloud(
          localEv,
          adminEmail,
          cache.syncedAssetHashes[id] || {}
        );
        writesUsed += pushed.writes;
        pushedCount += 1;
        indexNeedsWrite = true;
        cache.syncedEventUpdatedAt[id] = localEv.updatedAt;
        cache.syncedAssetHashes[id] = pushed.assetHashes;
        delete cache.deletedTombstones[id];
        nextIndexEntries.push({
          id,
          name: localEv.metadata.eventName.slice(0, 140),
          updatedAt: localEv.updatedAt,
          createdAt: localEv.createdAt,
          isCompleted: localEv.isCompleted,
          deleted: false,
          assetsVersion: pushed.assetsVersion || cloudEntry?.assetsVersion || 0,
        });
      } else {
        nextIndexEntries.push(
          cloudEntry || {
            id,
            name: localEv.metadata.eventName.slice(0, 140),
            updatedAt: localEv.updatedAt,
            createdAt: localEv.createdAt,
            isCompleted: localEv.isCompleted,
            deleted: false,
            assetsVersion: 0,
          }
        );
      }
      mergedEvents.push(localEv);
    }
  }

  // Sort merged events newest-updated / newest-created first for predictable display
  mergedEvents.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  // Keep active event consistent across PCs
  let nextActiveId = localActiveEventId;
  const mergedHasLocalActive = mergedEvents.some((e) => e.id === localActiveEventId);
  if (
    isUntouchedFreshBrowser &&
    cloudIndexDoc?.activeEventId &&
    mergedEvents.some((e) => e.id === cloudIndexDoc.activeEventId)
  ) {
    nextActiveId = cloudIndexDoc.activeEventId;
  } else if (!mergedHasLocalActive) {
    if (
      cloudIndexDoc?.activeEventId &&
      mergedEvents.some((e) => e.id === cloudIndexDoc.activeEventId)
    ) {
      nextActiveId = cloudIndexDoc.activeEventId;
    } else if (mergedEvents[0]) {
      nextActiveId = mergedEvents[0].id;
    }
  }

  // Prune old tombstones (> 90 days) so index stays compact forever
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const trimmedEntries = nextIndexEntries
    .filter((e) => !e.deleted || e.updatedAt >= ninetyDaysAgo)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_EVENTS_IN_INDEX);

  const now = Date.now();
  if (pushLocalChanges && (indexNeedsWrite || (cloudIndexDoc && cloudIndexDoc.activeEventId !== nextActiveId && pushedCount > 0))) {
    const db = await getLiteFirestore();
    if (db) {
      const { doc, setDoc } = await import('firebase/firestore/lite');
      let eventsJson = JSON.stringify(trimmedEntries);
      if (getUtf8ByteLength(eventsJson) > MAX_INDEX_JSON_BYTES) {
        eventsJson = JSON.stringify(trimmedEntries.slice(0, 80));
      }
      const indexPayload: CloudWorkspaceIndexDoc = {
        version: 1,
        activeEventId: sanitizeFirestoreId(nextActiveId || mergedEvents[0]?.id || 'default', 80),
        eventCount: trimmedEntries.filter((e) => !e.deleted).length,
        eventsJson,
        updatedAt: Math.floor(now),
        updatedBy: adminEmail.slice(0, 120),
      };
      await setDoc(doc(db, 'studio', 'workspaceIndex'), indexPayload);
      writesUsed += 1;
    }
  }

  cache.lastSyncedAt = now;
  writeLocalSyncCache(cache);

  return {
    events: mergedEvents,
    activeEventId: nextActiveId,
    changedLocally,
    pulledCount,
    pushedCount,
    deletedCount,
    readsUsed,
    writesUsed,
    syncedAt: now,
  };
}
