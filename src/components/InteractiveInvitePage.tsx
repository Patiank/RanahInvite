import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  ChevronDown,
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
  DEFAULT_RSVP_RECEIPT_CONFIG,
  DEFAULT_SLIDE_EXTRAS,
  DEFAULT_SLIDE_TEXT_SIZES,
  InteractiveCardStyle,
  InteractiveFontPreset,
  InteractiveInviteConfig,
  InteractiveSealSize,
  InteractiveSlideExtras,
  InteractiveTextScale,
  InteractiveThemeId,
  RsvpPayload,
  RsvpStatus,
} from '../types';
import {
  ensureGoogleFontsLoaded,
  getStudioFontCssFamily,
  isValidStudioFontId,
} from '../utils/fonts';
import { getRsvpLabel } from '../utils/rsvp';
import { fetchCloudVideoFromCloud } from '../utils/firebaseRsvp';
import {
  getOrCreateCachedVideoObjectUrl,
  isCloudVideoUrl,
  isWebpFramesMime,
  loadVideoBlobFromCache,
  parseCloudVideoUrl,
  peekCachedVideoObjectUrl,
  peekCachedWebpFrames,
  unpackWebpFramesFromBlob,
} from '../utils/videoCompressor';
import {
  EDITORIAL_EASE,
  EditorialTextReveal,
  getEditorialBlockMotion,
} from './EditorialTextReveal';

const RSVP_SUCCESS_SPARKLES: {
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  diamond?: boolean;
}[] = [
  { x: 0, y: -48, size: 6, color: '#FCE9B2', delay: 0.1, diamond: true },
  { x: 26, y: -40, size: 4.5, color: '#34D399', delay: 0.15 },
  { x: 44, y: -20, size: 5.5, color: '#F3D88B', delay: 0.12, diamond: true },
  { x: 50, y: 4, size: 4, color: '#D4AF37', delay: 0.18 },
  { x: 42, y: 28, size: 5.5, color: '#FCE9B2', delay: 0.14, diamond: true },
  { x: 22, y: 44, size: 4.5, color: '#34D399', delay: 0.2 },
  { x: 0, y: 50, size: 5, color: '#F3D88B', delay: 0.13, diamond: true },
  { x: -24, y: 44, size: 4.5, color: '#FCE9B2', delay: 0.19 },
  { x: -42, y: 26, size: 5.5, color: '#34D399', delay: 0.15, diamond: true },
  { x: -50, y: 2, size: 4, color: '#D4AF37', delay: 0.17 },
  { x: -44, y: -22, size: 5.5, color: '#FCE9B2', delay: 0.12, diamond: true },
  { x: -26, y: -40, size: 4.5, color: '#34D399', delay: 0.16 },
];

export interface PreviewJumpTarget {
  phase: 'sealed' | 'opening' | 'story';
  slideIndex?: 0 | 1 | 2;
  nonce: number;
  replayAnimation?: boolean;
}

export type PreviewEditTarget =
  | 'cover-top'
  | 'cover-seal'
  | 'cover-bottom'
  | 'slide1-organizer'
  | 'slide1-header'
  | 'slide1-banner'
  | 'slide1-panel'
  | 'slide1-welcome'
  | 'slide2-header'
  | 'slide2-countdown'
  | 'slide2-panel'
  | 'slide2-buttons'
  | 'slide3-panel'
  | 'story-nav';

