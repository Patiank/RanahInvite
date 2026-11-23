import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { parseRsvpParams } from './utils/rsvp';
import './index.css';

const LazyAdminStudio = lazy(() => import('./App.tsx'));
const LazyRsvpEntry = lazy(() => import('./components/RsvpStandaloneEntry.tsx'));

const rsvpPayload =
  typeof window !== 'undefined'
    ? parseRsvpParams(window.location.search)
    : null;

const LoadingShell: React.FC = () => (
  <div
    className="min-h-screen w-full flex items-center justify-center p-6"
    style={{ backgroundColor: 'var(--bg-canvas-outer)' }}
  >
    <div className="rounded-2xl bg-white/90 border border-[#DDEEF3] px-6 py-4 text-[13px] font-semibold text-[#1B1B4B] shadow-xs">
      Memuat Ranah Invite...
    </div>
  </div>
);

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<LoadingShell />}>
    {rsvpPayload ? (
      <LazyRsvpEntry payload={rsvpPayload} />
    ) : (
      <LazyAdminStudio />
    )}
  </Suspense>
);
