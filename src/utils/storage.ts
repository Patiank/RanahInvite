import {
  EventMetadata,
  OverlayBlock,
  StudioDraftState,
  TemplateImages,
} from '../types';

const DB_NAME = 'ranahinvite_studio_db';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'active_studio_draft_v4';
const LS_META_KEY = 'ranahinvite_studio_meta_v4';

const SYSTEM_DEFAULT_LS_KEY = 'ranahinvite_system_default_v3';
const SYSTEM_DEFAULT_IDB_KEY = 'system_default_v3';
// Legacy read-only fallback keys (cleaned up once v3 is saved)
const LEGACY_CUSTOM_DEFAULT_LS_KEY = 'ranahinvite_custom_default_overlays_v1';
const LEGACY_CUSTOM_DEFAULT_IDB_KEY = 'custom_default_overlays_v1';

export interface StoredSystemDefault {
  version: 3;
  savedAt: number;
  overlays: OverlayBlock[];
  metadata?: EventMetadata;
  templates?: TemplateImages;
}

export function normalizeLoadedOverlays(overlays: OverlayBlock[]): OverlayBlock[] {
  let result: OverlayBlock[] = overlays
    .filter((o) => (o.id as string) !== 'invitation_code')
    .map((o) => ({
      ...o,
      label: (o.label || '').replace(/\s*\(\{\{[^}]+\}\}\)\s*$/g, '').trim() || o.label,
      x: Number.isFinite(Number(o.x)) ? Number(o.x) : 50,
      y: Number.isFinite(Number(o.y)) ? Number(o.y) : 50,
      width: Number.isFinite(Number(o.width)) ? Number(o.width) : 60,
      fontSize:
        Number.isFinite(Number(o.fontSize)) && Number(o.fontSize) > 0
          ? Number(o.fontSize)
          : 14,
      locked: o.locked ?? true,
    }));

  if (!result.some((o) => o.id === 'place_label')) {
    const inst = result.find((o) => o.id === 'institution');
    const placeBlock: OverlayBlock = {
      id: 'place_label',
      label: 'Keterangan Tempat',
      placeholder: 'di tempat',
      page: inst?.page ?? 1,
      visible: true,
      locked: true,
      x: inst?.x ?? 50,
      y: Math.min(92, (inst?.y ?? 68) + 5.8),
      width: inst?.width ?? 56,
      fontFamily: 'Manrope',
      fontSize: inst?.fontSize ?? 13,
      fontWeight: 400,
      italic: false,
      align: inst?.align ?? 'center',
      color: inst?.color ?? '#4B5563',
    };

    const instIdx = result.findIndex((o) => o.id === 'institution');
    if (instIdx >= 0) {
      result = [...result];
      result.splice(instIdx + 1, 0, placeBlock);
    } else {
      result = [...result, placeBlock];
    }
  }

  if (!result.some((o) => o.id === 'rsvp_note')) {
    const qr = result.find((o) => o.id === 'qr_code');
    const rsvpNoteBlock: OverlayBlock = {
      id: 'rsvp_note',
      label: 'Teks Info Scan QR',
      placeholder: 'Mohon pindai QR Code untuk\nkonfirmasi kehadiran Anda',
      page: qr?.page ?? 2,
      visible: true,
      locked: false,
      x: qr?.x ?? 82.2,
      y: Math.min(94, (qr?.y ?? 76.9) + 9.3),
      width: 28,
      fontFamily: 'Manrope',
      fontSize: 9,
      fontWeight: 600,
      italic: false,
      align: 'center',
      color: '#1F2937',
    };
    result = [...result, rsvpNoteBlock];
  }

  return result;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

export async function saveStudioDraft(state: StudioDraftState): Promise<void> {
  try {
    const lightSummary = {
      activeEventId: state.activeEventId,
      updatedAt: state.updatedAt,
      eventSummaries: state.events.map((ev) => ({
        id: ev.id,
        eventName: ev.metadata.eventName,
        date: ev.metadata.date,
        recipientCount: ev.recipients.length,
        isCompleted: ev.isCompleted,
        updatedAt: ev.updatedAt,
      })),
    };
    localStorage.setItem(LS_META_KEY, JSON.stringify(lightSummary));
  } catch {
    // Ignore quota errors on localStorage fallback
  }

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(state, DRAFT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    });
    db.close();
  } catch {
    // Silent fallback if IndexedDB is unavailable
  }
}

export async function loadStudioDraft(): Promise<StudioDraftState | null> {
  try {
    const db = await openDatabase();
    const v4Result = await new Promise<StudioDraftState | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(DRAFT_KEY);
      req.onsuccess = () => resolve((req.result as StudioDraftState) ?? null);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
    db.close();

    if (v4Result && Array.isArray(v4Result.events) && v4Result.events.length > 0) {
      return {
        ...v4Result,
        events: v4Result.events.map((ev) => ({
          ...ev,
          overlays: normalizeLoadedOverlays(ev.overlays || []),
        })),
      };
    }
  } catch {
    // Ignore errors
  }

  return null;
}

export async function clearStudioDraft(): Promise<void> {
  try {
    localStorage.removeItem(LS_META_KEY);
  } catch {
    // Ignore
  }
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(DRAFT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    });
    db.close();
  } catch {
    // Ignore
  }
}

