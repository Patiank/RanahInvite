import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import {
  isAllowedAdminEmail,
  isFirebaseAuthConfigured,
  signInAdminWithGoogle,
  signOutAdmin,
  subscribeToAdminAuth,
} from '../utils/firebaseAuth';
import { BrandIcon } from './BrandIcon';

interface AdminAuthGateProps {
  children: (auth: {
    adminEmail: string | null;
    onSignOut: () => Promise<void>;
  }) => React.ReactNode;
}

export const AdminAuthGate: React.FC<AdminAuthGateProps> = ({ children }) => {
  const authEnabled = isFirebaseAuthConfigured();
  const [checking, setChecking] = useState<boolean>(authEnabled);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!authEnabled) return;
    let unsubscribe: (() => void) | undefined;
    let active = true;

    subscribeToAdminAuth(async (user) => {
      if (!active) return;
      if (!user) {
        setAdminEmail(null);
        setChecking(false);
        return;
      }

      if (isAllowedAdminEmail(user.email) && user.emailVerified) {
        setAdminEmail(user.email);
        setErrorMessage(null);
        setChecking(false);
      } else {
        const rejectedEmail = user.email || 'akun ini';
        setAdminEmail(null);
        setErrorMessage(
          `Akses ditolak untuk ${rejectedEmail}. Hanya email administrator yang terdaftar yang dapat masuk ke Studio.`
        );
        setChecking(false);
        try {
          await signOutAdmin();
        } catch {
          // ignore sign-out error
        }
      }
    })
      .then((unsub) => {
        if (!active) {
          unsub();
        } else {
          unsubscribe = unsub;
        }
      })
      .catch((err) => {
        if (!active) return;
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Gagal menginisialisasi layanan autentikasi.'
        );
        setChecking(false);
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [authEnabled]);

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setSigningIn(true);
    try {
      const user = await signInAdminWithGoogle();
      if (!isAllowedAdminEmail(user.email) || !user.emailVerified) {
        const rejectedEmail = user.email || 'akun ini';
        await signOutAdmin();
        setAdminEmail(null);
        setErrorMessage(
          `Akses ditolak untuk ${rejectedEmail}. Hanya email administrator yang terdaftar yang dapat masuk ke Studio.`
        );
      }
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (code === 'auth/popup-closed-by-user') {
        setErrorMessage('Proses login dibatalkan.');
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMessage(
          'Domain ini belum diotorisasi di Firebase Console (Authentication → Settings → Authorized domains).'
        );
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Gagal masuk dengan Google. Silakan coba lagi.'
        );
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOutAdmin();
    setAdminEmail(null);
  };

  // If Firebase env is not configured (e.g. offline local dev without .env), allow local studio directly
  if (!authEnabled) {
    return <>{children({ adminEmail: null, onSignOut: async () => {} })}</>;
  }

  if (checking) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center p-6"
        style={{ backgroundColor: 'var(--bg-canvas-outer)' }}
      >
        <div className="rounded-3xl bg-white border border-[#DDEEF3] px-7 py-5 flex items-center gap-3 shadow-sm">
          <Loader2 className="w-5 h-5 animate-spin text-[#1F9B96]" />
          <span className="text-[13.5px] font-semibold text-[#1B1B4B]">
            Memeriksa sesi administrator...
          </span>
        </div>
      </div>
    );
  }

  if (!adminEmail) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6"
        style={{ backgroundColor: 'var(--bg-canvas-outer)' }}
      >
        <div className="w-full max-w-md rounded-[28px] bg-white border border-[#DDEEF3] shadow-[0_24px_60px_-20px_rgba(31,155,150,0.32)] overflow-hidden">
          {/* Header Banner */}
          <div
            className="px-6 py-7 text-center text-white relative overflow-hidden"
            style={{ backgroundColor: 'var(--bg-sidebar)' }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-6 -top-6 w-24 h-24 rounded-full bg-[#F7B7C6]/35"
            />
            <div className="relative z-10 flex flex-col items-center gap-2.5">
              <BrandIcon
                name="brand-rumah-gadang"
                className="w-12 h-12 text-[#F9E99B]"
              />
              <div>
                <h1 className="font-display font-extrabold text-[22px] tracking-tight text-white">
                  Ranah Invite Studio
                </h1>
                <p className="text-[12.5px] text-white/85 mt-0.5">
                  Akses Terbatas · Panel Administrator Undangan
                </p>
              </div>
            </div>
          </div>

          <div className="h-1.5 w-full bg-[#F9DE6C]" />

          {/* Sign-In Body */}
          <div className="p-6 sm:p-7 space-y-5">
            <div className="text-center space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DCF5F1] text-[#157A76] text-[11.5px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Autentikasi Diperlukan</span>
              </div>
              <p className="text-[13px] text-[#757E96] leading-relaxed pt-1">
                Masuk menggunakan akun Google administrator yang telah didaftarkan untuk mengelola event, penerima, dan ekspor undangan PDF.
              </p>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-2xl border border-[#F5C6D2] bg-[#FDE8EE] px-4 py-3 flex items-start gap-2.5 text-[12.5px] text-[#B83B5E]"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            <button
              type="button"
              disabled={signingIn}
              onClick={handleGoogleSignIn}
              className="w-full inline-flex items-center justify-center gap-3 px-5 py-3 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white font-display font-bold text-[14px] transition-all shadow-xs active:scale-[0.99] disabled:opacity-55 disabled:cursor-not-allowed"
            >
              {signingIn ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  <span>Memverifikasi Akun...</span>
                </>
              ) : (
                <>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="w-4.5 h-4.5 bg-white rounded-full p-0.5 shrink-0"
                  >
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.96H1.28v3.1A12 12 0 0 0 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.28A7.22 7.22 0 0 1 4.9 12c0-.79.14-1.56.38-2.28v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.38l4-3.1Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.76c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4 3.1c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  <span>Masuk dengan Google</span>
                </>
              )}
            </button>

            <p className="text-center text-[11.5px] text-[#757E96]">
              Tamu undangan yang memindai QR Code RSVP tetap dapat mengonfirmasi kehadiran tanpa perlu login.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children({ adminEmail, onSignOut: handleSignOut })}</>;
};

export default AdminAuthGate;
