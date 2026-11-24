export const STUDIO_FONT_IDS = [
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Oswald',
  'Source Sans 3',
  'Raleway',
  'PT Sans',
  'Merriweather',
  'Plus Jakarta Sans',
  'Manrope',
  'Playfair Display',
] as const;

export type StudioFontId = (typeof STUDIO_FONT_IDS)[number];

export interface StudioFontMeta {
  id: StudioFontId;
  label: string;
  category: 'sans' | 'serif';
  cssFamily: string;
  googleSpec: string;
  sampleTag: string;
}

export const STUDIO_FONTS: readonly StudioFontMeta[] = [
  {
    id: 'Roboto',
    label: 'Roboto',
    category: 'sans',
    cssFamily: "'Roboto', system-ui, sans-serif",
    googleSpec: 'Roboto:ital,wght@0,400;0,600;0,700;1,400;1,700',
    sampleTag: 'Bersih & Modern',
  },
  {
    id: 'Open Sans',
    label: 'Open Sans',
    category: 'sans',
    cssFamily: "'Open Sans', system-ui, sans-serif",
    googleSpec: 'Open+Sans:ital,wght@0,400;0,600;0,700;1,400;1,700',
    sampleTag: 'Jelas & Formal',
  },
  {
    id: 'Lato',
    label: 'Lato',
    category: 'sans',
    cssFamily: "'Lato', system-ui, sans-serif",
    googleSpec: 'Lato:ital,wght@0,400;0,700;1,400;1,700',
    sampleTag: 'Elegan & Ringan',
  },
  {
    id: 'Montserrat',
    label: 'Montserrat',
    category: 'sans',
    cssFamily: "'Montserrat', system-ui, sans-serif",
    googleSpec: 'Montserrat:ital,wght@0,400;0,600;0,700;0,800;1,400;1,700',
    sampleTag: 'Tegas & Geometris',
  },
  {
    id: 'Oswald',
    label: 'Oswald',
    category: 'sans',
    cssFamily: "'Oswald', system-ui, sans-serif",
    googleSpec: 'Oswald:wght@400;600;700',
    sampleTag: 'Judul Tinggi & Gagah',
  },
  {
    id: 'Source Sans 3',
    label: 'Source Sans 3',
    category: 'sans',
    cssFamily: "'Source Sans 3', system-ui, sans-serif",
    googleSpec: 'Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400;1,700',
    sampleTag: 'Resmi & Nyaman',
  },
  {
    id: 'Raleway',
    label: 'Raleway',
    category: 'sans',
    cssFamily: "'Raleway', system-ui, sans-serif",
    googleSpec: 'Raleway:ital,wght@0,400;0,600;0,700;1,400;1,700',
    sampleTag: 'Anggun & Modern',
  },
  {
    id: 'PT Sans',
    label: 'PT Sans',
    category: 'sans',
    cssFamily: "'PT Sans', system-ui, sans-serif",
    googleSpec: 'PT+Sans:ital,wght@0,400;0,700;1,400;1,700',
    sampleTag: 'Klasik Dinas',
  },
  {
    id: 'Merriweather',
    label: 'Merriweather',
    category: 'serif',
    cssFamily: "'Merriweather', Georgia, serif",
    googleSpec: 'Merriweather:ital,wght@0,400;0,700;1,400;1,700',
    sampleTag: 'Serif Berwibawa',
  },
  {
    id: 'Plus Jakarta Sans',
    label: 'Jakarta Sans',
    category: 'sans',
    cssFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    googleSpec: 'Plus+Jakarta+Sans:ital,wght@0,400;0,600;0,700;0,800;1,400;1,700',
    sampleTag: 'Modern Nusantara',
  },
  {
    id: 'Manrope',
    label: 'Manrope',
    category: 'sans',
    cssFamily: "'Manrope', system-ui, sans-serif",
    googleSpec: 'Manrope:wght@400;600;700;800',
    sampleTag: 'Rapi & Kontemporer',
  },
  {
    id: 'Playfair Display',
    label: 'Playfair',
    category: 'serif',
    cssFamily: "'Playfair Display', Georgia, serif",
    googleSpec: 'Playfair+Display:ital,wght@0,600;0,700;0,800;1,400;1,700',
    sampleTag: 'Serif Gala & Mewah',
  },
] as const;

const FONT_MAP = new Map<string, StudioFontMeta>(
  STUDIO_FONTS.map((f) => [f.id, f])
);

export function isValidStudioFontId(val: unknown): val is StudioFontId {
  return typeof val === 'string' && FONT_MAP.has(val);
}

export function getStudioFontMeta(id?: string): StudioFontMeta {
  if (id && FONT_MAP.has(id)) {
    return FONT_MAP.get(id)!;
  }
  return FONT_MAP.get('Manrope')!;
}

export function getStudioFontCssFamily(id?: string): string {
  return getStudioFontMeta(id).cssFamily;
}

export function isSerifStudioFont(id?: string): boolean {
  return getStudioFontMeta(id).category === 'serif';
}

const loadedFontSpecs = new Set<string>();

/**
 * Dynamically injects Google Fonts `<link>` tags for only the requested fonts.
 * Guest pages load only 1–2 active fonts (instant load, zero wasted bandwidth),
 * while Admin Studio calls `ensureAllStudioFontsLoaded()` to preview all 12.
 */
export function ensureGoogleFontsLoaded(fontIds: (string | undefined)[]): void {
  if (typeof document === 'undefined') return;
  const specsToLoad: string[] = [];

  for (const rawId of fontIds) {
    if (!rawId) continue;
    const meta = FONT_MAP.get(rawId);
    if (!meta) continue;
    if (loadedFontSpecs.has(meta.id)) continue;
    loadedFontSpecs.add(meta.id);
    specsToLoad.push(meta.googleSpec);
  }

  if (specsToLoad.length === 0) return;

  const href = `https://fonts.googleapis.com/css2?${specsToLoad
    .map((s) => `family=${s}`)
    .join('&')}&display=swap`;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.ranahFonts = specsToLoad.join(',');
  document.head.appendChild(link);
}

export function ensureAllStudioFontsLoaded(): void {
  ensureGoogleFontsLoaded([...STUDIO_FONT_IDS]);
}
