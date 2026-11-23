import { EventMetadata, Recipient, RsvpPayload, RsvpStatus } from '../types';

export const RSVP_BROADCAST_CHANNEL = 'ranahinvite_rsvp_sync';

export function buildRsvpUrl(
  eventId: string,
  metadata: EventMetadata,
  recipient: Recipient
): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://ranahinvite.app';

  const params = new URLSearchParams({
    rsvp: '1',
    eid: eventId,
    code: recipient.invitationCode,
    s: recipient.salutation.slice(0, 32),
    n: recipient.recipientName.slice(0, 72),
    i: recipient.institution.slice(0, 80),
    e: metadata.eventName.slice(0, 80),
    d: metadata.date.slice(0, 40),
    t: metadata.time.slice(0, 32),
    l: metadata.location.slice(0, 80),
    o: metadata.organizer.slice(0, 72),
  });

  return `${origin}/?${params.toString()}`;
}

function sanitizeUrlSegment(raw: string, maxLen: number, fallback: string): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[\/\\?#%[\]]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, maxLen);
  return cleaned || fallback;
}

export function buildInteractiveInviteUrl(
  eventId: string,
  _metadata: EventMetadata,
  recipient: Recipient
): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://ranahinvite.web.app';

  const safeEventId = sanitizeUrlSegment(eventId, 80, 'default');
  const safeCode = sanitizeUrlSegment(recipient.invitationCode, 40, 'RI-001');

  return `${origin}/v/${encodeURIComponent(safeEventId)}/${encodeURIComponent(safeCode)}`;
}

export function buildWhatsAppInviteText(
  eventId: string,
  metadata: EventMetadata,
  recipient: Recipient,
  customTemplate?: string
): string {
  const inviteUrl = buildInteractiveInviteUrl(eventId, metadata, recipient);

  if (customTemplate && customTemplate.trim()) {
    return customTemplate
      .replace(/\{sapaan\}/gi, recipient.salutation || 'Kepada Yth.')
      .replace(/\{nama\}/gi, recipient.recipientName || '')
      .replace(/\{instansi\}/gi, recipient.institution || '')
      .replace(/\{acara\}/gi, metadata.eventName || '')
      .replace(/\{tanggal\}/gi, metadata.date || '')
      .replace(/\{waktu\}/gi, metadata.time || '')
      .replace(/\{lokasi\}/gi, metadata.location || '')
      .replace(/\{penyelenggara\}/gi, metadata.organizer || 'Panitia Penyelenggara')
      .replace(/\{link\}/gi, inviteUrl)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const targetLine = [recipient.salutation, recipient.recipientName]
    .filter(Boolean)
    .join(' ');
  const instLine = recipient.institution ? `\n${recipient.institution}` : '';
  const scheduleParts = [metadata.date, metadata.time].filter(Boolean).join(' · ');

  return [
    `${targetLine}${instLine}`,
    '',
    `Dengan hormat, kami mengundang Bapak/Ibu untuk menghadiri:`,
    `*${metadata.eventName}*`,
    scheduleParts ? `🗓️ ${scheduleParts}` : '',
    metadata.location ? `📍 ${metadata.location}` : '',
    '',
    `Silakan buka undangan digital interaktif & konfirmasi kehadiran melalui tautan berikut:`,
    inviteUrl,
    '',
    `Hormat kami,`,
    metadata.organizer || 'Panitia Penyelenggara',
  ]
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n');
}

export function parseRsvpParams(search: string): RsvpPayload | null {
  const params = new URLSearchParams(search);
  if (params.get('rsvp') !== '1') return null;

  return {
    eventId: params.get('eid') || '',
    invitationCode: params.get('code') || 'RI-001',
    salutation: params.get('s') || 'Kepada Yth.',
    recipientName: params.get('n') || 'Tamu Undangan',
    institution: params.get('i') || '',
    eventName: params.get('e') || 'Undangan Acara',
    date: params.get('d') || '',
    time: params.get('t') || '',
    location: params.get('l') || '',
    organizer: params.get('o') || 'Panitia Penyelenggara',
  };
}

export function parseInteractiveInviteRoute(
  pathname: string,
  search: string
): RsvpPayload | null {
  // 1. Short clean path: /v/{eventId}/{invitationCode}
  const match = /^\/v\/([^/]+)\/([^/]+)\/?$/i.exec((pathname || '').trim());
  if (match) {
    let eventId = '';
    let invitationCode = '';
    try {
      eventId = decodeURIComponent(match[1]).trim();
      invitationCode = decodeURIComponent(match[2]).trim();
    } catch {
      eventId = match[1].trim();
      invitationCode = match[2].trim();
    }
    if (eventId && invitationCode) {
      const params = new URLSearchParams(search || '');
      return {
        eventId,
        invitationCode,
        salutation: params.get('s') || 'Kepada Yth.',
        recipientName: params.get('n') || '',
        institution: params.get('i') || '',
        eventName: params.get('e') || '',
        date: params.get('d') || '',
        time: params.get('t') || '',
        location: params.get('l') || '',
        organizer: params.get('o') || '',
      };
    }
  }

  // 2. Legacy full query string: /?invite=1&eid=...&code=...
  return parseInteractiveInviteParams(search);
}

export function parseInteractiveInviteParams(search: string): RsvpPayload | null {
  const params = new URLSearchParams(search);
  if (params.get('invite') !== '1') return null;

  return {
    eventId: params.get('eid') || '',
    invitationCode: params.get('code') || 'RI-001',
    salutation: params.get('s') || 'Kepada Yth.',
    recipientName: params.get('n') || 'Tamu Undangan',
    institution: params.get('i') || '',
    eventName: params.get('e') || 'Undangan Acara',
    date: params.get('d') || '',
    time: params.get('t') || '',
    location: params.get('l') || '',
    organizer: params.get('o') || 'Panitia Penyelenggara',
  };
}

export function getRsvpLabel(status?: RsvpStatus): string {
  switch (status) {
    case 'attending':
      return 'Hadir';
    case 'represented':
      return 'Diwakilkan';
    case 'declined':
      return 'Berhalangan';
    default:
      return 'Belum Konfirmasi';
  }
}

export interface RsvpSubmissionMessage {
  type: 'rsvp_updated';
  eventId: string;
  invitationCode: string;
  rsvpStatus: RsvpStatus;
  rsvpRepresentative?: string;
  rsvpNote?: string;
  rsvpAt: number;
}