export interface PreviewDirectDragPatch {
  sealOffsetX?: number;
  sealOffsetY?: number;
  coverTopOffsetY?: number;
  coverBottomOffsetY?: number;
  slidePanelOffsetY?: {
    slide: 'slide1' | 'slide2' | 'slide3';
    offsetY: number;
  };
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
  previewRsvpViewMode?: 'auto' | 'form' | 'receipt' | 'updated-receipt';
  previewEditMode?: boolean;
  selectedEditTarget?: PreviewEditTarget | null;
  onSelectEditTarget?: (target: PreviewEditTarget | null) => void;
  onDirectDragChange?: (patch: PreviewDirectDragPatch) => void;
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

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(19, 18, 15, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha)).toFixed(2)})`;
}

export function getRelativeLuminance(hex: string): number {
  const clean = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return 0.05;
  const rgb = [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

export function getHexContrastRatio(hexA: string, hexB: string): number {
  const lA = getRelativeLuminance(hexA);
  const lB = getRelativeLuminance(hexB);
  return (Math.max(lA, lB) + 0.05) / (Math.min(lA, lB) + 0.05);
}

function getContrastTextColor(hex: string): string {
  return getRelativeLuminance(hex) > 0.36 ? '#151109' : '#FFFFFF';
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
  previewRsvpViewMode = 'auto',
  previewEditMode = false,
  selectedEditTarget = null,
  onSelectEditTarget,
  onDirectDragChange,
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
      slideStyles: config?.slideStyles ?? {},
      slideExtras: {
        ...DEFAULT_SLIDE_EXTRAS,
        ...(config?.slideExtras ?? {}),
        rsvpReceipt: {
          ...DEFAULT_RSVP_RECEIPT_CONFIG,
          ...(config?.slideExtras?.rsvpReceipt ?? {}),
        },
      },
    }),
    [config]
  );
  const textSizes = effectiveConfig.textSizes;
  const panelScales = effectiveConfig.panelScales;
  const slideExtras: InteractiveSlideExtras = effectiveConfig.slideExtras;
  const themeStyle = THEME_STYLES[effectiveConfig.theme] ?? THEME_STYLES['gold-dark'];
  const legacyPairing =
    FONT_PAIRINGS[effectiveConfig.fontPreset] ?? FONT_PAIRINGS.modern;
  const fontPairing = {
    heading: isValidStudioFontId(effectiveConfig.headingFont)
      ? getStudioFontCssFamily(effectiveConfig.headingFont)
      : legacyPairing.heading,
    body: isValidStudioFontId(effectiveConfig.bodyFont)
      ? getStudioFontCssFamily(effectiveConfig.bodyFont)
      : legacyPairing.body,
  };

  useEffect(() => {
    const ss = effectiveConfig.slideStyles;
    ensureGoogleFontsLoaded([
      effectiveConfig.headingFont,
      effectiveConfig.bodyFont,
      ss?.cover?.headingFont,
      ss?.cover?.bodyFont,
      ss?.slide1?.headingFont,
      ss?.slide1?.bodyFont,
      ss?.slide2?.headingFont,
      ss?.slide2?.bodyFont,
      ss?.slide3?.headingFont,
      ss?.slide3?.bodyFont,
    ]);
  }, [
    effectiveConfig.headingFont,
    effectiveConfig.bodyFont,
    effectiveConfig.slideStyles,
  ]);

  const customTitleColor =
    typeof effectiveConfig.titleColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(effectiveConfig.titleColor.trim())
      ? effectiveConfig.titleColor.trim()
      : '';
  const customBodyColor =
    typeof effectiveConfig.bodyColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(effectiveConfig.bodyColor.trim())
      ? effectiveConfig.bodyColor.trim()
      : '';
  const customAccentColor =
    typeof effectiveConfig.accentColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(effectiveConfig.accentColor.trim())
      ? effectiveConfig.accentColor.trim()
      : '';
  const customPanelBgColor =
    typeof effectiveConfig.panelBgColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(effectiveConfig.panelBgColor.trim())
      ? effectiveConfig.panelBgColor.trim()
      : '';
  const customButtonColor =
    typeof effectiveConfig.buttonColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(effectiveConfig.buttonColor.trim())
      ? effectiveConfig.buttonColor.trim()
      : '';
  const panelOpacity = Math.min(
    100,
    Math.max(0, Math.round(Number(effectiveConfig.panelOpacity ?? 85)))
  );
  const coverOverlayAlpha = Math.min(
    0.7,
    Math.max(0, Number(effectiveConfig.coverOverlayDarkness ?? 0) / 100)
  );
  const coverTopOffsetY = Math.min(
    80,
    Math.max(-40, Math.round(Number(effectiveConfig.coverTopOffsetY ?? 0)))
  );
  const coverBottomOffsetY = Math.min(
    40,
    Math.max(-80, Math.round(Number(effectiveConfig.coverBottomOffsetY ?? 0)))
  );
  const bodyBoldStyle: React.CSSProperties | undefined = effectiveConfig.textBold
    ? { fontWeight: 700 }
    : undefined;

  const defaultThemePanelHex =
    effectiveConfig.theme === 'emerald-light'
      ? '#FFFFFF'
      : effectiveConfig.theme === 'navy-gold'
        ? '#0E162B'
        : '#13120F';

  const isHexColor = (val?: string): string =>
    typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val.trim())
      ? val.trim()
      : '';

  const globalPanelBorderColor = isHexColor(slideExtras.panelBorderColor);
  const globalButtonTextColor = isHexColor(slideExtras.buttonTextColor);
  const globalSecondaryBtnColor = isHexColor(slideExtras.secondaryButtonColor);
  const globalSecondaryBtnTextColor = isHexColor(
    slideExtras.secondaryButtonTextColor
  );

  const resolveSlideStyle = (
    key: 'cover' | 'slide1' | 'slide2' | 'slide3'
  ) => {
    const ov = effectiveConfig.slideStyles?.[key];
    const headingFont =
      ov?.headingFont && isValidStudioFontId(ov.headingFont)
        ? getStudioFontCssFamily(ov.headingFont)
        : fontPairing.heading;
    const bodyFont =
      ov?.bodyFont && isValidStudioFontId(ov.bodyFont)
        ? getStudioFontCssFamily(ov.bodyFont)
        : fontPairing.body;
    const titleColor = isHexColor(ov?.titleColor) || customTitleColor;
    const bodyColor = isHexColor(ov?.bodyColor) || customBodyColor;
    const accentColor = isHexColor(ov?.accentColor) || customAccentColor;
    const align = ov?.textAlign || effectiveConfig.textAlign || 'center';
    const shadowMode = ov?.textShadow || effectiveConfig.textShadow || 'soft';
    const textShadow =
      shadowMode === 'none'
        ? 'none'
        : shadowMode === 'strong'
          ? '0 2px 10px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.95)'
          : '0 1px 6px rgba(0,0,0,0.5)';

    // Panel style (global default + per-slide override)
    const effPanelBg = isHexColor(ov?.panelBgColor) || customPanelBgColor;
    const effOpacity =
      typeof ov?.panelOpacity === 'number' && Number.isFinite(ov.panelOpacity)
        ? Math.min(100, Math.max(0, Math.round(ov.panelOpacity)))
        : panelOpacity;
    const effBorderColor =
      isHexColor(ov?.panelBorderColor) || globalPanelBorderColor;
    const effBorderStyle =
      ov?.panelBorderStyle || slideExtras.panelBorderStyle || 'thin';
    const effRadius = ov?.panelRadius || slideExtras.panelRadius || 'lg';
    const effBlur = ov?.panelBlur || slideExtras.panelBlur || 'soft';
    const effWidth =
      typeof ov?.panelWidth === 'number' && ov.panelWidth >= 75
        ? Math.min(100, Math.max(75, Math.round(ov.panelWidth)))
        : Math.min(100, Math.max(75, Math.round(slideExtras.panelWidth || 100)));
    const effPadding = ov?.panelPadding || slideExtras.panelPadding || 'normal';
    const effOffsetY =
      typeof ov?.panelOffsetY === 'number' && Number.isFinite(ov.panelOffsetY)
        ? Math.min(60, Math.max(-60, Math.round(ov.panelOffsetY)))
        : 0;

    const radiusPx =
      effRadius === 'sm' ? '8px' : effRadius === 'md' ? '14px' : '20px';
    const blurCss =
      effBlur === 'none'
        ? 'none'
        : effBlur === 'strong'
          ? 'blur(16px)'
          : 'blur(8px)';
    const panelPaddingClass =
      effPadding === 'compact'
        ? 'p-2.5'
        : effPadding === 'spacious'
          ? 'p-5'
          : 'p-3.5';

    const effPanelHex = effPanelBg || defaultThemePanelHex;
    const effPanelIsLight =
      effOpacity >= 25
        ? getRelativeLuminance(effPanelHex) > 0.42
        : effectiveConfig.theme === 'emerald-light';

    // Smart Auto-Contrast inside Panel:
    // Honors user's explicit color, else guarantees crisp readability on light OR dark panels!
    const panelTitleColor =
      titleColor || (effPanelIsLight ? '#151109' : '#FCE9B2');
    const panelBodyColor =
      bodyColor || (effPanelIsLight ? '#1E293B' : '#FDFBF7');
    const panelMutedColor = bodyColor
      ? hexToRgba(bodyColor, 0.78)
      : effPanelIsLight
        ? '#475569'
        : 'rgba(230,222,200,0.85)';
    const panelAccentColor =
      accentColor || (effPanelIsLight ? '#8A5A10' : '#E6C775');
    const panelTextShadow =
      effPanelIsLight && shadowMode !== 'strong' ? 'none' : textShadow;

    const subSurfaceBg = effPanelIsLight
      ? 'rgba(15, 23, 42, 0.055)'
      : 'rgba(0, 0, 0, 0.35)';
    const subSurfaceBorder = effBorderColor
      ? hexToRgba(effBorderColor, 0.38)
      : effPanelIsLight
        ? 'rgba(15, 23, 42, 0.16)'
        : 'rgba(255, 255, 255, 0.18)';
    const activeChoiceBg = effPanelIsLight
      ? hexToRgba(panelAccentColor, 0.14)
      : hexToRgba(panelAccentColor, 0.22);
    const activeChoiceBorder = panelAccentColor;
    const inputBg = effPanelIsLight
      ? 'rgba(255, 255, 255, 0.92)'
      : 'rgba(0, 0, 0, 0.45)';
    const inputBorder = effPanelIsLight
      ? 'rgba(15, 23, 42, 0.24)'
      : 'rgba(255, 255, 255, 0.2)';
    const dividerColor = effBorderColor
      ? hexToRgba(effBorderColor, 0.3)
      : effPanelIsLight
        ? 'rgba(15, 23, 42, 0.12)'
        : 'rgba(212, 175, 55, 0.22)';

    const effBadgeBg = isHexColor(ov?.badgeBgColor);
    const badgeStyle: React.CSSProperties = effBadgeBg
      ? {
          backgroundColor: effBadgeBg,
          borderColor: effBorderColor || hexToRgba(getContrastTextColor(effBadgeBg), 0.35),
          color: accentColor || getContrastTextColor(effBadgeBg),
        }
      : {
          color: accentColor || (effectiveConfig.theme === 'emerald-light' ? '#157A76' : '#F4DDA0'),
          backgroundColor:
            effectiveConfig.theme === 'emerald-light'
              ? 'rgba(255,255,255,0.88)'
              : 'rgba(21,19,14,0.85)',
          borderColor:
            effBorderColor ||
            (effectiveConfig.theme === 'emerald-light'
              ? 'rgba(31,155,150,0.35)'
              : 'rgba(212,175,55,0.4)'),
        };

    const cardStyle: React.CSSProperties = {
      backgroundColor:
        effOpacity === 0
          ? 'transparent'
          : hexToRgba(effPanelHex, effOpacity / 100),
      borderColor:
        effBorderStyle === 'none' || (effOpacity === 0 && !effBorderColor)
          ? 'transparent'
          : effBorderColor ||
            (effPanelIsLight ? 'rgba(15,23,42,0.16)' : 'rgba(212,175,55,0.32)'),
      borderWidth:
        effBorderStyle === 'none'
          ? '0px'
          : effBorderStyle === 'bold'
            ? '2px'
            : '1px',
      borderRadius: radiusPx,
      backdropFilter: effOpacity === 0 && effBlur === 'none' ? 'none' : blurCss,
      WebkitBackdropFilter:
        effOpacity === 0 && effBlur === 'none' ? 'none' : blurCss,
      boxShadow:
        effOpacity === 0 && effBorderStyle === 'none' ? 'none' : undefined,
      width: effWidth < 100 ? `${effWidth}%` : '100%',
      marginLeft: 'auto',
      marginRight: 'auto',
      textShadow: panelTextShadow,
    };

    // Primary & secondary button styles
    const effBtnBg = isHexColor(ov?.buttonColor) || customButtonColor;
    const effBtnText = isHexColor(ov?.buttonTextColor) || globalButtonTextColor;
    const primaryButtonStyle: React.CSSProperties | undefined = effBtnBg
      ? {
          backgroundImage: 'none',
          backgroundColor: effBtnBg,
          color: effBtnText || getContrastTextColor(effBtnBg),
        }
      : effBtnText
        ? { color: effBtnText }
        : undefined;

    const effSecBg =
      isHexColor(ov?.secondaryButtonColor) || globalSecondaryBtnColor;
    const secondaryButtonStyle: React.CSSProperties | undefined = effSecBg
      ? {
          backgroundColor: effSecBg,
          borderColor: effBorderColor || effSecBg,
          color: globalSecondaryBtnTextColor || getContrastTextColor(effSecBg),
        }
      : globalSecondaryBtnTextColor
        ? { color: globalSecondaryBtnTextColor }
        : effPanelIsLight
          ? {
              backgroundColor: 'rgba(255,255,255,0.92)',
              borderColor: 'rgba(15,23,42,0.18)',
              color: '#151109',
            }
          : undefined;

    return {
      headingFont,
      bodyFont,
      titleColor,
      bodyColor,
      accentColor,
      isLeft: align === 'left',
      textShadow,
      effPanelHex,
      effPanelIsLight,
      panelTitleColor,
      panelBodyColor,
      panelMutedColor,
      panelAccentColor,
      panelTextShadow,
      subSurfaceBg,
      subSurfaceBorder,
      activeChoiceBg,
      activeChoiceBorder,
      inputBg,
      inputBorder,
      dividerColor,
      badgeStyle,
      cardStyle,
      panelPaddingClass,
      panelOffsetY: effOffsetY,
      panelWidth: effWidth,
      primaryButtonStyle,
      secondaryButtonStyle,
    };
  };

  const coverStyle = resolveSlideStyle('cover');
  const slide1Style = resolveSlideStyle('slide1');
  const slide2Style = resolveSlideStyle('slide2');
  const slide3Style = resolveSlideStyle('slide3');
  const isLightTheme = effectiveConfig.theme === 'emerald-light';
  const topControlBtnClass = isLightTheme
    ? 'bg-white/85 border border-[#1B1B4B]/18 text-[#1B1B4B] shadow-xs'
    : 'bg-[#151410]/85 border border-[#D4AF37]/35 text-[#F4DDA0]';
  const scaleStyle =
    TEXT_SCALE_CLASSES[effectiveConfig.textScale] ?? TEXT_SCALE_CLASSES.md;
  const sealSizeClasses =
    SEAL_SIZE_MAP[effectiveConfig.sealSize] ?? SEAL_SIZE_MAP.md;
  const cardSurfaceClass = getCardSurfaceClass(
    effectiveConfig.cardStyle ?? 'solid',
    effectiveConfig.theme ?? 'gold-dark'
  );
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
  const isDirectEditActive = Boolean(embeddedPreview && previewEditMode);
  const [snapGuide, setSnapGuide] = useState<{ x?: boolean; y?: boolean }>({});
  const directDragRef = useRef<{
    pointerId: number;
    kind:
      | 'cover-top'
      | 'cover-seal'
      | 'cover-bottom'
      | 'slide1-panel'
      | 'slide2-panel'
      | 'slide3-panel';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const startDirectDrag = (
    e: React.PointerEvent<HTMLElement>,
    target: PreviewEditTarget,
    kind?:
      | 'cover-top'
      | 'cover-seal'
      | 'cover-bottom'
      | 'slide1-panel'
      | 'slide2-panel'
      | 'slide3-panel'
  ) => {
    if (!isDirectEditActive) return;
    e.preventDefault();
    e.stopPropagation();
    onSelectEditTarget?.(target);
    if (!kind || !onDirectDragChange) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const origX = kind === 'cover-seal' ? sealOffsetX : 0;
    const origY =
      kind === 'cover-top'
        ? coverTopOffsetY
        : kind === 'cover-bottom'
          ? coverBottomOffsetY
          : kind === 'cover-seal'
            ? sealOffsetY
            : kind === 'slide1-panel'
              ? slide1Style.panelOffsetY
              : kind === 'slide2-panel'
                ? slide2Style.panelOffsetY
                : slide3Style.panelOffsetY;
    directDragRef.current = {
      pointerId: e.pointerId,
      kind,
      startX: e.clientX,
      startY: e.clientY,
      origX,
      origY,
    };
  };

  const moveDirectDrag = (e: React.PointerEvent<HTMLElement>) => {
    const drag = directDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !onDirectDragChange) return;
    e.preventDefault();
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.kind === 'cover-seal') {
      const stageW = stageContainerRef.current?.clientWidth || 320;
      const stageH = stageContainerRef.current?.clientHeight || 620;
      let nextX = Math.max(-35, Math.min(35, Math.round(drag.origX + (dx / stageW) * 100)));
      let nextY = Math.max(-35, Math.min(35, Math.round(drag.origY + (dy / stageH) * 100)));
      const snapX = Math.abs(nextX) <= 2;
      const snapY = Math.abs(nextY) <= 2;
      if (snapX) nextX = 0;
      if (snapY) nextY = 0;
      setSnapGuide({ x: snapX, y: snapY });
      onDirectDragChange({ sealOffsetX: nextX, sealOffsetY: nextY });
    } else if (drag.kind === 'cover-top') {
      let nextY = Math.max(-40, Math.min(80, Math.round(drag.origY + dy)));
      const snapY = Math.abs(nextY) <= 3;
      if (snapY) nextY = 0;
      setSnapGuide({ y: snapY });
      onDirectDragChange({ coverTopOffsetY: nextY });
    } else if (drag.kind === 'cover-bottom') {
      let nextY = Math.max(-80, Math.min(40, Math.round(drag.origY + dy)));
      const snapY = Math.abs(nextY) <= 3;
      if (snapY) nextY = 0;
      setSnapGuide({ y: snapY });
      onDirectDragChange({ coverBottomOffsetY: nextY });
    } else {
      const slide =
        drag.kind === 'slide1-panel'
          ? 'slide1'
          : drag.kind === 'slide2-panel'
            ? 'slide2'
            : 'slide3';
      let nextY = Math.max(-60, Math.min(60, Math.round(drag.origY + dy)));
      const snapY = Math.abs(nextY) <= 3;
      if (snapY) nextY = 0;
      setSnapGuide({ y: snapY });
      onDirectDragChange({ slidePanelOffsetY: { slide, offsetY: nextY } });
    }
  };

  const endDirectDrag = (e: React.PointerEvent<HTMLElement>) => {
    const drag = directDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    directDragRef.current = null;
    setSnapGuide({});
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const getEditableClass = (
    target: PreviewEditTarget,
    draggable = false
  ): string => {
    if (!isDirectEditActive) return '';
    const selected = selectedEditTarget === target;
    return `relative transition-shadow ${
      draggable ? 'touch-none select-none cursor-grab active:cursor-grabbing' : 'cursor-pointer'
    } ${
      selected
        ? 'ring-2 ring-[#38BDF8] shadow-[0_0_0_2px_rgba(56,189,248,0.25)]'
        : 'hover:ring-1 hover:ring-dashed hover:ring-[#38BDF8]/80'
    }`;
  };

  const canDragSlide1Banner = Boolean(embeddedPreview && onUpdateSlide1BannerOffset);

  const handleBannerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDirectEditActive) {
      onSelectEditTarget?.('slide1-banner');
    }
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
  const rawIntroVideoUrl =
    (effectiveConfig.videoUrl || '/media/gold-envelope-intro.mp4?v=2').trim();
  const isCustomIntroVideo =
    rawIntroVideoUrl !== DEFAULT_INTERACTIVE_CONFIG.videoUrl;
  const effectiveVideoPoster =
    effectiveConfig.coverImageDataUrl ||
    (!isCustomIntroVideo
      ? effectiveConfig.posterUrl || '/media/gold-envelope-poster.webp'
      : '');
  const activeCoverImg =
    effectiveConfig.coverImageDataUrl ||
    effectiveConfig.posterUrl ||
    '/media/gold-envelope-poster.webp';
  const rawScrollVideoUrl = (effectiveConfig.scrollVideoUrl || '').trim();
  const hasAnyScrollVideo =
    effectiveConfig.storyNavMode === 'scroll' && rawScrollVideoUrl.length > 0;
  const activeOpenImg = isImageMode
    ? effectiveConfig.openImageDataUrl || effectiveConfig.coverImageDataUrl
    : effectiveConfig.openImageDataUrl ||
      (isCustomIntroVideo || hasAnyScrollVideo
        ? effectiveConfig.coverImageDataUrl || ''
        : effectiveConfig.openBgUrl || '/media/gold-envelope-open.webp');
  const openBgPosX = Math.min(
    100,
    Math.max(0, Math.round(Number(effectiveConfig.openBgPosX ?? 50)))
  );
  const openBgPosY = Math.min(
    100,
    Math.max(0, Math.round(Number(effectiveConfig.openBgPosY ?? 50)))
  );
  const activeBgAudioSrc = (
    effectiveConfig.bgAudioDataUrl ||
    effectiveConfig.bgAudioUrl ||
    ''
  ).trim();
  const bgAudioVolume = Math.min(
    1,
    Math.max(0.1, Number(effectiveConfig.bgAudioVolume ?? 75) / 100)
  );
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
  const mediaLayerRef = useRef<HTMLDivElement | null>(null);
  const sealedSealImgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrollVideoRef = useRef<HTMLVideoElement | null>(null);
  const scrollFramesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const storyScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollSectionRefs = useRef<(HTMLElement | null)[]>([null, null, null]);
  const scrollProgressRef = useRef<number>(0);
  const scrollSmoothTimeRef = useRef<number>(0);
  const scrollSmoothFrameRef = useRef<number>(0);
  const scrollLastDrawnFrameRef = useRef<number>(-1);
  const scrollLastYRef = useRef<number>(0);
  const scrollIdleTimerRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const imageTimerRef = useRef<number | null>(null);
  const hasTransitionedRef = useRef(false);
  const [phase, setPhase] = useState<'sealed' | 'opening' | 'story'>('sealed');
  const [openingSealOrigin, setOpeningSealOrigin] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [slideIndex, setSlideIndex] = useState<0 | 1 | 2>(0);
  const [textAnimReplayNonce, setTextAnimReplayNonce] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollRevealedSlides, setScrollRevealedSlides] = useState<
    [boolean, boolean, boolean]
  >([true, false, false]);
  const scrollCloudDesc = useMemo(
    () => parseCloudVideoUrl(rawScrollVideoUrl),
    [rawScrollVideoUrl]
  );
  const isScrollFramesMode = Boolean(
    scrollCloudDesc && isWebpFramesMime(scrollCloudDesc.mime)
  );
  const [resolvedIntroVideoUrl, setResolvedIntroVideoUrl] = useState<string>(() =>
    isCloudVideoUrl(rawIntroVideoUrl)
      ? peekCachedVideoObjectUrl(rawIntroVideoUrl)
      : rawIntroVideoUrl
  );
  const [resolvedScrollVideoUrl, setResolvedScrollVideoUrl] = useState<string>(() =>
    isCloudVideoUrl(rawScrollVideoUrl) && !isScrollFramesMode
      ? peekCachedVideoObjectUrl(rawScrollVideoUrl)
      : isScrollFramesMode
        ? ''
        : rawScrollVideoUrl
  );
  const [resolvedScrollFrames, setResolvedScrollFrames] = useState<
    (ImageBitmap | HTMLImageElement)[] | null
  >(() => (isScrollFramesMode ? peekCachedWebpFrames(rawScrollVideoUrl) : null));

  useEffect(() => {
    if (!isCloudVideoUrl(rawIntroVideoUrl)) {
      setResolvedIntroVideoUrl(rawIntroVideoUrl);
      return;
    }
    const syncHit = peekCachedVideoObjectUrl(rawIntroVideoUrl);
    if (syncHit) {
      setResolvedIntroVideoUrl(syncHit);
      return;
    }
    let cancelled = false;
    const loadIntro = async () => {
      const cached = await loadVideoBlobFromCache(rawIntroVideoUrl);
      const blob =
        cached ??
        (payload.eventId
          ? await fetchCloudVideoFromCloud(payload.eventId, rawIntroVideoUrl)
          : null);
      if (cancelled) return;
      if (blob) {
        setResolvedIntroVideoUrl(
          getOrCreateCachedVideoObjectUrl(rawIntroVideoUrl, blob)
        );
      } else {
        setResolvedIntroVideoUrl('');
      }
    };
    void loadIntro();
    return () => {
      cancelled = true;
    };
  }, [rawIntroVideoUrl, payload.eventId]);

  useEffect(() => {
    if (!rawScrollVideoUrl) {
      setResolvedScrollVideoUrl('');
      setResolvedScrollFrames(null);
      return;
    }
    if (!isCloudVideoUrl(rawScrollVideoUrl)) {
      setResolvedScrollFrames(null);
      setResolvedScrollVideoUrl(rawScrollVideoUrl);
      return;
    }

    if (isScrollFramesMode) {
      setResolvedScrollVideoUrl('');
      const syncFrames = peekCachedWebpFrames(rawScrollVideoUrl);
      if (syncFrames && syncFrames.length > 0) {
        setResolvedScrollFrames(syncFrames);
        return;
      }
      let cancelled = false;
      const loadFrames = async () => {
        const cached = await loadVideoBlobFromCache(rawScrollVideoUrl);
        const blob =
          cached ??
          (payload.eventId
            ? await fetchCloudVideoFromCloud(payload.eventId, rawScrollVideoUrl)
            : null);
        if (cancelled || !blob) return;
        const frames = await unpackWebpFramesFromBlob(blob, rawScrollVideoUrl);
        if (!cancelled && frames.length > 0) {
          setResolvedScrollFrames(frames);
        }
      };
      void loadFrames();
      return () => {
        cancelled = true;
      };
    }

    setResolvedScrollFrames(null);
    const syncHit = peekCachedVideoObjectUrl(rawScrollVideoUrl);
    if (syncHit) {
      setResolvedScrollVideoUrl(syncHit);
      return;
    }
    let cancelled = false;
    const loadScroll = async () => {
      const cached = await loadVideoBlobFromCache(rawScrollVideoUrl);
      const blob =
        cached ??
        (payload.eventId
          ? await fetchCloudVideoFromCloud(payload.eventId, rawScrollVideoUrl)
          : null);
      if (cancelled) return;
      if (blob) {
        setResolvedScrollVideoUrl(
          getOrCreateCachedVideoObjectUrl(rawScrollVideoUrl, blob)
        );
      } else {
        setResolvedScrollVideoUrl('');
      }
    };
    void loadScroll();
    return () => {
      cancelled = true;
    };
  }, [rawScrollVideoUrl, isScrollFramesMode, payload.eventId]);

  const isScrollMode = effectiveConfig.storyNavMode === 'scroll';
  const dedicatedScrollVideoUrl = rawScrollVideoUrl;
  const hasDedicatedScrollVideo =
    isScrollMode && dedicatedScrollVideoUrl.length > 0;
  const isContinuousSingleVideo =
    isScrollMode && !hasDedicatedScrollVideo && !isImageMode;
  const hasActiveScrollVideo =
    isScrollMode && (hasDedicatedScrollVideo || !isImageMode);
  const scrollVideoMode =
    effectiveConfig.scrollVideoMode === 'follow' ? 'follow' : 'scrub';
  const scrollVideoStartSec = Math.max(
    0,
    Math.min(120, Number(effectiveConfig.scrollVideoStartSec ?? 0) || 0)
  );
  const textAnim = slideExtras.textAnimation ?? 'cinematic-title';
  const skipTextAnim = isDirectEditActive || textAnim === 'none';

  const getActiveScrollVideo = (): HTMLVideoElement | null => {
    if (hasDedicatedScrollVideo) return scrollVideoRef.current;
    if (isContinuousSingleVideo) return videoRef.current;
    return null;
  };

  const getScrollVideoBounds = (video: HTMLVideoElement) => {
    const dur =
      Number.isFinite(video.duration) && video.duration > 0.2
        ? video.duration
        : 0;
    const safeStart =
      dur > 0 ? Math.min(scrollVideoStartSec, Math.max(0, dur - 0.35)) : 0;
    const usableSpan = dur > 0 ? Math.max(0.05, dur - safeStart - 0.04) : 0;
    return { dur, safeStart, usableSpan };
  };

  const stopScrollVideoEngine = () => {
    if (scrollRafRef.current !== null) {
      window.cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    if (scrollIdleTimerRef.current !== null) {
      window.clearTimeout(scrollIdleTimerRef.current);
      scrollIdleTimerRef.current = null;
    }
  };

  const drawScrollFrameToCanvas = (frameIndex: number) => {
    const frames = resolvedScrollFrames;
    const canvas = scrollFramesCanvasRef.current;
    if (!frames || frames.length === 0 || !canvas) return;
    const idx = Math.max(0, Math.min(frames.length - 1, Math.round(frameIndex)));
    if (scrollLastDrawnFrameRef.current === idx) return;

    const frame = frames[idx];
    const fw = frame instanceof ImageBitmap ? frame.width : frame.naturalWidth || 460;
    const fh = frame instanceof ImageBitmap ? frame.height : frame.naturalHeight || 820;
    if (fw <= 0 || fh <= 0) return;

    const cw = canvas.clientWidth || fw;
    const ch = canvas.clientHeight || fh;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Cover crop centered inside canvas stage
    const scale = Math.max(cw / fw, ch / fh);
    const dw = fw * scale;
    const dh = fh * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    ctx.drawImage(frame, dx, dy, dw, dh);
    scrollLastDrawnFrameRef.current = idx;
  };

  const syncScrollVideoImmediate = (progress: number) => {
    const clamped = Math.max(0, Math.min(1, progress));
    scrollProgressRef.current = clamped;
    setScrollProgress(clamped);
    if (resolvedScrollFrames && resolvedScrollFrames.length > 0 && hasDedicatedScrollVideo) {
      const targetIdx = clamped * (resolvedScrollFrames.length - 1);
      scrollSmoothFrameRef.current = targetIdx;
      scrollLastDrawnFrameRef.current = -1;
      drawScrollFrameToCanvas(targetIdx);
      return;
    }
    const video = getActiveScrollVideo();
    if (!video) return;
    const { dur, safeStart, usableSpan } = getScrollVideoBounds(video);
    if (dur <= 0) return;
    const target = safeStart + clamped * usableSpan;
    scrollSmoothTimeRef.current = target;
    video.pause();
    if (video.readyState >= 1) {
      try {
        video.currentTime = target;
      } catch {
        // Ignore seek errors before metadata is ready
      }
    }
  };

  const startScrubSmoothingLoop = () => {
    if (scrollRafRef.current !== null) return;
    const tick = () => {
      if (phase !== 'story' || !isScrollMode) {
        scrollRafRef.current = null;
        return;
      }
      // Ultra-smooth 60fps Apple-style WebP Frame Canvas renderer
      if (
        resolvedScrollFrames &&
        resolvedScrollFrames.length > 0 &&
        hasDedicatedScrollVideo
      ) {
        const targetIdx =
          scrollProgressRef.current * (resolvedScrollFrames.length - 1);
        const diff = targetIdx - scrollSmoothFrameRef.current;
        if (Math.abs(diff) < 0.08) {
          scrollSmoothFrameRef.current = targetIdx;
          drawScrollFrameToCanvas(targetIdx);
          scrollRafRef.current = null;
          return;
        }
        scrollSmoothFrameRef.current += diff * 0.28;
        drawScrollFrameToCanvas(scrollSmoothFrameRef.current);
        scrollRafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const video = getActiveScrollVideo();
      if (!video || scrollVideoMode !== 'scrub') {
        scrollRafRef.current = null;
        return;
      }
      const { dur, safeStart, usableSpan } = getScrollVideoBounds(video);
      if (dur <= 0) {
        scrollRafRef.current = window.requestAnimationFrame(tick);
        return;
      }
      const targetTime = safeStart + scrollProgressRef.current * usableSpan;
      const diff = targetTime - scrollSmoothTimeRef.current;
      if (Math.abs(diff) < 0.014) {
        scrollSmoothTimeRef.current = targetTime;
      } else {
        scrollSmoothTimeRef.current += diff * 0.24;
      }

      if (!video.paused) {
        video.pause();
      }
      if (
        video.readyState >= 2 &&
        !video.seeking &&
        Math.abs(video.currentTime - scrollSmoothTimeRef.current) > 0.016
      ) {
        try {
          video.currentTime = scrollSmoothTimeRef.current;
        } catch {
          // ignore transient seek exceptions
        }
      }

      if (
        Math.abs(diff) < 0.014 &&
        (!video.seeking && Math.abs(video.currentTime - targetTime) <= 0.025)
      ) {
        scrollRafRef.current = null;
        return;
      }
      scrollRafRef.current = window.requestAnimationFrame(tick);
    };
    scrollRafRef.current = window.requestAnimationFrame(tick);
  };

  const handleStoryScroll = () => {
    const el = storyScrollContainerRef.current;
    if (!el || !isScrollMode || phase !== 'story') return;

    const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
    const currentTop = el.scrollTop;
    const progress = Math.max(0, Math.min(1, currentTop / maxScroll));
    const deltaY = currentTop - scrollLastYRef.current;
    scrollLastYRef.current = currentTop;

    scrollProgressRef.current = progress;
    setScrollProgress(progress);

    // Determine active slide based on section vertical center
    const viewCenter = currentTop + el.clientHeight * 0.5;
    let activeIdx: 0 | 1 | 2 = progress < 0.34 ? 0 : progress < 0.72 ? 1 : 2;
    for (let i = 0; i < 3; i++) {
      const sec = scrollSectionRefs.current[i];
      if (!sec) continue;
      if (viewCenter >= sec.offsetTop && viewCenter <= sec.offsetTop + sec.offsetHeight) {
        activeIdx = i as 0 | 1 | 2;
        break;
      }
    }
    setSlideIndex((prev) => (prev === activeIdx ? prev : activeIdx));
    setScrollRevealedSlides((prev) => {
      if (prev[activeIdx]) return prev;
      const next: [boolean, boolean, boolean] = [...prev] as [boolean, boolean, boolean];
      next[activeIdx] = true;
      return next;
    });

    // Drive active background WebP Frame Canvas OR Video with finger scroll
    if (
      resolvedScrollFrames &&
      resolvedScrollFrames.length > 0 &&
      hasDedicatedScrollVideo
    ) {
      startScrubSmoothingLoop();
      return;
    }

    const video = getActiveScrollVideo();
    if (!video) return;
    const { dur, safeStart, usableSpan } = getScrollVideoBounds(video);
    if (dur <= 0) return;

    if (scrollVideoMode === 'follow') {
      if (scrollIdleTimerRef.current !== null) {
        window.clearTimeout(scrollIdleTimerRef.current);
      }
      const targetTime = safeStart + progress * usableSpan;
      if (deltaY > 0.5) {
        // Scrolling DOWN: hardware-smooth native playback while finger moves
        const speed = Math.min(2.0, Math.max(0.75, 0.85 + Math.abs(deltaY) * 0.03));
        video.muted = true;
        if (video.currentTime < safeStart) {
          try {
            video.currentTime = safeStart;
          } catch {
            // ignore
          }
        }
        if (video.currentTime < dur - 0.08) {
          video.playbackRate = speed;
          if (video.paused) {
            void video.play().catch(() => {});
          }
        } else if (!video.paused) {
          video.pause();
        }
      } else if (deltaY < -0.5) {
        // Scrolling UP: pause and gently track backward to scroll position
        if (!video.paused) video.pause();
        if (video.readyState >= 2 && !video.seeking) {
          try {
            video.currentTime = targetTime;
          } catch {
            // ignore
          }
        }
      }
      scrollSmoothTimeRef.current = video.currentTime;
      scrollIdleTimerRef.current = window.setTimeout(() => {
        if (video && !video.paused) {
          video.pause();
        }
      }, 115);
    } else {
      // Exact bidirectional scrub with inertia damping
      startScrubSmoothingLoop();
    }
  };

  const scrollToSlide = (targetIdx: 0 | 1 | 2, instant = false) => {
    setSlideIndex(targetIdx);
    setScrollRevealedSlides((prev) => {
      if (prev[targetIdx]) return prev;
      const next: [boolean, boolean, boolean] = [...prev] as [boolean, boolean, boolean];
      next[targetIdx] = true;
      return next;
    });
    if (!isScrollMode) return;
    const container = storyScrollContainerRef.current;
    const section = scrollSectionRefs.current[targetIdx];
    if (container && section) {
      container.scrollTo({
        top: section.offsetTop,
        behavior: instant ? 'auto' : 'smooth',
      });
      if (instant) {
        const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
        syncScrollVideoImmediate(section.offsetTop / maxScroll);
      }
    }
  };
  const activeSlideAccentHex =
    (slideIndex === 0
      ? slide1Style.accentColor
      : slideIndex === 1
        ? slide2Style.accentColor
        : slide3Style.accentColor) ||
    (isLightTheme ? '#157A76' : '#E8C56E');

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

  useEffect(() => {
    if (
      slideExtras.showRepresentedOption === false &&
      selectedStatus === 'represented'
    ) {
      setSelectedStatus('attending');
    }
  }, [slideExtras.showRepresentedOption, selectedStatus]);
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
  const [justSubmitted, setJustSubmitted] = useState<boolean>(false);
  const [submitNonce, setSubmitNonce] = useState<number>(0);
  const [lastSubmissionWasUpdate, setLastSubmissionWasUpdate] =
    useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const rsvpReceiptRef = useRef<HTMLDivElement | null>(null);
  const isUserSubmittingRef = useRef<boolean>(false);
  const hasHydratedInitialRsvpRef = useRef<boolean>(
    Boolean(initialStatus && initialStatus !== 'pending')
  );

  useEffect(() => {
    if (
      initialStatus &&
      initialStatus !== 'pending' &&
      !hasHydratedInitialRsvpRef.current &&
      !isUserSubmittingRef.current
    ) {
      hasHydratedInitialRsvpRef.current = true;
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
      isScrollMode ||
      isPaused ||
      isDirectEditActive ||
      slideIndex >= 2 ||
      slideDurationMs <= 0
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setSlideIndex((prev) => (prev < 2 ? ((prev + 1) as 0 | 1 | 2) : prev));
    }, slideDurationMs);
    return () => window.clearTimeout(timer);
  }, [phase, isScrollMode, isPaused, isDirectEditActive, slideIndex, slideDurationMs]);

  const captureCurrentSealCenter = () => {
    const layerRect = mediaLayerRef.current?.getBoundingClientRect();
    const sealRect = sealedSealImgRef.current?.getBoundingClientRect();
    if (layerRect && sealRect && sealRect.width > 0 && sealRect.height > 0) {
      setOpeningSealOrigin({
        left: sealRect.left - layerRect.left + sealRect.width / 2,
        top: sealRect.top - layerRect.top + sealRect.height / 2,
      });
    }
  };

  useEffect(() => {
    if (phase !== 'sealed' || !showSeal) return;
    const rafId = window.requestAnimationFrame(() => {
      captureCurrentSealCenter();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [
    phase,
    showSeal,
    sealOffsetX,
    sealOffsetY,
    effectiveConfig.sealSize,
    coverTopOffsetY,
    coverBottomOffsetY,
  ]);

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
      captureCurrentSealCenter();
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
      const targetSlide = previewJumpTarget.slideIndex;
      setSlideIndex(targetSlide);
      if (isScrollMode) {
        window.requestAnimationFrame(() => {
          scrollToSlide(targetSlide, true);
        });
      }
    }
    if (previewJumpTarget.replayAnimation) {
      setTextAnimReplayNonce((prev) => prev + 1);
    }
  }, [previewJumpTarget]);

  const enterStorySmoothly = (initialSlide: 0 | 1 | 2 = 0) => {
    if (hasTransitionedRef.current) return;
    hasTransitionedRef.current = true;
    setSlideIndex(initialSlide);
    setPhase('story');
    if (isScrollMode) {
      setScrollRevealedSlides([
        true,
        initialSlide >= 1,
        initialSlide >= 2,
      ]);
      scrollLastYRef.current = 0;
      const vid = getActiveScrollVideo();
      if (vid) {
        vid.pause();
        const { safeStart } = getScrollVideoBounds(vid);
        scrollSmoothTimeRef.current = safeStart;
        if (vid.readyState >= 1) {
          try {
            vid.currentTime = safeStart;
          } catch {
            // ignore
          }
        }
      }
      window.requestAnimationFrame(() => {
        if (initialSlide > 0) {
          scrollToSlide(initialSlide, true);
        } else {
          storyScrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
          syncScrollVideoImmediate(0);
        }
      });
    }
  };

  // Sync scroll video / WebP canvas frame whenever scroll mode, frames, or start sec updates
  useEffect(() => {
    if (phase !== 'story' || !isScrollMode) return;
    scrollLastDrawnFrameRef.current = -1;
    const container = storyScrollContainerRef.current;
    const progress = container
      ? Math.max(
          0,
          Math.min(
            1,
            container.scrollTop /
              Math.max(1, container.scrollHeight - container.clientHeight)
          )
        )
      : scrollProgressRef.current;
    syncScrollVideoImmediate(progress);
  }, [
    phase,
    isScrollMode,
    scrollVideoStartSec,
    dedicatedScrollVideoUrl,
    resolvedScrollFrames,
  ]);

  useEffect(() => {
    const audio = bgAudioRef.current;
    if (!audio) return;
    audio.volume = bgAudioVolume;
    audio.muted = muted;
  }, [bgAudioVolume, muted, activeBgAudioSrc]);

  useEffect(() => {
    const audio = bgAudioRef.current;
    if (!audio || !activeBgAudioSrc) return;
    if (phase !== 'sealed' && !muted && audio.paused) {
      audio.volume = bgAudioVolume;
      audio.muted = false;
      void audio.play().catch(() => {});
    }
  }, [activeBgAudioSrc, phase, muted, bgAudioVolume]);

  useEffect(() => {
    const onVisChange = () => {
      const audio = bgAudioRef.current;
      if (!audio || !activeBgAudioSrc) return;
      if (document.hidden) {
        audio.pause();
      } else if (phase !== 'sealed' && !muted) {
        void audio.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [activeBgAudioSrc, phase, muted]);

  useEffect(() => {
    return () => {
      stopScrollVideoEngine();
      if (imageTimerRef.current) {
        window.clearTimeout(imageTimerRef.current);
      }
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
      }
    };
  }, []);

  const handleBreakSeal = () => {
    captureCurrentSealCenter();
    hasTransitionedRef.current = false;
    stopScrollVideoEngine();
    setPhase('opening');

    // Start custom background audio synchronously inside the tap gesture (iOS/Android autoplay compliant)
    if (bgAudioRef.current && activeBgAudioSrc) {
      bgAudioRef.current.volume = bgAudioVolume;
      bgAudioRef.current.muted = muted;
      bgAudioRef.current.currentTime = 0;
      void bgAudioRef.current.play().catch(() => {});
    }

    // Prime dedicated scroll video inside the user's tap gesture so iOS Safari & Android Chrome pre-decode frames cleanly
    if (hasDedicatedScrollVideo && scrollVideoRef.current) {
      const sv = scrollVideoRef.current;
      sv.muted = true;
      sv.playsInline = true;
      const p = sv.play();
      if (p) {
        p.then(() => {
          sv.pause();
          const { safeStart } = getScrollVideoBounds(sv);
          scrollSmoothTimeRef.current = safeStart;
          try {
            sv.currentTime = safeStart;
          } catch {
            // ignore
          }
        }).catch(() => {});
      }
    }

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
    // Mute raw video track when custom background music is active so soundtracks don't clash
    video.muted = Boolean(activeBgAudioSrc) || muted;
    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {
        video.muted = true;
        if (!activeBgAudioSrc) setMuted(true);
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
    // Single continuous scroll video: pause right at handoff timestamp and reveal Slide 1 seamlessly
    if (
      isContinuousSingleVideo &&
      scrollVideoStartSec > 0.2 &&
      Number.isFinite(video.duration) &&
      video.duration > scrollVideoStartSec + 0.35 &&
      video.currentTime >= scrollVideoStartSec
    ) {
      video.pause();
      enterStorySmoothly();
      return;
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
    stopScrollVideoEngine();
    setSlideIndex(0);
    setScrollProgress(0);
    setScrollRevealedSlides([true, false, false]);
    setIsPaused(false);
    setPhase('sealed');
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    if (scrollVideoRef.current) {
      scrollVideoRef.current.pause();
      scrollVideoRef.current.currentTime = scrollVideoStartSec;
    }
    if (bgAudioRef.current) {
      bgAudioRef.current.pause();
      bgAudioRef.current.currentTime = 0;
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = Boolean(activeBgAudioSrc) || nextMuted;
    }
    if (bgAudioRef.current) {
      bgAudioRef.current.muted = nextMuted;
      if (!nextMuted && phase !== 'sealed' && bgAudioRef.current.paused) {
        bgAudioRef.current.volume = bgAudioVolume;
        void bgAudioRef.current.play().catch(() => {});
      }
    }
  };

  const handleRsvpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const wasUpdate = submittedAt !== null;
    isUserSubmittingRef.current = true;
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
      hasHydratedInitialRsvpRef.current = true;
      setLastSubmissionWasUpdate(wasUpdate);
      setSubmittedAt(Date.now());
      setSubmitNonce((n) => n + 1);
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

      requestAnimationFrame(() => {
        rsvpReceiptRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
    } finally {
      isUserSubmittingRef.current = false;
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
        {/* Dedicated Background Audio Element (Looping, Mobile-Safe) */}
        {activeBgAudioSrc && (
          <audio
            ref={bgAudioRef}
            src={activeBgAudioSrc}
            loop
            playsInline
            preload="metadata"
            className="hidden"
          />
        )}

        {/* GPU-Composited 3D Background Media Layer */}
        <div
          ref={mediaLayerRef}
          style={{ perspective: '1200px' }}
          className="absolute inset-0 overflow-hidden bg-[#0E0E10] pointer-events-none"
        >
          {/* Open Paper / Story Crisp Background with subtle 3D depth push-in */}
          {activeOpenImg && (
            <motion.img
              src={activeOpenImg}
              alt=""
              aria-hidden="true"
              decoding="async"
              style={{ objectPosition: `${openBgPosX}% ${openBgPosY}%` }}
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
          )}

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

          {/* MODE B: Video Opening Engine (also serves as continuous scroll video when no separate scroll video is set) */}
          {!isImageMode && (
            <video
              key={resolvedIntroVideoUrl || rawIntroVideoUrl}
              ref={videoRef}
              src={resolvedIntroVideoUrl || undefined}
              poster={effectiveVideoPoster || undefined}
              playsInline
              preload="auto"
              onLoadedMetadata={() => {
                if (phase === 'opening' && videoRef.current?.paused) {
                  videoRef.current.playbackRate = effectiveVideoSpeed;
                  videoRef.current.muted = Boolean(activeBgAudioSrc) || muted;
                  void videoRef.current.play().catch(() => {});
                } else if (phase === 'story' && isContinuousSingleVideo) {
                  syncScrollVideoImmediate(scrollProgressRef.current);
                }
              }}
              onTimeUpdate={handleVideoTimeUpdate}
              onEnded={() => enterStorySmoothly()}
              className={`absolute inset-0 w-full h-full object-cover scale-[1.04] transition-opacity duration-500 ease-out will-change-[opacity] ${
                phase === 'story' && !isContinuousSingleVideo
                  ? 'opacity-0'
                  : 'opacity-100'
              }`}
            />
          )}

          {/* MODE C: Dedicated Scroll-Driven Story Renderer (60fps WebP Frame Canvas OR External MP4 Video) */}
          {hasDedicatedScrollVideo && isScrollFramesMode && (
            <canvas
              ref={scrollFramesCanvasRef}
              aria-hidden="true"
              className={`absolute inset-0 w-full h-full scale-[1.04] transition-opacity duration-500 ease-out will-change-[opacity] ${
                phase === 'story' ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}

          {hasDedicatedScrollVideo && !isScrollFramesMode && (
            <video
              key={resolvedScrollVideoUrl || dedicatedScrollVideoUrl}
              ref={scrollVideoRef}
              src={resolvedScrollVideoUrl || undefined}
              poster={activeOpenImg || undefined}
              muted
              playsInline
              preload="auto"
              onLoadedMetadata={() => {
                if (phase === 'story') {
                  syncScrollVideoImmediate(scrollProgressRef.current);
                }
              }}
              className={`absolute inset-0 w-full h-full object-cover scale-[1.04] transition-opacity duration-500 ease-out will-change-[opacity] ${
                phase === 'story' ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}

          {/* 3D Gold Wax Seal — Burst & Spin-Dissolve locked to exact seal center */}
          {phase === 'opening' && showSeal && (
            <div
              style={
                openingSealOrigin
                  ? {
                      perspective: '900px',
                      left: `${openingSealOrigin.left}px`,
                      top: `${openingSealOrigin.top}px`,
                      transform: 'translate(-50%, -50%)',
                    }
                  : {
                      perspective: '900px',
                      left: '50%',
                      top: '50%',
                      transform: `translate(-50%, -50%) translate3d(${sealOffsetX}%, ${sealOffsetY}%, 0)`,
                    }
              }
              className="absolute flex items-center justify-center pointer-events-none z-20"
            >
              <motion.img
                src={sealImgSrc}
                alt=""
                aria-hidden="true"
                style={{ transformOrigin: 'center center' }}
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

          {/* Clean gradient vignette: Cover is 0% clean by default; Story uses customizable darkness */}
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
                : phase === 'sealed' && coverOverlayAlpha > 0
                  ? {
                      background: isLightTheme
                        ? `linear-gradient(to bottom, rgba(255,255,255,${coverOverlayAlpha.toFixed(2)}), rgba(255,255,255,${(coverOverlayAlpha * 0.2).toFixed(2)}), rgba(255,255,255,${Math.min(0.85, coverOverlayAlpha + 0.08).toFixed(2)}))`
                        : `linear-gradient(to bottom, rgba(0,0,0,${coverOverlayAlpha.toFixed(2)}), rgba(0,0,0,${(coverOverlayAlpha * 0.2).toFixed(2)}), rgba(0,0,0,${Math.min(0.85, coverOverlayAlpha + 0.08).toFixed(2)}))`,
                    }
                  : undefined
            }
            className={`absolute inset-0 transition-opacity duration-700 ease-out ${
              phase === 'opening'
                ? isLightTheme
                  ? 'bg-gradient-to-t from-white/25 via-transparent to-white/10'
                  : 'bg-gradient-to-t from-black/30 via-transparent to-black/15'
                : ''
            }`}
          />
        </div>

        {/* Center Snap Guide Overlay (Direct Preview Edit Mode) */}
        {isDirectEditActive && (snapGuide.x || snapGuide.y) && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30">
            {snapGuide.x && (
              <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-[#38BDF8]/85 shadow-[0_0_8px_#38BDF8]" />
            )}
            {snapGuide.y && (
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-[#38BDF8]/85 shadow-[0_0_8px_#38BDF8]" />
            )}
          </div>
        )}

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
                onPointerDown={(e) => startDirectDrag(e, 'cover-top', 'cover-top')}
                onPointerMove={moveDirectDrag}
                onPointerUp={endDirectDrag}
                onPointerCancel={endDirectDrag}
                initial={{ opacity: 0, y: coverTopOffsetY - 10, scale: panelScales.cover / 100 }}
                animate={{ opacity: 1, y: coverTopOffsetY, scale: panelScales.cover / 100 }}
                transition={{ duration: isDirectEditActive ? 0.05 : 0.45, ease: SMOOTH_EASE }}
                style={{
                  transformOrigin: 'top center',
                  textShadow: coverStyle.textShadow,
                  fontFamily: coverStyle.bodyFont,
                }}
                className={`max-w-[330px] mx-auto w-full space-y-1.5 rounded-xl px-1.5 py-1 ${
                  coverStyle.isLeft ? 'text-left' : 'text-center'
                } ${getEditableClass('cover-top', true)}`}
              >
                {isDirectEditActive && selectedEditTarget === 'cover-top' && (
                  <span className="pointer-events-none absolute -top-2.5 right-1 px-1.5 py-0.5 rounded-full bg-[#0EA5E9] text-white text-[9px] font-bold shadow">
                    Teks Sampul · Seret ↕ ({coverTopOffsetY}px)
                  </span>
                )}
                {slideExtras.showCoverBadge !== false && (
                  <div
                    style={{
                      fontSize: `${textSizes.coverBadge}px`,
                      color: coverStyle.accentColor || undefined,
                    }}
                    className={`font-bold uppercase tracking-[0.26em] ${
                      isLightTheme ? 'text-[#8A5A10]' : 'text-[#E6C775]'
                    }`}
                  >
                    {effectiveConfig.coverBadge || 'Undangan Resmi'}
                  </div>
                )}
                <div
                  style={{ color: coverStyle.bodyColor || undefined }}
                  className={`text-[13.5px] font-medium pt-1.5 ${
                    isLightTheme ? 'text-[#334155]' : 'text-[#F5EFE0]/90'
                  }`}
                >
                  {payload.salutation}
                </div>
                <h1
                  style={{
                    fontFamily: coverStyle.headingFont,
                    color: coverStyle.titleColor || undefined,
                    fontSize:
                      slideExtras.coverNameSize > 0
                        ? `${slideExtras.coverNameSize}px`
                        : undefined,
                  }}
                  className={`font-extrabold ${
                    slideExtras.coverNameSize > 0 ? '' : scaleStyle.coverName
                  } leading-snug break-words ${
                    coverStyle.titleColor
                      ? ''
                      : isLightTheme
                        ? 'text-[#151109]'
                        : 'text-transparent bg-clip-text bg-gradient-to-b from-[#FFF1C4] via-[#E8C56E] to-[#C69738]'
                  }`}
                >
                  {payload.recipientName}
                </h1>
                {slideExtras.showCoverInstitution !== false && payload.institution && (
                  <p
                    style={{
                      color: coverStyle.bodyColor || undefined,
                      fontSize:
                        slideExtras.coverInstitutionSize > 0
                          ? `${slideExtras.coverInstitutionSize}px`
                          : undefined,
                    }}
                    className={`${
                      slideExtras.coverInstitutionSize > 0 ? '' : 'text-[13.5px]'
                    } font-medium leading-snug break-words ${
                      isLightTheme ? 'text-[#334155]' : 'text-[#EBE4D1]/90'
                    }`}
                  >
                    {payload.institution}
                  </p>
                )}
              </motion.div>

              {/* Center Interactive 3D Gold Wax Seal (X + Y positionable) */}
              <div
                onPointerDown={(e) => startDirectDrag(e, 'cover-seal', 'cover-seal')}
                onPointerMove={moveDirectDrag}
                onPointerUp={endDirectDrag}
                onPointerCancel={endDirectDrag}
                style={{
                  perspective: '900px',
                  transform: `translate3d(${sealOffsetX}%, ${sealOffsetY}%, 0)`,
                }}
                className={`flex items-center justify-center my-auto rounded-full p-1 ${
                  isDirectEditActive ? '' : 'transition-transform duration-150'
                } ${getEditableClass('cover-seal', true)}`}
              >
                {isDirectEditActive && selectedEditTarget === 'cover-seal' && (
                  <span className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-full bg-[#0EA5E9] text-white text-[9px] font-bold shadow z-20">
                    Segel 3D · Seret ✥ ({sealOffsetX}%, {sealOffsetY}%)
                  </span>
                )}
                {showSeal ? (
                  <motion.button
                    type="button"
                    onClick={() => {
                      if (isDirectEditActive) return;
                      handleBreakSeal();
                    }}
                    whileHover={isDirectEditActive ? undefined : { scale: 1.05 }}
                    whileTap={isDirectEditActive ? undefined : { scale: 0.92 }}
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
                        ref={sealedSealImgRef}
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
                    onClick={() => {
                      if (isDirectEditActive) return;
                      handleBreakSeal();
                    }}
                    aria-label="Sentuh untuk membuka undangan"
                    className="w-28 h-28 rounded-full border border-[#F0D483]/30 bg-[#D4AF37]/5 active:scale-95 transition-transform"
                  >
                    <span className="sr-only">Buka Undangan</span>
                  </button>
                )}
              </div>

              {/* Bottom Smartphone-Friendly CTA */}
              <motion.div
                onPointerDown={(e) => startDirectDrag(e, 'cover-bottom', 'cover-bottom')}
                onPointerMove={moveDirectDrag}
                onPointerUp={endDirectDrag}
                onPointerCancel={endDirectDrag}
                initial={{ opacity: 0, y: coverBottomOffsetY + 12, scale: panelScales.cover / 100 }}
                animate={{ opacity: 1, y: coverBottomOffsetY, scale: panelScales.cover / 100 }}
                transition={{ duration: isDirectEditActive ? 0.05 : 0.45, delay: isDirectEditActive ? 0 : 0.1, ease: SMOOTH_EASE }}
                style={{ transformOrigin: 'bottom center', fontFamily: coverStyle.bodyFont }}
                className={`space-y-3.5 rounded-2xl px-1.5 py-1 ${getEditableClass('cover-bottom', true)}`}
              >
                {isDirectEditActive && selectedEditTarget === 'cover-bottom' && (
                  <span className="pointer-events-none absolute -top-2.5 right-1 px-1.5 py-0.5 rounded-full bg-[#0EA5E9] text-white text-[9px] font-bold shadow">
                    Tombol Bawah · Seret ↕ ({coverBottomOffsetY}px)
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (isDirectEditActive) return;
                    handleBreakSeal();
                  }}
                  style={{
                    fontSize: `${textSizes.openButtonText}px`,
                    fontFamily: coverStyle.headingFont,
                    width:
                      slideExtras.coverButtonWidth &&
                      slideExtras.coverButtonWidth < 100
                        ? `${slideExtras.coverButtonWidth}%`
                        : '100%',
                    ...coverStyle.primaryButtonStyle,
                  }}
                  className={`max-w-[300px] min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r ${themeStyle.ctaBg} ${themeStyle.ctaText} font-extrabold tracking-wide shadow-[0_12px_32px_-6px_rgba(0,0,0,0.35)] active:scale-[0.98] transition-transform`}
                >
                  <span>
                    {effectiveConfig.openButtonText || 'Sentuh Segel untuk Membuka'}
                  </span>
                </button>
                {slideExtras.showCoverQuickRsvp !== false && (
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isDirectEditActive) return;
                        enterStorySmoothly(2);
                      }}
                      style={{
                        color: coverStyle.bodyColor || undefined,
                        textShadow: coverStyle.textShadow,
                      }}
                      className={`py-1.5 px-3 text-[12.5px] font-medium underline underline-offset-4 transition-colors ${
                        isLightTheme
                          ? 'text-[#1E293B] hover:text-[#157A76]'
                          : 'text-[#E6DEC8]/90 hover:text-[#FCE9B2]'
                      }`}
                    >
                      {slideExtras.coverQuickRsvpText || 'Langsung ke Konfirmasi RSVP'}
                    </button>
                  </div>
                )}
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
                className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform ${topControlBtnClass}`}
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
                className={`min-h-[40px] px-4 rounded-full text-[12.5px] font-semibold active:scale-95 transition-transform ${topControlBtnClass}`}
              >
                Lewati →
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PHASE 3: INTERACTIVE 3-SLIDE STORY */}
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
                    onClick={() => scrollToSlide(idx as 0 | 1 | 2)}
                    aria-label={`Buka adegan ${idx + 1}`}
                    className={`h-1.5 rounded-full overflow-hidden ${
                      isLightTheme ? 'bg-[#1B1B4B]/15' : 'bg-white/15'
                    }`}
                  >
                    {isScrollMode ? (
                      <div
                        style={{
                          backgroundColor: activeSlideAccentHex,
                          transform: `scaleX(${Math.max(
                            0,
                            Math.min(1, scrollProgress * 3 - idx)
                          )})`,
                          transformOrigin: 'left',
                        }}
                        className="h-full w-full transition-transform duration-75 will-change-transform"
                      />
                    ) : idx < slideIndex ? (
                      <div
                        style={{ backgroundColor: activeSlideAccentHex }}
                        className="h-full w-full"
                      />
                    ) : idx === slideIndex ? (
                      idx < 2 && !isPaused ? (
                        <motion.div
                          key={`prog-${slideIndex}-${isPaused}`}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          style={{
                            transformOrigin: 'left',
                            backgroundColor: activeSlideAccentHex,
                          }}
                          transition={{
                            duration: slideDurationMs / 1000,
                            ease: 'linear',
                          }}
                          className="h-full w-full will-change-transform"
                        />
                      ) : (
                        <div
                          style={{ backgroundColor: activeSlideAccentHex }}
                          className="h-full w-full"
                        />
                      )
                    ) : null}
                  </button>
                ))}
              </div>

              <div
                onPointerDown={(e) => {
                  if (!isDirectEditActive) return;
                  startDirectDrag(e, 'story-nav');
                }}
                className={`flex items-center justify-between gap-2 rounded-xl px-1 py-0.5 ${getEditableClass('story-nav')}`}
              >
                <span
                  style={{ color: activeSlideAccentHex }}
                  className="text-[11.5px] font-bold uppercase tracking-[0.18em]"
                >
                  {slideIndex === 0
                    ? '01 · Undangan'
                    : slideIndex === 1
                      ? '02 · Waktu & Lokasi'
                      : '03 · Konfirmasi RSVP'}
                </span>

                <div className="flex items-center gap-1.5">
                  {activeBgAudioSrc && (
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      title={muted ? 'Aktifkan musik latar' : 'Bisukan musik latar'}
                      aria-label={muted ? 'Aktifkan musik latar' : 'Bisukan musik latar'}
                      className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform ${topControlBtnClass}`}
                    >
                      {muted ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  {!isScrollMode && slideIndex < 2 && (
                    <button
                      type="button"
                      onClick={() => setIsPaused((p) => !p)}
                      aria-label={isPaused ? 'Lanjutkan otomatis' : 'Jeda otomatis'}
                      className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform ${topControlBtnClass}`}
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
                    className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform ${topControlBtnClass}`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  {!embeddedPreview && (
                    <button
                      type="button"
                      onClick={handleToggleFullscreen}
                      title={isFullscreen ? 'Keluar layar penuh' : 'Mode layar penuh'}
                      aria-label={isFullscreen ? 'Keluar layar penuh' : 'Mode layar penuh'}
                      className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform ${topControlBtnClass}`}
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
                      onClick={() => scrollToSlide(2)}
                      className={`h-9 px-3.5 rounded-full text-[12px] font-bold active:scale-95 transition-transform ${
                        isLightTheme
                          ? 'bg-white/90 border border-[#1B1B4B]/20 text-[#1B1B4B] shadow-xs'
                          : 'bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#FCE9B2]'
                      }`}
                    >
                      RSVP
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Smooth Scrollable Safe-Zone Positioned Slide Area (Android-compact & Vertical Scroll Mode) */}
            <div
              ref={storyScrollContainerRef}
              onScroll={isScrollMode ? handleStoryScroll : undefined}
              className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 ${
                isScrollMode ? 'py-0 snap-y snap-proximity' : 'py-2 flex flex-col'
              }`}
            >
              <div
                style={
                  isScrollMode
                    ? undefined
                    : {
                        transform: (() => {
                          const activeScale =
                            slideIndex === 0
                              ? panelScales.slide1
                              : slideIndex === 1
                                ? panelScales.slide2
                                : panelScales.slide3;
                          const parts: string[] = [];
                          if (panelOffsetY !== 0)
                            parts.push(`translateY(${panelOffsetY}%)`);
                          if (activeScale !== 100)
                            parts.push(`scale(${activeScale / 100})`);
                          return parts.length > 0 ? parts.join(' ') : undefined;
                        })(),
                        transformOrigin:
                          effectiveConfig.panelPosition === 'top'
                            ? 'top center'
                            : effectiveConfig.panelPosition === 'bottom'
                              ? 'bottom center'
                              : 'center center',
                      }
                }
                className={
                  isScrollMode
                    ? 'w-full h-full'
                    : `w-full transition-transform duration-300 ${
                        effectiveConfig.panelPosition === 'top'
                          ? 'mb-auto pt-1'
                          : effectiveConfig.panelPosition === 'bottom'
                            ? 'mt-auto pb-1'
                            : 'my-auto'
                      }`
                }
              >
                <AnimatePresence mode={isScrollMode ? 'sync' : 'wait'}>
                  {(isScrollMode || slideIndex === 0) && (
                    <section
                      key={`section-0-${isScrollMode ? 'scroll' : 'slide'}`}
                      ref={(el) => {
                        scrollSectionRefs.current[0] = el;
                      }}
                      className={
                        isScrollMode
                          ? `min-h-full snap-start flex flex-col py-4 ${
                              effectiveConfig.panelPosition === 'top'
                                ? 'justify-start pt-2'
                                : effectiveConfig.panelPosition === 'bottom'
                                  ? 'justify-end pb-6'
                                  : 'justify-center'
                            }`
                          : 'w-full'
                      }
                    >
                    <motion.div
                      key={`slide-0-${textAnim}-${textAnimReplayNonce}`}
                      initial={skipTextAnim ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: skipTextAnim ? 0 : 0.24, ease: EDITORIAL_EASE }}
                      style={{
                        textShadow: slide1Style.textShadow,
                        fontFamily: slide1Style.bodyFont,
                        ...bodyBoldStyle,
                        ...(isScrollMode
                          ? {
                              transform: (() => {
                                const parts: string[] = [];
                                if (panelOffsetY !== 0)
                                  parts.push(`translateY(${panelOffsetY}%)`);
                                if (panelScales.slide1 !== 100)
                                  parts.push(`scale(${panelScales.slide1 / 100})`);
                                return parts.length > 0 ? parts.join(' ') : undefined;
                              })(),
                              transformOrigin: 'center center',
                            }
                          : {}),
                      }}
                      className={`${slide1Style.isLeft ? 'text-left' : 'text-center'} space-y-3`}
                    >
                      {slideExtras.showSlide1Organizer !== false && (
                        <motion.div
                          {...getEditorialBlockMotion(textAnim, 0.04, skipTextAnim)}
                          onPointerDown={(e) => startDirectDrag(e, 'slide1-organizer')}
                          style={slide1Style.badgeStyle}
                          className={`inline-flex items-center px-3 py-1 rounded-full border text-[11px] font-semibold max-w-full ${getEditableClass('slide1-organizer')}`}
                        >
                          {isDirectEditActive &&
                            selectedEditTarget === 'slide1-organizer' && (
                              <span className="pointer-events-none absolute -top-2.5 right-0 px-1.5 py-0.5 rounded-full bg-[#0EA5E9] text-white text-[9px] font-bold shadow">
                                Penyelenggara
                              </span>
                            )}
                          <span className="truncate">{payload.organizer}</span>
                        </motion.div>
                      )}

                      <div
                        onPointerDown={(e) => startDirectDrag(e, 'slide1-header')}
                        className={`space-y-1.5 px-1.5 py-1 rounded-xl ${getEditableClass('slide1-header')}`}
                      >
                        {isDirectEditActive && selectedEditTarget === 'slide1-header' && (
                          <span className="pointer-events-none absolute -top-2.5 right-1 px-1.5 py-0.5 rounded-full bg-[#0EA5E9] text-white text-[9px] font-bold shadow">
                            Judul Slide 1
                          </span>
                        )}
                        <EditorialTextReveal
                          as="p"
                          text={effectiveConfig.slide1Heading || 'Dengan Hormat Mengundang'}
                          preset={textAnim}
                          delay={0.1}
                          instant={skipTextAnim}
                          style={{
                            fontSize: `${textSizes.slide1Heading}px`,
                            color: slide1Style.accentColor || undefined,
                          }}
                          className="font-semibold tracking-[0.2em] uppercase text-[#E6DEC8]/80"
                        />
                        <EditorialTextReveal
                          as="h2"
                          text={payload.eventName}
                          preset={textAnim}
                          delay={0.18}
                          instant={skipTextAnim}
                          style={{
                            fontFamily: slide1Style.headingFont,
                            color: slide1Style.titleColor || undefined,
                            fontSize:
                              slideExtras.slide1TitleSize > 0
                                ? `${slideExtras.slide1TitleSize}px`
                                : undefined,
                          }}
                          wordClassName={
                            slide1Style.titleColor
                              ? ''
                              : `text-transparent bg-clip-text bg-gradient-to-b ${themeStyle.titleGradient}`
                          }
                          className={`font-extrabold ${
                            slideExtras.slide1TitleSize > 0 ? '' : scaleStyle.slideTitle
                          } leading-snug break-words`}
                        />
                      </div>

                      {effectiveConfig.slide1BannerDataUrl ? (
                        <motion.div
                          {...getEditorialBlockMotion(textAnim, 0.34, skipTextAnim)}
                        >
                        <div
                          onPointerDown={handleBannerPointerDown}
                          onPointerMove={handleBannerPointerMove}
                          onPointerUp={handleBannerPointerUp}
                          onPointerCancel={handleBannerPointerUp}
                          style={{
                            width:
                              slideExtras.slide1BannerWidth &&
                              slideExtras.slide1BannerWidth < 100
                                ? `${slideExtras.slide1BannerWidth}%`
                                : '100%',
                            marginLeft: 'auto',
                            marginRight: 'auto',
                            ...(slide1BannerOffsetX !== 0 || slide1BannerOffsetY !== 0
                              ? {
                                  transform: `translate3d(${slide1BannerOffsetX}px, ${slide1BannerOffsetY}px, 0)`,
                                }
                              : {}),
                          }}
                          className={`relative z-10 aspect-[3/2] ${
                            effectiveConfig.slide1BannerDataUrl.startsWith(
                              'data:image/png'
                            )
                              ? 'flex items-center justify-center bg-transparent'
                              : 'rounded-2xl overflow-hidden border border-[#D4AF37]/35 bg-transparent shadow-md'
                          } ${
                            canDragSlide1Banner
                              ? 'touch-none select-none cursor-grab active:cursor-grabbing ring-1 ring-dashed ring-[#D4AF37]/50'
                              : ''
                          } ${
                            isDirectEditActive && selectedEditTarget === 'slide1-banner'
                              ? 'ring-2 ring-[#38BDF8]'
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
                        </motion.div>
                      ) : (
                        <motion.div
                          aria-hidden="true"
                          initial={skipTextAnim ? false : { scaleX: 0, opacity: 0 }}
                          animate={{ scaleX: 1, opacity: 1 }}
                          transition={{
                            duration: skipTextAnim ? 0 : 0.72,
                            delay: skipTextAnim ? 0 : 0.34,
                            ease: EDITORIAL_EASE,
                          }}
                          style={{
                            transformOrigin: slide1Style.isLeft ? 'left center' : 'center',
                          }}
                          className={`${slide1Style.isLeft ? '' : 'mx-auto'} w-16 h-px bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent`}
                        />
                      )}

                      <motion.div
                        {...getEditorialBlockMotion(textAnim, 0.4, skipTextAnim)}
                      >
                      <div
                        onPointerDown={(e) => startDirectDrag(e, 'slide1-panel', 'slide1-panel')}
                        onPointerMove={moveDirectDrag}
                        onPointerUp={endDirectDrag}
                        onPointerCancel={endDirectDrag}
                        style={{
                          ...slide1Style.cardStyle,
                          transform:
                            slide1Style.panelOffsetY !== 0
                              ? `translateY(${slide1Style.panelOffsetY}px)`
                              : undefined,
                        }}
                        className={`${cardSurfaceClass} ${slide1Style.panelPaddingClass} space-y-1 ${getEditableClass('slide1-panel', true)}`}
                      >
                        {isDirectEditActive && selectedEditTarget === 'slide1-panel' && (
                          <span className="pointer-events-none absolute -top-2.5 right-2 px-1.5 py-0.5 rounded-full bg-[#0EA5E9] text-white text-[9px] font-bold shadow">
                            Panel Slide 1 · Seret ↕ ({slide1Style.panelOffsetY}px)
                          </span>
                        )}
                        <div
                          style={{ color: slide1Style.panelAccentColor }}
                          className="text-[11px] font-semibold"
                        >
                          {payload.salutation}
                        </div>
                        <EditorialTextReveal
                          as="div"
                          text={payload.recipientName}
                          preset={textAnim}
                          delay={0.48}
                          instant={skipTextAnim}
                          style={{
                            fontFamily: slide1Style.headingFont,
                            color: slide1Style.panelBodyColor,
                            fontSize:
                              slideExtras.slide1RecipientSize > 0
                                ? `${slideExtras.slide1RecipientSize}px`
                                : undefined,
                          }}
                          className={`font-extrabold ${
                            slideExtras.slide1RecipientSize > 0
                              ? ''
                              : scaleStyle.recipientName
                          } leading-snug break-words`}
                        />
                        {payload.institution && (
                          <div
                            style={{
                              color: slide1Style.panelMutedColor,
                              fontSize:
                                slideExtras.slide1InstitutionSize > 0
                                  ? `${slideExtras.slide1InstitutionSize}px`
                                  : undefined,
                            }}
                            className={`${
                              slideExtras.slide1InstitutionSize > 0
                                ? ''
                                : scaleStyle.body
                            } leading-snug break-words`}
                          >
                            {payload.institution}
                          </div>
                        )}
                        {slideExtras.showSlide1Code !== false && (
                          <div
                            style={{
                              color: slide1Style.panelAccentColor,
                              opacity: 0.85,
                            }}
                            className="pt-1.5 text-[10.5px] font-medium tabular-nums"
                          >
                            Kode Undangan: {payload.invitationCode}
                          </div>
                        )}
                      </div>
                      </motion.div>

                      {slideExtras.showSlide1Welcome !== false && (
                        <motion.p
                          {...getEditorialBlockMotion(textAnim, 0.58, skipTextAnim)}
                          onPointerDown={(e) => startDirectDrag(e, 'slide1-welcome')}
                          style={{
                            fontSize: `${textSizes.welcomeNote}px`,
                            color: slide1Style.bodyColor || undefined,
                            opacity: slide1Style.bodyColor ? 0.92 : undefined,
                          }}
                          className={`${themeStyle.mutedText} leading-relaxed max-w-[290px] rounded-xl px-1.5 py-1 ${
                            slide1Style.isLeft ? '' : 'mx-auto'
                          } ${getEditableClass('slide1-welcome')}`}
                        >
                          {isDirectEditActive &&
                            selectedEditTarget === 'slide1-welcome' && (
                              <span className="pointer-events-none absolute -top-2.5 right-1 px-1.5 py-0.5 rounded-full bg-[#0EA5E9] text-white text-[9px] font-bold shadow">
                                Sambutan
                              </span>
                            )}
                          {effectiveConfig.welcomeNote ||
                            'Merupakan suatu kehormatan bagi kami apabila Bapak/Ibu berkenan hadir pada kegiatan tersebut.'}
                        </motion.p>
                      )}

                      {isScrollMode && !isDirectEditActive && (
                        <button
                          type="button"
                          onClick={() => scrollToSlide(1)}
                          style={{ color: activeSlideAccentHex }}
                          className={`mx-auto mt-2 inline-flex flex-col items-center gap-0.5 text-[10.5px] font-semibold tracking-wider uppercase transition-opacity duration-300 ${
                            scrollProgress < 0.08
                              ? 'opacity-85'
                              : 'opacity-0 pointer-events-none'
                          }`}
                        >
                          <span>Gulir ke bawah</span>
                          <ChevronDown className="w-4 h-4 animate-bounce" />
                        </button>
                      )}
                    </motion.div>
                    </section>
                  )}

                  {(isScrollMode || slideIndex === 1) && (
                    <section
                      key={`section-1-${isScrollMode ? 'scroll' : 'slide'}`}
                      ref={(el) => {
                        scrollSectionRefs.current[1] = el;
                      }}
                      className={
                        isScrollMode
                          ? `min-h-full snap-start flex flex-col py-4 ${
                              effectiveConfig.panelPosition === 'top'
                                ? 'justify-start pt-2'
                                : effectiveConfig.panelPosition === 'bottom'
                                  ? 'justify-end pb-6'
                                  : 'justify-center'
                            }`
                          : 'w-full'
                      }
                    >
                    <motion.div
                      key={`slide-1-${textAnim}-${textAnimReplayNonce}-${
                        isScrollMode ? (scrollRevealedSlides[1] ? 'in' : 'wait') : 'active'
                      }`}
                      initial={skipTextAnim ? false : { opacity: 0 }}
                      animate={{
                        opacity:
                          !isScrollMode || scrollRevealedSlides[1] || skipTextAnim
                            ? 1
                            : 0,
                      }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: skipTextAnim ? 0 : 0.24, ease: EDITORIAL_EASE }}
                      style={{
                        textShadow: slide2Style.textShadow,
                        fontFamily: slide2Style.bodyFont,
                        ...bodyBoldStyle,
                        ...(isScrollMode
                          ? {
                              transform: (() => {
                                const parts: string[] = [];
                                if (panelOffsetY !== 0)
                                  parts.push(`translateY(${panelOffsetY}%)`);
                                if (panelScales.slide2 !== 100)
                                  parts.push(`scale(${panelScales.slide2 / 100})`);
                                return parts.length > 0 ? parts.join(' ') : undefined;
                              })(),
                              transformOrigin: 'center center',
                            }
                          : {}),
                      }}
                      className="space-y-2.5"
                    >
                      <div
                        onPointerDown={(e) => startDirectDrag(e, 'slide2-header')}
                        className={`${slide2Style.isLeft ? 'text-left' : 'text-center'} space-y-0.5 px-1.5 py-1 rounded-xl ${getEditableClass('slide2-header')}`}
                      >
                        {isDirectEditActive && selectedEditTarget === 'slide2-header' && (
                          <span className="pointer-events-none absolute -top-2.5 right-1 px-1.5 py-0.5 rounded-full bg-[#0EA5E9] text-white text-[9px] font-bold shadow">
                            Judul Slide 2
                          </span>
                        )}
                        <EditorialTextReveal
                          as="div"
                          text={effectiveConfig.slide2Heading || 'Pelaksanaan Kegiatan'}
                          preset={textAnim}
                          delay={0.06}
                          instant={skipTextAnim}
                          style={{
                            fontSize: `${textSizes.slide2Heading}px`,
                            color: slide2Style.accentColor || undefined,
                          }}
                          className={`font-bold uppercase tracking-[0.2em] ${themeStyle.accentText}`}
                        />
                        {slideExtras.showSlide2Title !== false && (
                          <EditorialTextReveal
                            as="h2"
                            text={payload.eventName}
                            preset={textAnim}
                            delay={0.14}
                            instant={skipTextAnim}
                            style={{
                              fontFamily: slide2Style.headingFont,
                              color: slide2Style.titleColor || undefined,
                              fontSize:
                                slideExtras.slide2TitleSize > 0
                                  ? `${slideExtras.slide2TitleSize}px`
                                  : undefined,
                            }}
                            className={`font-extrabold ${
                              slideExtras.slide2TitleSize > 0
                                ? ''
                                : scaleStyle.recipientName
                            } ${themeStyle.bodyText} leading-snug break-words`}
                          />
                        )}
                      </div>

                      {/* Live Countdown */}
                      {effectiveConfig.showCountdown && countdown && (
                        <div
                          onPointerDown={(e) => startDirectDrag(e, 'slide2-countdown')}
                          style={{
                            width: slide2Style.cardStyle.width,
                            marginLeft: 'auto',
                            marginRight: 'auto',
                          }}
                          className={`grid grid-cols-4 gap-1.5 rounded-xl p-0.5 ${getEditableClass('slide2-countdown')}`}
                        >
                          {isDirectEditActive &&
                            selectedEditTarget === 'slide2-countdown' && (
                              <span className="pointer-events-none absolute -top-2.5 right-1 px-1.5 py-0.5 rounded-full bg-[#0EA5E9] text-white text-[9px] font-bold shadow z-10">
                                Hitung Mundur
                              </span>
                            )}
                          {[
                            { label: 'Hari', val: countdown.days },
                            { label: 'Jam', val: countdown.hours },
                            { label: 'Menit', val: countdown.minutes },
                            { label: 'Detik', val: countdown.seconds },
                          ].map((unit, idx) => (
                            <motion.div
                              key={unit.label}
                              {...getEditorialBlockMotion(
                                textAnim,
                                0.24 + idx * 0.055,
                                skipTextAnim
                              )}
                              style={{
                                ...slide2Style.cardStyle,
                                width: undefined,
                                marginLeft: undefined,
                                marginRight: undefined,
                              }}
                              className={`${cardSurfaceClass} py-2 px-1 text-center`}
                            >
                              <div
                                style={{
                                  fontFamily: slide2Style.headingFont,
                                  color: slide2Style.panelAccentColor,
                                }}
                                className="font-extrabold text-[17px] tabular-nums leading-none"
                              >
                                {String(unit.val).padStart(2, '0')}
                              </div>
                              <div
                                style={{ color: slide2Style.panelMutedColor }}
                                className="text-[9.5px] font-semibold uppercase tracking-wider mt-1"
                              >
                                {unit.label}
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}

                      {/* Date / Time / Location Card */}
                      <motion.div
                        {...getEditorialBlockMotion(textAnim, 0.42, skipTextAnim)}
                      >
                      <div
                        onPointerDown={(e) => startDirectDrag(e, 'slide2-panel', 'slide2-panel')}
                        onPointerMove={moveDirectDrag}
                        onPointerUp={endDirectDrag}
                        onPointerCancel={endDirectDrag}
                        style={{
                          ...slide2Style.cardStyle,
                          transform:
                            slide2Style.panelOffsetY !== 0
                              ? `translateY(${slide2Style.panelOffsetY}px)`
                              : undefined,
                        }}
                        className={`${cardSurfaceClass} ${slide2Style.panelPaddingClass} space-y-2.5 ${scaleStyle.body} ${getEditableClass('slide2-panel', true)}`}
                      >
                        {isDirectEditActive && selectedEditTarget === 'slide2-panel' && (
                          <span className="pointer-events-none absolute -top-2.5 right-2 px-1.5 py-0.5 rounded-full bg-[#0EA5E9] text-white text-[9px] font-bold shadow">
                            Panel Slide 2 · Seret ↕ ({slide2Style.panelOffsetY}px)
                          </span>
                        )}
                        {payload.date && (
                          <div className="flex items-start gap-2.5">
                            <Clock
                              style={{ color: slide2Style.panelAccentColor }}
                              className="w-4 h-4 shrink-0 mt-0.5"
                            />
                            <div className="min-w-0">
                              <div
                                style={{ color: slide2Style.panelAccentColor }}
                                className="text-[10px] font-semibold uppercase tracking-wider"
                              >
                                Tanggal & Waktu
                              </div>
                              <div
                                style={{
                                  color: slide2Style.panelBodyColor,
                                  fontSize:
                                    slideExtras.slide2DetailSize > 0
                                      ? `${slideExtras.slide2DetailSize}px`
                                      : undefined,
                                }}
                                className={`font-bold ${
                                  slideExtras.slide2DetailSize > 0 ? '' : 'text-[13px]'
                                } mt-0.5 leading-snug`}
                              >
                                {payload.date}
                              </div>
                              {payload.time && (
                                <div
                                  style={{
                                    color: slide2Style.panelMutedColor,
                                    fontSize:
                                      slideExtras.slide2DetailSize > 0
                                        ? `${Math.max(10, slideExtras.slide2DetailSize - 1)}px`
                                        : undefined,
                                  }}
                                  className={`${
                                    slideExtras.slide2DetailSize > 0 ? '' : 'text-[11.5px]'
                                  } mt-0.5`}
                                >
                                  {payload.time}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {payload.location && (
                          <div
                            style={{ borderTopColor: slide2Style.dividerColor }}
                            className="flex items-start gap-2.5 pt-2.5 border-t"
                          >
                            <MapPin
                              style={{ color: slide2Style.panelAccentColor }}
                              className="w-4 h-4 shrink-0 mt-0.5"
                            />
                            <div className="min-w-0">
                              <div
                                style={{ color: slide2Style.panelAccentColor }}
                                className="text-[10px] font-semibold uppercase tracking-wider"
                              >
                                Lokasi Acara
                              </div>
                              <div
                                style={{
                                  color: slide2Style.panelBodyColor,
                                  fontSize:
                                    slideExtras.slide2DetailSize > 0
                                      ? `${slideExtras.slide2DetailSize}px`
                                      : undefined,
                                }}
                                className={`font-bold ${
                                  slideExtras.slide2DetailSize > 0 ? '' : 'text-[12.5px]'
                                } mt-0.5 leading-snug break-words`}
                              >
                                {payload.location}
                              </div>
                            </div>
                          </div>
                        )}

                        {effectiveConfig.dresscode && (
                          <div
                            style={{ borderTopColor: slide2Style.dividerColor }}
                            className="pt-2 border-t text-[11.5px]"
                          >
                            <span
                              style={{ color: slide2Style.panelAccentColor }}
                              className="text-[10px] font-semibold uppercase tracking-wider block"
                            >
                              Dresscode / Catatan Pakaian
                            </span>
                            <span
                              style={{ color: slide2Style.panelBodyColor }}
                              className="font-semibold mt-0.5 block"
                            >
                              {effectiveConfig.dresscode}
                            </span>
                          </div>
                        )}

                        {effectiveConfig.slide2ExtraNote && (
                          <div
                            style={{ borderTopColor: slide2Style.dividerColor }}
                            className="pt-2 border-t"
                          >
                            <span
                              style={{ color: slide2Style.panelAccentColor }}
                              className="text-[10px] font-semibold uppercase tracking-wider block"
                            >
                              Informasi Tambahan
                            </span>
                            <p
                              style={{
                                fontSize: `${textSizes.slide2ExtraNote}px`,
                                color: slide2Style.panelBodyColor,
                              }}
                              className="mt-0.5 leading-relaxed whitespace-pre-line break-words"
                            >
                              {effectiveConfig.slide2ExtraNote}
                            </p>
                          </div>
                        )}
                      </div>
                      </motion.div>

                      {/* Android-Compact Action Buttons */}
                      <motion.div
                        {...getEditorialBlockMotion(textAnim, 0.56, skipTextAnim)}
                        onPointerDown={(e) => startDirectDrag(e, 'slide2-buttons')}
                        style={{
                          width: slide2Style.cardStyle.width,
                          marginLeft: 'auto',
                          marginRight: 'auto',
                        }}
                        className={`space-y-1.5 rounded-2xl p-0.5 ${getEditableClass('slide2-buttons')}`}
                      >
                        {isDirectEditActive && selectedEditTarget === 'slide2-buttons' && (
                          <span className="pointer-events-none absolute -top-2.5 right-2 px-1.5 py-0.5 rounded-full bg-[#0EA5E9] text-white text-[9px] font-bold shadow">
                            Tombol Peta &amp; Kalender
                          </span>
                        )}
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
                            onClick={(e) => {
                              if (isDirectEditActive) e.preventDefault();
                            }}
                            style={slide2Style.secondaryButtonStyle}
                            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-full border border-[#D4AF37]/45 bg-[#1B1811]/90 hover:bg-[#D4AF37]/20 text-[12px] font-bold text-[#FCE9B2] active:scale-[0.98] transition-all"
                          >
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              {slideExtras.slide2MapsButtonText || 'Buka Peta'}
                            </span>
                          </a>
                          {effectiveConfig.showCalendarButton !== false && (
                            <a
                              href={gcalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                if (isDirectEditActive) e.preventDefault();
                              }}
                              style={slide2Style.secondaryButtonStyle}
                              className="min-h-[40px] inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-full border border-[#D4AF37]/45 bg-[#1B1811]/90 hover:bg-[#D4AF37]/20 text-[12px] font-bold text-[#FCE9B2] active:scale-[0.98] transition-all"
                            >
                              <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">
                                {slideExtras.slide2CalendarButtonText || 'Kalender'}
                              </span>
                            </a>
                          )}
                        </div>

                        {loWhatsAppUrl && (
                          <a
                            href={loWhatsAppUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              if (isDirectEditActive) e.preventDefault();
                            }}
                            style={slide2Style.secondaryButtonStyle}
                            className="w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 py-1.5 px-3.5 rounded-full border border-emerald-400/40 bg-emerald-950/75 hover:bg-emerald-900/75 text-[11.5px] font-semibold text-emerald-200 active:scale-[0.98] transition-all"
                          >
                            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              Narahubung: {effectiveConfig.contactName || effectiveConfig.contactPhone}
                            </span>
                          </a>
                        )}
                      </motion.div>
                    </motion.div>
                    </section>
                  )}

                  {(isScrollMode || slideIndex === 2) && (
                    <section
                      key={`section-2-${isScrollMode ? 'scroll' : 'slide'}`}
                      ref={(el) => {
                        scrollSectionRefs.current[2] = el;
                      }}
                      className={
                        isScrollMode
                          ? `min-h-full snap-start flex flex-col py-4 ${
                              effectiveConfig.panelPosition === 'top'
                                ? 'justify-start pt-2'
                                : effectiveConfig.panelPosition === 'bottom'
                                  ? 'justify-end pb-6'
                                  : 'justify-center'
                            }`
                          : 'w-full'
                      }
                    >
                    <motion.div
                      key={`slide-2-${textAnim}-${textAnimReplayNonce}-${
                        isScrollMode ? (scrollRevealedSlides[2] ? 'in' : 'wait') : 'active'
                      }`}
                      initial={skipTextAnim ? false : { opacity: 0 }}
                      animate={{
                        opacity:
                          !isScrollMode || scrollRevealedSlides[2] || skipTextAnim
                            ? 1
                            : 0,
                      }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: skipTextAnim ? 0 : 0.24, ease: EDITORIAL_EASE }}
                      style={{
                        fontFamily: slide3Style.bodyFont,
                        textShadow: slide3Style.textShadow,
                        ...(isScrollMode
                          ? {
                              transform: (() => {
                                const parts: string[] = [];
                                if (panelOffsetY !== 0)
                                  parts.push(`translateY(${panelOffsetY}%)`);
                                if (panelScales.slide3 !== 100)
                                  parts.push(`scale(${panelScales.slide3 / 100})`);
                                return parts.length > 0 ? parts.join(' ') : undefined;
                              })(),
                              transformOrigin: 'center center',
                            }
                          : {}),
                      }}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                      {(() => {
                        const rsvpReceiptCfg = {
                          ...DEFAULT_RSVP_RECEIPT_CONFIG,
                          ...(slideExtras.rsvpReceipt ?? {}),
                        };
                        const isForcedReceipt =
                          embeddedPreview &&
                          (previewRsvpViewMode === 'receipt' ||
                            previewRsvpViewMode === 'updated-receipt');
                        const isForcedForm =
                          embeddedPreview && previewRsvpViewMode === 'form';
                        const shouldShowReceipt =
                          isForcedReceipt ||
                          (!isForcedForm && !editing && Boolean(submittedAt));

                        if (shouldShowReceipt) {
                          const isUpdatePreview =
                            previewRsvpViewMode === 'updated-receipt';
                          const animateSuccess =
                            !isDirectEditActive &&
                            (justSubmitted || isForcedReceipt);
                          const isUpdateDisplay =
                            isUpdatePreview ||
                            (lastSubmissionWasUpdate && animateSuccess);
                          const accentMode = rsvpReceiptCfg.accentMode || 'auto';
                          const shouldCelebrate =
                            animateSuccess &&
                            selectedStatus !== 'declined' &&
                            accentMode !== 'minimal';
                          const ringColor =
                            accentMode === 'theme'
                              ? slide3Style.panelAccentColor
                              : selectedStatus === 'declined'
                                ? 'rgba(252, 233, 178, 0.55)'
                                : 'rgba(52, 211, 153, 0.55)';
                          const badgeText = isUpdateDisplay
                            ? rsvpReceiptCfg.updatedBadgeText ||
                              'Perubahan Tersimpan'
                            : rsvpReceiptCfg.savedBadgeText ||
                              'Tersimpan Online';
                          const receiptTitle = isUpdateDisplay
                            ? rsvpReceiptCfg.updateTitle ||
                              'Perubahan Konfirmasi Tercatat'
                            : effectiveConfig.slide3SuccessTitle ||
                              'Konfirmasi Kehadiran Tercatat';
                          const receiptNote =
                            isUpdateDisplay && rsvpReceiptCfg.updateNote
                              ? rsvpReceiptCfg.updateNote
                              : effectiveConfig.slide3SuccessNote ||
                                'Terima kasih, konfirmasi Anda telah tersimpan secara online untuk panitia.';
                          const medallionStyle: React.CSSProperties | undefined =
                            accentMode === 'theme'
                              ? {
                                  backgroundImage: 'none',
                                  backgroundColor: slide3Style.panelAccentColor,
                                  color: getContrastTextColor(
                                    slide3Style.panelAccentColor
                                  ),
                                }
                              : accentMode === 'minimal'
                                ? {
                                    backgroundImage: 'none',
                                    backgroundColor: slide3Style.subSurfaceBg,
                                    border: `1.5px solid ${slide3Style.activeChoiceBorder}`,
                                    color: slide3Style.panelAccentColor,
                                    boxShadow: 'none',
                                  }
                                : undefined;

                          return (
                        <motion.div
                          key={`rsvp-receipt-${submitNonce}-${previewRsvpViewMode}`}
                          ref={rsvpReceiptRef}
                          initial={{
                            opacity: 0,
                            y: animateSuccess ? 16 : 8,
                            scale: animateSuccess ? 0.94 : 0.98,
                          }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.96 }}
                          transition={
                            animateSuccess
                              ? { type: 'spring', stiffness: 280, damping: 24 }
                              : { duration: 0.24, ease: SMOOTH_EASE }
                          }
                        >
                        <div
                          onPointerDown={(e) => startDirectDrag(e, 'slide3-panel', 'slide3-panel')}
                          onPointerMove={moveDirectDrag}
                          onPointerUp={endDirectDrag}
                          onPointerCancel={endDirectDrag}
                          style={{
                            ...slide3Style.cardStyle,
                            transform:
                              slide3Style.panelOffsetY !== 0
                                ? `translateY(${slide3Style.panelOffsetY}px)`
                                : undefined,
                          }}
                          className={`relative border border-[#D4AF37]/35 bg-[#13120F]/90 ${slide3Style.panelPaddingClass} ${
                            slide3Style.isLeft ? 'text-left' : 'text-center'
                          } space-y-3 shadow-lg ${getEditableClass('slide3-panel', true)}`}
                        >
                          {/* One-time subtle golden shimmer sweep across the card on fresh submit */}
                          {animateSuccess && accentMode !== 'minimal' && (
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
                            >
                              <motion.span
                                initial={{ x: '-120%', opacity: 0.9 }}
                                animate={{ x: '220%', opacity: 0 }}
                                transition={{
                                  duration: 1.05,
                                  delay: 0.16,
                                  ease: [0.22, 1, 0.36, 1],
                                }}
                                className="absolute inset-y-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-[#FCE9B2]/25 to-transparent"
                              />
                            </div>
                          )}

                          {isDirectEditActive && selectedEditTarget === 'slide3-panel' && (
                            <span className="pointer-events-none absolute -top-2.5 right-2 px-1.5 py-0.5 rounded-full bg-[#0EA5E9] text-white text-[9px] font-bold shadow">
                              Panel Tercatat · Seret ↕ ({slide3Style.panelOffsetY}px)
                            </span>
                          )}

                          {/* Animated Medallion + Ripple Rings + Contextual Sparkle Burst */}
                          <div
                            className={`relative w-14 h-14 ${
                              slide3Style.isLeft ? '' : 'mx-auto'
                            } flex items-center justify-center`}
                          >
                            {animateSuccess && accentMode !== 'minimal' && (
                              <>
                                <motion.span
                                  aria-hidden="true"
                                  initial={{ scale: 0.78, opacity: 0.75 }}
                                  animate={{ scale: 2.05, opacity: 0 }}
                                  transition={{
                                    duration: 0.85,
                                    ease: [0.22, 1, 0.36, 1],
                                  }}
                                  style={{ borderColor: ringColor }}
                                  className="pointer-events-none absolute inset-0 rounded-full border-2"
                                />
                                <motion.span
                                  aria-hidden="true"
                                  initial={{ scale: 0.78, opacity: 0.5 }}
                                  animate={{ scale: 2.45, opacity: 0 }}
                                  transition={{
                                    duration: 1.05,
                                    delay: 0.16,
                                    ease: [0.22, 1, 0.36, 1],
                                  }}
                                  style={{ borderColor: 'rgba(252, 233, 178, 0.48)' }}
                                  className="pointer-events-none absolute inset-0 rounded-full border"
                                />
                              </>
                            )}

                            {shouldCelebrate &&
                              RSVP_SUCCESS_SPARKLES.map((p, idx) => (
                                <motion.span
                                  key={idx}
                                  aria-hidden="true"
                                  initial={{
                                    x: 0,
                                    y: 0,
                                    scale: 0,
                                    opacity: 0,
                                    rotate: p.diamond ? 45 : 0,
                                  }}
                                  animate={{
                                    x: p.x,
                                    y: p.y,
                                    scale: [0, 1.2, 0],
                                    opacity: [0, 1, 0],
                                    rotate: p.diamond ? 135 : 0,
                                  }}
                                  transition={{
                                    duration: 0.88,
                                    delay: p.delay,
                                    ease: [0.16, 1, 0.3, 1],
                                  }}
                                  style={{
                                    width: p.size,
                                    height: p.size,
                                    backgroundColor:
                                      accentMode === 'theme'
                                        ? slide3Style.panelAccentColor
                                        : p.color,
                                  }}
                                  className={`pointer-events-none absolute ${
                                    p.diamond ? 'rounded-[1.5px]' : 'rounded-full'
                                  }`}
                                />
                              ))}

                            <motion.div
                              initial={
                                animateSuccess
                                  ? { scale: 0.45, rotate: -14, opacity: 0 }
                                  : { scale: 0.92, opacity: 0 }
                              }
                              animate={{ scale: 1, rotate: 0, opacity: 1 }}
                              transition={
                                animateSuccess
                                  ? { type: 'spring', stiffness: 320, damping: 18 }
                                  : { duration: 0.22 }
                              }
                              style={medallionStyle}
                              className="relative z-10 w-12 h-12 rounded-full bg-gradient-to-br from-[#FCE9B2] via-[#E5C158] to-[#C69535] flex items-center justify-center text-[#151109] shadow-[0_0_22px_rgba(243,216,139,0.42)]"
                            >
                              <svg
                                viewBox="0 0 36 36"
                                className="w-7 h-7"
                                fill="none"
                                aria-hidden="true"
                              >
                                <motion.circle
                                  cx="18"
                                  cy="18"
                                  r="14.5"
                                  stroke="currentColor"
                                  strokeOpacity={0.25}
                                  strokeWidth="2"
                                  initial={{ pathLength: animateSuccess ? 0 : 1 }}
                                  animate={{ pathLength: 1 }}
                                  transition={{ duration: 0.42, ease: 'easeOut' }}
                                />
                                <motion.path
                                  d="M11.5 18.5L16 23L25 13.5"
                                  stroke="currentColor"
                                  strokeWidth="3.2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  initial={{
                                    pathLength: animateSuccess ? 0 : 1,
                                    opacity: animateSuccess ? 0 : 1,
                                  }}
                                  animate={{ pathLength: 1, opacity: 1 }}
                                  transition={{
                                    pathLength: {
                                      duration: 0.36,
                                      delay: animateSuccess ? 0.18 : 0,
                                      ease: [0.22, 1, 0.36, 1],
                                    },
                                    opacity: {
                                      duration: 0.1,
                                      delay: animateSuccess ? 0.18 : 0,
                                    },
                                  }}
                                />
                              </svg>
                            </motion.div>
                          </div>

                          <motion.div
                            role="status"
                            aria-live="polite"
                            initial={{ opacity: 0, y: animateSuccess ? 10 : 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.34,
                              delay: animateSuccess ? 0.18 : 0.04,
                              ease: SMOOTH_EASE,
                            }}
                            className="space-y-1.5"
                          >
                            {badgeText && (
                              <div
                                style={
                                  accentMode === 'theme' || accentMode === 'minimal'
                                    ? {
                                        borderColor: slide3Style.activeChoiceBorder,
                                        backgroundColor: slide3Style.activeChoiceBg,
                                        color: slide3Style.panelAccentColor,
                                      }
                                    : undefined
                                }
                                className={`relative inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10.5px] font-bold tracking-wide overflow-hidden ${
                                  accentMode === 'auto'
                                    ? selectedStatus === 'declined'
                                      ? 'border-[#FCE9B2]/35 bg-[#FCE9B2]/12 text-[#FCE9B2]'
                                      : 'border-[#34D399]/40 bg-[#10B981]/18 text-[#A7F3D0]'
                                    : ''
                                }`}
                              >
                                {animateSuccess && accentMode !== 'minimal' && (
                                  <motion.span
                                    aria-hidden="true"
                                    initial={{ x: '-130%' }}
                                    animate={{ x: '230%' }}
                                    transition={{
                                      duration: 0.85,
                                      delay: 0.35,
                                      ease: 'easeInOut',
                                    }}
                                    className="pointer-events-none absolute inset-y-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent"
                                  />
                                )}
                                <Check className="w-3 h-3 stroke-[2.8] shrink-0" />
                                <span>{badgeText}</span>
                              </div>
                            )}

                            <h2
                              style={{
                                fontFamily: slide3Style.headingFont,
                                fontSize: `${textSizes.slide3SuccessTitle}px`,
                                color: slide3Style.panelTitleColor,
                              }}
                              className="font-extrabold"
                            >
                              {receiptTitle}
                            </h2>
                            <p
                              style={{
                                fontSize: `${textSizes.slide3SuccessNote}px`,
                                color: slide3Style.panelMutedColor,
                              }}
                              className="mt-0.5 leading-relaxed"
                            >
                              {receiptNote}
                            </p>
                          </motion.div>

                          <motion.div
                            initial={{ opacity: 0, y: animateSuccess ? 10 : 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.34,
                              delay: animateSuccess ? 0.28 : 0.08,
                              ease: SMOOTH_EASE,
                            }}
                            style={{
                              backgroundColor: slide3Style.subSurfaceBg,
                              borderColor: slide3Style.subSurfaceBorder,
                            }}
                            className="rounded-xl border p-3 text-left space-y-2 text-[12px]"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span
                                style={{ color: slide3Style.panelMutedColor }}
                                className="shrink-0"
                              >
                                Nama
                              </span>
                              <span
                                style={{ color: slide3Style.panelBodyColor }}
                                className="font-bold text-right break-words"
                              >
                                {payload.recipientName}
                              </span>
                            </div>
                            {rsvpReceiptCfg.showMeta !== false && payload.institution && (
                              <div className="flex items-center justify-between gap-3">
                                <span
                                  style={{ color: slide3Style.panelMutedColor }}
                                  className="shrink-0"
                                >
                                  Instansi
                                </span>
                                <span
                                  style={{ color: slide3Style.panelBodyColor }}
                                  className="font-medium text-right break-words"
                                >
                                  {payload.institution}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-3">
                              <span
                                style={{ color: slide3Style.panelMutedColor }}
                                className="shrink-0"
                              >
                                Status
                              </span>
                              <span
                                style={{ color: slide3Style.panelAccentColor }}
                                className="font-bold"
                              >
                                {selectedStatus === 'attending'
                                  ? slideExtras.rsvpAttendingLabel || getRsvpLabel('attending')
                                  : selectedStatus === 'represented'
                                    ? slideExtras.rsvpRepresentedLabel || getRsvpLabel('represented')
                                    : slideExtras.rsvpDeclinedLabel || getRsvpLabel('declined')}
                              </span>
                            </div>
                            {representative && (
                              <div className="flex items-center justify-between gap-3">
                                <span
                                  style={{ color: slide3Style.panelMutedColor }}
                                  className="shrink-0"
                                >
                                  {selectedStatus === 'represented'
                                    ? 'Perwakilan'
                                    : 'Keterangan'}
                                </span>
                                <span
                                  style={{ color: slide3Style.panelBodyColor }}
                                  className="font-semibold text-right"
                                >
                                  {representative}
                                </span>
                              </div>
                            )}
                            {rsvpReceiptCfg.showMeta !== false && payload.invitationCode && (
                              <div className="flex items-center justify-between gap-3">
                                <span
                                  style={{ color: slide3Style.panelMutedColor }}
                                  className="shrink-0"
                                >
                                  Kode
                                </span>
                                <span
                                  style={{ color: slide3Style.panelAccentColor }}
                                  className="font-mono font-bold text-[11px]"
                                >
                                  {payload.invitationCode}
                                </span>
                              </div>
                            )}
                            {note && (
                              <div
                                style={{ borderTopColor: slide3Style.dividerColor }}
                                className="pt-2 border-t"
                              >
                                <div
                                  style={{ color: slide3Style.panelMutedColor }}
                                  className="text-[10.5px]"
                                >
                                  Catatan:
                                </div>
                                <div
                                  style={{ color: slide3Style.panelBodyColor }}
                                  className="mt-0.5 leading-snug"
                                >
                                  {note}
                                </div>
                              </div>
                            )}
                          </motion.div>

                          {rsvpReceiptCfg.footerNote && (
                            <div
                              style={{
                                borderColor: slide3Style.subSurfaceBorder,
                                color: slide3Style.panelAccentColor,
                              }}
                              className="rounded-xl border border-dashed px-3 py-2 text-[11px] font-medium leading-snug"
                            >
                              {rsvpReceiptCfg.footerNote}
                            </div>
                          )}

                          <motion.div
                            initial={{ opacity: 0, y: animateSuccess ? 8 : 3 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.3,
                              delay: animateSuccess ? 0.36 : 0.12,
                              ease: SMOOTH_EASE,
                            }}
                            className="flex flex-col gap-2 pt-0.5"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (isDirectEditActive) return;
                                setJustSubmitted(false);
                                setEditing(true);
                              }}
                              style={{
                                borderColor: slide3Style.activeChoiceBorder,
                                color: slide3Style.panelAccentColor,
                              }}
                              className="w-full min-h-[40px] px-4 py-2 rounded-full border bg-transparent text-[12px] font-semibold active:scale-[0.98] transition-all"
                            >
                              {rsvpReceiptCfg.editButtonText ||
                                'Ubah Konfirmasi Kehadiran'}
                            </button>

                            {rsvpReceiptCfg.showCloseButton !== false && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (isDirectEditActive) return;
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
                                style={{
                                  backgroundColor: slide3Style.subSurfaceBg,
                                  borderColor: slide3Style.subSurfaceBorder,
                                  color: slide3Style.panelBodyColor,
                                }}
                                className="w-full min-h-[40px] px-4 py-2 rounded-full border text-[12px] font-semibold active:scale-[0.98] transition-all"
                              >
                                {rsvpReceiptCfg.closeButtonText || 'Tutup'}
                              </button>
                            )}
                          </motion.div>
                        </div>
                        </motion.div>
                          );
                        }

                        return (
                        <motion.div
                          key={`rsvp-form-${textAnim}-${textAnimReplayNonce}-${previewRsvpViewMode}`}
                          {...getEditorialBlockMotion(textAnim, 0.06, skipTextAnim)}
                          exit={{ opacity: 0, y: -10, scale: 0.96 }}
                        >
                        <form
                          onSubmit={(e) => {
                            if (isDirectEditActive) {
                              e.preventDefault();
                              return;
                            }
                            void handleRsvpSubmit(e);
                          }}
                          onPointerDown={(e) => startDirectDrag(e, 'slide3-panel', 'slide3-panel')}
                          onPointerMove={moveDirectDrag}
                          onPointerUp={endDirectDrag}
                          onPointerCancel={endDirectDrag}
                          style={{
                            ...slide3Style.cardStyle,
                            transform:
                              slide3Style.panelOffsetY !== 0
                                ? `translateY(${slide3Style.panelOffsetY}px)`
                                : undefined,
                          }}
                          className={`border ${slide3Style.panelPaddingClass} flex flex-col gap-3 shadow-lg ${getEditableClass('slide3-panel', true)}`}
                        >
                          {isDirectEditActive && selectedEditTarget === 'slide3-panel' && (
                            <span className="pointer-events-none absolute -top-2.5 right-2 px-1.5 py-0.5 rounded-full bg-[#0EA5E9] text-white text-[9px] font-bold shadow">
                              Panel RSVP · Seret ↕ ({slide3Style.panelOffsetY}px)
                            </span>
                          )}
                          <div className={`${slide3Style.isLeft ? 'text-left' : 'text-center'} space-y-0.5`}>
                            <EditorialTextReveal
                              as="h2"
                              text={effectiveConfig.slide3Heading || 'Konfirmasi Kehadiran'}
                              preset={textAnim}
                              delay={0.16}
                              instant={skipTextAnim}
                              style={{
                                fontFamily: slide3Style.headingFont,
                                fontSize: `${textSizes.slide3Heading}px`,
                                color: slide3Style.panelTitleColor,
                              }}
                              className="font-extrabold"
                            />
                            <motion.p
                              {...getEditorialBlockMotion(textAnim, 0.24, skipTextAnim)}
                              style={{ color: slide3Style.panelMutedColor }}
                              className="text-[11.5px] break-words"
                            >
                              {payload.salutation} {payload.recipientName}
                            </motion.p>
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
                                    id: 'attending' as const,
                                    title:
                                      slideExtras.rsvpAttendingLabel || 'Hadir Langsung',
                                    desc:
                                      slideExtras.rsvpAttendingDesc ||
                                      'Saya berencana hadir sesuai jadwal',
                                  },
                                  ...(slideExtras.showRepresentedOption !== false
                                    ? [
                                        {
                                          id: 'represented' as const,
                                          title:
                                            slideExtras.rsvpRepresentedLabel ||
                                            'Diwakilkan',
                                          desc:
                                            slideExtras.rsvpRepresentedDesc ||
                                            'Diwakilkan pejabat / staf instansi',
                                        },
                                      ]
                                    : []),
                                  {
                                    id: 'declined' as const,
                                    title:
                                      slideExtras.rsvpDeclinedLabel ||
                                      'Belum Dapat Hadir',
                                    desc:
                                      slideExtras.rsvpDeclinedDesc ||
                                      'Mohon maaf berhalangan hadir',
                                  },
                                ]
                              ).map((choice, idx) => {
                                const active = selectedStatus === choice.id;
                                return (
                                  <motion.button
                                    key={choice.id}
                                    {...getEditorialBlockMotion(
                                      textAnim,
                                      0.28 + idx * 0.065,
                                      skipTextAnim
                                    )}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => {
                                      if (isDirectEditActive) return;
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
                                    style={{
                                      backgroundColor: active
                                        ? slide3Style.activeChoiceBg
                                        : slide3Style.subSurfaceBg,
                                      borderColor: active
                                        ? slide3Style.activeChoiceBorder
                                        : slide3Style.subSurfaceBorder,
                                    }}
                                    className="min-h-[42px] flex items-center justify-between gap-2.5 px-3 py-1.5 rounded-xl border text-left transition-colors"
                                  >
                                    <div className="min-w-0">
                                      <div
                                        style={{ color: slide3Style.panelBodyColor }}
                                        className="font-bold text-[12.5px] leading-tight"
                                      >
                                        {choice.title}
                                      </div>
                                      <div
                                        style={{ color: slide3Style.panelMutedColor }}
                                        className="text-[10.5px] mt-0.5 leading-tight"
                                      >
                                        {choice.desc}
                                      </div>
                                    </div>
                                    <span
                                      style={
                                        active
                                          ? {
                                              borderColor: slide3Style.activeChoiceBorder,
                                              backgroundColor: slide3Style.activeChoiceBorder,
                                              color: getContrastTextColor(
                                                slide3Style.activeChoiceBorder
                                              ),
                                            }
                                          : { borderColor: slide3Style.subSurfaceBorder }
                                      }
                                      className="w-4 h-4 rounded-full border flex items-center justify-center shrink-0"
                                    >
                                      {active && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                    </span>
                                  </motion.button>
                                );
                              })}
                            </div>
                          </fieldset>

                          {selectedStatus === 'attending' && (
                            <div
                              style={{ borderTopColor: slide3Style.dividerColor }}
                              className="pt-2.5 border-t space-y-2"
                            >
                              <label
                                htmlFor="invite-attending-count"
                                style={{ color: slide3Style.panelAccentColor }}
                                className="block text-[11.5px] font-semibold"
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
                                      onClick={() => {
                                        if (isDirectEditActive) return;
                                        setRepresentative(opt.value);
                                      }}
                                      style={{
                                        backgroundColor: isSelected
                                          ? slide3Style.activeChoiceBg
                                          : slide3Style.subSurfaceBg,
                                        borderColor: isSelected
                                          ? slide3Style.activeChoiceBorder
                                          : slide3Style.subSurfaceBorder,
                                        color: isSelected
                                          ? slide3Style.panelAccentColor
                                          : slide3Style.panelBodyColor,
                                      }}
                                      className="min-h-[34px] px-1 rounded-full border text-[11.5px] font-bold transition-colors text-center"
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
                                style={{
                                  backgroundColor: slide3Style.inputBg,
                                  borderColor: slide3Style.inputBorder,
                                  color: slide3Style.panelBodyColor,
                                }}
                                className="w-full min-h-[38px] rounded-xl border px-3 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[#E8C56E]"
                              />
                            </div>
                          )}

                          {selectedStatus === 'represented' && (
                            <div
                              style={{ borderTopColor: slide3Style.dividerColor }}
                              className="pt-2.5 border-t space-y-1.5"
                            >
                              <label
                                htmlFor="invite-rep-name"
                                style={{ color: slide3Style.panelAccentColor }}
                                className="block text-[11.5px] font-semibold"
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
                                style={{
                                  backgroundColor: slide3Style.inputBg,
                                  borderColor: slide3Style.inputBorder,
                                  color: slide3Style.panelBodyColor,
                                }}
                                className="w-full min-h-[38px] rounded-xl border px-3 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[#E8C56E]"
                              />
                            </div>
                          )}

                          <div
                            style={
                              selectedStatus === 'declined'
                                ? { borderTopColor: slide3Style.dividerColor }
                                : undefined
                            }
                            className={
                              selectedStatus === 'declined'
                                ? 'pt-2.5 border-t space-y-1.5'
                                : 'pt-1 space-y-1.5'
                            }
                          >
                            <label
                              htmlFor="invite-note"
                              style={{ color: slide3Style.panelAccentColor }}
                              className="block text-[11.5px] font-semibold"
                            >
                              {slideExtras.rsvpNoteLabel || 'Catatan (Opsional)'}
                            </label>
                            <textarea
                              id="invite-note"
                              rows={2}
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="Catatan untuk panitia..."
                              style={{
                                backgroundColor: slide3Style.inputBg,
                                borderColor: slide3Style.inputBorder,
                                color: slide3Style.panelBodyColor,
                              }}
                              className="w-full rounded-xl border px-3 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[#E8C56E]"
                            />
                          </div>

                          <motion.div
                            {...getEditorialBlockMotion(textAnim, 0.48, skipTextAnim)}
                            className="pt-0.5"
                          >
                            <button
                              type="submit"
                              disabled={submitting}
                              style={{
                                fontFamily: slide3Style.headingFont,
                                ...slide3Style.primaryButtonStyle,
                              }}
                              className="w-full min-h-[42px] py-2 px-4 rounded-full bg-gradient-to-r from-[#F3D88B] via-[#DFB454] to-[#C69535] text-[#151109] font-extrabold text-[13px] shadow-md active:scale-[0.98] transition-transform disabled:opacity-50"
                            >
                              {submitting
                                ? submittedAt
                                  ? 'Menyimpan Perubahan...'
                                  : 'Menyimpan Konfirmasi...'
                                : submittedAt
                                  ? slideExtras.rsvpReceipt?.submitUpdateText ||
                                    'Simpan Perubahan Konfirmasi'
                                  : slideExtras.slide3SubmitText ||
                                    'Kirim Konfirmasi Kehadiran'}
                            </button>
                          </motion.div>
                        </form>
                        </motion.div>
                        );
                      })()}
                      </AnimatePresence>
                    </motion.div>
                    </section>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Fixed Bottom Smartphone Navigation Controls */}
            <div
              onPointerDown={(e) => {
                if (!isDirectEditActive) return;
                startDirectDrag(e, 'story-nav');
              }}
              className={`px-4 pt-2 pb-[max(0.85rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-2.5 shrink-0 ${getEditableClass('story-nav')}`}
            >
              {isScrollMode ? (
                <div className="w-full flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        { idx: 0 as const, label: '01 Undangan' },
                        { idx: 1 as const, label: '02 Jadwal' },
                        { idx: 2 as const, label: '03 RSVP' },
                      ] as const
                    ).map((item) => {
                      const active = slideIndex === item.idx;
                      return (
                        <button
                          key={item.idx}
                          type="button"
                          onClick={() => {
                            if (isDirectEditActive) return;
                            scrollToSlide(item.idx);
                          }}
                          style={
                            active
                              ? item.idx === 0
                                ? slide1Style.primaryButtonStyle
                                : item.idx === 1
                                  ? slide2Style.primaryButtonStyle
                                  : slide3Style.primaryButtonStyle
                              : undefined
                          }
                          className={`min-h-[32px] px-2.5 py-1 rounded-full text-[10.5px] font-bold transition-all active:scale-95 ${
                            active
                              ? 'bg-gradient-to-r from-[#F0D483] to-[#C89B3C] text-[#151109] shadow-xs'
                              : `${topControlBtnClass} opacity-80 hover:opacity-100`
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                  {slideExtras.footerText && (
                    <span
                      style={{
                        color:
                          slide3Style.accentColor ||
                          (effectiveConfig.theme === 'emerald-light'
                            ? '#157A76'
                            : 'rgba(217,199,158,0.75)'),
                      }}
                      className="text-[10.5px] font-medium truncate max-w-[95px]"
                    >
                      {slideExtras.footerText}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={slideIndex === 0}
                    onClick={() => {
                      if (isDirectEditActive) return;
                      setSlideIndex((prev) =>
                        prev > 0 ? ((prev - 1) as 0 | 1 | 2) : prev
                      );
                    }}
                    style={
                      slideIndex === 0
                        ? slide1Style.secondaryButtonStyle
                        : slideIndex === 1
                          ? slide2Style.secondaryButtonStyle
                          : slide3Style.secondaryButtonStyle
                    }
                    className={`min-h-[38px] inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[12px] font-semibold active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all ${topControlBtnClass}`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Sebelumnya</span>
                  </button>

                  {slideIndex < 2 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (isDirectEditActive) return;
                        setSlideIndex((prev) =>
                          prev < 2 ? ((prev + 1) as 0 | 1 | 2) : prev
                        );
                      }}
                      style={
                        slideIndex === 0
                          ? slide1Style.primaryButtonStyle
                          : slide2Style.primaryButtonStyle
                      }
                      className="min-h-[38px] inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#F0D483] to-[#C89B3C] text-[#151109] text-[12px] font-extrabold active:scale-95 transition-transform"
                    >
                      <span>{slideIndex === 1 ? 'Isi RSVP' : 'Lanjut'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ) : slideExtras.footerText ? (
                    <span
                      style={{
                        color:
                          slide3Style.accentColor ||
                          (effectiveConfig.theme === 'emerald-light'
                            ? '#157A76'
                            : 'rgba(217,199,158,0.75)'),
                      }}
                      className="text-[11px] font-medium pr-1"
                    >
                      {slideExtras.footerText}
                    </span>
                  ) : (
                    <span />
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
