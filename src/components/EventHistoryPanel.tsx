import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Copy,
  FolderOpen,
  MapPin,
  Plus,
  X,
} from 'lucide-react';
import { EventMetadata, SavedEventRecord } from '../types';
import { AnalogClockTimePicker, CalendarDatePicker } from './DateTimePickers';
import { PaginationBar } from './PaginationBar';
import { CountUpNumber, SmartMarqueeText } from './UiPolish';
import { BrandIcon, IconBadge, getSumbarEventIcon } from './BrandIcon';

interface EventHistoryPanelProps {
  events: SavedEventRecord[];
  activeEventId: string;
  onSelectEvent: (eventId: string) => void;
  onCreateEvent: (metadata: EventMetadata) => void;
  onDuplicateEvent: (eventId: string) => void;
  onToggleCompleted: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
}

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  januari: 0,
  jan: 0,
  january: 0,
  februari: 1,
  feb: 1,
  february: 1,
  maret: 2,
  mar: 2,
  march: 2,
  april: 3,
  apr: 3,
  mei: 4,
  may: 4,
  juni: 5,
  jun: 5,
  june: 5,
  juli: 6,
  jul: 6,
  july: 6,
  agustus: 7,
  agu: 7,
  agt: 7,
  aug: 7,
  august: 7,
  september: 8,
  sep: 8,
  sept: 8,
  oktober: 9,
  okt: 9,
  oct: 9,
  october: 9,
  november: 10,
  nov: 10,
  desember: 11,
  des: 11,
  dec: 11,
  december: 11,
};

function parseEventDateMs(rawDate: string): number | null {
  if (!rawDate || !rawDate.trim()) return null;
  const trimmed = rawDate.trim();

  // ISO format: YYYY-MM-DD
  const isoMatch = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day).getTime();
    }
  }

  // Indonesian / English text format (supports weekday prefix and ranges like "14 - 16 November 2026")
  const textMatch = /(\d{1,2})(?:\s*[-–—]\s*\d{1,2})?\s+([A-Za-z]+)\.?\s+(\d{4})/.exec(
    trimmed
  );
  if (textMatch) {
    const day = Number(textMatch[1]);
    const monthKey = textMatch[2].toLowerCase();
    const year = Number(textMatch[3]);
    const month = MONTH_NAME_TO_INDEX[monthKey];
    if (month !== undefined && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return new Date(year, month, day).getTime();
    }
  }

  // Numeric DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(trimmed);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]) - 1;
    const year = Number(dmyMatch[3]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day).getTime();
    }
  }

  return null;
}

