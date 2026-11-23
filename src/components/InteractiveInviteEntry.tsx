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
  fetchSingleRsvpFromCloud,
  isFirestoreRsvpConfigured,
  submitRsvpToCloud,
} from '../utils/firebaseRsvp';
import { InteractiveInvitePage } from './InteractiveInvitePage';

interface InteractiveInviteEntryProps {
  payload: RsvpPayload;
}

export const InteractiveInviteEntry: React.FC<InteractiveInviteEntryProps> = ({
  payload,
}) => {
  const [initialState, setInitialState] = useState<{
    status?: RsvpStatus;
    representative?: string;
    note?: string;
    submittedAt?: number;
  }>({});

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      if (isFirestoreRsvpConfigured() && payload.eventId) {
        try {
          const cloudRecord = await fetchSingleRsvpFromCloud(
            payload.eventId,
            payload.invitationCode
          );
          if (!cancelled && cloudRecord) {
            setInitialState({
              status: cloudRecord.status,
              representative: cloudRecord.representative,
              note: cloudRecord.note,
              submittedAt: cloudRecord.updatedAt,
            });
            return;
          }
        } catch {
          // Graceful fallback to local draft storage
        }
      }

      try {
        const draft = await loadStudioDraft();
        if (cancelled || !draft) return;
        const matched = draft.events
          .find((e) => !payload.eventId || e.id === payload.eventId)
          ?.recipients.find(
            (r) =>
              r.invitationCode.toLowerCase() ===
              payload.invitationCode.toLowerCase()
          );
        if (matched) {
          setInitialState({
            status: matched.rsvpStatus,
            representative: matched.rsvpRepresentative,
            note: matched.rsvpNote,
            submittedAt: matched.rsvpAt,
          });
        }
      } catch {
        // ignore
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [payload.eventId, payload.invitationCode]);

  const handleSubmit = async (data: {
    status: 'attending' | 'represented' | 'declined';
    representative?: string;
    note?: string;
  }) => {
    const rsvpAt = Date.now();

    if (isFirestoreRsvpConfigured() && payload.eventId) {
      try {
        await submitRsvpToCloud(payload.eventId, payload.invitationCode, {
          status: data.status,
          representative: data.representative,
          note: data.note,
          updatedAt: rsvpAt,
        });
      } catch (err) {
        console.warn('Firestore RSVP sync skipped:', err);
      }
    }

    await applyRsvpSubmissionToStorage(
      payload.eventId,
      payload.invitationCode,
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
        eventId: payload.eventId,
        invitationCode: payload.invitationCode,
        rsvpStatus: data.status,
        rsvpRepresentative: data.representative,
        rsvpNote: data.note,
        rsvpAt,
      };
      ch.postMessage(msg);
      ch.close();
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <InteractiveInvitePage
        payload={payload}
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