export async function applyRsvpSubmissionToStorage(
  eventId: string,
  invitationCode: string,
  patch: {
    rsvpStatus: 'attending' | 'represented' | 'declined';
    rsvpRepresentative?: string;
    rsvpNote?: string;
    rsvpAt: number;
  }
): Promise<boolean> {
  try {
    const draft = await loadStudioDraft();
    if (!draft) return false;
    let updated = false;
    const nextEvents = draft.events.map((ev) => {
      if (eventId && ev.id !== eventId) return ev;
      const nextRecipients = ev.recipients.map((rec) => {
        if (rec.invitationCode.toLowerCase() === invitationCode.toLowerCase()) {
          updated = true;
          return {
            ...rec,
            rsvpStatus: patch.rsvpStatus,
            rsvpRepresentative: patch.rsvpRepresentative,
            rsvpNote: patch.rsvpNote,
            rsvpAt: patch.rsvpAt,
          };
        }
        return rec;
      });
      return { ...ev, recipients: nextRecipients, updatedAt: Date.now() };
    });

    if (updated) {
      await saveStudioDraft({
        ...draft,
        events: nextEvents,
        updatedAt: Date.now(),
      });
    }
    return updated;
  } catch {
    return false;
  }
}

function parseStoredSystemDefault(raw: unknown): StoredSystemDefault | null {
  if (!raw) return null;

  // Backward compatibility: v1 bare OverlayBlock[] array
  if (Array.isArray(raw) && raw.length > 0) {
    return {
      version: 3,
      savedAt: 0,
      overlays: normalizeLoadedOverlays(raw as OverlayBlock[]),
    };
  }

  if (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as Partial<StoredSystemDefault>).overlays) &&
    (raw as Partial<StoredSystemDefault>).overlays!.length > 0
  ) {
    const obj = raw as Partial<StoredSystemDefault>;
    const validMetadata =
      obj.metadata && typeof obj.metadata === 'object'
        ? { ...obj.metadata }
        : undefined;
    const validTemplates =
      obj.templates &&
      typeof obj.templates === 'object' &&
      typeof obj.templates.page1DataUrl === 'string' &&
      obj.templates.page1DataUrl.length > 0
        ? { ...obj.templates }
        : undefined;

    return {
      version: 3,
      savedAt: typeof obj.savedAt === 'number' ? obj.savedAt : Date.now(),
      overlays: normalizeLoadedOverlays(obj.overlays!),
      metadata: validMetadata,
      templates: validTemplates,
    };
  }
  return null;
}

export function saveSystemDefaultSync(data: {
  overlays: OverlayBlock[];
  metadata?: EventMetadata;
  templates?: TemplateImages;
  savedAt?: number;
}): StoredSystemDefault {
  const payload: StoredSystemDefault = {
    version: 3,
    savedAt: data.savedAt ?? Date.now(),
    overlays: normalizeLoadedOverlays(data.overlays.map((o) => ({ ...o }))),
    metadata: data.metadata ? { ...data.metadata } : undefined,
    templates: data.templates ? { ...data.templates } : undefined,
  };

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Try storing full payload if compact; otherwise store overlays + metadata in localStorage
      // while full templates reside in IndexedDB.
      const lightPayload: StoredSystemDefault = {
        version: 3,
        savedAt: payload.savedAt,
        overlays: payload.overlays,
        metadata: payload.metadata,
      };
      const fullSerialized = JSON.stringify(payload);
      if (fullSerialized.length <= 1_500_000) {
        window.localStorage.setItem(SYSTEM_DEFAULT_LS_KEY, fullSerialized);
      } else {
        window.localStorage.setItem(
          SYSTEM_DEFAULT_LS_KEY,
          JSON.stringify(lightPayload)
        );
      }
      window.localStorage.removeItem(LEGACY_CUSTOM_DEFAULT_LS_KEY);
    }
  } catch {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const lightPayload: StoredSystemDefault = {
          version: 3,
          savedAt: payload.savedAt,
          overlays: payload.overlays,
          metadata: payload.metadata,
        };
        window.localStorage.setItem(
          SYSTEM_DEFAULT_LS_KEY,
          JSON.stringify(lightPayload)
        );
        window.localStorage.removeItem(LEGACY_CUSTOM_DEFAULT_LS_KEY);
      }
    } catch {
      // Ignore storage quota errors
    }
  }
  return payload;
}

export async function saveSystemDefaultToIdb(
  payload: StoredSystemDefault
): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(payload, SYSTEM_DEFAULT_IDB_KEY);
      store.delete(LEGACY_CUSTOM_DEFAULT_IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error('IndexedDB system default write failed'));
    });
    db.close();
  } catch {
    // Ignore if IndexedDB is unavailable
  }
}

export function loadSystemDefaultSync(): StoredSystemDefault | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw =
      window.localStorage.getItem(SYSTEM_DEFAULT_LS_KEY) ??
      window.localStorage.getItem(LEGACY_CUSTOM_DEFAULT_LS_KEY);
    if (!raw) return null;
    return parseStoredSystemDefault(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadSystemDefaultFromIdb(): Promise<StoredSystemDefault | null> {
  try {
    const db = await openDatabase();
    const v3 = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SYSTEM_DEFAULT_IDB_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () =>
        reject(req.error ?? new Error('IndexedDB system default read failed'));
    });
    const parsedV3 = parseStoredSystemDefault(v3);
    if (parsedV3) {
      db.close();
      return parsedV3;
    }

    const legacy = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(LEGACY_CUSTOM_DEFAULT_IDB_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () =>
        reject(req.error ?? new Error('IndexedDB legacy default read failed'));
    });
    db.close();
    return parseStoredSystemDefault(legacy);
  } catch {
    return null;
  }
}

export async function clearSystemDefault(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(SYSTEM_DEFAULT_LS_KEY);
      window.localStorage.removeItem(LEGACY_CUSTOM_DEFAULT_LS_KEY);
    }
  } catch {
    // Ignore
  }
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(SYSTEM_DEFAULT_IDB_KEY);
      store.delete(LEGACY_CUSTOM_DEFAULT_IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error('IndexedDB system default delete failed'));
    });
    db.close();
  } catch {
    // Ignore
  }
}
