import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { RsvpPayload, RsvpStatus } from '../types';
import { getRsvpLabel } from '../utils/rsvp';

interface InteractiveInvitePageProps {
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

const ID_MONTH_MAP: Record<string, number> = {
  januari: 0,
  februari: 1,
  maret: 2,
  april: 3,
  mei: 4,
  juni: 5,
  juli: 6,
  agustus: 7,
  september: 8,
  oktober: 9,
  november: 10,
  desember: 11,
};

function parseEventTargetDate(dateStr: string, timeStr: string): Date | null {
  if (!dateStr) return null;
  const cleaned = dateStr.trim().toLowerCase();
  let year = 0;
  let month = -1;
  let day = 0;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(cleaned);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]) - 1;
    day = Number(iso[3]);
  } else {
    const idMatch = /(\d{1,2})\s+([a-z]+)\s+(\d{4})/.exec(cleaned);
    if (idMatch && idMatch[2] in ID_MONTH_MAP) {
      day = Number(idMatch[1]);
      month = ID_MONTH_MAP[idMatch[2]];
      year = Number(idMatch[3]);
    }
  }

  if (!year || month < 0 || !day) return null;

  let hour = 9;
  let minute = 0;
  const timeMatch = /(\d{1,2})[.:](\d{2})/.exec(timeStr || '');
  if (timeMatch) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
  }

  const target = new Date(year, month, day, hour, minute, 0);
  return Number.isNaN(target.getTime()) ? null : target;
}

