import type { User } from 'firebase/auth';

export const ALLOWED_ADMIN_EMAILS = [
  'aldilesaldo@gmail.com',
  'aldoaldiles@gmail.com',
] as const;

export function isAllowedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (ALLOWED_ADMIN_EMAILS as readonly string[]).includes(normalized);
}

function readFirebaseConfig() {
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

export function isFirebaseAuthConfigured(): boolean {
  return readFirebaseConfig() !== null;
}

async function getFirebaseAuth() {
  const config = readFirebaseConfig();
  if (!config) {
    throw new Error('Konfigurasi Firebase belum tersedia di environment (.env).');
  }
  const [{ initializeApp, getApps, getApp }, { getAuth }] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ]);
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  return getAuth(app);
}

export async function subscribeToAdminAuth(
  onUserChange: (user: User | null) => void
): Promise<() => void> {
  const auth = await getFirebaseAuth();
  const { onAuthStateChanged } = await import('firebase/auth');
  return onAuthStateChanged(auth, onUserChange);
}

export async function signInAdminWithGoogle(): Promise<User> {
  const auth = await getFirebaseAuth();
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutAdmin(): Promise<void> {
  const auth = await getFirebaseAuth();
  const { signOut } = await import('firebase/auth');
  await signOut(auth);
}
