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
  Maximize2,
  MessageCircle,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  DEFAULT_INTERACTIVE_CONFIG,
  DEFAULT_PANEL_SCALES,
  DEFAULT_SLIDE_TEXT_SIZES,
  InteractiveCardStyle,
  InteractiveFontPreset,
  InteractiveInviteConfig,
  InteractiveSealSize,
  InteractiveTextScale,
  InteractiveThemeId,
  RsvpPayload,
  RsvpStatus,
} from '../types';
import { getRsvpLabel } from '../utils/rsvp';

export interface PreviewJumpTarget {
  phase: 'sealed' | 'opening' | 'story';
  slideIndex?: 0 | 1 | 2;
  nonce: number;
}

interface InteractiveInvitePageProps {
  payload: RsvpPayload;
  config?: Partial<InteractiveInviteConfig>;
  initialStatus?: RsvpStatus;
  initialRepresentative?: string;
  initialNote?: string;
  initialSubmittedAt?: number;
  isSimulation?: boolean;
  embeddedPreview?: boolean;
  previewJumpTarget?: PreviewJumpTarget | null;
  onUpdateSlide1BannerOffset?: (offsetX: number, offsetY: number) => void;
  onBackToAdmin?: () => void;
  onSubmitRsvp: (data: {
    status: 'attending' | 'represented' | 'declined';
    representative?: string;
    note?: string;
  }) => Promise<void> | void;
}

const THEME_STYLES: Record<
  InteractiveThemeId,
  {
    accentText: string;
    titleGradient: string;
    cardBg: string;
    cardBorder: string;
    ctaBg: string;
    ctaText: string;
    bodyText: string;
    mutedText: string;
    storyVignette: string;
  }
> = {
  'gold-dark': {
    accentText: 'text-[#E6C775]',
    titleGradient: 'from-[#FFF2C9] via-[#E8C56E] to-[#C69535]',
    cardBg: 'bg-[#13120F]/85',
    cardBorder: 'border-[#D4AF37]/30',
    ctaBg: 'from-[#F3D88B] via-[#DFB454] to-[#C69535]',
    ctaText: 'text-[#151109]',
    bodyText: 'text-[#FDFBF7]',
    mutedText: 'text-[#E6DEC8]/85',
    storyVignette: 'bg-gradient-to-b from-black/75 via-black/40 to-black/80',
  },
  'emerald-light': {
    accentText: 'text-[#157A76]',
    titleGradient: 'from-[#0E5956] via-[#1F9B96] to-[#157A76]',
    cardBg: 'bg-white/90',
    cardBorder: 'border-[#1F9B96]/30',
    ctaBg: 'from-[#1F9B96] via-[#167F7B] to-[#0F6461]',
    ctaText: 'text-white',
    bodyText: 'text-[#1B1B4B]',
    mutedText: 'text-[#4B5568]',
    storyVignette: 'bg-gradient-to-b from-white/75 via-white/55 to-white/85',
  },
  'navy-gold': {
    accentText: 'text-[#F3D88B]',
    titleGradient: 'from-[#FFF6D6] via-[#F0D483] to-[#C89B3C]',
    cardBg: 'bg-[#0E162B]/88',
    cardBorder: 'border-[#D4AF37]/35',
    ctaBg: 'from-[#F3D88B] via-[#DFB454] to-[#C69535]',
    ctaText: 'text-[#0E162B]',
    bodyText: 'text-[#F8FAFC]',
    mutedText: 'text-[#CBD5E1]',
    storyVignette: 'bg-gradient-to-b from-[#080F20]/85 via-[#0B152C]/55 to-[#080F20]/90',
  },
};

