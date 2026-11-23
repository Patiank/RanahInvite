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
