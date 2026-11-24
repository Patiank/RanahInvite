import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  MapPin,
} from 'lucide-react';
import { RsvpPayload, RsvpStatus } from '../types';
import { getRsvpLabel } from '../utils/rsvp';
import { BrandIcon } from './BrandIcon';

interface GuestRsvpPageProps {
  payload: RsvpPayload;
  initialStatus?: RsvpStatus;
  initialRepresentative?: string;
  initialNote?: string;
  initialSubmittedAt?: number;
  isSimulation?: boolean;
  onBackToAdmin?: () => void;
  onSubmitRsvp: (data: {
    status: 'attending' | 'represented' | 'declined';
    representative?: string;
    note?: string;
  }) => Promise<void> | void;
}

const ATTENDING_COUNT_OPTIONS = [
  { id: '1', label: '1 (Sendiri)', value: '1 orang (Sendiri)' },
  { id: '2', label: '2', value: '2 orang' },
  { id: '3', label: '3', value: '3 orang' },
  { id: '4', label: '4', value: '4 orang' },
  { id: '>5', label: '>5', value: '>5 orang' },
] as const;

export const GuestRsvpPage: React.FC<GuestRsvpPageProps> = ({
  payload,
  initialStatus,
  initialRepresentative,
  initialNote,
  initialSubmittedAt,
  isSimulation = false,
  onBackToAdmin,
  onSubmitRsvp,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<
    'attending' | 'represented' | 'declined'
  >(
    initialStatus === 'represented'
      ? 'represented'
      : initialStatus === 'declined'
        ? 'declined'
        : 'attending'
  );
  const [representative, setRepresentative] = useState<string>(
    initialRepresentative ||
      (!initialStatus || initialStatus === 'pending' || initialStatus === 'attending'
        ? '1 orang (Sendiri)'
        : '')
  );
  const [note, setNote] = useState<string>(initialNote || '');
  const [submittedAt, setSubmittedAt] = useState<number | null>(
    initialStatus && initialStatus !== 'pending'
      ? initialSubmittedAt || Date.now()
      : null
  );
  const [editing, setEditing] = useState<boolean>(
    !initialStatus || initialStatus === 'pending'
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const cleanRep =
        selectedStatus === 'attending'
          ? representative.trim() || '1 orang'
          : selectedStatus === 'represented'
            ? representative.trim() || 'Perwakilan Instansi'
            : undefined;
      await onSubmitRsvp({
        status: selectedStatus,
        representative: cleanRep,
        note: note.trim() || undefined,
      });
      setSubmittedAt(Date.now());
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full py-6 px-4 flex flex-col items-center justify-center"
      style={{ backgroundColor: 'var(--bg-canvas-outer)' }}
    >
      {isSimulation && onBackToAdmin && (
        <div className="w-full max-w-lg mb-3 flex items-center justify-between gap-2 px-4 py-2.5 rounded-full bg-white border border-[#DDEEF3] shadow-xs">
          <span className="text-[12px] font-medium text-[#757E96]">
            Pratinjau Halaman RSVP Tamu (Simulasi Scan QR)
          </span>
          <button
            type="button"
            onClick={onBackToAdmin}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold text-white bg-[#1F9B96] hover:bg-[#167F7B] transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Admin</span>
          </button>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg rounded-[28px] bg-white shadow-xl border border-[#DDEEF3] overflow-hidden"
      >
        {/* Top Event Banner */}
        <div className="px-6 py-6 text-white bg-[#1F9B96] relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-8 w-28 h-28 rounded-full bg-[#F7B7C6]/35"
          />
          <div className="relative z-10 flex items-center gap-3 mb-3">
            <BrandIcon name="brand-verify" white className="w-10 h-10 shrink-0" />
            <div className="text-[12px] font-medium text-white/90 truncate">
              {payload.organizer}
            </div>
          </div>

          <h1 className="relative z-10 font-display font-bold text-[20px] leading-snug text-white">
            {payload.eventName}
          </h1>

          <div className="relative z-10 mt-3 space-y-1.5 text-[12px] text-white/90">
            {payload.date && (
              <div className="flex items-center gap-2">
                <BrandIcon name="schedule-datetime" white className="w-4 h-4 shrink-0" />
                <span>
                  {payload.date} {payload.time ? `· ${payload.time}` : ''}
                </span>
              </div>
            )}
            {payload.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#F9DE6C] shrink-0" />
                <span>{payload.location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Butter Yellow Accent Hairline */}
        <div className="h-1.5 w-full bg-[#F9DE6C]" />

        {/* Recipient Identity Card */}
        <div className="px-6 pt-5 pb-4 border-b border-[#EDF6F9] bg-[#F4FBFD]">
          <div className="text-[12px] font-semibold text-[#1F9B96]">
            {payload.salutation}
          </div>
          <div className="font-display font-bold text-[18px] text-[#1B1B4B] mt-0.5">
            {payload.recipientName}
          </div>
          {payload.institution && (
            <div className="text-[13px] text-[#757E96] mt-0.5">
              {payload.institution}
            </div>
          )}
          <div className="text-[11px] font-mono text-[#757E96] mt-2 tabular-nums">
            Kode Undangan: {payload.invitationCode}
          </div>
        </div>

        {/* Form or Confirmation Receipt */}
        {!editing && submittedAt ? (
          <div className="p-6 space-y-5 text-center">
            <div className="flex justify-center">
              <BrandIcon
                name={
                  selectedStatus === 'represented'
                    ? 'rsvp-represented'
                    : selectedStatus === 'declined'
                      ? 'rsvp-declined'
                      : 'rsvp-attending'
                }
                className="w-11 h-11 text-[#1B1B4B]"
              />
            </div>

            <div>
              <h2 className="font-display font-bold text-[18px] text-[#1B1B4B]">
                Konfirmasi Kehadiran Tercatat
              </h2>
              <p className="text-[13px] text-[#757E96] mt-1">
                Terima kasih telah melakukan verifikasi kehadiran untuk panitia penyelenggara.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E5F1F5] bg-[#F4FBFD] p-4 text-left space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-[#757E96]">Status Kehadiran</span>
                <span className="font-bold text-[#1B1B4B]">
                  {getRsvpLabel(selectedStatus)}
                </span>
              </div>
              {representative && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#757E96]">
                    {selectedStatus === 'represented' ? 'Perwakilan' : 'Keterangan'}
                  </span>
                  <span className="font-semibold text-[#1B1B4B] text-right">
                    {representative}
                  </span>
                </div>
              )}
              {note && (
                <div className="pt-2 border-t border-[#DDEEF3]">
                  <div className="text-[11px] text-[#757E96]">Catatan:</div>
                  <div className="text-[#1B1B4B] mt-0.5">{note}</div>
                </div>
              )}
              <div className="pt-2 border-t border-[#DDEEF3] flex items-center justify-between text-[11px] text-[#757E96] tabular-nums">
                <span>Waktu Konfirmasi</span>
                <span>
                  {new Date(submittedAt).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setEditing(true)}
              className="px-5 py-2.5 rounded-full border border-[#DDEEF3] bg-white text-[13px] font-semibold text-[#1B1B4B] hover:bg-[#E3F5FA] transition-colors"
            >
              Ubah Konfirmasi Kehadiran
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
            <div>
              <h2 className="font-display font-bold text-[15px] text-[#1B1B4B]">
                Konfirmasi Kehadiran Anda
              </h2>
              <p className="text-[12px] text-[#757E96] mt-0.5">
                Informasi ini membantu panitia menyiapkan penyambutan dan tempat duduk tamu dengan baik.
              </p>
            </div>

            {/* 3 Clear RSVP Choices */}
            <fieldset className="border-0 p-0 m-0">
              <legend className="sr-only">Pilihan Status Kehadiran</legend>
              <div role="radiogroup" aria-label="Pilihan Status Kehadiran" className="grid grid-cols-1 gap-2.5">
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedStatus === 'attending'}
                  onClick={() => {
                    setSelectedStatus('attending');
                    if (!representative || representative === 'Perwakilan Instansi') {
                      setRepresentative('1 orang (Sendiri)');
                    }
                  }}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                    selectedStatus === 'attending'
                      ? 'border-[#1F9B96] bg-[#DCF5F1]/75 ring-2 ring-[#1F9B96]/20'
                      : 'border-[#E5F1F5] hover:border-[#B5E4F1]'
                  }`}
                >
                  <BrandIcon
                    name="rsvp-attending"
                    className={`w-5 h-5 shrink-0 ${
                      selectedStatus === 'attending' ? 'text-[#157A76]' : 'text-[#757E96]'
                    }`}
                  />
                  <div>
                    <div className="font-display font-bold text-[14px] text-[#1B1B4B]">
                      Hadir Langsung
                    </div>
                    <div className="text-[12px] text-[#757E96]">
                      Saya berencana menghadiri acara ini sesuai jadwal
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedStatus === 'represented'}
                  onClick={() => {
                    setSelectedStatus('represented');
                    if (
                      representative === '1 orang' ||
                      ATTENDING_COUNT_OPTIONS.some((opt) => opt.value === representative)
                    ) {
                      setRepresentative('');
                    }
                  }}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                    selectedStatus === 'represented'
                      ? 'border-[#1F9B96] bg-[#E3F5FA] ring-2 ring-[#1F9B96]/20'
                      : 'border-[#E5F1F5] hover:border-[#B5E4F1]'
                  }`}
                >
                  <BrandIcon
                    name="rsvp-represented"
                    className={`w-5 h-5 shrink-0 ${
                      selectedStatus === 'represented' ? 'text-[#167F7B]' : 'text-[#757E96]'
                    }`}
                  />
                  <div>
                    <div className="font-display font-bold text-[14px] text-[#1B1B4B]">
                      Diwakilkan
                    </div>
                    <div className="text-[12px] text-[#757E96]">
                      Kehadiran akan diwakilkan oleh pejabat/staf instansi kami
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedStatus === 'declined'}
                  onClick={() => setSelectedStatus('declined')}
                  className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                    selectedStatus === 'declined'
                      ? 'border-[#E598AB] bg-[#FDE8EE] ring-2 ring-[#F7B7C6]/40'
                      : 'border-[#E5F1F5] hover:border-[#F5C6D2]'
                  }`}
                >
                  <BrandIcon
                    name="rsvp-declined"
                    className={`w-5 h-5 shrink-0 ${
                      selectedStatus === 'declined' ? 'text-[#B83B5E]' : 'text-[#757E96]'
                    }`}
                  />
                  <div>
                    <div className="font-display font-bold text-[14px] text-[#1B1B4B]">
                      Belum Dapat Hadir / Berhalangan
                    </div>
                    <div className="text-[12px] text-[#757E96]">
                      Mohon maaf berhalangan menghadiri acara pada jadwal tersebut
                    </div>
                  </div>
                </button>
              </div>
            </fieldset>

            {/* Conditional Detail Input */}
            {selectedStatus === 'attending' && (
              <div className="pt-4 border-t border-[#EDF6F9] space-y-2.5">
                <label htmlFor="rsvp-attending-notes" className="block text-[12px] font-medium text-[#1B1B4B]">
                  Jumlah Orang / Keterangan Kehadiran
                </label>
                <div role="radiogroup" aria-label="Pilihan jumlah orang" className="grid grid-cols-6 sm:grid-cols-5 gap-2">
                  {ATTENDING_COUNT_OPTIONS.map((opt) => {
                    const isSelected =
                      representative === opt.value ||
                      (opt.id === '1' && representative === '1 orang') ||
                      (opt.id !== '1' &&
                        opt.id !== '>5' &&
                        representative.startsWith(`${opt.id} `)) ||
                      (opt.id === '>5' && representative.startsWith('>5'));

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setRepresentative(opt.value)}
                        className={`py-2 px-1.5 rounded-full border text-[12px] font-semibold tabular-nums transition-all text-center whitespace-nowrap ${
                          opt.id === '1' ? 'col-span-2 sm:col-span-1' : 'col-span-1'
                        } ${
                          isSelected
                            ? 'border-[#1F9B96] bg-[#E3F5FA] text-[#167F7B] ring-2 ring-[#1F9B96]/20'
                            : 'border-[#DDEEF3] bg-white text-[#1B1B4B] hover:border-[#B5E4F1] hover:bg-[#F4FBFD]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  id="rsvp-attending-notes"
                  type="text"
                  value={representative}
                  onChange={(e) => setRepresentative(e.target.value)}
                  placeholder="Atau tulis keterangan khusus (misal: 6 orang / + 1 Staf Protokol)"
                  className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                />
              </div>
            )}

            {selectedStatus === 'represented' && (
              <div className="pt-4 border-t border-[#EDF6F9]">
                <label htmlFor="rsvp-representative-name" className="block text-[12px] font-medium text-[#1B1B4B] mb-1.5">
                  Nama & Jabatan Perwakilan *
                </label>
                <input
                  id="rsvp-representative-name"
                  type="text"
                  required
                  value={representative}
                  onChange={(e) => setRepresentative(e.target.value)}
                  placeholder="Contoh: Bpk. Hendri Saputra (Kabid Pemasaran)"
                  className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2.5 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                />
              </div>
            )}

            <div className={selectedStatus === 'declined' ? 'pt-4 border-t border-[#EDF6F9]' : 'pt-1'}>
              <label htmlFor="rsvp-notes" className="block text-[12px] font-medium text-[#1B1B4B] mb-1.5">
                Catatan untuk Panitia (Opsional)
              </label>
              <textarea
                id="rsvp-notes"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Misalnya: Perkiraan tiba pukul 09.15 WIB atau catatan khusus..."
                className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-5 rounded-full font-display font-bold text-[14px] text-white bg-[#1F9B96] hover:bg-[#167F7B] transition-colors active:scale-[0.99] disabled:opacity-50 shadow-xs"
            >
              {submitting ? 'Menyimpan Konfirmasi...' : 'Kirim Konfirmasi Kehadiran'}
            </button>
          </form>
        )}

        <div className="px-6 py-3 bg-[#F4FBFD] border-t border-[#EDF6F9] flex items-center justify-between text-[11px] text-[#757E96]">
          <span className="font-semibold text-[#1B1B4B]">Ranah Invite</span>
          <span className="inline-flex items-center gap-1">
            <BrandIcon name="rsvp-pending" className="w-3.5 h-3.5" />
            <span>Verifikasi Kehadiran Mandiri</span>
          </span>
        </div>
      </motion.div>
    </div>
  );
};
