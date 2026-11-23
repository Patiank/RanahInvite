import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { RsvpPayload, RsvpStatus } from '../types';
import { getRsvpLabel } from '../utils/rsvp';

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
        <div className="w-full max-w-lg mb-3 flex items-center justify-between gap-2 px-4 py-2.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
          <span className="text-[12px] font-medium text-slate-600">
            Pratinjau Halaman RSVP Tamu (Simulasi Scan QR)
          </span>
          <button
            type="button"
            onClick={onBackToAdmin}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white transition-colors hover:brightness-95 whitespace-nowrap"
            style={{ backgroundColor: 'var(--bg-sidebar)' }}
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
        className="w-full max-w-lg rounded-[24px] bg-white shadow-xl border border-slate-200/70 overflow-hidden"
      >
        {/* Top Event Banner */}
        <div
          className="px-6 py-6 text-white relative overflow-hidden"
          style={{ backgroundColor: 'var(--bg-sidebar)' }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 36 36" fill="none" className="w-5 h-5" aria-hidden="true">
                <path
                  d="M4 25C7.5 21 9 13 7 6C10.5 11.5 14 13.5 18 5C22 13.5 25.5 11.5 29 6C27 13 28.5 21 32 25L27 29H9L4 25Z"
                  fill="#F6D458"
                />
                <path d="M11 29H25" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="text-[12px] font-medium text-white/85 truncate">
              {payload.organizer}
            </div>
          </div>

          <h1 className="font-display font-bold text-[20px] leading-snug text-white">
            {payload.eventName}
          </h1>

          <div className="mt-3 space-y-1.5 text-[12px] text-white/90">
            {payload.date && (
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-[#F6D458] shrink-0" />
                <span>
                  {payload.date} {payload.time ? `· ${payload.time}` : ''}
                </span>
              </div>
            )}
            {payload.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#F6D458] shrink-0" />
                <span>{payload.location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Gold Songket Accent Hairline */}
        <div className="h-1 w-full" style={{ backgroundColor: 'var(--accent-cultural-gold)' }} />

        {/* Recipient Identity Card */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-slate-50/60">
          <div className="text-[12px] font-medium text-[#158A85]">
            {payload.salutation}
          </div>
          <div className="font-display font-bold text-[18px] text-[#111827] mt-0.5">
            {payload.recipientName}
          </div>
          {payload.institution && (
            <div className="text-[13px] text-slate-600 mt-0.5">
              {payload.institution}
            </div>
          )}
          <div className="text-[11px] font-mono text-slate-500 mt-2 tabular-nums">
            Kode Undangan: {payload.invitationCode}
          </div>
        </div>

        {/* Form or Confirmation Receipt */}
        {!editing && submittedAt ? (
          <div className="p-6 space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div>
              <h2 className="font-display font-bold text-[18px] text-[#111827]">
                Konfirmasi Kehadiran Tercatat
              </h2>
              <p className="text-[13px] text-slate-500 mt-1">
                Terima kasih telah melakukan verifikasi kehadiran untuk panitia penyelenggara.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-left space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status Kehadiran</span>
                <span className="font-semibold text-[#111827]">
                  {getRsvpLabel(selectedStatus)}
                </span>
              </div>
              {representative && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">
                    {selectedStatus === 'represented' ? 'Perwakilan' : 'Keterangan'}
                  </span>
                  <span className="font-medium text-[#111827] text-right">
                    {representative}
                  </span>
                </div>
              )}
              {note && (
                <div className="pt-2 border-t border-slate-200/80">
                  <div className="text-[11px] text-slate-500">Catatan:</div>
                  <div className="text-[#111827] mt-0.5">{note}</div>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
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
              className="px-4 py-2 rounded-xl border border-slate-200 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Ubah Konfirmasi Kehadiran
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div>
              <h2 className="font-display font-semibold text-[15px] text-[#111827]">
                Konfirmasi Kehadiran Anda
              </h2>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Informasi ini membantu panitia menyiapkan penyambutan dan tempat duduk tamu dengan baik.
              </p>
            </div>

            {/* 3 Clear RSVP Choices */}
            <div className="grid grid-cols-1 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedStatus('attending');
                  if (!representative || representative === 'Perwakilan Instansi') {
                    setRepresentative('1 orang (Sendiri)');
                  }
                }}
                className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                  selectedStatus === 'attending'
                    ? 'border-[#158A85] bg-[#E6F4F8]/60 ring-2 ring-[#158A85]/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <CheckCircle2
                  className={`w-5 h-5 shrink-0 ${
                    selectedStatus === 'attending' ? 'text-[#158A85]' : 'text-slate-400'
                  }`}
                />
                <div>
                  <div className="font-display font-semibold text-[14px] text-[#111827]">
                    Hadir Langsung
                  </div>
                  <div className="text-[12px] text-slate-500">
                    Saya berencana menghadiri acara ini sesuai jadwal
                  </div>
                </div>
              </button>

              <button
                type="button"
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
                    ? 'border-[#158A85] bg-[#E6F4F8]/60 ring-2 ring-[#158A85]/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <UserCheck
                  className={`w-5 h-5 shrink-0 ${
                    selectedStatus === 'represented' ? 'text-[#158A85]' : 'text-slate-400'
                  }`}
                />
                <div>
                  <div className="font-display font-semibold text-[14px] text-[#111827]">
                    Diwakilkan
                  </div>
                  <div className="text-[12px] text-slate-500">
                    Kehadiran akan diwakilkan oleh pejabat/staf instansi kami
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedStatus('declined')}
                className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                  selectedStatus === 'declined'
                    ? 'border-red-500 bg-red-50/50 ring-2 ring-red-500/15'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <XCircle
                  className={`w-5 h-5 shrink-0 ${
                    selectedStatus === 'declined' ? 'text-red-600' : 'text-slate-400'
                  }`}
                />
                <div>
                  <div className="font-display font-semibold text-[14px] text-[#111827]">
                    Belum Dapat Hadir / Berhalangan
                  </div>
                  <div className="text-[12px] text-slate-500">
                    Mohon maaf berhalangan menghadiri acara pada jadwal tersebut
                  </div>
                </div>
              </button>
            </div>

            {/* Conditional Detail Input */}
            {selectedStatus === 'attending' && (
              <div className="space-y-2.5">
                <label className="block text-[12px] font-medium text-slate-700">
                  Jumlah Orang / Keterangan Kehadiran
                </label>
                <div className="grid grid-cols-6 sm:grid-cols-5 gap-2">
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
                        onClick={() => setRepresentative(opt.value)}
                        className={`py-2 px-1.5 rounded-xl border text-[12px] font-semibold tabular-nums transition-all text-center whitespace-nowrap ${
                          opt.id === '1' ? 'col-span-2 sm:col-span-1' : 'col-span-1'
                        } ${
                          isSelected
                            ? 'border-[#158A85] bg-[#E6F4F8] text-[#158A85] ring-2 ring-[#158A85]/20'
                            : 'border-slate-200 bg-white text-[#111827] hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={representative}
                  onChange={(e) => setRepresentative(e.target.value)}
                  placeholder="Atau tulis keterangan khusus (misal: 6 orang / + 1 Staf Protokol)"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                />
              </div>
            )}

            {selectedStatus === 'represented' && (
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">
                  Nama & Jabatan Perwakilan *
                </label>
                <input
                  type="text"
                  required
                  value={representative}
                  onChange={(e) => setRepresentative(e.target.value)}
                  placeholder="Contoh: Bpk. Hendri Saputra (Kabid Pemasaran)"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                />
              </div>
            )}

            <div>
              <label className="block text-[12px] font-medium text-slate-700 mb-1">
                Catatan untuk Panitia (Opsional)
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Misalnya: Perkiraan tiba pukul 09.15 WIB atau catatan khusus..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 rounded-xl font-display font-semibold text-[14px] text-white transition-all hover:brightness-95 active:scale-[0.99] disabled:opacity-50"
              style={{ backgroundColor: 'var(--bg-sidebar)' }}
            >
              {submitting ? 'Menyimpan Konfirmasi...' : 'Kirim Konfirmasi Kehadiran'}
            </button>
          </form>
        )}

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>RanahInvite Studio</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Verifikasi Kehadiran Mandiri</span>
          </span>
        </div>
      </motion.div>
    </div>
  );
};