export const EventHistoryPanel: React.FC<EventHistoryPanelProps> = ({
  events,
  activeEventId,
  onSelectEvent,
  onCreateEvent,
  onDuplicateEvent,
  onToggleCompleted,
  onDeleteEvent,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'done'>('all');
  const [eventPage, setEventPage] = useState<number>(1);
  const EVENT_PAGE_SIZE = 10;
  const [createOpen, setCreateOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<SavedEventRecord | null>(null);
  const [eventToDelete, setEventToDelete] = useState<SavedEventRecord | null>(null);

  useEffect(() => {
    if (!eventToDelete) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEventToDelete(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [eventToDelete]);

  const [newMeta, setNewMeta] = useState<EventMetadata>({
    eventName: '',
    date: '20 Desember 2026',
    time: '09:00 WIB - Selesai',
    location: 'Padang, Sumatera Barat',
    organizer: 'Dinas Pariwisata Provinsi Sumatera Barat',
  });

  const visibleEvents = useMemo(() => {
    const now = new Date();
    const todayStartMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();

    const filtered = events.filter((ev) => {
      if (statusFilter === 'active') return !ev.isCompleted;
      if (statusFilter === 'done') return ev.isCompleted;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const aMs = parseEventDateMs(a.metadata.date);
      const bMs = parseEventDateMs(b.metadata.date);

      const aUpcoming = aMs !== null && aMs >= todayStartMs;
      const bUpcoming = bMs !== null && bMs >= todayStartMs;

      // 1. Upcoming (today or future) always comes before past events
      if (aUpcoming && !bUpcoming) return -1;
      if (!aUpcoming && bUpcoming) return 1;

      // 2. Both upcoming: nearest date first (ascending)
      if (aUpcoming && bUpcoming && aMs !== null && bMs !== null) {
        if (aMs !== bMs) return aMs - bMs;
        return b.updatedAt - a.updatedAt;
      }

      // 3. Dated past events before undated events, sorted descending (most recently passed first down to oldest at bottom)
      if (aMs !== null && bMs !== null) {
        if (aMs !== bMs) return bMs - aMs;
        return b.updatedAt - a.updatedAt;
      }

      if (aMs !== null && bMs === null) return -1;
      if (aMs === null && bMs !== null) return 1;

      return b.updatedAt - a.updatedAt;
    });
  }, [events, statusFilter]);

  const totalEventPages = Math.max(1, Math.ceil(visibleEvents.length / EVENT_PAGE_SIZE));
  const safeEventPage = Math.min(eventPage, totalEventPages);
  const paginatedEvents = visibleEvents.slice(
    (safeEventPage - 1) * EVENT_PAGE_SIZE,
    safeEventPage * EVENT_PAGE_SIZE
  );

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeta.eventName.trim()) return;
    onCreateEvent({
      ...newMeta,
      eventName: newMeta.eventName.trim(),
    });
    setCreateOpen(false);
    setNewMeta({
      eventName: '',
      date: '20 Desember 2026',
      time: '09:00 WIB - Selesai',
      location: 'Padang, Sumatera Barat',
      organizer: 'Dinas Pariwisata Provinsi Sumatera Barat',
    });
  };

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-[#B2E3F0] bg-[#D6F1F8] p-5 flex flex-col justify-between h-full">
      {/* Subtle PinHome geometric blush accent orb */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-9 -right-9 w-28 h-28 rounded-full bg-[#F7B7C6]/35"
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <IconBadge name="sumbar-skyline-mini" size="sm" />
            <div>
              <h3 className="font-display font-bold text-[16px] text-[#1B1B4B]">
                Daftar Event
              </h3>
              <p className="text-[12px] text-[#2F5B6D] font-medium mt-0.5 tabular-nums">
                <CountUpNumber value={events.length} /> event tersimpan
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-full bg-white/85 border border-[#B2E3F0]">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'active', label: 'Aktif' },
                  { id: 'done', label: 'Selesai' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setEventPage(1);
                  }}
                  className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-colors whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-[#1F9B96] text-white shadow-xs'
                      : 'text-[#4B6B7A] hover:text-[#1B1B4B]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold text-[#1B1B4B] bg-[#F9DE6C] hover:bg-[#F3D34F] transition-colors shadow-xs whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Event Baru</span>
            </button>
          </div>
        </div>

        {/* Event List */}
        {visibleEvents.length === 0 ? (
          <div className="py-10 px-4 text-center border border-dashed border-[#9AD6E8] rounded-2xl bg-white/80">
            <p className="text-[13px] font-medium text-[#4B6B7A]">
              Belum ada event pada filter ini.
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-semibold text-white bg-[#1F9B96] hover:bg-[#167F7B]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Event Baru</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[304px] overflow-y-auto p-1 pr-1.5">
            {paginatedEvents.map((ev, idx) => {
              const isCurrent = ev.id === activeEventId;
              const genCount = ev.recipients.filter((r) => r.status === 'generated').length;

              return (
                <motion.div
                  key={ev.id}
                  layout="position"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.2,
                    delay: Math.min(idx * 0.04, 0.28),
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  onClick={() => onSelectEvent(ev.id)}
                  className={`py-3 px-3.5 rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    isCurrent
                      ? 'bg-white border-2 border-[#1F9B96] shadow-[0_6px_18px_-6px_rgba(31,155,150,0.32)]'
                      : 'bg-white/80 border-2 border-[#C3E8F3]/75 hover:bg-white hover:border-[#8FD2E4]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="relative shrink-0">
                      <img
                        src={ev.templates.page1DataUrl}
                        alt={ev.metadata.eventName}
                        className="w-12 h-14 object-contain rounded-xl border border-[#DDEEF3] bg-white p-0.5"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          title={ev.metadata.eventName}
                          className="font-display font-bold text-[14px] text-[#1B1B4B] flex-1 min-w-0 truncate"
                        >
                          {ev.metadata.eventName}
                        </div>
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#DCF5F1] text-[10.5px] font-bold text-[#157A76] whitespace-nowrap shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#1F9B96]" />
                            <span>Aktif</span>
                          </span>
                        )}
                      </div>

                      <div
                        title={`${ev.metadata.date} · ${ev.metadata.location}`}
                        className="text-[12px] text-[#757E96] mt-0.5 truncate"
                      >
                        {ev.metadata.date} · {ev.metadata.location}
                      </div>

                      <div className="flex items-center gap-2.5 mt-1.5 text-[11px] tabular-nums">
                        <span className="font-medium text-[#1B1B4B]/80">
                          {ev.recipients.length} penerima ({genCount} PDF)
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleCompleted(ev.id);
                          }}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold transition-colors ${
                            ev.isCompleted
                              ? 'bg-[#DCF5F1] text-[#157A76] hover:bg-[#CBEFE9]'
                              : 'bg-[#FFF7D6] text-[#9A7409] hover:bg-[#FCEFA8]'
                          }`}
                          title="Klik untuk ubah status selesai / aktif"
                        >
                          {ev.isCompleted ? (
                            <>
                              <BrandIcon name="status-check" className="w-3 h-3" />
                              <span>Selesai</span>
                            </>
                          ) : (
                            <>
                              <BrandIcon name="rsvp-pending" className="w-3 h-3" />
                              <span>Aktif</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setDetailEvent(ev)}
                      title="Lihat rincian event"
                      className="p-1.5 rounded-full text-[#757E96] hover:text-[#1F9B96] hover:bg-[#E3F5FA] transition-colors"
                    >
                      <BrandIcon name="action-eye" className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDuplicateEvent(ev.id)}
                      title="Duplikat desain & daftar event ini"
                      className="p-1.5 rounded-full text-[#757E96] hover:text-[#1B1B4B] hover:bg-[#E3F5FA] transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>

                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => onSelectEvent(ev.id)}
                        title="Buka event ini ke ruang kerja"
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-semibold text-[#167F7B] bg-[#F4FBFD] border border-[#B5E4F1] hover:bg-[#1F9B96] hover:text-white transition-colors whitespace-nowrap"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Buka</span>
                      </button>
                    )}

                    {events.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEventToDelete(ev)}
                        title="Hapus event dari riwayat"
                        className="p-1.5 rounded-full text-[#757E96] hover:text-[#B83B5E] hover:bg-[#FDE8EE] transition-colors"
                      >
                        <BrandIcon name="action-trash" className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
        {visibleEvents.length > EVENT_PAGE_SIZE && (
          <div className="mt-3 -mx-5 -mb-5 rounded-b-[22px] overflow-hidden">
            <PaginationBar
              currentPage={safeEventPage}
              totalItems={visibleEvents.length}
              pageSize={EVENT_PAGE_SIZE}
              onPageChange={setEventPage}
              compact
            />
          </div>
        )}
      </div>

      {/* Create New Event Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1B4B]/45 backdrop-blur-xs">
          <form
            onSubmit={handleCreateSubmit}
            className="w-full max-w-lg rounded-[26px] bg-white shadow-2xl border border-[#E5F1F5] overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDF6F9] bg-[#F4FBFD]">
              <div className="flex items-center gap-3">
                <IconBadge name="brand-ticket" size="sm" />
                <div>
                  <h3 className="font-display font-bold text-[16px] text-[#1B1B4B]">
                    Buat Proyek Event Baru
                  </h3>
                  <p className="text-[12px] text-[#757E96]">
                    Event sebelumnya tetap tersimpan aman di daftar riwayat.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-2 rounded-full text-[#757E96] hover:bg-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#1B1B4B] mb-1">
                  Nama Event / Kegiatan *
                </label>
                <input
                  type="text"
                  required
                  value={newMeta.eventName}
                  onChange={(e) =>
                    setNewMeta({ ...newMeta, eventName: e.target.value })
                  }
                  placeholder="Contoh: Tour de Singkarak Summit 2026"
                  className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2.5 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[#1B1B4B] mb-1">
                    Tanggal Acara
                  </label>
                  <CalendarDatePicker
                    value={newMeta.date}
                    onChange={(nextDate) =>
                      setNewMeta({ ...newMeta, date: nextDate })
                    }
                    inputClassName="py-2 px-3"
                    ariaLabel="Pilih Tanggal Acara Event Baru"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#1B1B4B] mb-1">
                    Waktu
                  </label>
                  <AnalogClockTimePicker
                    value={newMeta.time}
                    onChange={(nextTime) =>
                      setNewMeta({ ...newMeta, time: nextTime })
                    }
                    inputClassName="py-2 px-3"
                    ariaLabel="Pilih Waktu Acara Event Baru"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#1B1B4B] mb-1">
                  Lokasi & Penyelenggara
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newMeta.location}
                    onChange={(e) =>
                      setNewMeta({ ...newMeta, location: e.target.value })
                    }
                    placeholder="Lokasi pelaksanaan"
                    className="w-full rounded-xl border border-[#DDEEF3] px-3 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                  />
                  <input
                    type="text"
                    value={newMeta.organizer}
                    onChange={(e) =>
                      setNewMeta({ ...newMeta, organizer: e.target.value })
                    }
                    placeholder="Instansi penyelenggara"
                    className="w-full rounded-xl border border-[#DDEEF3] px-3 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#EDF6F9] bg-[#F4FBFD]">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-full border border-[#DDEEF3] bg-white text-[13px] font-medium text-[#757E96] hover:bg-[#E3F5FA]/50"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-full text-[13px] font-semibold text-white bg-[#1F9B96] hover:bg-[#167F7B]"
              >
                Buat & Buka Event
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Event Detail Preview Modal */}
      {detailEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1B4B]/45 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-[26px] bg-white shadow-2xl border border-[#E5F1F5] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDF6F9] bg-[#F4FBFD]">
              <div className="flex items-center gap-3 min-w-0">
                <IconBadge
                  name={getSumbarEventIcon(
                    detailEvent.metadata.eventName,
                    detailEvent.metadata.location
                  )}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="text-[12px] text-[#757E96]">
                    {detailEvent.isCompleted ? 'Selesai' : 'Aktif'} · {detailEvent.metadata.date}
                  </div>
                  <h3 className="font-display font-bold text-[16px] text-[#1B1B4B]">
                    <SmartMarqueeText text={detailEvent.metadata.eventName} />
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailEvent(null)}
                className="p-2 rounded-full text-[#757E96] hover:bg-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <img
                  src={detailEvent.templates.page1DataUrl}
                  alt={detailEvent.metadata.eventName}
                  className="w-28 h-auto object-contain rounded-xl border border-[#DDEEF3] bg-white shrink-0"
                />
                <div className="space-y-2 text-[13px] text-[#757E96]">
                  <div className="flex items-center gap-2">
                    <BrandIcon name="schedule-datetime" className="w-4 h-4 text-[#1F9B96]" />
                    <span>
                      {detailEvent.metadata.date} ({detailEvent.metadata.time})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#1F9B96] shrink-0" />
                    <span>{detailEvent.metadata.location}</span>
                  </div>
                  <div className="text-[12px] text-[#757E96]">
                    Penyelenggara: <strong className="text-[#1B1B4B]">{detailEvent.metadata.organizer}</strong>
                  </div>
                  <div className="pt-1 text-[12px] font-semibold text-[#1F9B96] tabular-nums">
                    {detailEvent.recipients.length} penerima ·{' '}
                    {detailEvent.recipients.filter((r) => r.status === 'generated').length} PDF telah dibuat ·{' '}
                    Format {detailEvent.templates.pageCount} halaman
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E5F1F5] overflow-hidden">
                <div className="bg-[#F4FBFD] px-3.5 py-2 text-[12px] font-semibold text-[#757E96] border-b border-[#E5F1F5]">
                  Daftar Penerima pada Event Ini ({detailEvent.recipients.length})
                </div>
                <div className="max-h-44 overflow-y-auto divide-y divide-[#EDF6F9] text-[12px]">
                  {detailEvent.recipients.length === 0 ? (
                    <div className="p-3 text-[#757E96]">Belum ada penerima.</div>
                  ) : (
                    detailEvent.recipients.map((rec) => (
                      <div key={rec.id} className="px-3.5 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-[#1B1B4B] truncate">
                            {rec.recipientName}
                          </div>
                          <div className="text-[#757E96] truncate">{rec.institution}</div>
                        </div>
                        <span className="font-mono text-[11px] text-[#757E96] shrink-0 tabular-nums">
                          {rec.invitationCode}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#EDF6F9] bg-[#F4FBFD]">
              <button
                type="button"
                onClick={() => setDetailEvent(null)}
                className="px-4 py-2 rounded-full border border-[#DDEEF3] bg-white text-[13px] font-medium text-[#757E96] hover:bg-[#E3F5FA]/50"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectEvent(detailEvent.id);
                  setDetailEvent(null);
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-[13px] font-semibold text-white bg-[#1F9B96] hover:bg-[#167F7B]"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Buka ke Ruang Kerja</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Event Confirmation Modal */}
      {eventToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1B4B]/45 backdrop-blur-xs"
          onClick={() => setEventToDelete(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-event-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[26px] bg-white shadow-2xl border border-[#F5C6D2] overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F5C6D2] bg-[#FDE8EE]">
              <div className="flex items-center gap-3 min-w-0">
                <IconBadge name="action-trash" tone="red" size="sm" />
                <div className="min-w-0">
                  <h3
                    id="delete-event-modal-title"
                    className="font-display font-bold text-[16px] text-[#1B1B4B]"
                  >
                    Konfirmasi Hapus Event
                  </h3>
                  <p className="text-[12px] text-[#B83B5E]">
                    Data event yang dihapus tidak dapat dikembalikan.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEventToDelete(null)}
                aria-label="Tutup konfirmasi hapus"
                className="p-2 rounded-full text-[#B83B5E] hover:bg-white/70 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-3.5">
              <p className="text-[13px] text-[#5B647E] leading-relaxed">
                Apakah Anda yakin ingin menghapus event berikut beserta seluruh daftar tamu dan pengaturan tata letaknya?
              </p>

              <div className="rounded-2xl border border-[#E5F1F5] bg-[#F4FBFD] p-3.5 space-y-1.5">
                <div className="font-display font-bold text-[14px] text-[#1B1B4B]">
                  {eventToDelete.metadata.eventName}
                </div>
                <div className="text-[12px] text-[#757E96]">
                  {eventToDelete.metadata.date} · {eventToDelete.metadata.location}
                </div>
                <div className="text-[12px] font-semibold text-[#1F9B96] tabular-nums pt-0.5">
                  {eventToDelete.recipients.length} penerima ·{' '}
                  {eventToDelete.recipients.filter((r) => r.status === 'generated').length} PDF dibuat
                </div>
              </div>

              {eventToDelete.id === activeEventId && (
                <div className="rounded-xl border border-[#F4DF89] bg-[#FFF7D6] px-3.5 py-2.5 text-[12px] text-[#9A7409]">
                  Event ini sedang aktif di ruang kerja. Setelah dihapus, ruang kerja akan otomatis beralih ke event tersimpan lainnya.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#EDF6F9] bg-[#F4FBFD]">
              <button
                type="button"
                onClick={() => setEventToDelete(null)}
                className="px-4 py-2 rounded-full border border-[#DDEEF3] bg-white text-[13px] font-medium text-[#1B1B4B] hover:bg-[#E3F5FA]/60 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetId = eventToDelete.id;
                  onDeleteEvent(targetId);
                  if (detailEvent?.id === targetId) {
                    setDetailEvent(null);
                  }
                  setEventToDelete(null);
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-[13px] font-semibold text-white bg-[#B83B5E] hover:bg-[#9D2E4D] transition-colors shadow-xs"
              >
                <BrandIcon name="action-trash" white className="w-3.5 h-3.5" />
                <span>Ya, Hapus Event</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
