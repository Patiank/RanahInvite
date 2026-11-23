import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  FolderOpen,
  MapPin,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { EventMetadata, SavedEventRecord } from '../types';
import { AnalogClockTimePicker, CalendarDatePicker } from './DateTimePickers';
import { PaginationBar } from './PaginationBar';
import { CountUpNumber, SmartMarqueeText } from './UiPolish';

interface EventHistoryPanelProps {
  events: SavedEventRecord[];
  activeEventId: string;
  onSelectEvent: (eventId: string) => void;
  onCreateEvent: (metadata: EventMetadata) => void;
  onDuplicateEvent: (eventId: string) => void;
  onToggleCompleted: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
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

  const [newMeta, setNewMeta] = useState<EventMetadata>({
    eventName: '',
    date: '20 Desember 2026',
    time: '09:00 WIB - Selesai',
    location: 'Padang, Sumatera Barat',
    organizer: 'Dinas Pariwisata Provinsi Sumatera Barat',
  });

  const visibleEvents = events.filter((ev) => {
    if (statusFilter === 'active') return !ev.isCompleted;
    if (statusFilter === 'done') return ev.isCompleted;
    return true;
  });

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
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-display font-semibold text-[16px] text-[#111827]">
              Daftar Event
            </h3>
            <p className="text-[12px] text-slate-500 mt-0.5 tabular-nums">
              <CountUpNumber value={events.length} /> event
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100">
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
                  className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-slate-600 hover:text-[#111827]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-[#111827] transition-all hover:brightness-95 whitespace-nowrap"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Event Baru</span>
            </button>
          </div>
        </div>

        {/* Event List */}
        {visibleEvents.length === 0 ? (
          <div className="py-10 px-4 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <p className="text-[13px] font-medium text-slate-700">
              Belum ada event pada filter ini.
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold text-white"
              style={{ backgroundColor: 'var(--bg-sidebar)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Event Baru</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[290px] overflow-y-auto pr-1">
            {paginatedEvents.map((ev, idx) => {
              const isCurrent = ev.id === activeEventId;
              const genCount = ev.recipients.filter((r) => r.status === 'generated').length;

              return (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.2,
                    delay: Math.min(idx * 0.05, 0.35),
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  onClick={() => onSelectEvent(ev.id)}
                  className={`py-3 px-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isCurrent
                      ? 'bg-[#E6F4F8]/70'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={ev.templates.page1DataUrl}
                      alt={ev.metadata.eventName}
                      className="w-10 h-14 object-cover rounded-md border border-slate-200 bg-white shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <SmartMarqueeText
                          text={ev.metadata.eventName}
                          className="font-display font-semibold text-[14px] text-[#111827] flex-1 min-w-0"
                        />
                        {isCurrent && (
                          <span className="text-[11px] font-semibold text-[#158A85] whitespace-nowrap shrink-0">
                            · Sedang Dibuka
                          </span>
                        )}
                      </div>

                      <SmartMarqueeText
                        text={`${ev.metadata.date} · ${ev.metadata.location}`}
                        className="text-[12px] text-slate-500 mt-0.5"
                      />

                      <div className="flex items-center gap-3 mt-1 text-[11px] tabular-nums">
                        <span className="font-medium text-slate-700">
                          {ev.recipients.length} penerima ({genCount} PDF terbuat)
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          |
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleCompleted(ev.id);
                          }}
                          className={`inline-flex items-center gap-1 font-medium transition-colors ${
                            ev.isCompleted
                              ? 'text-emerald-700 hover:text-emerald-800'
                              : 'text-amber-700 hover:text-amber-800'
                          }`}
                          title="Klik untuk ubah status selesai / aktif"
                        >
                          {ev.isCompleted ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Selesai</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3" />
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
                      className="p-1.5 rounded-lg text-slate-500 hover:text-[#158A85] hover:bg-white transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDuplicateEvent(ev.id)}
                      title="Duplikat desain & daftar event ini"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-[#111827] hover:bg-white transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>

                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => onSelectEvent(ev.id)}
                        title="Buka event ini ke ruang kerja"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-[#158A85] bg-white border border-slate-200 hover:border-[#158A85] transition-colors whitespace-nowrap"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Buka</span>
                      </button>
                    )}

                    {events.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteEvent(ev.id)}
                        title="Hapus event dari riwayat"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
        {visibleEvents.length > EVENT_PAGE_SIZE && (
          <div className="mt-2 -mx-5 -mb-5 rounded-b-2xl overflow-hidden">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <form
            onSubmit={handleCreateSubmit}
            className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-display font-bold text-[16px] text-[#111827]">
                  Buat Proyek Event Baru
                </h3>
                <p className="text-[12px] text-slate-500">
                  Event sebelumnya tetap tersimpan aman di daftar riwayat.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">
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
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-slate-700 mb-1">
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
                  <label className="block text-[12px] font-medium text-slate-700 mb-1">
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
                <label className="block text-[12px] font-medium text-slate-700 mb-1">
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
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                  />
                  <input
                    type="text"
                    value={newMeta.organizer}
                    onChange={(e) =>
                      setNewMeta({ ...newMeta, organizer: e.target.value })
                    }
                    placeholder="Instansi penyelenggara"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/70">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white hover:brightness-95"
                style={{ backgroundColor: 'var(--bg-sidebar)' }}
              >
                Buat & Buka Event
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Event Detail Preview Modal */}
      {detailEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="min-w-0">
                <div className="text-[12px] text-slate-500">
                  {detailEvent.isCompleted ? 'Selesai' : 'Aktif'} · {detailEvent.metadata.date}
                </div>
                <h3 className="font-display font-bold text-[16px] text-[#111827] truncate">
                  {detailEvent.metadata.eventName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailEvent(null)}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <img
                  src={detailEvent.templates.page1DataUrl}
                  alt={detailEvent.metadata.eventName}
                  className="w-28 h-36 object-cover rounded-xl border border-slate-200 bg-white shrink-0"
                />
                <div className="space-y-2 text-[13px] text-slate-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#158A85] shrink-0" />
                    <span>
                      {detailEvent.metadata.date} ({detailEvent.metadata.time})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#158A85] shrink-0" />
                    <span>{detailEvent.metadata.location}</span>
                  </div>
                  <div className="text-[12px] text-slate-500">
                    Penyelenggara: <strong className="text-[#111827]">{detailEvent.metadata.organizer}</strong>
                  </div>
                  <div className="pt-1 text-[12px] font-medium text-[#158A85] tabular-nums">
                    {detailEvent.recipients.length} penerima ·{' '}
                    {detailEvent.recipients.filter((r) => r.status === 'generated').length} PDF telah dibuat ·{' '}
                    Format {detailEvent.templates.pageCount} halaman
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-3.5 py-2 text-[12px] font-semibold text-slate-600 border-b border-slate-200">
                  Daftar Penerima pada Event Ini ({detailEvent.recipients.length})
                </div>
                <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 text-[12px]">
                  {detailEvent.recipients.length === 0 ? (
                    <div className="p-3 text-slate-500">Belum ada penerima.</div>
                  ) : (
                    detailEvent.recipients.map((rec) => (
                      <div key={rec.id} className="px-3.5 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-[#111827] truncate">
                            {rec.recipientName}
                          </div>
                          <div className="text-slate-500 truncate">{rec.institution}</div>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums">
                          {rec.invitationCode}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/70">
              <button
                type="button"
                onClick={() => setDetailEvent(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectEvent(detailEvent.id);
                  setDetailEvent(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white hover:brightness-95"
                style={{ backgroundColor: 'var(--bg-sidebar)' }}
              >
                <FolderOpen className="w-4 h-4" />
                <span>Buka ke Ruang Kerja</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