const ATTENDING_COUNT_OPTIONS = [
  { id: '1', label: '1', value: '1 orang (Sendiri)' },
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

const SMOOTH_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const VIDEO_PLAYBACK_RATE = 1;
const FONT_PAIRINGS: Record<
  InteractiveFontPreset,
  { heading: string; body: string }
> = {
  modern: {
    heading: "'Manrope', system-ui, sans-serif",
    body: "'Manrope', system-ui, sans-serif",
  },
  classic: {
    heading: "'Playfair Display', Georgia, serif",
    body: "'Plus Jakarta Sans', system-ui, sans-serif",
  },
  ceremonial: {
    heading: "'Cinzel', Georgia, serif",
    body: "'Lora', Georgia, serif",
  },
  editorial: {
    heading: "'Cormorant Garamond', Georgia, serif",
    body: "'Inter', system-ui, sans-serif",
  },
};
const TEXT_SCALE_CLASSES: Record<
  InteractiveTextScale,
  {
    coverName: string;
    slideTitle: string;
    recipientName: string;
    body: string;
  }
> = {
  sm: {
    coverName: 'text-[16px] sm:text-[18px]',
    slideTitle: 'text-[16.5px] sm:text-[18px]',
    recipientName: 'text-[14px]',
    body: 'text-[11px]',
  },
  md: {
    coverName: 'text-[18.5px] sm:text-[20px]',
    slideTitle: 'text-[19px] sm:text-[21px]',
    recipientName: 'text-[16px]',
    body: 'text-[12px]',
  },
  lg: {
    coverName: 'text-[21px] sm:text-[23px]',
    slideTitle: 'text-[22px] sm:text-[24px]',
    recipientName: 'text-[18px]',
    body: 'text-[13px]',
  },
};
const SEAL_SIZE_MAP: Record<
  InteractiveSealSize,
  { button: string; img: string }
> = {
  sm: { button: 'w-32 h-32', img: 'w-24 h-24' },
  md: { button: 'w-40 h-40', img: 'w-32 h-32' },
  lg: { button: 'w-48 h-48', img: 'w-40 h-40' },
};

function buildWhatsAppLoUrl(phone: string, eventName: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (!digits) return '';
  const normalized = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('62')
      ? digits
      : `62${digits}`;
  const msg = encodeURIComponent(
    `Halo, saya ingin menanyakan informasi terkait acara "${eventName}".`
  );
  return `https://wa.me/${normalized}?text=${msg}`;
}

function getCardSurfaceClass(
  cardStyle: InteractiveCardStyle,
  theme: InteractiveThemeId
): string {
  if (cardStyle === 'minimal') {
    return 'bg-transparent border-transparent shadow-none px-1 py-2';
  }
  if (cardStyle === 'glass') {
    return theme === 'emerald-light'
      ? 'bg-white/60 border border-[#1F9B96]/30 shadow-md'
      : 'bg-[#13120F]/55 border border-[#D4AF37]/30 shadow-md';
  }
  return theme === 'emerald-light'
    ? 'bg-white/90 border border-[#1F9B96]/30 shadow-lg'
    : theme === 'navy-gold'
      ? 'bg-[#0E162B]/88 border border-[#D4AF37]/35 shadow-lg'
      : 'bg-[#13120F]/85 border border-[#D4AF37]/30 shadow-lg';
}

const GOLD_SPARK_VECTORS = [
  { x: -64, y: -72, size: 7, delay: 0.04 },
  { x: 58, y: -66, size: 6, delay: 0.08 },
  { x: -82, y: -10, size: 5, delay: 0.06 },
  { x: 84, y: -14, size: 6, delay: 0.1 },
  { x: -54, y: 64, size: 6, delay: 0.09 },
  { x: 60, y: 58, size: 7, delay: 0.05 },
  { x: -16, y: -88, size: 8, delay: 0.02 },
  { x: 18, y: 82, size: 5, delay: 0.11 },
];

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
  config,
  initialStatus,
  initialRepresentative,
  initialNote,
  initialSubmittedAt,
  isSimulation = false,
  embeddedPreview = false,
  previewJumpTarget = null,
  onUpdateSlide1BannerOffset,
  onBackToAdmin,
  onSubmitRsvp,
}) => {
  const effectiveConfig: InteractiveInviteConfig = useMemo(
    () => ({
      ...DEFAULT_INTERACTIVE_CONFIG,
      ...config,
      textSizes: {
        ...DEFAULT_SLIDE_TEXT_SIZES,
        ...(config?.textSizes ?? {}),
      },
      panelScales: {
        ...DEFAULT_PANEL_SCALES,
        ...(config?.panelScales ?? {}),
      },
    }),
    [config]
  );
  const textSizes = effectiveConfig.textSizes;
  const panelScales = effectiveConfig.panelScales;
  const themeStyle = THEME_STYLES[effectiveConfig.theme] ?? THEME_STYLES['gold-dark'];
  const fontPairing =
    FONT_PAIRINGS[effectiveConfig.fontPreset] ?? FONT_PAIRINGS.modern;
  const scaleStyle =
    TEXT_SCALE_CLASSES[effectiveConfig.textScale] ?? TEXT_SCALE_CLASSES.md;
  const sealSizeClasses =
    SEAL_SIZE_MAP[effectiveConfig.sealSize] ?? SEAL_SIZE_MAP.md;
  const cardSurfaceClass = getCardSurfaceClass(
    effectiveConfig.cardStyle ?? 'solid',
    effectiveConfig.theme ?? 'gold-dark'
  );
  const isLeftAligned = effectiveConfig.textAlign === 'left';
  const sealImgSrc =
    effectiveConfig.customSealDataUrl || '/media/sumbar-gold-seal.webp';
  const showSeal = effectiveConfig.showSeal !== false;
  const sealOffsetX = Math.min(
    35,
    Math.max(-35, Number(effectiveConfig.sealOffsetX ?? 0))
  );
  const sealOffsetY = Math.min(
    35,
    Math.max(-35, Number(effectiveConfig.sealOffsetY ?? 0))
  );
  const slide1BannerOffsetX = Math.min(
    80,
    Math.max(-80, Math.round(Number(effectiveConfig.slide1BannerOffsetX ?? 0)))
  );
  const slide1BannerOffsetY = Math.min(
    80,
    Math.max(-80, Math.round(Number(effectiveConfig.slide1BannerOffsetY ?? 0)))
  );
  const bannerDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const canDragSlide1Banner = Boolean(embeddedPreview && onUpdateSlide1BannerOffset);

  const handleBannerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canDragSlide1Banner || !onUpdateSlide1BannerOffset) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    bannerDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: slide1BannerOffsetX,
      origY: slide1BannerOffsetY,
    };
  };

  const handleBannerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = bannerDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !onUpdateSlide1BannerOffset) return;
    e.preventDefault();
    const nextX = Math.max(
      -80,
      Math.min(80, Math.round(drag.origX + (e.clientX - drag.startX)))
    );
    const nextY = Math.max(
      -80,
      Math.min(80, Math.round(drag.origY + (e.clientY - drag.startY)))
    );
    onUpdateSlide1BannerOffset(nextX, nextY);
  };

  const handleBannerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = bannerDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    bannerDragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  const panelOffsetY = Math.min(
    15,
    Math.max(-15, Number(effectiveConfig.panelOffsetY ?? 0))
  );
  const overlayAlpha = Math.min(
    0.9,
    Math.max(0.2, (Number(effectiveConfig.overlayDarkness ?? 60) || 60) / 100)
  );
  const effectiveVideoSpeed = Math.min(
    2.5,
    Math.max(0.75, Number(effectiveConfig.videoSpeed) || 1)
  );
  const isImageMode =
    effectiveConfig.mediaMode === 'image' &&
    Boolean(effectiveConfig.coverImageDataUrl);
  const activeCoverImg =
    effectiveConfig.coverImageDataUrl ||
    effectiveConfig.posterUrl ||
    '/media/gold-envelope-poster.webp';
  const activeOpenImg = isImageMode
    ? effectiveConfig.openImageDataUrl || effectiveConfig.coverImageDataUrl
    : effectiveConfig.openBgUrl || '/media/gold-envelope-open.webp';
  const imageOpenDurationSec = Math.min(
    3,
    Math.max(0.8, Number(effectiveConfig.openAnimDurationSec) || 1.5)
  );
  const loWhatsAppUrl = useMemo(
    () =>
      effectiveConfig.contactPhone
        ? buildWhatsAppLoUrl(effectiveConfig.contactPhone, payload.eventName)
        : '',
    [effectiveConfig.contactPhone, payload.eventName]
  );
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageTimerRef = useRef<number | null>(null);
  const hasTransitionedRef = useRef(false);
  const [phase, setPhase] = useState<'sealed' | 'opening' | 'story'>('sealed');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [slideIndex, setSlideIndex] = useState<0 | 1 | 2>(0);
  const [isPaused, setIsPaused] = useState(false);

  // Lock dark edge-to-edge background on smartphone viewports (no cyan flash or scrollbars)
  useEffect(() => {
    if (embeddedPreview) return;
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;
    const prevOverflow = document.body.style.overflow;
    document.documentElement.style.backgroundColor = '#09090B';
    document.body.style.backgroundColor = '#09090B';
    document.body.style.overflow = 'hidden';

    const onFsChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(Boolean(document.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    return () => {
      document.documentElement.style.backgroundColor = prevHtmlBg;
      document.body.style.backgroundColor = prevBodyBg;
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, [embeddedPreview]);

  const tryEnterFullscreen = () => {
    if (embeddedPreview) return;
    const el = (stageContainerRef.current ?? document.documentElement) as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    if (document.fullscreenElement || doc.webkitFullscreenElement) return;
    try {
      if (el.requestFullscreen) {
        void Promise.resolve(el.requestFullscreen()).catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        void Promise.resolve(el.webkitRequestFullscreen()).catch(() => {});
      }
    } catch {
      // iOS Safari / restricted webviews fall back smoothly to 100dvh edge-to-edge
    }
  };

  const handleToggleFullscreen = () => {
    if (embeddedPreview) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      try {
        if (document.exitFullscreen) {
          void Promise.resolve(document.exitFullscreen()).catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          void Promise.resolve(doc.webkitExitFullscreen()).catch(() => {});
        }
      } catch {
        // ignore
      }
    } else {
      tryEnterFullscreen();
    }
  };

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
    if (diff <= 0)
      return { days: 0, hours: 0, minutes: 0, seconds: 0, passed: true };
    const totalSec = Math.floor(diff / 1000);
    return {
      days: Math.floor(totalSec / 86400),
      hours: Math.floor((totalSec % 86400) / 3600),
      minutes: Math.floor((totalSec % 3600) / 60),
      seconds: totalSec % 60,
      passed: false,
    };
  }, [targetDate, nowMs]);

  // Auto-advance Story slides 0 -> 1 -> 2 using per-slide durations (0 = manual)
  const activeSlideDurationSec =
    slideIndex === 0
      ? Number(effectiveConfig.slide1DurationSec ?? effectiveConfig.slideDurationSec ?? 5)
      : slideIndex === 1
        ? Number(effectiveConfig.slide2DurationSec ?? effectiveConfig.slideDurationSec ?? 8)
        : 0;
  const slideDurationMs =
    activeSlideDurationSec > 0 ? activeSlideDurationSec * 1000 : 0;
  useEffect(() => {
    if (
      phase !== 'story' ||
      isPaused ||
      slideIndex >= 2 ||
      slideDurationMs <= 0
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setSlideIndex((prev) => (prev < 2 ? ((prev + 1) as 0 | 1 | 2) : prev));
    }, slideDurationMs);
    return () => window.clearTimeout(timer);
  }, [phase, isPaused, slideIndex, slideDurationMs]);

  // Allow Studio Preview jump buttons to switch phase/slide directly
  useEffect(() => {
    if (!previewJumpTarget) return;
    if (imageTimerRef.current) {
      window.clearTimeout(imageTimerRef.current);
      imageTimerRef.current = null;
    }
    if (previewJumpTarget.phase === 'sealed') {
      hasTransitionedRef.current = false;
      setSlideIndex(0);
      setIsPaused(false);
      setPhase('sealed');
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
      return;
    }
    if (previewJumpTarget.phase === 'opening') {
      hasTransitionedRef.current = false;
      setSlideIndex(0);
      setIsPaused(false);
      setPhase('opening');
      if (isImageMode) {
        imageTimerRef.current = window.setTimeout(() => {
          hasTransitionedRef.current = true;
          setPhase('story');
        }, Math.round(imageOpenDurationSec * 1000));
      } else if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.muted = true;
        videoRef.current.playbackRate = effectiveVideoSpeed;
        videoRef.current.play().catch(() => {
          hasTransitionedRef.current = true;
          setPhase('story');
        });
      }
      return;
    }
    hasTransitionedRef.current = true;
    setPhase('story');
    if (typeof previewJumpTarget.slideIndex === 'number') {
      setSlideIndex(previewJumpTarget.slideIndex);
    }
  }, [previewJumpTarget]);

  const enterStorySmoothly = () => {
    if (hasTransitionedRef.current) return;
    hasTransitionedRef.current = true;
    setPhase('story');
  };

  useEffect(() => {
    return () => {
      if (imageTimerRef.current) {
        window.clearTimeout(imageTimerRef.current);
      }
    };
  }, []);

  const handleBreakSeal = () => {
    hasTransitionedRef.current = false;
    setPhase('opening');

    if (isImageMode) {
      if (imageTimerRef.current) window.clearTimeout(imageTimerRef.current);
      imageTimerRef.current = window.setTimeout(() => {
        enterStorySmoothly();
      }, Math.round(imageOpenDurationSec * 1000));
      return;
    }

    const video = videoRef.current;
    if (!video) {
      enterStorySmoothly();
      return;
    }
    video.currentTime = 0;
    video.defaultPlaybackRate = effectiveVideoSpeed;
    video.playbackRate = effectiveVideoSpeed;
    video.muted = muted;
    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {
        video.muted = true;
        setMuted(true);
        video.playbackRate = effectiveVideoSpeed;
        video.play().catch(() => enterStorySmoothly());
      });
    }
  };

  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || phase !== 'opening') return;
    if (video.playbackRate !== effectiveVideoSpeed) {
      video.playbackRate = effectiveVideoSpeed;
    }
    // Start cross-fade right as the envelope finishes opening for seamless transition
    if (
      Number.isFinite(video.duration) &&
      video.duration > 1 &&
      video.currentTime >= video.duration - 0.25
    ) {
      enterStorySmoothly();
    }
  };

  const handleReplayEnvelope = () => {
    hasTransitionedRef.current = false;
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

  const mapsUrl =
    effectiveConfig.mapsUrl && /^https?:\/\//i.test(effectiveConfig.mapsUrl.trim())
      ? effectiveConfig.mapsUrl.trim()
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          payload.location || payload.eventName
        )}`;
  const gcalUrl = useMemo(() => buildGoogleCalendarUrl(payload), [payload]);

  return (
    <div
      ref={stageContainerRef}
      className={
        embeddedPreview
          ? 'w-full flex flex-col items-center justify-center select-none touch-manipulation'
          : 'fixed inset-0 w-full h-[100dvh] bg-[#09090B] text-[#F7F3EA] flex flex-col items-center justify-center md:p-5 select-none touch-manipulation overflow-hidden'
      }
    >
      {/* Simulation Top Bar for Admin Preview */}
      {isSimulation && !embeddedPreview && onBackToAdmin && (
        <div className="w-full md:max-w-[430px] md:mb-3 px-4 py-2.5 md:rounded-full bg-[#16161A] border-b md:border border-[#D4AF37]/30 flex items-center justify-between gap-3 z-20 shrink-0">
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

      {/* Edge-to-Edge Fullscreen Portrait Stage on All Smartphones (< 768px) */}
      <div
        style={{ fontFamily: fontPairing.body }}
        className={
          embeddedPreview
            ? 'relative w-full max-w-[340px] h-[680px] rounded-[30px] overflow-hidden bg-[#0E0E10] border-2 border-[#D4AF37]/40 shadow-[0_24px_60px_-20px_rgba(27,27,75,0.35)] flex flex-col text-[#F7F3EA]'
            : isFullscreen
              ? 'relative w-full h-full flex-1 min-h-0 overflow-hidden bg-[#0E0E10] flex flex-col'
              : 'relative w-full h-full flex-1 min-h-0 md:flex-none md:max-w-[420px] md:h-[min(92dvh,840px)] md:rounded-[32px] overflow-hidden bg-[#0E0E10] md:border md:border-[#D4AF37]/30 md:shadow-[0_30px_90px_-20px_rgba(212,175,55,0.28)] flex flex-col'
        }
      >
        {/* GPU-Composited 3D Background Media Layer */}
        <div
          style={{ perspective: '1200px' }}
          className="absolute inset-0 overflow-hidden bg-[#0E0E10] pointer-events-none"
        >
          {/* Open Paper / Story Crisp Background with subtle 3D depth push-in */}
          <motion.img
            src={activeOpenImg}
            alt=""
            aria-hidden="true"
            decoding="async"
            initial={false}
            animate={
              phase === 'story'
                ? { opacity: 1, scale: 1.04 }
                : isImageMode && phase === 'opening'
                  ? { opacity: 1, scale: 1.0 }
                  : { opacity: 0, scale: 0.96 }
            }
            transition={{ duration: 0.75, ease: SMOOTH_EASE }}
            className="absolute inset-0 w-full h-full object-cover will-change-[transform,opacity]"
          />

          {/* MODE A: True 3D Perspective Image Opening Engine (60fps, Zero Video Needed!) */}
          {isImageMode && phase !== 'story' && (
            <div
              style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
              className="absolute inset-0 overflow-hidden"
            >
              {effectiveConfig.imageAnimation === 'wax-seal-open' && (
                <>
                  {/* Top 3D Hinged Envelope Flap */}
                  <motion.div
                    initial={{ rotateX: 0, y: '0%', opacity: 1 }}
                    animate={
                      phase === 'opening'
                        ? { rotateX: 102, y: '-14%', opacity: 0 }
                        : { rotateX: 0, y: '0%', opacity: 1 }
                    }
                    transition={{
                      duration: imageOpenDurationSec * 0.76,
                      delay: phase === 'opening' ? imageOpenDurationSec * 0.24 : 0,
                      ease: SMOOTH_EASE,
                    }}
                    style={{
                      clipPath: 'inset(0 0 50% 0)',
                      transformOrigin: 'top center',
                      backfaceVisibility: 'hidden',
                    }}
                    className="absolute inset-0 will-change-transform shadow-[0_24px_50px_rgba(0,0,0,0.85)]"
                  >
                    <img
                      src={activeCoverImg}
                      alt=""
                      className="w-full h-full object-cover scale-[1.04]"
                    />
                  </motion.div>

                  {/* Bottom 3D Hinged Envelope Flap */}
                  <motion.div
                    initial={{ rotateX: 0, y: '0%', opacity: 1 }}
                    animate={
                      phase === 'opening'
                        ? { rotateX: -102, y: '14%', opacity: 0 }
                        : { rotateX: 0, y: '0%', opacity: 1 }
                    }
                    transition={{
                      duration: imageOpenDurationSec * 0.76,
                      delay: phase === 'opening' ? imageOpenDurationSec * 0.24 : 0,
                      ease: SMOOTH_EASE,
                    }}
                    style={{
                      clipPath: 'inset(50% 0 0 0)',
                      transformOrigin: 'bottom center',
                      backfaceVisibility: 'hidden',
                    }}
                    className="absolute inset-0 will-change-transform shadow-[0_-24px_50px_rgba(0,0,0,0.85)]"
                  >
                    <img
                      src={activeCoverImg}
                      alt=""
                      className="w-full h-full object-cover scale-[1.04]"
                    />
                  </motion.div>
                </>
              )}

              {effectiveConfig.imageAnimation === 'gate-split' && (
                <>
                  {/* Left 3D Swinging Royal Gate Door */}
                  <motion.div
                    initial={{ rotateY: 0, x: '0%', opacity: 1 }}
                    animate={
                      phase === 'opening'
                        ? { rotateY: -98, x: '-12%', opacity: 0 }
                        : { rotateY: 0, x: '0%', opacity: 1 }
                    }
                    transition={{
                      duration: imageOpenDurationSec * 0.85,
                      delay: phase === 'opening' ? imageOpenDurationSec * 0.12 : 0,
                      ease: SMOOTH_EASE,
                    }}
                    style={{
                      clipPath: 'inset(0 50% 0 0)',
                      transformOrigin: 'left center',
                      backfaceVisibility: 'hidden',
                    }}
                    className="absolute inset-0 will-change-transform"
                  >
                    <img
                      src={activeCoverImg}
                      alt=""
                      className="w-full h-full object-cover scale-[1.04]"
                    />
                  </motion.div>

                  {/* Right 3D Swinging Royal Gate Door */}
                  <motion.div
                    initial={{ rotateY: 0, x: '0%', opacity: 1 }}
                    animate={
                      phase === 'opening'
                        ? { rotateY: 98, x: '12%', opacity: 0 }
                        : { rotateY: 0, x: '0%', opacity: 1 }
                    }
                    transition={{
                      duration: imageOpenDurationSec * 0.85,
                      delay: phase === 'opening' ? imageOpenDurationSec * 0.12 : 0,
                      ease: SMOOTH_EASE,
                    }}
                    style={{
                      clipPath: 'inset(0 0 0 50%)',
                      transformOrigin: 'right center',
                      backfaceVisibility: 'hidden',
                    }}
                    className="absolute inset-0 will-change-transform"
                  >
                    <img
                      src={activeCoverImg}
                      alt=""
                      className="w-full h-full object-cover scale-[1.04]"
                    />
                  </motion.div>

                  {phase === 'opening' && (
                    <motion.div
                      initial={{ opacity: 0.95, scaleX: 1 }}
                      animate={{ opacity: 0, scaleX: 18 }}
                      transition={{
                        duration: imageOpenDurationSec * 0.7,
                        ease: SMOOTH_EASE,
                      }}
                      className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-gradient-to-b from-transparent via-[#FCE9B2] to-transparent"
                    />
                  )}
                </>
              )}

              {effectiveConfig.imageAnimation === 'curtain-up' && (
                <motion.div
                  initial={{ rotateX: 0, y: '0%', opacity: 1 }}
                  animate={
                    phase === 'opening'
                      ? { rotateX: 28, y: '-108%', opacity: 0.4 }
                      : { rotateX: 0, y: '0%', opacity: 1 }
                  }
                  transition={{
                    duration: imageOpenDurationSec * 0.88,
                    ease: SMOOTH_EASE,
                  }}
                  style={{ transformOrigin: 'top center' }}
                  className="absolute inset-0 will-change-transform border-b-2 border-[#E8C56E]/90 shadow-[0_24px_60px_rgba(0,0,0,0.9)]"
                >
                  <img
                    src={activeCoverImg}
                    alt=""
                    className="w-full h-full object-cover scale-[1.04]"
                  />
                </motion.div>
              )}

              {effectiveConfig.imageAnimation === 'ken-burns' && (
                <motion.div
                  initial={{ scale: 1, rotateX: 0, opacity: 1 }}
                  animate={
                    phase === 'opening'
                      ? { scale: 1.24, rotateX: 6, opacity: 0 }
                      : { scale: 1, rotateX: 0, opacity: 1 }
                  }
                  transition={{
                    duration: imageOpenDurationSec * 0.95,
                    ease: SMOOTH_EASE,
                  }}
                  className="absolute inset-0 will-change-transform"
                >
                  <img
                    src={activeCoverImg}
                    alt=""
                    className="w-full h-full object-cover scale-[1.04]"
                  />
                </motion.div>
              )}
            </div>
          )}

          {/* MODE B: Video Opening Engine */}
          {!isImageMode && (
            <video
              key={effectiveConfig.videoUrl}
              ref={videoRef}
              src={effectiveConfig.videoUrl || '/media/gold-envelope-intro.mp4?v=2'}
              poster={effectiveConfig.posterUrl || '/media/gold-envelope-poster.webp'}
              playsInline
              preload="auto"
              onTimeUpdate={handleVideoTimeUpdate}
              onEnded={enterStorySmoothly}
              className={`absolute inset-0 w-full h-full object-cover scale-[1.04] transition-opacity duration-500 ease-out will-change-[opacity] ${
                phase === 'story' ? 'opacity-0' : 'opacity-100'
              }`}
            />
          )}

          {/* 3D Gold Wax Seal — Burst & Spin-Dissolve on Open */}
          {phase === 'opening' && showSeal && (
            <div
              style={{
                perspective: '900px',
                transform: `translate3d(${sealOffsetX}%, ${sealOffsetY}%, 0)`,
              }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
            >
              <motion.img
                src={sealImgSrc}
                alt=""
                aria-hidden="true"
                initial={{ opacity: 1, scale: 1, rotateY: 0, rotateZ: 0 }}
                animate={{
                  opacity: [1, 0.95, 0],
                  scale: [1, 1.32, 1.85],
                  rotateY: [0, 95, 195],
                  rotateZ: [0, 8, 16],
                  filter: ['brightness(1) blur(0px)', 'brightness(1.7) blur(2px)', 'brightness(2.2) blur(10px)'],
                }}
                transition={{
                  duration: Math.min(1.2, Math.max(0.55, imageOpenDurationSec * 0.5)),
                  ease: SMOOTH_EASE,
                }}
                className={`${sealSizeClasses.img} object-contain drop-shadow-[0_14px_28px_rgba(0,0,0,0.85)] will-change-transform`}
              />
              {GOLD_SPARK_VECTORS.map((spark, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0.95, scale: 0.5, x: 0, y: 0 }}
                  animate={{
                    opacity: 0,
                    scale: [0.5, 1.4, 0.2],
                    x: spark.x,
                    y: spark.y,
                  }}
                  transition={{
                    duration: Math.min(1.25, Math.max(0.6, imageOpenDurationSec * 0.55)),
                    delay: spark.delay,
                    ease: SMOOTH_EASE,
                  }}
                  style={{ width: spark.size, height: spark.size }}
                  className="absolute rounded-full bg-[#FCE9B2] shadow-[0_0_12px_#F0D483] will-change-transform"
                />
              ))}
            </div>
          )}

          {/* Clean gradient vignette with customizable darkness for effortless text legibility */}
          <div
            aria-hidden="true"
            style={
              phase === 'story'
                ? {
                    background:
                      effectiveConfig.theme === 'emerald-light'
                        ? `linear-gradient(to bottom, rgba(255,255,255,${Math.min(0.92, overlayAlpha + 0.12)}), rgba(255,255,255,${Math.max(0.25, overlayAlpha - 0.12)}), rgba(255,255,255,${Math.min(0.95, overlayAlpha + 0.16)}))`
                        : effectiveConfig.theme === 'navy-gold'
                          ? `linear-gradient(to bottom, rgba(8,15,32,${Math.min(0.95, overlayAlpha + 0.15)}), rgba(11,21,44,${Math.max(0.15, overlayAlpha - 0.15)}), rgba(8,15,32,${Math.min(0.96, overlayAlpha + 0.2)}))`
                          : `linear-gradient(to bottom, rgba(0,0,0,${Math.min(0.92, overlayAlpha + 0.12)}), rgba(0,0,0,${Math.max(0.12, overlayAlpha - 0.18)}), rgba(0,0,0,${Math.min(0.95, overlayAlpha + 0.18)}))`,
                  }
                : undefined
            }
            className={`absolute inset-0 transition-opacity duration-700 ease-out ${
              phase === 'opening'
                ? 'bg-gradient-to-t from-black/45 via-transparent to-black/25'
                : phase === 'story'
                  ? ''
                  : 'bg-gradient-to-b from-black/75 via-black/15 to-black/80'
            }`}
          />
        </div>

        {/* PHASE 1: SEALED ENVELOPE OVERLAY (bounded height for 1:1 parity on all Android ratios) */}
        <AnimatePresence>
          {phase === 'sealed' && (
            <motion.div
              key="sealed-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.14 } }}
              transition={{ duration: 0.45, ease: SMOOTH_EASE }}
              className="relative z-10 flex-1 flex flex-col justify-between w-full max-h-[660px] my-auto px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.75rem,env(safe-area-inset-bottom))] text-center"
            >
              {/* Top Personalized Recipient Calligraphy */}
              <motion.div
                initial={{ opacity: 0, y: -10, scale: panelScales.cover / 100 }}
                animate={{ opacity: 1, y: 0, scale: panelScales.cover / 100 }}
                transition={{ duration: 0.45, ease: SMOOTH_EASE }}
                style={{ transformOrigin: 'top center' }}
                className="max-w-[330px] mx-auto space-y-1.5 drop-shadow-[0_2px_12px_rgba(0,0,0,0.92)]"
              >
                <div
                  style={{ fontSize: `${textSizes.coverBadge}px` }}
                  className="font-bold uppercase tracking-[0.26em] text-[#E6C775]"
                >
                  {effectiveConfig.coverBadge || 'Undangan Resmi'}
                </div>
                <div className="text-[13.5px] font-medium text-[#F5EFE0]/90 pt-1.5">
                  {payload.salutation}
                </div>
                <h1
                  style={{ fontFamily: fontPairing.heading }}
                  className={`font-extrabold ${scaleStyle.coverName} leading-snug text-transparent bg-clip-text bg-gradient-to-b from-[#FFF1C4] via-[#E8C56E] to-[#C69738] break-words`}
                >
                  {payload.recipientName}
                </h1>
                {payload.institution && (
                  <p className="text-[13.5px] font-medium text-[#EBE4D1]/90 leading-snug break-words">
                    {payload.institution}
                  </p>
                )}
              </motion.div>

              {/* Center Interactive 3D Gold Wax Seal (X + Y positionable) */}
              <div
                style={{
                  perspective: '900px',
                  transform: `translate3d(${sealOffsetX}%, ${sealOffsetY}%, 0)`,
                }}
                className="flex items-center justify-center my-auto transition-transform duration-150"
              >
                {showSeal ? (
                  <motion.button
                    type="button"
                    onClick={handleBreakSeal}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.92 }}
                    aria-label="Sentuh segel emas untuk membuka undangan"
                    className={`group relative ${sealSizeClasses.button} rounded-full flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0D483]`}
                  >
                    {/* Pulsing Golden Aura Halo */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(240,212,131,0.42)_0%,rgba(212,175,55,0.14)_52%,transparent_72%)] animate-pulse"
                      style={{ animationDuration: '2.8s' }}
                    />
                    {/* Expanding Gold Ripple Ring */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-3 rounded-full border border-[#F0D483]/50 animate-ping"
                      style={{ animationDuration: '2.4s' }}
                    />
                    {/* 3D Floating & Tilting Metallic Seal Medallion */}
                    <motion.div
                      animate={{
                        rotateY: [-9, 9, -9],
                        rotateX: [5, -5, 5],
                        y: [0, -5, 0],
                      }}
                      transition={{
                        duration: 4.8,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      style={{ transformStyle: 'preserve-3d' }}
                      className={`relative ${sealSizeClasses.img} flex items-center justify-center will-change-transform`}
                    >
                      <img
                        src={sealImgSrc}
                        alt="Segel Emas Pembuka Undangan"
                        className={`${sealSizeClasses.img} object-contain drop-shadow-[0_14px_24px_rgba(0,0,0,0.88)] select-none pointer-events-none`}
                      />
                      {/* Periodic Metallic Specular Sheen */}
                      <span
                        aria-hidden="true"
                        className="absolute inset-2 rounded-full overflow-hidden pointer-events-none"
                      >
                        <motion.span
                          animate={{ x: ['-140%', '180%'] }}
                          transition={{
                            duration: 2.2,
                            repeat: Infinity,
                            repeatDelay: 2.6,
                            ease: 'easeInOut',
                          }}
                          className="block w-1/2 h-full -skew-x-20 bg-gradient-to-r from-transparent via-[#FFF7D6]/45 to-transparent"
                        />
                      </span>
                    </motion.div>
                    <span className="sr-only">Buka Undangan</span>
                  </motion.button>
                ) : (
                  <button
                    type="button"
                    onClick={handleBreakSeal}
                    aria-label="Sentuh untuk membuka undangan"
                    className="w-28 h-28 rounded-full border border-[#F0D483]/30 bg-[#D4AF37]/5 active:scale-95 transition-transform"
                  >
                    <span className="sr-only">Buka Undangan</span>
                  </button>
                )}
              </div>

              {/* Bottom Smartphone-Friendly CTA */}
              <motion.div
                initial={{ opacity: 0, y: 12, scale: panelScales.cover / 100 }}
                animate={{ opacity: 1, y: 0, scale: panelScales.cover / 100 }}
                transition={{ duration: 0.45, delay: 0.1, ease: SMOOTH_EASE }}
                style={{ transformOrigin: 'bottom center' }}
                className="space-y-3.5"
              >
                <button
                  type="button"
                  onClick={handleBreakSeal}
                  style={{ fontSize: `${textSizes.openButtonText}px` }}
                  className={`w-full max-w-[300px] min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r ${themeStyle.ctaBg} ${themeStyle.ctaText} font-display font-extrabold tracking-wide shadow-[0_12px_32px_-6px_rgba(223,180,84,0.6)] active:scale-[0.98] transition-transform`}
                >
                  <span>
                    {effectiveConfig.openButtonText || 'Sentuh Segel untuk Membuka'}
                  </span>
                </button>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setSlideIndex(2);
                      enterStorySmoothly();
                    }}
                    className="py-1.5 px-3 text-[12.5px] font-medium text-[#E6DEC8]/80 hover:text-[#FCE9B2] underline underline-offset-4 transition-colors"
                  >
                    Langsung ke Konfirmasi RSVP
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PHASE 2: OPENING VIDEO CONTROLS */}
        <AnimatePresence>
          {phase === 'opening' && (
            <motion.div
              key="opening-controls"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="relative z-10 flex items-center justify-end gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]"
            >
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={muted ? 'Aktifkan suara' : 'Bisukan suara'}
                className="w-10 h-10 rounded-full bg-black/65 border border-[#D4AF37]/40 text-[#F4DDA0] flex items-center justify-center active:scale-95 transition-transform"
              >
                {muted ? (
                  <VolumeX className="w-4.5 h-4.5" />
                ) : (
                  <Volume2 className="w-4.5 h-4.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  videoRef.current?.pause();
                  enterStorySmoothly();
                }}
                className="min-h-[40px] px-4 rounded-full bg-black/65 border border-[#D4AF37]/40 text-[12.5px] font-semibold text-[#F4DDA0] active:scale-95 transition-transform"
              >
                Lewati →
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PHASE 3: INTERACTIVE 3-SLIDE STORY OVER OPEN BLACK EMBOSSED PAPER */}
        {phase === 'story' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.55, ease: SMOOTH_EASE }}
            className="relative z-10 flex-1 flex flex-col min-h-0"
          >
            {/* Fixed Top Story Progress Bar + Controls */}
            <div className="px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2.5 space-y-3 shrink-0">
              <div className="grid grid-cols-3 gap-2" aria-label="Progres undangan">
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
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          style={{ transformOrigin: 'left' }}
                          transition={{
                            duration: slideDurationMs / 1000,
                            ease: 'linear',
                          }}
                          className="h-full w-full bg-gradient-to-r from-[#FCE9B2] to-[#D4AF37] will-change-transform"
                        />
                      ) : (
                        <div className="h-full w-full bg-[#E8C56E]" />
                      )
                    ) : null}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] font-bold uppercase tracking-[0.18em] text-[#E6C775]">
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
                      className="w-9 h-9 rounded-full bg-[#151410]/85 border border-[#D4AF37]/35 text-[#F4DDA0] flex items-center justify-center active:scale-95 transition-transform"
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
                    className="w-9 h-9 rounded-full bg-[#151410]/85 border border-[#D4AF37]/35 text-[#F4DDA0] flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  {!embeddedPreview && (
                    <button
                      type="button"
                      onClick={handleToggleFullscreen}
                      title={isFullscreen ? 'Keluar layar penuh' : 'Mode layar penuh'}
                      aria-label={isFullscreen ? 'Keluar layar penuh' : 'Mode layar penuh'}
                      className="w-9 h-9 rounded-full bg-[#151410]/85 border border-[#D4AF37]/35 text-[#F4DDA0] flex items-center justify-center active:scale-95 transition-transform"
                    >
                      {isFullscreen ? (
                        <Minimize2 className="w-3.5 h-3.5" />
                      ) : (
                        <Maximize2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  {slideIndex !== 2 && (
                    <button
                      type="button"
                      onClick={() => setSlideIndex(2)}
                      className="h-9 px-3.5 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[12px] font-bold text-[#FCE9B2] active:scale-95 transition-transform"
                    >
                      RSVP
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Smooth Scrollable Safe-Zone Positioned Slide Area (Android-compact) */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-2 flex flex-col">
              <div
                style={{
                  transform: (() => {
                    const activeScale =
                      slideIndex === 0
                        ? panelScales.slide1
                        : slideIndex === 1
                          ? panelScales.slide2
                          : panelScales.slide3;
                    const parts: string[] = [];
                    if (panelOffsetY !== 0) parts.push(`translateY(${panelOffsetY}%)`);
                    if (activeScale !== 100) parts.push(`scale(${activeScale / 100})`);
                    return parts.length > 0 ? parts.join(' ') : undefined;
                  })(),
                  transformOrigin:
                    effectiveConfig.panelPosition === 'top'
                      ? 'top center'
                      : effectiveConfig.panelPosition === 'bottom'
                        ? 'bottom center'
                        : 'center center',
                }}
                className={`w-full transition-transform duration-300 ${
                  effectiveConfig.panelPosition === 'top'
                    ? 'mb-auto pt-1'
                    : effectiveConfig.panelPosition === 'bottom'
                      ? 'mt-auto pb-1'
                      : 'my-auto'
                }`}
              >
                <AnimatePresence mode="wait">
                  {slideIndex === 0 && (
                    <motion.div
                      key="slide-0"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.38, ease: SMOOTH_EASE }}
                      className={`${isLeftAligned ? 'text-left' : 'text-center'} space-y-3`}
                    >
                      <div className="inline-flex items-center px-3 py-1 rounded-full border border-[#D4AF37]/40 bg-[#15130E]/85 text-[11px] font-semibold text-[#F4DDA0] max-w-full">
                        <span className="truncate">{payload.organizer}</span>
                      </div>

                      <div className="space-y-1.5 px-1">
                        <p
                          style={{ fontSize: `${textSizes.slide1Heading}px` }}
                          className="font-semibold tracking-[0.2em] uppercase text-[#E6DEC8]/80"
                        >
                          {effectiveConfig.slide1Heading || 'Dengan Hormat Mengundang'}
                        </p>
                        <h2
                          style={{ fontFamily: fontPairing.heading }}
                          className={`font-extrabold ${scaleStyle.slideTitle} leading-snug text-transparent bg-clip-text bg-gradient-to-b ${themeStyle.titleGradient} break-words`}
                        >
                          {payload.eventName}
                        </h2>
                      </div>

                      {effectiveConfig.slide1BannerDataUrl ? (
                        <div
                          onPointerDown={handleBannerPointerDown}
                          onPointerMove={handleBannerPointerMove}
                          onPointerUp={handleBannerPointerUp}
                          onPointerCancel={handleBannerPointerUp}
                          style={
                            slide1BannerOffsetX !== 0 || slide1BannerOffsetY !== 0
                              ? {
                                  transform: `translate3d(${slide1BannerOffsetX}px, ${slide1BannerOffsetY}px, 0)`,
                                }
                              : undefined
                          }
                          className={`relative z-10 w-full aspect-[3/2] ${
                            effectiveConfig.slide1BannerDataUrl.startsWith(
                              'data:image/png'
                            )
                              ? 'flex items-center justify-center bg-transparent'
                              : 'rounded-2xl overflow-hidden border border-[#D4AF37]/35 bg-transparent shadow-md'
                          } ${
                            canDragSlide1Banner
                              ? 'touch-none select-none cursor-grab active:cursor-grabbing ring-1 ring-dashed ring-[#D4AF37]/50'
                              : ''
                          }`}
                        >
                          <img
                            src={effectiveConfig.slide1BannerDataUrl}
                            alt={`Gambar ${payload.eventName}`}
                            loading="eager"
                            decoding="async"
                            draggable={false}
                            className={`w-full h-full block pointer-events-none ${
                              effectiveConfig.slide1BannerDataUrl.startsWith(
                                'data:image/png'
                              )
                                ? 'object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]'
                                : 'object-cover'
                            }`}
                          />
                          {canDragSlide1Banner && (
                            <span className="pointer-events-none absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full bg-black/65 border border-[#D4AF37]/45 text-[9.5px] font-semibold text-[#FCE9B2]">
                              Geser ({slide1BannerOffsetX}, {slide1BannerOffsetY})
                            </span>
                          )}
                        </div>
                      ) : (
                        <div
                          aria-hidden="true"
                          className={`${isLeftAligned ? '' : 'mx-auto'} w-16 h-px bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent`}
                        />
                      )}

                      <div
                        className={`rounded-2xl ${cardSurfaceClass} p-3.5 space-y-1`}
                      >
                        <div className={`text-[11px] font-medium ${themeStyle.accentText}`}>
                          {payload.salutation}
                        </div>
                        <div
                          style={{ fontFamily: fontPairing.heading }}
                          className={`font-extrabold ${scaleStyle.recipientName} leading-snug ${themeStyle.bodyText} break-words`}
                        >
                          {payload.recipientName}
                        </div>
                        {payload.institution && (
                          <div className={`${scaleStyle.body} ${themeStyle.mutedText} leading-snug break-words`}>
                            {payload.institution}
                          </div>
                        )}
                        <div className="pt-1.5 text-[10.5px] font-medium text-[#D9C79E]/70 tabular-nums">
                          Kode Undangan: {payload.invitationCode}
                        </div>
                      </div>

                      <p
                        style={{ fontSize: `${textSizes.welcomeNote}px` }}
                        className={`${themeStyle.mutedText} leading-relaxed max-w-[290px] ${
                          isLeftAligned ? '' : 'mx-auto'
                        }`}
                      >
                        {effectiveConfig.welcomeNote ||
                          'Merupakan suatu kehormatan bagi kami apabila Bapak/Ibu berkenan hadir pada kegiatan tersebut.'}
                      </p>
                    </motion.div>
                  )}

                  {slideIndex === 1 && (
                    <motion.div
                      key="slide-1"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.38, ease: SMOOTH_EASE }}
                      className="space-y-2.5"
                    >
                      <div className={`${isLeftAligned ? 'text-left' : 'text-center'} space-y-0.5 px-1`}>
                        <div
                          style={{ fontSize: `${textSizes.slide2Heading}px` }}
                          className={`font-bold uppercase tracking-[0.2em] ${themeStyle.accentText}`}
                        >
                          {effectiveConfig.slide2Heading || 'Pelaksanaan Kegiatan'}
                        </div>
                        <h2
                          style={{ fontFamily: fontPairing.heading }}
                          className={`font-extrabold ${scaleStyle.recipientName} ${themeStyle.bodyText} leading-snug break-words`}
                        >
                          {payload.eventName}
                        </h2>
                      </div>

                      {/* Live Countdown */}
                      {effectiveConfig.showCountdown && countdown && (
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { label: 'Hari', val: countdown.days },
                            { label: 'Jam', val: countdown.hours },
                            { label: 'Menit', val: countdown.minutes },
                            { label: 'Detik', val: countdown.seconds },
                          ].map((unit) => (
                            <div
                              key={unit.label}
                              className={`rounded-xl ${cardSurfaceClass} py-2 px-1 text-center`}
                            >
                              <div
                                style={{ fontFamily: fontPairing.heading }}
                                className={`font-extrabold text-[17px] ${themeStyle.accentText} tabular-nums leading-none`}
                              >
                                {String(unit.val).padStart(2, '0')}
                              </div>
                              <div className={`text-[9.5px] font-semibold uppercase tracking-wider ${themeStyle.mutedText} mt-1`}>
                                {unit.label}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Date / Time / Location Card */}
                      <div className={`rounded-2xl ${cardSurfaceClass} p-3.5 space-y-2.5 ${scaleStyle.body}`}>
                        {payload.date && (
                          <div className="flex items-start gap-2.5">
                            <Clock className="w-4 h-4 text-[#E8C56E] shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className={`text-[10px] font-semibold uppercase tracking-wider ${themeStyle.mutedText}`}>
                                Tanggal & Waktu
                              </div>
                              <div className={`font-bold text-[13px] ${themeStyle.bodyText} mt-0.5 leading-snug`}>
                                {payload.date}
                              </div>
                              {payload.time && (
                                <div className={`text-[11.5px] ${themeStyle.mutedText} mt-0.5`}>
                                  {payload.time}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {payload.location && (
                          <div className="flex items-start gap-2.5 pt-2.5 border-t border-[#D4AF37]/20">
                            <MapPin className="w-4 h-4 text-[#E8C56E] shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className={`text-[10px] font-semibold uppercase tracking-wider ${themeStyle.mutedText}`}>
                                Lokasi Acara
                              </div>
                              <div className={`font-bold text-[12.5px] ${themeStyle.bodyText} mt-0.5 leading-snug break-words`}>
                                {payload.location}
                              </div>
                            </div>
                          </div>
                        )}

                        {effectiveConfig.dresscode && (
                          <div className="pt-2 border-t border-[#D4AF37]/20 text-[11.5px]">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${themeStyle.mutedText} block`}>
                              Dresscode / Catatan Pakaian
                            </span>
                            <span className={`font-semibold ${themeStyle.accentText} mt-0.5 block`}>
                              {effectiveConfig.dresscode}
                            </span>
                          </div>
                        )}

                        {effectiveConfig.slide2ExtraNote && (
                          <div className="pt-2 border-t border-[#D4AF37]/20">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${themeStyle.mutedText} block`}>
                              Informasi Tambahan
                            </span>
                            <p
                              style={{ fontSize: `${textSizes.slide2ExtraNote}px` }}
                              className={`${themeStyle.bodyText} mt-0.5 leading-relaxed whitespace-pre-line break-words`}
                            >
                              {effectiveConfig.slide2ExtraNote}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Android-Compact Action Buttons */}
                      <div className="space-y-1.5">
                        <div
                          className={`grid gap-2 ${
                            effectiveConfig.showCalendarButton !== false
                              ? 'grid-cols-2'
                              : 'grid-cols-1'
                          }`}
                        >
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-full border border-[#D4AF37]/45 bg-[#1B1811]/90 hover:bg-[#D4AF37]/20 text-[12px] font-bold text-[#FCE9B2] active:scale-[0.98] transition-all"
                          >
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span>Buka Peta</span>
                          </a>
                          {effectiveConfig.showCalendarButton !== false && (
                            <a
                              href={gcalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-full border border-[#D4AF37]/45 bg-[#1B1811]/90 hover:bg-[#D4AF37]/20 text-[12px] font-bold text-[#FCE9B2] active:scale-[0.98] transition-all"
                            >
                              <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
                              <span>Kalender</span>
                            </a>
                          )}
                        </div>

                        {loWhatsAppUrl && (
                          <a
                            href={loWhatsAppUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 py-1.5 px-3.5 rounded-full border border-emerald-400/40 bg-emerald-950/75 hover:bg-emerald-900/75 text-[11.5px] font-semibold text-emerald-200 active:scale-[0.98] transition-all"
                          >
                            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              Narahubung: {effectiveConfig.contactName || effectiveConfig.contactPhone}
                            </span>
                          </a>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {slideIndex === 2 && (
                    <motion.div
                      key="slide-2"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.38, ease: SMOOTH_EASE }}
                    >
                      {!editing && submittedAt ? (
                        <div className="rounded-2xl border border-[#D4AF37]/35 bg-[#13120F]/90 p-4 text-center space-y-3 shadow-lg">
                          <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-[#FCE9B2] to-[#C69535] flex items-center justify-center text-[#151109] shadow-md">
                            <Check className="w-5 h-5 stroke-[2.8]" />
                          </div>

                          <div>
                            <h2
                              style={{
                                fontFamily: fontPairing.heading,
                                fontSize: `${textSizes.slide3SuccessTitle}px`,
                              }}
                              className="font-extrabold text-[#FCE9B2]"
                            >
                              {effectiveConfig.slide3SuccessTitle ||
                                'Konfirmasi Kehadiran Tercatat'}
                            </h2>
                            <p
                              style={{ fontSize: `${textSizes.slide3SuccessNote}px` }}
                              className="text-[#E6DEC8]/85 mt-0.5 leading-relaxed"
                            >
                              {effectiveConfig.slide3SuccessNote ||
                                'Terima kasih, konfirmasi Anda telah tersimpan secara online untuk panitia.'}
                            </p>
                          </div>

                          <div className="rounded-xl border border-[#D4AF37]/25 bg-black/45 p-3 text-left space-y-2 text-[12px]">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[#D9C79E]/80 shrink-0">Nama</span>
                              <span className="font-bold text-[#FDFBF7] text-right break-words">
                                {payload.recipientName}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[#D9C79E]/80 shrink-0">Status</span>
                              <span className="font-bold text-[#FCE9B2]">
                                {getRsvpLabel(selectedStatus)}
                              </span>
                            </div>
                            {representative && (
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[#D9C79E]/80 shrink-0">
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
                                <div className="text-[10.5px] text-[#D9C79E]/75">
                                  Catatan:
                                </div>
                                <div className="text-[#FDFBF7] mt-0.5 leading-snug">
                                  {note}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => setEditing(true)}
                              className="w-full min-h-[40px] px-4 py-2 rounded-full border border-[#D4AF37]/45 bg-transparent text-[12px] font-semibold text-[#FCE9B2] hover:bg-[#D4AF37]/15 active:scale-[0.98] transition-all"
                            >
                              Ubah Konfirmasi Kehadiran
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (onBackToAdmin) {
                                  onBackToAdmin();
                                  return;
                                }
                                try {
                                  window.close();
                                } catch {
                                  // Browser may block programmatic close
                                }
                                handleReplayEnvelope();
                              }}
                              className="w-full min-h-[40px] px-4 py-2 rounded-full border border-white/20 bg-white/10 text-[12px] font-semibold text-[#E6DEC8] hover:bg-white/15 active:scale-[0.98] transition-all"
                            >
                              Tutup
                            </button>
                          </div>
                        </div>
                      ) : (
                        <form
                          onSubmit={handleRsvpSubmit}
                          className="rounded-2xl border border-[#D4AF37]/30 bg-[#13120F]/90 p-3.5 space-y-2.5 shadow-lg"
                        >
                          <div className="text-center space-y-0.5">
                            <h2
                              style={{
                                fontFamily: fontPairing.heading,
                                fontSize: `${textSizes.slide3Heading}px`,
                              }}
                              className="font-extrabold text-[#FCE9B2]"
                            >
                              {effectiveConfig.slide3Heading || 'Konfirmasi Kehadiran'}
                            </h2>
                            <p className="text-[11.5px] text-[#E6DEC8]/85 break-words">
                              {payload.salutation} {payload.recipientName}
                            </p>
                          </div>

                          <fieldset className="border-0 p-0 m-0">
                            <legend className="sr-only">Pilihan Status Kehadiran</legend>
                            <div
                              role="radiogroup"
                              aria-label="Pilihan Status Kehadiran"
                              className="grid grid-cols-1 gap-1.5"
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
                                    className={`min-h-[42px] flex items-center justify-between gap-2.5 px-3 py-1.5 rounded-xl border text-left transition-colors ${
                                      active
                                        ? 'border-[#E8C56E] bg-[#D4AF37]/20 ring-1 ring-[#E8C56E]/40'
                                        : 'border-white/15 bg-black/35 hover:border-[#D4AF37]/40'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="font-bold text-[12.5px] text-[#FDFBF7] leading-tight">
                                        {choice.title}
                                      </div>
                                      <div className="text-[10.5px] text-[#D9C79E]/80 mt-0.5 leading-tight">
                                        {choice.desc}
                                      </div>
                                    </div>
                                    <span
                                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                        active
                                          ? 'border-[#FCE9B2] bg-[#E8C56E] text-[#151109]'
                                          : 'border-white/30'
                                      }`}
                                    >
                                      {active && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </fieldset>

                          {selectedStatus === 'attending' && (
                            <div className="pt-1.5 border-t border-[#D4AF37]/15 space-y-1.5">
                              <label
                                htmlFor="invite-attending-count"
                                className="block text-[11.5px] font-semibold text-[#E6C775]"
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
                                      className={`min-h-[34px] px-1 rounded-full border text-[11.5px] font-bold transition-colors text-center ${
                                        isSelected
                                          ? 'border-[#E8C56E] bg-[#D4AF37]/25 text-[#FCE9B2]'
                                          : 'border-white/15 bg-black/35 text-[#E6DEC8]/85 hover:border-[#D4AF37]/45'
                                      }`}
                                    >
                                      {opt.label}
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
                                className="w-full min-h-[38px] rounded-xl border border-white/18 bg-black/45 px-3 py-1.5 text-[12.5px] text-[#FDFBF7] placeholder:text-[#D9C79E]/45 focus:outline-none focus:ring-2 focus:ring-[#E8C56E]"
                              />
                            </div>
                          )}

                          {selectedStatus === 'represented' && (
                            <div className="pt-1.5 border-t border-[#D4AF37]/15 space-y-1">
                              <label
                                htmlFor="invite-rep-name"
                                className="block text-[11.5px] font-semibold text-[#E6C775]"
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
                                className="w-full min-h-[38px] rounded-xl border border-white/18 bg-black/45 px-3 py-1.5 text-[12.5px] text-[#FDFBF7] placeholder:text-[#D9C79E]/45 focus:outline-none focus:ring-2 focus:ring-[#E8C56E]"
                              />
                            </div>
                          )}

                          <div
                            className={
                              selectedStatus === 'declined'
                                ? 'pt-1.5 border-t border-[#D4AF37]/15 space-y-1'
                                : 'pt-0.5 space-y-1'
                            }
                          >
                            <label
                              htmlFor="invite-note"
                              className="block text-[11.5px] font-semibold text-[#E6C775]"
                            >
                              Catatan (Opsional)
                            </label>
                            <textarea
                              id="invite-note"
                              rows={2}
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="Catatan untuk panitia..."
                              className="w-full rounded-xl border border-white/18 bg-black/45 px-3 py-1.5 text-[12.5px] text-[#FDFBF7] placeholder:text-[#D9C79E]/45 focus:outline-none focus:ring-2 focus:ring-[#E8C56E]"
                            />
                          </div>

                          <div className="pt-0.5">
                            <button
                              type="submit"
                              disabled={submitting}
                              className="w-full min-h-[42px] py-2 px-4 rounded-full bg-gradient-to-r from-[#F3D88B] via-[#DFB454] to-[#C69535] text-[#151109] font-display font-extrabold text-[13px] shadow-md active:scale-[0.98] transition-transform disabled:opacity-50"
                            >
                              {submitting
                                ? 'Menyimpan Konfirmasi...'
                                : 'Kirim Konfirmasi Kehadiran'}
                            </button>
                          </div>
                        </form>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Fixed Bottom Smartphone Navigation Controls */}
            <div className="px-4 pt-2 pb-[max(0.85rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-2.5 shrink-0">
              <button
                type="button"
                disabled={slideIndex === 0}
                onClick={() =>
                  setSlideIndex((prev) =>
                    prev > 0 ? ((prev - 1) as 0 | 1 | 2) : prev
                  )
                }
                className="min-h-[38px] inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full border border-[#D4AF37]/35 bg-[#151410]/85 text-[12px] font-semibold text-[#F4DDA0] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
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
                  className="min-h-[38px] inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#F0D483] to-[#C89B3C] text-[#151109] text-[12px] font-extrabold active:scale-95 transition-transform"
                >
                  <span>{slideIndex === 1 ? 'Isi RSVP' : 'Lanjut'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <span className="text-[11px] font-medium text-[#D9C79E]/65 pr-1">
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
