export type NavTab =
  | 'dashboard'
  | 'info'
  | 'guests'
  | 'layout'
  | 'export';

export interface WorkflowStepStatus {
  infoReady: boolean;
  guestsReady: boolean;
  layoutReady: boolean;
  exportReady: boolean;
}

export type OverlayFontFamily =
  | 'Manrope'
  | 'Fraunces'
  | 'Playfair Display'
  | 'Syne'
  | 'Outfit'
  | 'Plus Jakarta Sans'
  | 'DM Sans';

export type TextAlign = 'left' | 'center' | 'right';

export type OverlayFieldKey =
  | 'salutation'
  | 'recipient_name'
  | 'institution'
  | 'place_label'
  | 'qr_code'
  | 'rsvp_note'
  | `custom_text_${string}`;

export interface OverlayBlock {
  id: OverlayFieldKey;
  label: string;
  placeholder: string;
  page: 1 | 2;
  visible: boolean;
  /** Percentage 0..100 relative to page width */
  x: number;
  /** Percentage 0..100 relative to page height */
  y: number;
  /** Percentage 10..90 of page width for text wrapping or QR size */
  width: number;
  fontFamily: OverlayFontFamily;
  fontSize: number;
  fontWeight: 400 | 600 | 700;
  italic: boolean;
  align: TextAlign;
  color: string;
  locked?: boolean;
}

export interface EventMetadata {
  eventName: string;
  date: string;
  time: string;
  location: string;
  organizer: string;
}

export interface TemplateImages {
  pageCount: 1 | 2;
  page1DataUrl: string;
  page1Width: number;
  page1Height: number;
  page2DataUrl: string | null;
  page2Width: number;
  page2Height: number;
  activeTemplateId: string;
}

export type RecipientStatus = 'ready' | 'generating' | 'generated';

export type RsvpStatus = 'pending' | 'attending' | 'represented' | 'declined';

export interface Recipient {
  id: string;
  salutation: string;
  recipientName: string;
  institution: string;
  placeLabel?: string;
  group?: string;
  invitationCode: string;
  status: RecipientStatus;
  generatedAt?: number;
  rsvpStatus?: RsvpStatus;
  rsvpAt?: number;
  rsvpRepresentative?: string;
  rsvpNote?: string;
}

export type InteractiveThemeId = 'gold-dark' | 'emerald-light' | 'navy-gold';
export type InteractiveMediaMode = 'video' | 'image';
export type InteractiveImageAnimation =
  | 'wax-seal-open'
  | 'gate-split'
  | 'curtain-up'
  | 'ken-burns';
export type InteractiveFontPreset =
  | 'modern'
  | 'classic'
  | 'ceremonial'
  | 'editorial';
export type InteractiveTextScale = 'sm' | 'md' | 'lg';
export type InteractiveVerticalAlign = 'top' | 'center' | 'bottom';
export type InteractiveCardStyle = 'solid' | 'glass' | 'minimal';
export type InteractiveTextAlign = 'center' | 'left';
export type InteractiveSealSize = 'sm' | 'md' | 'lg';

export interface InteractiveInviteConfig {
  mediaMode: InteractiveMediaMode;
  imageAnimation: InteractiveImageAnimation;
  coverImageDataUrl: string;
  openImageDataUrl: string;
  theme: InteractiveThemeId;
  fontPreset: InteractiveFontPreset;
  textScale: InteractiveTextScale;
  /** Base text size in px (12..24, default 16) for numeric font sizing */
  baseFontSize: number;
  overlayDarkness: number;
  videoUrl: string;
  posterUrl: string;
  openBgUrl: string;
  videoSpeed: number;
  /** Legacy global seconds per auto-advance slide; kept for backward compatibility */
  slideDurationSec: number;
  /** Seconds on Slide 1 (Opening & Recipient); 0 means manual */
  slide1DurationSec: number;
  /** Seconds on Slide 2 (Schedule & Location); 0 means manual */
  slide2DurationSec: number;
  /** Opening 3D seal & flap animation duration in seconds (0.8..3.0) */
  openAnimDurationSec: number;
  panelPosition: InteractiveVerticalAlign;
  panelOffsetY: number;
  cardStyle: InteractiveCardStyle;
  textAlign: InteractiveTextAlign;
  showSeal: boolean;
  customSealDataUrl: string;
  sealSize: InteractiveSealSize;
  sealOffsetY: number;
  coverBadge: string;
  openButtonText: string;
  welcomeNote: string;
  dresscode: string;
  mapsUrl: string;
  showCountdown: boolean;
  showCalendarButton: boolean;
  contactName: string;
  contactPhone: string;
  whatsappTemplate: string;
}

export const DEFAULT_INTERACTIVE_CONFIG: InteractiveInviteConfig = {
  mediaMode: 'video',
  imageAnimation: 'wax-seal-open',
  coverImageDataUrl: '',
  openImageDataUrl: '',
  theme: 'gold-dark',
  fontPreset: 'modern',
  textScale: 'md',
  baseFontSize: 16,
  overlayDarkness: 60,
  videoUrl: '/media/gold-envelope-intro.mp4?v=2',
  posterUrl: '/media/gold-envelope-poster.webp',
  openBgUrl: '/media/gold-envelope-open.webp',
  videoSpeed: 1,
  slideDurationSec: 6,
  slide1DurationSec: 5,
  slide2DurationSec: 8,
  openAnimDurationSec: 1.5,
  panelPosition: 'center',
  panelOffsetY: 0,
  cardStyle: 'solid',
  textAlign: 'center',
  showSeal: true,
  customSealDataUrl: '',
  sealSize: 'md',
  sealOffsetY: 0,
  coverBadge: 'Undangan Resmi',
  openButtonText: 'Sentuh Segel untuk Membuka',
  welcomeNote:
    'Merupakan suatu kehormatan bagi kami apabila Bapak/Ibu berkenan hadir pada kegiatan tersebut.',
  dresscode: '',
  mapsUrl: '',
  showCountdown: true,
  showCalendarButton: true,
  contactName: '',
  contactPhone: '',
  whatsappTemplate:
    '{sapaan} {nama}\n{instansi}\n\nDengan hormat, kami mengundang Bapak/Ibu untuk menghadiri:\n*{acara}*\n🗓️ {tanggal} · {waktu}\n📍 {lokasi}\n\nSilakan buka undangan digital interaktif & konfirmasi kehadiran melalui tautan berikut:\n{link}\n\nHormat kami,\n{penyelenggara}',
};

export interface SavedEventRecord {
  id: string;
  metadata: EventMetadata;
  templates: TemplateImages;
  overlays: OverlayBlock[];
  recipients: Recipient[];
  interactiveConfig?: InteractiveInviteConfig;
  isCompleted: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StudioDraftState {
  activeEventId: string;
  events: SavedEventRecord[];
  updatedAt: number;
}

export interface RsvpPayload {
  eventId: string;
  invitationCode: string;
  salutation: string;
  recipientName: string;
  institution: string;
  eventName: string;
  date: string;
  time: string;
  location: string;
  organizer: string;
}

export interface BankSyncUpdate {
  previousKey: {
    invitationCode?: string;
    recipientName: string;
    institution: string;
    group?: string;
  };
  next: {
    salutation: string;
    recipientName: string;
    institution: string;
    placeLabel: string;
    group: string;
  };
}

