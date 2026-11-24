import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  Loader2,
  MapPin,
  X,
} from 'lucide-react';
import { RsvpPayload, RsvpStatus } from '../types';
import { getRsvpLabel } from '../utils/rsvp';
import { BrandIcon } from './BrandIcon';

interface GuestRsvpPageProps {
  payload: RsvpPayload;
  initialStatus?: RsvpStatus;
  initialRepresentative?: string;
  initialNote?: string;
  initialSubmittedAt?: number;
  isSimulation?: boolean;
  onBackToAdmin?: () => void;
  onSubmitRsvp: (data: {
    status: 'attending' | 'represented' | 'declined';
    representative?: string;
    note?: string;
  }) => Promise<void> | void;
}

const ATTENDING_COUNT_OPTIONS = [
  { id: '1', label: '1 (Sendiri)', value: '1 orang (Sendiri)' },
  { id: '2', label: '2', value: '2 orang' },
  { id: '3', label: '3', value: '3 orang' },
  { id: '4', label: '4', value: '4 orang' },
  { id: '>5', label: '>5', value: '>5 orang' },
] as const;

const CELEBRATION_PARTICLES = [
  { x: 0, y: -56, size: 7, color: '#F9DE6C', delay: 0.12 },
  { x: 30, y: -48, size: 5, color: '#1F9B96', delay: 0.16 },
  { x: 52, y: -24, size: 6, color: '#34D399', delay: 0.14 },
  { x: 58, y: 6, size: 5, color: '#F9DE6C', delay: 0.18 },
  { x: 44, y: 36, size: 6, color: '#38BDF8', delay: 0.15 },
  { x: 18, y: 52, size: 5, color: '#1F9B96', delay: 0.19 },
  { x: -18, y: 52, size: 6, color: '#F7B7C6', delay: 0.14 },
  { x: -46, y: 34, size: 5, color: '#F9DE6C', delay: 0.17 },
  { x: -58, y: 4, size: 6, color: '#1F9B96', delay: 0.13 },
  { x: -50, y: -26, size: 5, color: '#34D399', delay: 0.18 },
  { x: -28, y: -48, size: 6, color: '#F7B7C6', delay: 0.15 },
  { x: 14, y: -54, size: 4, color: '#38BDF8', delay: 0.2 },
] as const;

const SUCCESS_THEMES = {
  attending: {
    medallionBg: 'bg-[#DCF5F1]',
    medallionBorder: 'border-[#1F9B96]/35',
    ringBorder: 'border-[#1F9B96]',
    strokeColor: '#157A76',
    pillClass: 'bg-[#DCF5F1] border-[#9FE2D7] text-[#157A76]',
    pillLabel: 'Konfirmasi Berhasil Tersimpan',
    cardBorder: 'border-[#B5E9E0]',
    statusBadgeClass: 'bg-[#DCF5F1] text-[#157A76] border-[#9FE2D7]',
    celebrate: true,
  },
  represented: {
    medallionBg: 'bg-[#E3F5FA]',
    medallionBorder: 'border-[#167F7B]/35',
    ringBorder: 'border-[#167F7B]',
    strokeColor: '#167F7B',
    pillClass: 'bg-[#E3F5FA] border-[#B2E3F0] text-[#157A76]',
    pillLabel: 'Konfirmasi Perwakilan Tersimpan',
    cardBorder: 'border-[#B2E3F0]',
    statusBadgeClass: 'bg-[#E3F5FA] text-[#157A76] border-[#B2E3F0]',
    celebrate: true,
  },
  declined: {
    medallionBg: 'bg-[#FDE8EE]',
    medallionBorder: 'border-[#E598AB]/50',
    ringBorder: 'border-[#E598AB]',
    strokeColor: '#B83B5E',
    pillClass: 'bg-[#FDE8EE] border-[#F5C6D2] text-[#B83B5E]',
    pillLabel: 'Konfirmasi Berhalangan Tercatat',
    cardBorder: 'border-[#F5C6D2]',
    statusBadgeClass: 'bg-[#FDE8EE] text-[#B83B5E] border-[#F5C6D2]',
    celebrate: false,
  },
} as const;