function buildGoogleCalendarUrl(payload: RsvpPayload): string {
  const target = parseEventTargetDate(payload.date, payload.time);
  const formatGCal = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: payload.eventName || 'Undangan Acara',
    details: `Undangan untuk ${payload.salutation} ${payload.recipientName}${payload.institution ? ` (${payload.institution})` : ''}\nPenyelenggara: ${payload.organizer}\nKode Undangan: ${payload.invitationCode}`,
    location: payload.location || '',
  });

  if (target) {
    const end = new Date(target.getTime() + 2 * 60 * 60 * 1000);
    params.set('dates', `${formatGCal(target)}/${formatGCal(end)}`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export const InteractiveInvitePage: React.FC<InteractiveInvitePageProps> = ({
  payload,
  initialStatus,
  initialRepresentative,
  initialNote,
  initialSubmittedAt,
  isSimulation = false,
  onBackToAdmin,
  onSubmitRsvp,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<'sealed' | 'opening' | 'story'>('sealed');
  const [muted, setMuted] = useState(false);
  const [slideIndex, setSlideIndex] = useState<0 | 1 | 2>(0);
  const [isPaused, setIsPaused] = useState(false);

  // RSVP form state
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
      (!initialStatus ||
      initialStatus === 'pending' ||
      initialStatus === 'attending'
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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialStatus && initialStatus !== 'pending') {
      setSelectedStatus(
        initialStatus === 'represented'
          ? 'represented'
          : initialStatus === 'declined'
            ? 'declined'
            : 'attending'
      );
      if (initialRepresentative) setRepresentative(initialRepresentative);
      if (initialNote) setNote(initialNote);
      setSubmittedAt(initialSubmittedAt || Date.now());
      setEditing(false);
    }
  }, [initialStatus, initialRepresentative, initialNote, initialSubmittedAt]);

  // Live countdown ticker
  const targetDate = useMemo(
    () => parseEventTargetDate(payload.date, payload.time),
    [payload.date, payload.time]
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!targetDate) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [targetDate]);

  const countdown = useMemo(() => {
    if (!targetDate) return null;
    const diff = targetDate.getTime() - nowMs;
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, passed: true };
    const totalSec = Math.floor(diff / 1000);
    return {
      days: Math.floor(totalSec / 86400),
      hours: Math.floor((totalSec % 86400) / 3600),
      minutes: Math.floor((totalSec % 3600) / 60),
      seconds: totalSec % 60,
      passed: false,
    };
  }, [targetDate, nowMs]);

  // Auto-advance Story slides 0 -> 1 -> 2 (pauses automatically on RSVP slide 2)
  const slideDurationMs = slideIndex === 0 ? 5500 : 6500;
  useEffect(() => {
    if (phase !== 'story' || isPaused || slideIndex >= 2) return;
    const timer = window.setTimeout(() => {
      setSlideIndex((prev) => (prev < 2 ? ((prev + 1) as 0 | 1 | 2) : prev));
    }, slideDurationMs);
    return () => window.clearTimeout(timer);
  }, [phase, isPaused, slideIndex, slideDurationMs]);

  const handleBreakSeal = () => {
    setPhase('opening');
    const video = videoRef.current;
    if (!video) {
      setPhase('story');
      return;
    }
    video.currentTime = 0;
    video.muted = muted;
    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {
        // Fallback if browser blocks unmuted playback
        video.muted = true;
        setMuted(true);
        video.play().catch(() => setPhase('story'));
      });
    }
  };

  const handleReplayEnvelope = () => {
    setSlideIndex(0);
    setIsPaused(false);
    setPhase('sealed');
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  };

  const handleRsvpSubmit = async (e: React.FormEvent) => {
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
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  };

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    payload.location || payload.eventName
  )}`;
  const gcalUrl = useMemo(() => buildGoogleCalendarUrl(payload), [payload]);

  return (
    <div className="min-h-[100dvh] w-full bg-[#09090B] text-[#F7F3EA] flex flex-col items-center justify-center sm:p-5 select-none">
      {/* Simulation Top Bar for Admin Preview */}
      {isSimulation && onBackToAdmin && (
        <div className="w-full max-w-[430px] mb-3 px-4 py-2.5 sm:rounded-full bg-[#16161A] border border-[#D4AF37]/30 flex items-center justify-between gap-3">
          <span className="text-[12px] font-medium text-[#D9C79E] truncate">
            Pratinjau Undangan Video Interaktif
          </span>
          <button
            type="button"
            onClick={onBackToAdmin}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold text-[#14110B] bg-gradient-to-r from-[#F0D483] to-[#C89B3C] hover:brightness-105 transition-all whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali</span>
          </button>
        </div>
      )}

      {/* 9:16 Luxury Portrait Stage */}
      <div className="relative w-full sm:max-w-[430px] min-h-[100dvh] sm:min-h-0 sm:h-[min(90dvh,820px)] sm:rounded-[32px] overflow-hidden bg-[#0E0E10] sm:border sm:border-[#D4AF37]/30 sm:shadow-[0_30px_90px_-20px_rgba(212,175,55,0.28)] flex flex-col">
        {/* Background Media Layer */}
        <div className="absolute inset-0 overflow-hidden bg-[#0E0E10]">
          {/* Open Paper Crisp Background (active during story phase) */}
          <img
            src="/media/gold-envelope-open.webp"
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 w-full h-full object-cover scale-[1.04] transition-opacity duration-700 ${
              phase === 'story' ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Gold Wax-Seal Intro Video (active during sealed & opening phases) */}
          <video
            ref={videoRef}
            src="/media/gold-envelope-intro.mp4"
            poster="/media/gold-envelope-poster.webp"
            playsInline
            preload="auto"
            onEnded={() => setPhase('story')}
            className={`absolute inset-0 w-full h-full object-cover scale-[1.04] transition-opacity duration-700 ${
              phase === 'story' ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          />

          {/* Subtle vignette for luxury framing & crisp text contrast */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
              phase === 'opening'
                ? 'bg-gradient-to-t from-black/55 via-transparent to-black/35'
                : 'bg-gradient-to-b from-black/65 via-black/25 to-black/75'
            }`}
          />
        </div>

        {/* PHASE 1: SEALED ENVELOPE OVERLAY */}
        <AnimatePresence>
          {phase === 'sealed' && (
            <motion.div
              key="sealed-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.45 } }}
              className="relative z-10 flex-1 flex flex-col justify-between p-6 pt-12 pb-9 text-center"
            >
              {/* Top Personalized Recipient Calligraphy */}
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-1.5 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]"
              >
                <div className="text-[10.5px] font-bold uppercase tracking-[0.28em] text-[#E6C775]">
                  Undangan Resmi
                </div>
                <div className="text-[13px] font-medium text-[#F5EFE0]/85 pt-2">
                  {payload.salutation}
                </div>
                <h1 className="font-display font-extrabold text-[22px] sm:text-[24px] leading-tight text-transparent bg-clip-text bg-gradient-to-b from-[#FCE9B2] via-[#E8C56E] to-[#C69738] px-2">
                  {payload.recipientName}
                </h1>
                {payload.institution && (
                  <p className="text-[13px] font-medium text-[#E6DEC8]/90 px-4">
                    {payload.institution}
                  </p>
                )}
              </motion.div>

              {/* Center Interactive Gold Wax Seal Trigger */}
              <div className="flex items-center justify-center my-auto">
                <button
                  type="button"
                  onClick={handleBreakSeal}
                  aria-label="Sentuh segel emas untuk membuka undangan"
                  className="group relative w-32 h-32 rounded-full flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0D483]"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full border border-[#F0D483]/60 animate-ping"
                    style={{ animationDuration: '2.4s' }}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-2 rounded-full border border-[#F0D483]/50 bg-[#D4AF37]/10 group-hover:bg-[#D4AF37]/20 transition-colors"
                  />
                  <span className="sr-only">Buka Undangan</span>
                </button>
              </div>

              {/* Bottom CTA Prompt */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.15 }}
                className="space-y-3"
              >
                <button
                  type="button"
                  onClick={handleBreakSeal}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#F3D88B] via-[#DFB454] to-[#C69535] text-[#151109] font-display font-extrabold text-[13.5px] tracking-wide shadow-[0_10px_30px_-6px_rgba(223,180,84,0.65)] hover:brightness-105 active:scale-[0.98] transition-all"
                >
                  <span>Sentuh Segel untuk Membuka</span>
                </button>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setSlideIndex(2);
                      setPhase('story');
                    }}
                    className="text-[11.5px] font-medium text-[#D9C79E]/75 hover:text-[#FCE9B2] underline underline-offset-4 transition-colors"
                  >
                    Langsung ke Konfirmasi RSVP
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PHASE 2: OPENING VIDEO CONTROLS */}
        {phase === 'opening' && (
          <div className="relative z-10 flex items-center justify-end gap-2 p-4">
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={muted ? 'Aktifkan suara' : 'Bisukan suara'}
              className="p-2 rounded-full bg-black/50 border border-[#D4AF37]/35 text-[#F4DDA0] hover:bg-black/70 transition-colors backdrop-blur-xs"
            >
              {muted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                videoRef.current?.pause();
                setPhase('story');
              }}
              className="px-3.5 py-1.5 rounded-full bg-black/50 border border-[#D4AF37]/35 text-[12px] font-semibold text-[#F4DDA0] hover:bg-black/70 transition-colors backdrop-blur-xs"
            >
              Lewati →
            </button>
          </div>
        )}

        {/* PHASE 3: INTERACTIVE 3-SLIDE STORY OVER OPEN BLACK EMBOSSED PAPER */}
        {phase === 'story' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 flex-1 flex flex-col justify-between p-5 pt-4 pb-5 overflow-y-auto"
          >
            {/* Top Story Progress Bar + Controls */}
            <div className="space-y-3 shrink-0">
              <div className="grid grid-cols-3 gap-1.5" aria-label="Progres undangan">
                {[0, 1, 2].map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSlideIndex(idx as 0 | 1 | 2)}
                    aria-label={`Buka adegan ${idx + 1}`}
                    className="h-1.5 rounded-full bg-white/15 overflow-hidden"
                  >
                    {idx < slideIndex ? (
                      <div className="h-full w-full bg-[#E8C56E]" />
                    ) : idx === slideIndex ? (
                      idx < 2 && !isPaused ? (
                        <motion.div
                          key={`prog-${slideIndex}-${isPaused}`}
                          initial={{ width: '0%' }}
                          animate={{ width: '100%' }}
                          transition={{
                            duration: slideDurationMs / 1000,
                            ease: 'linear',
                          }}
                          className="h-full bg-gradient-to-r from-[#FCE9B2] to-[#D4AF37]"
                        />
                      ) : (
                        <div className="h-full w-full bg-[#E8C56E]" />
                      )
                    ) : null}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#E6C775]/90">
                  {slideIndex === 0
                    ? '01 · Undangan'
                    : slideIndex === 1
                      ? '02 · Waktu & Lokasi'
                      : '03 · Konfirmasi RSVP'}
                </span>

                <div className="flex items-center gap-1.5">
                  {slideIndex < 2 && (
                    <button
                      type="button"
                      onClick={() => setIsPaused((p) => !p)}
                      aria-label={isPaused ? 'Lanjutkan otomatis' : 'Jeda otomatis'}
                      className="p-1.5 rounded-full bg-white/8 border border-[#D4AF37]/30 text-[#F4DDA0] hover:bg-white/15 transition-colors"
                    >
                      {isPaused ? (
                        <Play className="w-3.5 h-3.5" />
                      ) : (
                        <Pause className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleReplayEnvelope}
                    title="Putar ulang animasi amplop"
                    aria-label="Putar ulang animasi amplop"
                    className="p-1.5 rounded-full bg-white/8 border border-[#D4AF37]/30 text-[#F4DDA0] hover:bg-white/15 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  {slideIndex !== 2 && (
                    <button
                      type="button"
                      onClick={() => setSlideIndex(2)}
                      className="px-3 py-1 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/45 text-[11px] font-bold text-[#FCE9B2] hover:bg-[#D4AF37]/30 transition-colors"
                    >
                      RSVP
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Center Slide Content */}
            <div className="my-auto py-4">
              <AnimatePresence mode="wait">
                {slideIndex === 0 && (
                  <motion.div
                    key="slide-0"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="text-center space-y-5 px-2"
                  >
                    <div className="inline-flex items-center px-3.5 py-1 rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 text-[11px] font-semibold text-[#F4DDA0]">
                      {payload.organizer}
                    </div>

                    <div className="space-y-3">
                      <p className="text-[12px] tracking-[0.22em] uppercase text-[#D9C79E]/80">
                        Dengan Hormat Mengundang
                      </p>
                      <h2 className="font-display font-extrabold text-[25px] sm:text-[27px] leading-snug text-transparent bg-clip-text bg-gradient-to-b from-[#FFF1C4] via-[#E8C56E] to-[#C69535]">
                        {payload.eventName}
                      </h2>
                    </div>

                    <div
                      aria-hidden="true"
                      className="mx-auto w-24 h-px bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent"
                    />

                    <div className="rounded-2xl border border-[#D4AF37]/25 bg-white/[0.04] backdrop-blur-xs p-4 space-y-1">
                      <div className="text-[11.5px] font-medium text-[#E6C775]">
                        {payload.salutation}
                      </div>
                      <div className="font-display font-bold text-[18px] text-[#FDFBF7]">
                        {payload.recipientName}
                      </div>
                      {payload.institution && (
                        <div className="text-[12.5px] text-[#D9C79E]/85">
                          {payload.institution}
                        </div>
                      )}
                      <div className="pt-2 text-[11px] text-[#D9C79E]/65 tabular-nums">
                        Kode Undangan: {payload.invitationCode}
                      </div>
                    </div>

                    <p className="text-[12.5px] text-[#E6DEC8]/80 leading-relaxed max-w-xs mx-auto">
                      Merupakan suatu kehormatan bagi kami apabila Bapak/Ibu berkenan hadir pada kegiatan tersebut.
                    </p>
                  </motion.div>
                )}

                {slideIndex === 1 && (
                  <motion.div
                    key="slide-1"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-4 px-1"
                  >
                    <div className="text-center space-y-1">
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#E6C775]">
                        Pelaksanaan Kegiatan
                      </div>
                      <h2 className="font-display font-extrabold text-[21px] text-[#FCE9B2] leading-snug">
                        {payload.eventName}
                      </h2>
                    </div>

                    {/* Live Countdown */}
                    {countdown && (
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: 'Hari', val: countdown.days },
                          { label: 'Jam', val: countdown.hours },
                          { label: 'Menit', val: countdown.minutes },
                          { label: 'Detik', val: countdown.seconds },
                        ].map((unit) => (
                          <div
                            key={unit.label}
                            className="rounded-2xl border border-[#D4AF37]/30 bg-white/[0.05] py-2.5 px-1 text-center"
                          >
                            <div className="font-display font-extrabold text-[20px] text-[#FCE9B2] tabular-nums leading-none">
                              {String(unit.val).padStart(2, '0')}
                            </div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#D9C79E]/80 mt-1">
                              {unit.label}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Date / Time / Location Card */}
                    <div className="rounded-2xl border border-[#D4AF37]/25 bg-white/[0.04] backdrop-blur-xs p-4 space-y-3.5 text-[13px]">
                      {payload.date && (
                        <div className="flex items-start gap-3">
                          <Clock className="w-4.5 h-4.5 text-[#E8C56E] shrink-0 mt-0.5" />
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-[#D9C79E]/75">
                              Tanggal & Waktu
                            </div>
                            <div className="font-bold text-[#FDFBF7] mt-0.5">
                              {payload.date}
                            </div>
                            {payload.time && (
                              <div className="text-[12.5px] text-[#E6DEC8]/85">
                                {payload.time}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {payload.location && (
                        <div className="flex items-start gap-3 pt-3 border-t border-[#D4AF37]/15">
                          <MapPin className="w-4.5 h-4.5 text-[#E8C56E] shrink-0 mt-0.5" />
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-[#D9C79E]/75">
                              Lokasi Acara
                            </div>
                            <div className="font-bold text-[#FDFBF7] mt-0.5 leading-snug">
                              {payload.location}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-full border border-[#D4AF37]/45 bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[12px] font-bold text-[#FCE9B2] transition-colors"
                      >
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>Buka Peta</span>
                      </a>
                      <a
                        href={gcalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-full border border-[#D4AF37]/45 bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[12px] font-bold text-[#FCE9B2] transition-colors"
                      >
                        <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
                        <span>Simpan Kalender</span>
                      </a>
                    </div>
                  </motion.div>
                )}

                {slideIndex === 2 && (
                  <motion.div
                    key="slide-2"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="px-1"
                  >
                    {!editing && submittedAt ? (
                      <div className="rounded-3xl border border-[#D4AF37]/35 bg-white/[0.05] backdrop-blur-xs p-5 text-center space-y-4">
                        <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-br from-[#FCE9B2] to-[#C69535] flex items-center justify-center text-[#151109] shadow-md">
                          <Check className="w-6 h-6 stroke-[2.8]" />
                        </div>

                        <div>
                          <h2 className="font-display font-extrabold text-[19px] text-[#FCE9B2]">
                            Konfirmasi Kehadiran Tercatat
                          </h2>
                          <p className="text-[12px] text-[#D9C79E]/85 mt-1">
                            Terima kasih, konfirmasi Anda telah diterima secara online oleh panitia.
                          </p>
                        </div>

                        <div className="rounded-2xl border border-[#D4AF37]/20 bg-black/35 p-3.5 text-left space-y-2 text-[12.5px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[#D9C79E]/75">Nama</span>
                            <span className="font-bold text-[#FDFBF7] text-right truncate">
                              {payload.recipientName}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[#D9C79E]/75">Status</span>
                            <span className="font-bold text-[#FCE9B2]">
                              {getRsvpLabel(selectedStatus)}
                            </span>
                          </div>
                          {representative && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[#D9C79E]/75">
                                {selectedStatus === 'represented'
                                  ? 'Perwakilan'
                                  : 'Keterangan'}
                              </span>
                              <span className="font-semibold text-[#FDFBF7] text-right">
                                {representative}
                              </span>
                            </div>
                          )}
                          {note && (
                            <div className="pt-2 border-t border-[#D4AF37]/15">
                              <div className="text-[11px] text-[#D9C79E]/70">Catatan:</div>
                              <div className="text-[#FDFBF7] mt-0.5">{note}</div>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setEditing(true)}
                          className="px-5 py-2 rounded-full border border-[#D4AF37]/45 bg-transparent text-[12.5px] font-semibold text-[#FCE9B2] hover:bg-[#D4AF37]/15 transition-colors"
                        >
                          Ubah Konfirmasi Kehadiran
                        </button>
                      </div>
                    ) : (
                      <form
                        onSubmit={handleRsvpSubmit}
                        className="rounded-3xl border border-[#D4AF37]/30 bg-white/[0.04] backdrop-blur-xs p-4 space-y-3.5"
                      >
                        <div className="text-center">
                          <h2 className="font-display font-extrabold text-[17px] text-[#FCE9B2]">
                            Konfirmasi Kehadiran
                          </h2>
                          <p className="text-[11.5px] text-[#D9C79E]/80 mt-0.5">
                            {payload.salutation} {payload.recipientName}
                          </p>
                        </div>

                        <fieldset className="border-0 p-0 m-0">
                          <legend className="sr-only">Pilihan Status Kehadiran</legend>
                          <div
                            role="radiogroup"
                            aria-label="Pilihan Status Kehadiran"
                            className="grid grid-cols-1 gap-2"
                          >
                            {(
                              [
                                {
                                  id: 'attending',
                                  title: 'Hadir Langsung',
                                  desc: 'Saya berencana hadir sesuai jadwal',
                                },
                                {
                                  id: 'represented',
                                  title: 'Diwakilkan',
                                  desc: 'Diwakilkan pejabat / staf instansi',
                                },
                                {
                                  id: 'declined',
                                  title: 'Belum Dapat Hadir',
                                  desc: 'Mohon maaf berhalangan hadir',
                                },
                              ] as const
                            ).map((choice) => {
                              const active = selectedStatus === choice.id;
                              return (
                                <button
                                  key={choice.id}
                                  type="button"
                                  role="radio"
                                  aria-checked={active}
                                  onClick={() => {
                                    setSelectedStatus(choice.id);
                                    if (
                                      choice.id === 'attending' &&
                                      (!representative ||
                                        representative === 'Perwakilan Instansi')
                                    ) {
                                      setRepresentative('1 orang (Sendiri)');
                                    } else if (
                                      choice.id === 'represented' &&
                                      ATTENDING_COUNT_OPTIONS.some(
                                        (o) => o.value === representative
                                      )
                                    ) {
                                      setRepresentative('');
                                    }
                                  }}
                                  className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl border text-left transition-all ${
                                    active
                                      ? 'border-[#E8C56E] bg-[#D4AF37]/20 ring-1 ring-[#E8C56E]/40'
                                      : 'border-white/12 bg-black/25 hover:border-[#D4AF37]/40'
                                  }`}
                                >
                                  <div>
                                    <div className="font-display font-bold text-[13px] text-[#FDFBF7]">
                                      {choice.title}
                                    </div>
                                    <div className="text-[11px] text-[#D9C79E]/75">
                                      {choice.desc}
                                    </div>
                                  </div>
                                  <span
                                    className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center shrink-0 ${
                                      active
                                        ? 'border-[#FCE9B2] bg-[#E8C56E] text-[#151109]'
                                        : 'border-white/30'
                                    }`}
                                  >
                                    {active && <Check className="w-3 h-3 stroke-[3]" />}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>

                        {selectedStatus === 'attending' && (
                          <div className="space-y-2">
                            <label
                              htmlFor="invite-attending-count"
                              className="block text-[11.5px] font-medium text-[#E6C775]"
                            >
                              Jumlah Orang / Keterangan
                            </label>
                            <div
                              role="radiogroup"
                              aria-label="Pilihan jumlah orang"
                              className="grid grid-cols-5 gap-1.5"
                            >
                              {ATTENDING_COUNT_OPTIONS.map((opt) => {
                                const isSelected = representative === opt.value;
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    onClick={() => setRepresentative(opt.value)}
                                    className={`py-1.5 px-1 rounded-full border text-[11px] font-bold transition-all text-center ${
                                      isSelected
                                        ? 'border-[#E8C56E] bg-[#D4AF37]/25 text-[#FCE9B2]'
                                        : 'border-white/15 bg-black/25 text-[#D9C79E]/85 hover:border-[#D4AF37]/45'
                                    }`}
                                  >
                                    {opt.id === '1' ? '1' : opt.label}
                                  </button>
                                );
                              })}
                            </div>
                            <input
                              id="invite-attending-count"
                              type="text"
                              value={representative}
                              onChange={(e) => setRepresentative(e.target.value)}
                              placeholder="Keterangan jumlah hadir..."
                              className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-[12.5px] text-[#FDFBF7] placeholder:text-[#D9C79E]/45 focus:outline-none focus:ring-2 focus:ring-[#E8C56E]"
                            />
                          </div>
                        )}

                        {selectedStatus === 'represented' && (
                          <div>
                            <label
                              htmlFor="invite-rep-name"
                              className="block text-[11.5px] font-medium text-[#E6C775] mb-1"
                            >
                              Nama & Jabatan Perwakilan *
                            </label>
                            <input
                              id="invite-rep-name"
                              type="text"
                              required
                              value={representative}
                              onChange={(e) => setRepresentative(e.target.value)}
                              placeholder="Contoh: Bpk. Hendri Saputra (Kabid)"
                              className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-[12.5px] text-[#FDFBF7] placeholder:text-[#D9C79E]/45 focus:outline-none focus:ring-2 focus:ring-[#E8C56E]"
                            />
                          </div>
                        )}

                        <div>
                          <label
                            htmlFor="invite-note"
                            className="block text-[11.5px] font-medium text-[#E6C775] mb-1"
                          >
                            Catatan (Opsional)
                          </label>
                          <textarea
                            id="invite-note"
                            rows={2}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Catatan untuk panitia..."
                            className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-1.5 text-[12.5px] text-[#FDFBF7] placeholder:text-[#D9C79E]/45 focus:outline-none focus:ring-2 focus:ring-[#E8C56E]"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full py-2.5 px-5 rounded-full bg-gradient-to-r from-[#F3D88B] via-[#DFB454] to-[#C69535] text-[#151109] font-display font-extrabold text-[13.5px] shadow-md hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50"
                        >
                          {submitting
                            ? 'Menyimpan Konfirmasi...'
                            : 'Kirim Konfirmasi Kehadiran'}
                        </button>
                      </form>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom Slide Controls */}
            <div className="pt-2 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                disabled={slideIndex === 0}
                onClick={() =>
                  setSlideIndex((prev) => (prev > 0 ? ((prev - 1) as 0 | 1 | 2) : prev))
                }
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-full border border-[#D4AF37]/30 bg-black/35 text-[12px] font-semibold text-[#F4DDA0] hover:bg-[#D4AF37]/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Sebelumnya</span>
              </button>

              {slideIndex < 2 ? (
                <button
                  type="button"
                  onClick={() =>
                    setSlideIndex((prev) =>
                      prev < 2 ? ((prev + 1) as 0 | 1 | 2) : prev
                    )
                  }
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-gradient-to-r from-[#F0D483] to-[#C89B3C] text-[#151109] text-[12px] font-extrabold hover:brightness-105 transition-all"
                >
                  <span>{slideIndex === 1 ? 'Isi RSVP' : 'Lanjut'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <span className="text-[11px] font-medium text-[#D9C79E]/60 pr-1">
                  Ranah Invite
                </span>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
