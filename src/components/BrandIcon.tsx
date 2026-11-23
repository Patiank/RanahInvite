import React from 'react';

export type BrandIconName =
  // Cultural & Brand Emblems (West Sumatra)
  | 'brand-rumah-gadang'
  | 'brand-skyline'
  | 'brand-badge'
  | 'brand-ticket'
  | 'brand-verify'
  | 'sumbar-rumah-gadang'
  | 'sumbar-skyline-mini'
  | 'sumbar-jam-gadang'
  | 'sumbar-pavilion'
  | 'sumbar-mountain'
  | 'sumbar-surfer'
  | 'sumbar-boat'
  | 'sumbar-beach'
  // Primary Navigation
  | 'nav-home'
  | 'nav-dashboard'
  | 'nav-design'
  | 'nav-guests'
  | 'nav-export-pdf'
  // Documents & Actions
  | 'doc-pdf'
  | 'doc-upload'
  | 'action-eye'
  | 'action-eye-off'
  | 'action-download-doc'
  | 'action-download'
  | 'action-edit-design'
  | 'action-upload'
  | 'action-bank'
  | 'action-database'
  | 'action-qr'
  | 'action-save'
  | 'action-reset'
  | 'action-sync'
  | 'action-settings'
  | 'action-lock'
  | 'action-unlock'
  | 'action-trash'
  // RSVP, Schedule & Status
  | 'rsvp-attending'
  | 'rsvp-represented'
  | 'rsvp-declined'
  | 'rsvp-pending'
  | 'schedule-datetime'
  | 'status-check'
  | 'status-user'
  | 'status-cross';

interface BrandIconProps {
  name: BrandIconName;
  className?: string;
  /** Render the transparent white-line PNG directly as an <img> (ideal for dark/teal backgrounds) */
  white?: boolean;
  alt?: string;
}

/**
 * Renders the custom West Sumatra transparent white-line PNG icon set (/public/icons/*.png).
 * - With `white={true}`: renders the pure white-line PNG directly via <img>.
 * - Default: uses the white-line PNG as an alpha mask tinted by `currentColor` so it stays
 *   razor-sharp and legible on white/light surfaces, yellow CTAs, and semantic status labels.
 */
export const BrandIcon: React.FC<BrandIconProps> = ({
  name,
  className = 'w-4 h-4',
  white = false,
  alt = '',
}) => {
  const src = `/icons/${name}.png`;

  if (white) {
    return (
      <img
        src={src}
        alt={alt}
        aria-hidden={alt === '' ? true : undefined}
        draggable={false}
        className={`inline-block object-contain select-none pointer-events-none shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={`inline-block shrink-0 bg-current align-middle select-none pointer-events-none ${className}`}
      style={{
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
  );
};

export type IconBadgeTone = 'teal' | 'emerald' | 'red' | 'slate' | 'amber';
export type IconBadgeSize = 'xs' | 'sm' | 'md' | 'lg';

interface IconBadgeProps {
  name: BrandIconName;
  tone?: IconBadgeTone;
  size?: IconBadgeSize;
  /** Set true when placed on a dark or saturated colored surface so lines render pure white */
  white?: boolean;
  className?: string;
  title?: string;
}

const SIZE_CLASSES: Record<IconBadgeSize, string> = {
  xs: 'w-5 h-5',
  sm: 'w-7 h-7',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
};

/**
 * Renders a clean, larger, boxless line-art PNG icon with automatic background contrast:
 * - Default (light/white/tinted background): crisp black lines (`text-[#111827]`).
 * - With `white={true}` (dark/solid colored button or header): crisp white lines.
 */
export const IconBadge: React.FC<IconBadgeProps> = ({
  name,
  size = 'md',
  white = false,
  className = '',
  title,
}) => {
  const iconSizeClass = SIZE_CLASSES[size];
  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      className={`inline-flex items-center justify-center shrink-0 ${
        white ? 'text-white' : 'text-[#1B1B4B]'
      } ${className}`}
    >
      <BrandIcon name={name} white={white} className={iconSizeClass} />
    </span>
  );
};

/**
 * Picks a contextual West Sumatra cultural white-line PNG icon based on an event's title/location.
 */
export function getSumbarEventIcon(eventName: string, location = ''): BrandIconName {
  const text = `${eventName} ${location}`.toLowerCase();
  if (/(jam gadang|bukittinggi|agam)/.test(text)) return 'sumbar-jam-gadang';
  if (/(mentawai|surf|selancar|ombak)/.test(text)) return 'sumbar-surfer';
  if (/(pantai|mandeh|pesisir|painan|pariaman|pulau)/.test(text)) return 'sumbar-beach';
  if (/(bahari|kapal|perahu|pelabuhan|teluk)/.test(text)) return 'sumbar-boat';
  if (/(singkarak|maninjau|danau|gunung|harau|lembah|solok|tour)/.test(text)) {
    return 'sumbar-mountain';
  }
  if (/(festival|budaya|adat|minang|pesona|seni)/.test(text)) return 'sumbar-pavilion';
  if (/(rakor|rapat|dinas|pemprov|pariwisata|sumatera barat|padang)/.test(text)) {
    return 'sumbar-rumah-gadang';
  }
  return 'brand-ticket';
}