export const GuestRsvpPage: React.FC<GuestRsvpPageProps> = ({
  payload,
  initialStatus,
  initialRepresentative,
  initialNote,
  initialSubmittedAt,
  isSimulation = false,
  onBackToAdmin,
  onSubmitRsvp,
}) => {
  const cardTopRef = useRef<HTMLDivElement | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<
    'attending' | 'represented' | 'declined'
  >(
    initialStatus === 'represented'
      ? 'represented'
      : initialStatus === 'declined'
        ? 'declined'
        : 'attending'
  );
  const [representative, setRepresentative] = useState<string>(
    initialRepresentative ||
      (!initialStatus || initialStatus === 'pending' || initialStatus === 'attending'
        ? '1 orang (Sendiri)'
        : '')
  );
  const [note, setNote] = useState<string>(initialNote || '');
  const [submittedAt, setSubmittedAt] = useState<number | null>(
    initialStatus && initialStatus !== 'pending'
      ? initialSubmittedAt || Date.now()
      : null
  );
  const [editing, setEditing] = useState<boolean>(
    !initialStatus || initialStatus === 'pending'
  );
  const [justSubmitted, setJustSubmitted] = useState<boolean>(false);
  const [closed, setClosed] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);

  const successTheme = SUCCESS_THEMES[selectedStatus];

  const handleClosePage = () => {
    if (onBackToAdmin) {
      onBackToAdmin();
      return;
    }
    try {
      window.close();
    } catch {
      // Browser may block programmatic tab close
    }
    setClosed(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const cleanRep =
        selectedStatus === 'attending'
          ? representative.trim() || '1 orang'
          : selectedStatus === 'represented'
            ? representative.trim() || 'Perwakilan Instansi'
            : undefined;
      await onSubmitRsvp({
        status: selectedStatus,
        representative: cleanRep,
        note: note.trim() || undefined,
      });
      setSubmittedAt(Date.now());
      setJustSubmitted(true);
      setEditing(false);

      // Gentle mobile haptic confirmation when supported
      try {
        if (
          typeof navigator !== 'undefined' &&
          typeof navigator.vibrate === 'function'
        ) {
          navigator.vibrate(selectedStatus === 'declined' ? 25 : [20, 45, 25]);
        }
      } catch {
        // Ignore unsupported vibration API
      }

      // Smoothly bring the confirmation receipt into full view on mobile screens
      requestAnimationFrame(() => {
        cardTopRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full py-6 px-4 flex flex-col items-center justify-center"
      style={{ backgroundColor: 'var(--bg-canvas-outer)' }}
    >
      {isSimulation && onBackToAdmin && (
        <div className="w-full max-w-lg mb-3 flex items-center justify-between gap-2 px-4 py-2.5 rounded-full bg-white border border-[#DDEEF3] shadow-xs">
          <span className="text-[12px] font-medium text-[#757E96]">
            Pratinjau Halaman RSVP Tamu (Simulasi Scan QR)
          </span>
          <button
            type="button"
            onClick={onBackToAdmin}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold text-white bg-[#1F9B96] hover:bg-[#167F7B] transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Admin</span>
          </button>
        </div>
      )}

      <motion.div
        ref={cardTopRef}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg rounded-[28px] bg-white shadow-xl border border-[#DDEEF3] overflow-hidden"
      >
        {/* Top Event Banner */}
        <div className="px-6 py-6 text-white bg-[#1F9B96] relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-8 w-28 h-28 rounded-full bg-[#F7B7C6]/35"
          />
          <div className="relative z-10 flex items-center gap-3 mb-3">
            <BrandIcon name="brand-verify" white className="w-10 h-10 shrink-0" />
            <div className="text-[12px] font-medium text-white/90 truncate">
              {payload.organizer}
            </div>
          </div>

          <h1 className="relative z-10 font-display font-bold text-[20px] leading-snug text-white">
            {payload.eventName}
          </h1>

          <div className="relative z-10 mt-3 space-y-1.5 text-[12px] text-white/90">
            {payload.date && (
              <div className="flex items-center gap-2">
                <BrandIcon name="schedule-datetime" white className="w-4 h-4 shrink-0" />
                <span>
                  {payload.date} {payload.time ? `· ${payload.time}` : ''}
                </span>
              </div>
            )}
            {payload.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#F9DE6C] shrink-0" />
                <span>{payload.location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Butter Yellow Accent Hairline */}
        <div className="h-1.5 w-full bg-[#F9DE6C]" />

        {/* Recipient Identity Card */}
        <div className="px-6 pt-5 pb-4 border-b border-[#EDF6F9] bg-[#F4FBFD]">
          <div className="text-[12px] font-semibold text-[#1F9B96]">
            {payload.salutation}
          </div>
          <div className="font-display font-bold text-[18px] text-[#1B1B4B] mt-0.5">
            {payload.recipientName}
          </div>
          {payload.institution && (
            <div className="text-[13px] text-[#757E96] mt-0.5">
              {payload.institution}
            </div>
          )}
          <div className="text-[11px] font-mono text-[#757E96] mt-2 tabular-nums">
            Kode Undangan: {payload.invitationCode}
          </div>
        </div>

        {/* Form or Confirmation Receipt */}
        <AnimatePresence mode="wait" initial={false}>
          {closed ? (
            <motion.div
              key="rsvp-closed"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="p-6 py-8 text-center space-y-4"
            >
              <div className="mx-auto w-14 h-14 rounded-full bg-[#DCF5F1] border border-[#9FE2D7] flex items-center justify-center text-[#157A76]">
                <Check className="w-7 h-7 stroke-[2.5]" />
              </div>
              <div className="space-y-1">
                <h2 className="font-display font-bold text-[18px] text-[#1B1B4B]">
                  {submittedAt ? 'Terima Kasih' : 'Halaman Ditutup'}
                </h2>
                <p className="text-[13px] text-[#757E96] max-w-xs mx-auto leading-relaxed">
                  {submittedAt
                    ? 'Konfirmasi kehadiran Anda telah tersimpan untuk panitia. Anda dapat menutup tab browser ini.'
                    : 'Anda dapat menutup tab browser ini atau membuka kembali formulir konfirmasi kapan saja.'}
                </p>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setClosed(false)}
                  className="px-5 py-2.5 rounded-full border border-[#DDEEF3] bg-white text-[13px] font-semibold text-[#1B1B4B] hover:bg-[#E3F5FA] transition-colors"
                >
                  {submittedAt ? 'Lihat Bukti Konfirmasi' : 'Buka Kembali Formulir'}
                </button>
              </div>
            </motion.div>
          ) : !editing && submittedAt ? (
            <motion.div
              key={`receipt-${submittedAt}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="p-6 space-y-5 text-center"
            >
              {/* Animated Checkmark Medallion + Ripple Rings + Celebratory Micro-Burst */}
              <div className="relative flex justify-center items-center py-2">
                <div className="relative w-20 h-20 flex items-center justify-center">
                  {justSubmitted && (
                    <>
                      <motion.span
                        aria-hidden="true"
                        initial={{ scale: 0.72, opacity: 0.6 }}
                        animate={{ scale: 1.72, opacity: 0 }}
                        transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
                        className={`pointer-events-none absolute inset-0 rounded-full border-2 ${successTheme.ringBorder}`}
                      />
                      <motion.span
                        aria-hidden="true"
                        initial={{ scale: 0.72, opacity: 0.45 }}
                        animate={{ scale: 2.05, opacity: 0 }}
                        transition={{
                          duration: 1.05,
                          delay: 0.2,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className={`pointer-events-none absolute inset-0 rounded-full border ${successTheme.ringBorder}`}
                      />
                    </>
                  )}

                  {justSubmitted &&
                    successTheme.celebrate &&
                    CELEBRATION_PARTICLES.map((p, idx) => (
                      <motion.span
                        key={idx}
                        aria-hidden="true"
                        initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                        animate={{
                          x: p.x,
                          y: p.y,
                          scale: [0, 1.15, 0.7, 0],
                          opacity: [0, 1, 0.9, 0],
                        }}
                        transition={{
                          duration: 0.88,
                          delay: p.delay,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        style={{
                          width: p.size,
                          height: p.size,
                          backgroundColor: p.color,
                        }}
                        className="pointer-events-none absolute rounded-full"
                      />
                    ))}

                  <motion.div
                    initial={
                      justSubmitted ? { scale: 0.45, opacity: 0 } : { scale: 0.92, opacity: 0 }
                    }
                    animate={{ scale: 1, opacity: 1 }}
                    transition={
                      justSubmitted
                        ? { type: 'spring', stiffness: 320, damping: 18 }
                        : { duration: 0.25 }
                    }
                    className={`relative z-10 w-[76px] h-[76px] rounded-full border-2 ${successTheme.medallionBg} ${successTheme.medallionBorder} flex items-center justify-center shadow-sm`}
                  >
                    <svg
                      viewBox="0 0 48 48"
                      fill="none"
                      aria-hidden="true"
                      className="w-11 h-11"
                    >
                      <motion.circle
                        cx="24"
                        cy="24"
                        r="19"
                        stroke={successTheme.strokeColor}
                        strokeWidth="2.5"
                        strokeOpacity="0.28"
                        initial={{ pathLength: justSubmitted ? 0 : 1 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.45, ease: 'easeOut' }}
                      />
                      <motion.path
                        d="M14.5 24.5 L21.2 31.2 L34 17.5"
                        stroke={successTheme.strokeColor}
                        strokeWidth="3.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: justSubmitted ? 0 : 1, opacity: justSubmitted ? 0 : 1 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{
                          pathLength: {
                            duration: 0.42,
                            delay: justSubmitted ? 0.18 : 0,
                            ease: [0.22, 1, 0.36, 1],
                          },
                          opacity: { duration: 0.12, delay: justSubmitted ? 0.18 : 0 },
                        }}
                      />
                    </svg>
                  </motion.div>
                </div>
              </div>

              {/* Shimmer Status Pill + Heading */}
              <motion.div
                role="status"
                aria-live="polite"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.32,
                  delay: justSubmitted ? 0.2 : 0.05,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="space-y-2"
              >
                <div className="flex justify-center">
                  <span
                    className={`relative overflow-hidden inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full border text-[11.5px] font-bold tracking-wide ${successTheme.pillClass}`}
                  >
                    {justSubmitted && (
                      <motion.span
                        aria-hidden="true"
                        initial={{ x: '-130%' }}
                        animate={{ x: '260%' }}
                        transition={{ duration: 0.85, delay: 0.42, ease: 'easeInOut' }}
                        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/75 to-transparent -skew-x-12"
                      />
                    )}
                    <Check className="w-3.5 h-3.5 stroke-[2.8] shrink-0 relative z-10" />
                    <span className="relative z-10">{successTheme.pillLabel}</span>
                  </span>
                </div>

                <h2 className="font-display font-bold text-[19px] text-[#1B1B4B]">
                  Konfirmasi Kehadiran Tercatat
                </h2>
                <p className="text-[13px] text-[#757E96]">
                  Terima kasih telah melakukan verifikasi kehadiran untuk panitia penyelenggara.
                </p>
              </motion.div>

              {/* Staggered Receipt Summary Card */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.34,
                  delay: justSubmitted ? 0.3 : 0.1,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={`rounded-2xl border ${successTheme.cardBorder} bg-[#F4FBFD] p-4 text-left space-y-2.5 text-[13px] shadow-2xs`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#757E96]">Status Kehadiran</span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[12px] font-bold ${successTheme.statusBadgeClass}`}
                  >
                    {getRsvpLabel(selectedStatus)}
                  </span>
                </div>
                {representative && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[#757E96]">
                      {selectedStatus === 'represented' ? 'Perwakilan' : 'Keterangan'}
                    </span>
                    <span className="font-semibold text-[#1B1B4B] text-right">
                      {representative}
                    </span>
                  </div>
                )}
                {note && (
                  <div className="pt-2 border-t border-[#DDEEF3]">
                    <div className="text-[11px] text-[#757E96]">Catatan:</div>
                    <div className="text-[#1B1B4B] mt-0.5">{note}</div>
                  </div>
                )}
                <div className="pt-2 border-t border-[#DDEEF3] flex items-center justify-between text-[11px] text-[#757E96] tabular-nums">
                  <span>Waktu Konfirmasi</span>
                  <span>
                    {new Date(submittedAt).toLocaleString('id-ID', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.3,
                  delay: justSubmitted ? 0.4 : 0.14,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex flex-col gap-2.5 pt-1"
              >
                <button
                  type="button"
                  onClick={() => {
                    setJustSubmitted(false);
                    setEditing(true);
                  }}
                  className="w-full py-2.5 px-5 rounded-full border border-[#DDEEF3] bg-white text-[13px] font-semibold text-[#1B1B4B] hover:bg-[#E3F5FA] transition-colors"
                >
                  Ubah Konfirmasi Kehadiran
                </button>
                <button
                  type="button"
                  onClick={handleClosePage}
                  className="w-full py-2.5 px-5 rounded-full border border-[#E5F1F5] bg-[#F4FBFD] text-[13px] font-semibold text-[#5A6580] hover:bg-[#E3F5FA] hover:text-[#1B1B4B] transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <X className="w-4 h-4" />
                  <span>Tutup</span>
                </button>
              </motion.div>
            </motion.div>
          ) : (
            <motion.form
              key="rsvp-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handleSubmit}
              className="p-6 flex flex-col gap-5"
            >
              <div>
                <h2 className="font-display font-bold text-[15px] text-[#1B1B4B]">
                  Konfirmasi Kehadiran Anda
                </h2>
                <p className="text-[12px] text-[#757E96] mt-0.5">
                  Informasi ini membantu panitia menyiapkan penyambutan dan tempat duduk tamu dengan baik.
                </p>
              </div>

            {/* 3 Clear RSVP Choices */}
            <fieldset className="border-0 p-0 m-0">
              <legend className="sr-only">Pilihan Status Kehadiran</legend>
              <div role="radiogroup" aria-label="Pilihan Status Kehadiran" className="grid grid-cols-1 gap-2.5">
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedStatus === 'attending'}
                  onClick={() => {
                    setSelectedStatus('attending');
                    if (!representative || representative === 'Perwakilan Instansi') {
                      setRepresentative('1 orang (Sendiri)');
                    }
                  }}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                    selectedStatus === 'attending'
                      ? 'border-[#1F9B96] bg-[#DCF5F1]/75 ring-2 ring-[#1F9B96]/20'
                      : 'border-[#E5F1F5] hover:border-[#B5E4F1]'
                  }`}
                >
                  <BrandIcon
                    name="rsvp-attending"
                    className={`w-5 h-5 shrink-0 ${
                      selectedStatus === 'attending' ? 'text-[#157A76]' : 'text-[#757E96]'
                    }`}
                  />
                  <div>
                    <div className="font-display font-bold text-[14px] text-[#1B1B4B]">
                      Hadir Langsung
                    </div>
                    <div className="text-[12px] text-[#757E96]">
                      Saya berencana menghadiri acara ini sesuai jadwal
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedStatus === 'represented'}
                  onClick={() => {
                    setSelectedStatus('represented');
                    if (
                      representative === '1 orang' ||
                      ATTENDING_COUNT_OPTIONS.some((opt) => opt.value === representative)
                    ) {
                      setRepresentative('');
                    }
                  }}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                    selectedStatus === 'represented'
                      ? 'border-[#1F9B96] bg-[#E3F5FA] ring-2 ring-[#1F9B96]/20'
                      : 'border-[#E5F1F5] hover:border-[#B5E4F1]'
                  }`}
                >
                  <BrandIcon
                    name="rsvp-represented"
                    className={`w-5 h-5 shrink-0 ${
                      selectedStatus === 'represented' ? 'text-[#167F7B]' : 'text-[#757E96]'
                    }`}
                  />
                  <div>
                    <div className="font-display font-bold text-[14px] text-[#1B1B4B]">
                      Diwakilkan
                    </div>
                    <div className="text-[12px] text-[#757E96]">
                      Kehadiran akan diwakilkan oleh pejabat/staf instansi kami
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedStatus === 'declined'}
                  onClick={() => setSelectedStatus('declined')}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                    selectedStatus === 'declined'
                      ? 'border-[#E598AB] bg-[#FDE8EE] ring-2 ring-[#F7B7C6]/40'
                      : 'border-[#E5F1F5] hover:border-[#F5C6D2]'
                  }`}
                >
                  <BrandIcon
                    name="rsvp-declined"
                    className={`w-5 h-5 shrink-0 ${
                      selectedStatus === 'declined' ? 'text-[#B83B5E]' : 'text-[#757E96]'
                    }`}
                  />
                  <div>
                    <div className="font-display font-bold text-[14px] text-[#1B1B4B]">
                      Belum Dapat Hadir / Berhalangan
                    </div>
                    <div className="text-[12px] text-[#757E96]">
                      Mohon maaf berhalangan menghadiri acara pada jadwal tersebut
                    </div>
                  </div>
                </button>
              </div>
            </fieldset>

            {/* Conditional Detail Input */}
            {selectedStatus === 'attending' && (
              <div className="pt-4 border-t border-[#EDF6F9] space-y-2.5">
                <label htmlFor="rsvp-attending-notes" className="block text-[12px] font-medium text-[#1B1B4B]">
                  Jumlah Orang / Keterangan Kehadiran
                </label>
                <div role="radiogroup" aria-label="Pilihan jumlah orang" className="grid grid-cols-6 sm:grid-cols-5 gap-2">
                  {ATTENDING_COUNT_OPTIONS.map((opt) => {
                    const isSelected =
                      representative === opt.value ||
                      (opt.id === '1' && representative === '1 orang') ||
                      (opt.id !== '1' &&
                        opt.id !== '>5' &&
                        representative.startsWith(`${opt.id} `)) ||
                      (opt.id === '>5' && representative.startsWith('>5'));

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setRepresentative(opt.value)}
                        className={`py-2 px-1.5 rounded-full border text-[12px] font-semibold tabular-nums transition-all text-center whitespace-nowrap ${
                          opt.id === '1' ? 'col-span-2 sm:col-span-1' : 'col-span-1'
                        } ${
                          isSelected
                            ? 'border-[#1F9B96] bg-[#E3F5FA] text-[#167F7B] ring-2 ring-[#1F9B96]/20'
                            : 'border-[#DDEEF3] bg-white text-[#1B1B4B] hover:border-[#B5E4F1] hover:bg-[#F4FBFD]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  id="rsvp-attending-notes"
                  type="text"
                  value={representative}
                  onChange={(e) => setRepresentative(e.target.value)}
                  placeholder="Atau tulis keterangan khusus (misal: 6 orang / + 1 Staf Protokol)"
                  className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                />
              </div>
            )}

            {selectedStatus === 'represented' && (
              <div className="pt-4 border-t border-[#EDF6F9]">
                <label htmlFor="rsvp-representative-name" className="block text-[12px] font-medium text-[#1B1B4B] mb-1.5">
                  Nama & Jabatan Perwakilan *
                </label>
                <input
                  id="rsvp-representative-name"
                  type="text"
                  required
                  value={representative}
                  onChange={(e) => setRepresentative(e.target.value)}
                  placeholder="Contoh: Bpk. Hendri Saputra (Kabid Pemasaran)"
                  className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2.5 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                />
              </div>
            )}

            <div className={selectedStatus === 'declined' ? 'pt-4 border-t border-[#EDF6F9]' : 'pt-1'}>
              <label htmlFor="rsvp-notes" className="block text-[12px] font-medium text-[#1B1B4B] mb-1.5">
                Catatan untuk Panitia (Opsional)
              </label>
              <textarea
                id="rsvp-notes"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Misalnya: Perkiraan tiba pukul 09.15 WIB atau catatan khusus..."
                className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-5 rounded-full font-display font-bold text-[14px] text-white bg-[#1F9B96] hover:bg-[#167F7B] transition-colors active:scale-[0.99] disabled:opacity-55 shadow-xs inline-flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan Konfirmasi...</span>
                  </>
                ) : (
                  <span>Kirim Konfirmasi Kehadiran</span>
                )}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleClosePage}
                className="w-full py-2.5 px-5 rounded-full border border-[#DDEEF3] bg-white text-[13px] font-semibold text-[#5A6580] hover:bg-[#F4FBFD] hover:text-[#1B1B4B] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                <X className="w-4 h-4" />
                <span>Tutup</span>
              </button>
            </div>
          </motion.form>
        )}
        </AnimatePresence>

        <div className="px-6 py-3 bg-[#F4FBFD] border-t border-[#EDF6F9] flex items-center justify-between text-[11px] text-[#757E96]">
          <span className="font-semibold text-[#1B1B4B]">Ranah Invite</span>
          <span className="inline-flex items-center gap-1">
            <BrandIcon name="rsvp-pending" className="w-3.5 h-3.5" />
            <span>Verifikasi Kehadiran Mandiri</span>
          </span>
        </div>
      </motion.div>
    </div>
  );
};
