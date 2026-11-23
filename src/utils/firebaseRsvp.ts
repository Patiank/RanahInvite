import { RsvpStatus } from '../types';

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

export function sanitizeFirestoreId(raw: string, maxLen: number): string {
  const cleaned = raw
    .trim()
    .replace(/[\/\\?#%[\]]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, maxLen);
  return cleaned || 'default';
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
