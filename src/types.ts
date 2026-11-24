export type NavTab =
  | 'dashboard'
  | 'info'
  | 'guests'
  | 'layout'
  | 'video'
  | 'export';

export interface WorkflowStepStatus {
  infoReady: boolean;
  guestsReady: boolean;
  layoutReady: boolean;
  exportReady: boolean;
}

export type OverlayFontFamily =
  | 'Roboto'
  | 'Open Sans'
  | 'Lato'
  | 'Montserrat'
  | 'Oswald'
  | 'Source Sans 3'
  | 'Raleway'
  | 'PT Sans'
  | 'Merriweather'
  | 'Plus Jakarta Sans'
  | 'Manrope'
  | 'Playfair Display'
  | 'Fraunces'
  | 'Syne'
  | 'Outfit'
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
export type InteractiveTextShadow = 'none' | 'soft' | 'strong';
export type InteractiveTextScale = 'sm' | 'md' | 'lg';
export type InteractiveVerticalAlign = 'top' | 'center' | 'bottom';
export type InteractiveCardStyle = 'solid' | 'glass' | 'minimal';
export type InteractiveTextAlign = 'center' | 'left';
export type InteractiveSealSize = 'sm' | 'md' | 'lg';

export interface InteractiveSlideTextSizes {
  coverBadge: number;
  openButtonText: number;
  slide1Heading: number;
  welcomeNote: number;
  slide2Heading: number;
  slide2ExtraNote: number;
  slide3Heading: number;
  slide3SuccessTitle: number;
  slide3SuccessNote: number;
}

export const DEFAULT_SLIDE_TEXT_SIZES: InteractiveSlideTextSizes = {
  coverBadge: 11,
  openButtonText: 14,
  slide1Heading: 10,
  welcomeNote: 12,
  slide2Heading: 10,
  slide2ExtraNote: 12,
  slide3Heading: 16,
  slide3SuccessTitle: 16,
  slide3SuccessNote: 12,
};

export interface InteractivePanelScales {
  cover: number;
  slide1: number;
  slide2: number;
  slide3: number;
}

export const DEFAULT_PANEL_SCALES: InteractivePanelScales = {
  cover: 100,
  slide1: 100,
  slide2: 100,
  slide3: 100,
};

export interface InteractiveInviteConfig {
  mediaMode: InteractiveMediaMode;
  imageAnimation: InteractiveImageAnimation;
  coverImageDataUrl: string;
  openImageDataUrl: string;
  openBgPosX: number;
  openBgPosY: number;
  theme: InteractiveThemeId;
  fontPreset: InteractiveFontPreset;
  headingFont: string;
  bodyFont: string;
  textShadow: InteractiveTextShadow;
  textBold: boolean;
  titleColor: string;
  bodyColor: string;
  accentColor: string;
  panelBgColor: string;
  panelOpacity: number;
  buttonColor: string;
  coverOverlayDarkness: number;
  coverTopOffsetY: number;
  coverBottomOffsetY: number;
  textScale: InteractiveTextScale;
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
  sealOffsetX: number;
  sealOffsetY: number;
  coverBadge: string;
  openButtonText: string;
  slide1Heading: string;
  slide1BannerDataUrl: string;
  slide1BannerOffsetX: number;
  slide1BannerOffsetY: number;
  welcomeNote: string;
  slide2Heading: string;
  slide2ExtraNote: string;
  slide3Heading: string;
  slide3SuccessTitle: string;
  slide3SuccessNote: string;
  textSizes: InteractiveSlideTextSizes;
  panelScales: InteractivePanelScales;
  dresscode: string;
  mapsUrl: string;
  showCountdown: boolean;
  showCalendarButton: boolean;
  contactName: string;
  contactPhone: string;
  bgAudioDataUrl: string;
  bgAudioName: string;
  bgAudioUrl: string;
  bgAudioVolume: number;
  bgAudioDurationSec: number;
  whatsappTemplate: string;
}

export const DEFAULT_INTERACTIVE_CONFIG: InteractiveInviteConfig = {
  mediaMode: 'video',
  imageAnimation: 'wax-seal-open',
  coverImageDataUrl: '',
  openImageDataUrl: '',
  openBgPosX: 50,
  openBgPosY: 50,
  theme: 'gold-dark',
  fontPreset: 'modern',
  headingFont: 'Manrope',
  bodyFont: 'Manrope',
  textShadow: 'soft',
  textBold: false,
  titleColor: '',
  bodyColor: '',
  accentColor: '',
  panelBgColor: '',
  panelOpacity: 85,
  buttonColor: '',
  coverOverlayDarkness: 0,
  coverTopOffsetY: 0,
  coverBottomOffsetY: 0,
  textScale: 'md',
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
  sealOffsetX: 0,
  sealOffsetY: 0,
  coverBadge: 'Undangan Resmi',
  openButtonText: 'Sentuh Segel untuk Membuka',
  slide1Heading: 'Dengan Hormat Mengundang',
  slide1BannerDataUrl: '',
  slide1BannerOffsetX: 0,
  slide1BannerOffsetY: 0,
  welcomeNote:
    'Merupakan suatu kehormatan bagi kami apabila Bapak/Ibu berkenan hadir pada kegiatan tersebut.',
  slide2Heading: 'Pelaksanaan Kegiatan',
  slide2ExtraNote: '',
  slide3Heading: 'Konfirmasi Kehadiran',
  slide3SuccessTitle: 'Konfirmasi Kehadiran Tercatat',
  slide3SuccessNote:
    'Terima kasih, konfirmasi Anda telah tersimpan secara online untuk panitia.',
  textSizes: { ...DEFAULT_SLIDE_TEXT_SIZES },
  panelScales: { ...DEFAULT_PANEL_SCALES },
  dresscode: '',
  mapsUrl: '',
  showCountdown: true,
  showCalendarButton: true,
  contactName: '',
  contactPhone: '',
  bgAudioDataUrl: '',
  bgAudioName: '',
  bgAudioUrl: '',
  bgAudioVolume: 75,
  bgAudioDurationSec: 0,
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

