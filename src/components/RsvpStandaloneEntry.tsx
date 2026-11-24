import React, { useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { RsvpPayload, RsvpStatus } from '../types';
import {
  RSVP_BROADCAST_CHANNEL,
  RsvpSubmissionMessage,
} from '../utils/rsvp';
import {
  applyRsvpSubmissionToStorage,
  loadStudioDraft,
} from '../utils/storage';
import {
  fetchGuestInviteFromCloud,
  fetchInviteConfigWithMetaFromCloud,
  fetchSingleRsvpFromCloud,
  isFirestoreRsvpConfigured,
  sanitizeFirestoreId,
  submitRsvpToCloud,
} from '../utils/firebaseRsvp';
import { GuestRsvpPage } from './GuestRsvpPage';

interface RsvpStandaloneEntryProps {
  payload: RsvpPayload;
}

export const RsvpStandaloneEntry: React.FC<RsvpStandaloneEntryProps> = ({
  payload,
}) => {
  const isShortRoute = !payload.recipientName || !payload.eventName;
  const [hydrating, setHydrating] = useState<boolean>(isShortRoute);
  const [resolvedPayload, setResolvedPayload] = useState<RsvpPayload>(payload);
  const [initialState, setInitialState] = useState<{
    status?: RsvpStatus;
    representative?: string;
    note?: string;
    submittedAt?: number;
  }>({});

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      let nextPayload: RsvpPayload = { ...payload };
      let hasCloudRsvp = false;

      try {
        // 1. Hydrate from Cloud Firestore (parallel lightweight single-doc reads)
        if (isFirestoreRsvpConfigured() && payload.eventId) {
          const [configResult, guestResult, rsvpResult] =
            await Promise.allSettled([
              isShortRoute
                ? fetchInviteConfigWithMetaFromCloud(payload.eventId)
                : Promise.resolve(null),
              isShortRoute
                ? fetchGuestInviteFromCloud(payload.eventId, payload.invitationCode)
                : Promise.resolve(null),
              fetchSingleRsvpFromCloud(payload.eventId, payload.invitationCode),
            ]);

          if (
            !cancelled &&
            configResult.status === 'fulfilled' &&
            configResult.value?.eventMeta
          ) {
            const meta = configResult.value.eventMeta;
            nextPayload = {
              ...nextPayload,
              eventName: nextPayload.eventName || meta.eventName || '',
              date: nextPayload.date || meta.date || '',
              time: nextPayload.time || meta.time || '',
              location: nextPayload.location || meta.location || '',
              organizer: nextPayload.organizer || meta.organizer || '',
            };
          }

          if (
            !cancelled &&
            guestResult.status === 'fulfilled' &&
            guestResult.value
          ) {
            const g = guestResult.value;
            nextPayload = {
              ...nextPayload,
              salutation: g.salutation || nextPayload.salutation || 'Kepada Yth.',
              recipientName: g.recipientName || nextPayload.recipientName,
              institution: g.institution || nextPayload.institution,
            };
          }

          if (
            !cancelled &&
            rsvpResult.status === 'fulfilled' &&
            rsvpResult.value
          ) {
            hasCloudRsvp = true;
            setInitialState({
              status: rsvpResult.value.status,
              representative: rsvpResult.value.representative,
              note: rsvpResult.value.note,
              submittedAt: rsvpResult.value.updatedAt,
            });
          }
        }

        // 2. Fallback to local browser IndexedDB draft (useful on same device / offline preview)
        if (!hasCloudRsvp || !nextPayload.recipientName || !nextPayload.eventName) {
          try {
            const draft = await loadStudioDraft();
            if (!cancelled && draft) {
              const targetEventId = sanitizeFirestoreId(
                payload.eventId,
                80,
                'default'
              );
              const targetCode = sanitizeFirestoreId(
                payload.invitationCode,
                40,
                'RI-001'
              ).toLowerCase();
              const ev = draft.events.find(
                (e) =>
                  !payload.eventId ||
                  e.id === payload.eventId ||
                  sanitizeFirestoreId(e.id, 80, 'default') === targetEventId
              );
              if (ev) {
                nextPayload = {
                  ...nextPayload,
                  eventName: nextPayload.eventName || ev.metadata.eventName,
                  date: nextPayload.date || ev.metadata.date,
                  time: nextPayload.time || ev.metadata.time,
                  location: nextPayload.location || ev.metadata.location,
                  organizer: nextPayload.organizer || ev.metadata.organizer,
                };
                const matched = ev.recipients.find(
                  (r) =>
                    r.invitationCode.toLowerCase() ===
                      payload.invitationCode.toLowerCase() ||
                    sanitizeFirestoreId(
                      r.invitationCode,
                      40,
                      'RI-001'
                    ).toLowerCase() === targetCode
                );
                if (matched) {
                  nextPayload = {
                    ...nextPayload,
                    salutation: matched.salutation || nextPayload.salutation,
                    recipientName:
                      nextPayload.recipientName || matched.recipientName,
                    institution: nextPayload.institution || matched.institution,
                  };
                  if (!hasCloudRsvp) {
                    setInitialState({
                      status: matched.rsvpStatus,
                      representative: matched.rsvpRepresentative,
                      note: matched.rsvpNote,
                      submittedAt: matched.rsvpAt,
                    });
                  }
                }
              }
            }
          } catch {
            // ignore IndexedDB fallback errors
          }
        }
      } finally {
        if (!cancelled) {
          setResolvedPayload({
            ...nextPayload,
            salutation: nextPayload.salutation || 'Kepada Yth.',
            recipientName: nextPayload.recipientName || 'Tamu Undangan',
            eventName: nextPayload.eventName || 'Undangan Resmi',
            organizer: nextPayload.organizer || 'Panitia Penyelenggara',
          });
          setHydrating(false);
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [payload, isShortRoute]);

  const handleSubmit = async (data: {
    status: 'attending' | 'represented' | 'declined';
    representative?: string;
    note?: string;
  }) => {
    const rsvpAt = Date.now();

    // 1. Sync to Cloud Firestore (1 lightweight setDoc write) when configured
    if (isFirestoreRsvpConfigured() && resolvedPayload.eventId) {
      try {
        await submitRsvpToCloud(
          resolvedPayload.eventId,
          resolvedPayload.invitationCode,
          {
            status: data.status,
            representative: data.representative,
            note: data.note,
            updatedAt: rsvpAt,
          }
        );
      } catch (err) {
        console.warn('Firestore RSVP sync skipped:', err);
      }
    }

    // 2. Always persist locally & broadcast to open admin tabs on same device
    await applyRsvpSubmissionToStorage(
      resolvedPayload.eventId,
      resolvedPayload.invitationCode,
      {
        rsvpStatus: data.status,
        rsvpRepresentative: data.representative,
        rsvpNote: data.note,
        rsvpAt,
      }
    );

    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(RSVP_BROADCAST_CHANNEL);
      const msg: RsvpSubmissionMessage = {
        type: 'rsvp_updated',
        eventId: resolvedPayload.eventId,
        invitationCode: resolvedPayload.invitationCode,
        rsvpStatus: data.status,
        rsvpRepresentative: data.representative,
        rsvpNote: data.note,
        rsvpAt,
      };
      ch.postMessage(msg);
      ch.close();
    }
  };

  if (hydrating) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center p-6"
        style={{ backgroundColor: 'var(--bg-canvas-outer)' }}
      >
        <div className="rounded-3xl bg-white border border-[#DDEEF3] px-7 py-5 flex items-center gap-3 shadow-sm">
          <div className="w-5 h-5 rounded-full border-2 border-[#1F9B96]/30 border-t-[#1F9B96] animate-spin" />
          <span className="text-[13.5px] font-semibold text-[#1B1B4B]">
            Membuka Halaman Konfirmasi Kehadiran...
          </span>
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <GuestRsvpPage
        payload={resolvedPayload}
        initialStatus={initialState.status}
        initialRepresentative={initialState.representative}
        initialNote={initialState.note}
        initialSubmittedAt={initialState.submittedAt}
        onSubmitRsvp={handleSubmit}
      />
    </MotionConfig>
  );
};

export default RsvpStandaloneEntry;
