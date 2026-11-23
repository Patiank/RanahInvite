import {
  EventMetadata,
  OverlayBlock,
  SavedEventRecord,
  TemplateImages,
} from '../types';
import { getEffectiveBankRecipients } from '../utils/bankStorage';
import {
  StoredSystemDefault,
  loadSystemDefaultSync,
} from '../utils/storage';
import { renderFallbackTemplateArtwork } from '../utils/templateArtwork';

/**
 * Minimal base fallback used ONLY when no System Default has been saved yet.
 * All legacy preset defaults (Rakor, Landscape, Marawa) have been removed.
 */
export const BASE_SYSTEM_OVERLAYS: OverlayBlock[] = [
  {
    id: 'salutation',
    label: 'Sapaan',
    placeholder: 'Kepada Yth.',
    page: 1,
    visible: true,
    locked: true,
    x: 50,
    y: 57.5,
    width: 60,
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: 600,
    italic: false,
    align: 'center',
    color: '#158A85',
  },
  {
    id: 'recipient_name',
    label: 'Nama Penerima / Jabatan',
    placeholder: 'Nama Penerima',
    page: 1,
    visible: true,
    locked: true,
    x: 50,
    y: 62.2,
    width: 64,
    fontFamily: 'Manrope',
    fontSize: 18,
    fontWeight: 700,
    italic: false,
    align: 'center',
    color: '#111827',
  },
  {
    id: 'institution',
    label: 'Instansi / Asal Daerah',
    placeholder: 'Instansi Tujuan',
    page: 1,
    visible: true,
    locked: true,
    x: 50,
    y: 68.4,
    width: 62,
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: 400,
    italic: false,
    align: 'center',
    color: '#4B5563',
  },
  {
    id: 'place_label',
    label: 'Keterangan Tempat',
    placeholder: 'di tempat',
    page: 1,
    visible: true,
    locked: true,
    x: 50,
    y: 74.2,
    width: 56,
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: 400,
    italic: false,
    align: 'center',
    color: '#4B5563',
  },
  {
    id: 'qr_code',
    label: 'QR Code RSVP',
    placeholder: 'QR',
    page: 2,
    visible: true,
    locked: true,
    x: 82.2,
    y: 76.9,
    width: 12,
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: 400,
    italic: false,
    align: 'center',
    color: '#111827',
  },
  {
    id: 'rsvp_note',
    label: 'Teks Info Scan QR',
    placeholder: 'Mohon pindai QR Code untuk\nkonfirmasi kehadiran Anda',
    page: 2,
    visible: true,
    locked: false,
    x: 82.2,
    y: 86.2,
    width: 28,
    fontFamily: 'Manrope',
    fontSize: 9,
    fontWeight: 600,
    italic: false,
    align: 'center',
    color: '#1F2937',
  },
];

export const BASE_EVENT_METADATA: EventMetadata = {
  eventName: 'Undangan Kegiatan Resmi',
  date: '14 November 2026',
  time: '09:00 WIB - Selesai',
  location: 'Padang, Sumatera Barat',
  organizer: 'Dinas Pariwisata Provinsi Sumatera Barat',
};

export function buildDefaultTemplates(
  meta: EventMetadata,
  systemDefault?: StoredSystemDefault | null
): TemplateImages {
  if (systemDefault?.templates && systemDefault.templates.page1DataUrl) {
    return { ...systemDefault.templates };
  }
  const fallback = renderFallbackTemplateArtwork(meta);
  return {
    pageCount: 2,
    page1DataUrl: fallback.page1DataUrl,
    page1Width: fallback.page1Width,
    page1Height: fallback.page1Height,
    page2DataUrl: fallback.page2DataUrl,
    page2Width: fallback.page2Width,
    page2Height: fallback.page2Height,
    activeTemplateId: 'system-default',
  };
}

export function createInitialEvents(
  systemDefault?: StoredSystemDefault | null,
  options?: { emptyRecipients?: boolean }
): SavedEventRecord[] {
  const now = Date.now();
  const effectiveDefault = systemDefault ?? loadSystemDefaultSync();
  const metadata: EventMetadata = effectiveDefault?.metadata
    ? { ...effectiveDefault.metadata }
    : { ...BASE_EVENT_METADATA };
  const templates = buildDefaultTemplates(metadata, effectiveDefault);
  const singlePageOnly = templates.pageCount === 1 || !templates.page2DataUrl;
  const overlays = (effectiveDefault?.overlays ?? BASE_SYSTEM_OVERLAYS).map(
    (o) => ({
      ...o,
      page: singlePageOnly ? 1 : o.page,
    })
  );

  const recipients = options?.emptyRecipients
    ? []
    : getEffectiveBankRecipients().map((r) => ({ ...r }));

  return [
    {
      id: 'evt-default-active',
      metadata,
      templates,
      overlays,
      recipients,
      isCompleted: false,
      createdAt: now,
      updatedAt: effectiveDefault?.savedAt || now,
    },
  ];
}
