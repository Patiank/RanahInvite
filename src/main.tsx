import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { parseInteractiveInviteParams, parseRsvpParams } from './utils/rsvp';
import './index.css';

const LazyAdminStudio = lazy(() => import('./App.tsx'));
const LazyAdminAuthGate = lazy(() => import('./components/AdminAuthGate.tsx'));
const LazyRsvpEntry = lazy(() => import('./components/RsvpStandaloneEntry.tsx'));
const LazyInteractiveInviteEntry = lazy(
  () => import('./components/InteractiveInviteEntry.tsx')
);

const search = typeof window !== 'undefined' ? window.location.search : '';
const interactiveInvitePayload = parseInteractiveInviteParams(search);
const rsvpPayload = interactiveInvitePayload ? null : parseRsvpParams(search);

const LoadingShell: React.FC<{ dark?: boolean }> = ({ dark = false }) => (
  <div
    className={`min-h-screen w-full flex items-center justify-center p-6 ${
      dark ? 'bg-[#09090B]' : ''
    }`}
    style={dark ? undefined : { backgroundColor: 'var(--bg-canvas-outer)' }}
  >
    <div
      className={`rounded-2xl border px-6 py-4 text-[13px] font-semibold shadow-xs ${
        dark
          ? 'bg-[#151518] border-[#D4AF37]/30 text-[#FCE9B2]'
          : 'bg-white/90 border-[#DDEEF3] text-[#1B1B4B]'
      }`}
    >
      Memuat Ranah Invite...
    </div>
  </div>
);

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<LoadingShell dark={Boolean(interactiveInvitePayload)} />}>
    {interactiveInvitePayload ? (
      <LazyInteractiveInviteEntry payload={interactiveInvitePayload} />
    ) : rsvpPayload ? (
      <LazyRsvpEntry payload={rsvpPayload} />
    ) : (
      <LazyAdminAuthGate>
        {({ adminEmail, onSignOut }) => (
          <LazyAdminStudio adminEmail={adminEmail} onSignOut={onSignOut} />
        )}
      </LazyAdminAuthGate>
    )}
  </Suspense>
);
