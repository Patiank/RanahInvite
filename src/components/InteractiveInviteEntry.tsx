import React, { useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import {
  InteractiveInviteConfig,
  RsvpPayload,
  RsvpStatus,
} from '../types';
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
import { InteractiveInvitePage } from './InteractiveInvitePage';

interface InteractiveInviteEntryProps {
  payload: RsvpPayload;
}

export const InteractiveInviteEntry: React.FC<InteractiveInviteEntryProps> = ({
  payload,
}) => {
  const isShortRoute = !payload.recipientName || !payload.eventName;
  const [hydrating, setHydrating] = useState<boolean>(isShortRoute);
  const [resolvedPayload, setResolvedPayload] = useState<RsvpPayload>(payload);
  const [cloudConfig, setCloudConfig] = useState<
    Partial<InteractiveInviteConfig> | undefined
  >(undefined);
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

      try {
        if (isFirestoreRsvpConfigured() && payload.eventId) {
          const [configResult, guestResult, rsvpResult] =
            await Promise.allSettled([
              fetchInviteConfigWithMetaFromCloud(payload.eventId),
              fetchGuestInviteFromCloud(payload.eventId, payload.invitationCode),
              fetchSingleRsvpFromCloud(payload.eventId, payload.invitationCode),
            ]);

          if (
            !cancelled &&
            configResult.status === 'fulfilled' &&
            configResult.value
          ) {
            setCloudConfig(configResult.value.config);
            const meta = configResult.value.eventMeta;
            if (meta) {
              nextPayload = {
                ...nextPayload,
                eventName: nextPayload.eventName || meta.eventName || '',
                date: nextPayload.date || meta.date || '',
                time: nextPayload.time || meta.time || '',
                location: nextPayload.location || meta.location || '',
                organizer: nextPayload.organizer || meta.organizer || '',
              };
            }
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
            setInitialState({
              status: rsvpResult.value.status,
              representative: rsvpResult.value.representative,
              note: rsvpResult.value.note,
              submittedAt: rsvpResult.value.updatedAt,
            });
          }
        }

        // Local IndexedDB fallback (helpful when admin previews short link locally)
        if (!nextPayload.recipientName || !nextPayload.eventName) {
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
                  setInitialState((prev) =>
                    prev.status
                      ? prev
                      : {
                          status: matched.rsvpStatus,
                          representative: matched.rsvpRepresentative,
                          note: matched.rsvpNote,
                          submittedAt: matched.rsvpAt,
                        }
                  );
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
  }, [payload]);

  const handleSubmit = async (data: {
    status: 'attending' | 'represented' | 'declined';
    representative?: string;
    note?: string;
  }) => {
    const rsvpAt = Date.now();

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
      <div className="fixed inset-0 w-full h-[100dvh] bg-[#09090B] flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="w-14 h-14 rounded-full border-2 border-[#D4AF37]/30 border-t-[#FCE9B2] animate-spin" />
        <div className="text-[13px] font-semibold tracking-wide text-[#FCE9B2]">
          Membuka Undangan Digital...
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <InteractiveInvitePage
        payload={resolvedPayload}
        config={cloudConfig}
        initialStatus={initialState.status}
        initialRepresentative={initialState.representative}
        initialNote={initialState.note}
        initialSubmittedAt={initialState.submittedAt}
        onSubmitRsvp={handleSubmit}
      />
    </MotionConfig>
  );
};

export default InteractiveInviteEntry;
