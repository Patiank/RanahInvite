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
import { GuestRsvpPage } from './GuestRsvpPage';

interface RsvpStandaloneEntryProps {
  payload: RsvpPayload;
}

export const RsvpStandaloneEntry: React.FC<RsvpStandaloneEntryProps> = ({
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
    loadStudioDraft()
      .then((draft) => {
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
      })
      .catch(() => {});
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
      <GuestRsvpPage
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

export default RsvpStandaloneEntry;
