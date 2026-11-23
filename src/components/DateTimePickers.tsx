import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock as ClockIcon,
  X,
} from 'lucide-react';

const ID_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const ID_WEEKDAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const ID_WEEKDAYS_FULL = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

function parseIndonesianDate(value: string): {
  year: number;
  month: number;
  day: number;
  hasWeekdayPrefix: boolean;
} {
  const now = new Date();
  const fallback = {
    year: now.getFullYear(),
    month: now.getMonth(),
    day: now.getDate(),
    hasWeekdayPrefix: false,
  };

  if (!value || !value.trim()) return fallback;
  const trimmed = value.trim();

  // ISO format YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return { year, month, day, hasWeekdayPrefix: false };
    }
  }

  // Indonesian format e.g. "Sabtu, 14 November 2026" or "14 November 2026"
  const hasWeekdayPrefix = /^(Minggu|Senin|Selasa|Rabu|Kamis|Jumat|Sabtu)\s*,/i.test(trimmed);
  const cleaned = trimmed.replace(/^(Minggu|Senin|Selasa|Rabu|Kamis|Jumat|Sabtu)\s*,\s*/i, '');
  const idMatch = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(cleaned);
  if (idMatch) {
    const day = Number(idMatch[1]);
    const monthName = idMatch[2].toLowerCase();
    const year = Number(idMatch[3]);
    const monthIdx = ID_MONTHS.findIndex(
      (m) => m.toLowerCase() === monthName || m.toLowerCase().startsWith(monthName.slice(0, 3))
    );
    if (monthIdx >= 0 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return { year, month: monthIdx, day, hasWeekdayPrefix };
    }
  }

  return fallback;
}

function formatIndonesianDate(
  year: number,
  month: number,
  day: number,
  includeWeekday: boolean
): string {
  const dateObj = new Date(year, month, day);
  const base = `${day} ${ID_MONTHS[month]} ${year}`;
  if (!includeWeekday) return base;
  const weekday = ID_WEEKDAYS_FULL[dateObj.getDay()];
  return `${weekday}, ${base}`;
}

function useFloatingPosition(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
  popoverWidth: number,
  popoverHeight: number
) {
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 10;

      let left = rect.left;
      if (left + popoverWidth > vw - margin) {
        left = Math.max(margin, vw - popoverWidth - margin);
      }
      if (left < margin) left = margin;

      const spaceBelow = vh - rect.bottom - margin;
      let top = rect.bottom + 6;
      if (spaceBelow < popoverHeight && rect.top - margin > spaceBelow) {
        top = Math.max(margin, rect.top - popoverHeight - 6);
      } else if (top + popoverHeight > vh - margin) {
        top = Math.max(margin, vh - popoverHeight - margin);
      }

      setPos({ top, left });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef, popoverWidth, popoverHeight]);

  return pos;
}

/* ============================================================================
 * 1. Clickable Calendar Date Picker
 * ============================================================================ */

interface CalendarDatePickerProps {
  value: string;
  onChange: (nextDate: string) => void;
  placeholder?: string;
  inputClassName?: string;
  ariaLabel?: string;
}

export const CalendarDatePicker: React.FC<CalendarDatePickerProps> = ({
  value,
  onChange,
  placeholder = 'Pilih tanggal acara...',
  inputClassName = '',
  ariaLabel = 'Pilih tanggal acara',
}) => {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const parsed = useMemo(() => parseIndonesianDate(value), [value]);
  const [viewYear, setViewYear] = useState(parsed.year);
  const [viewMonth, setViewMonth] = useState(parsed.month);
  const [includeWeekday, setIncludeWeekday] = useState(parsed.hasWeekdayPrefix);

  useEffect(() => {
    if (open) {
      const latest = parseIndonesianDate(value);
      setViewYear(latest.year);
      setViewMonth(latest.month);
      setIncludeWeekday(latest.hasWeekdayPrefix);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        anchorRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const pos = useFloatingPosition(open, anchorRef, 304, 358);

  const calendarCells = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  const today = new Date();
  const isToday = (d: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth() === viewMonth &&
    today.getDate() === d;

  const isSelected = (d: number) =>
    parsed.year === viewYear && parsed.month === viewMonth && parsed.day === d;

  const handleSelectDay = (day: number) => {
    onChange(formatIndonesianDate(viewYear, viewMonth, day, includeWeekday));
    setOpen(false);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handlePickToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    onChange(
      formatIndonesianDate(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        includeWeekday
      )
    );
    setOpen(false);
  };

  const years = useMemo(() => {
    const start = Math.min(2024, viewYear - 2);
    const end = Math.max(2032, viewYear + 4);
    const list: number[] = [];
    for (let y = start; y <= end; y++) list.push(y);
    return list;
  }, [viewYear]);

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-left text-[#111827] hover:border-[#158A85]/70 focus:outline-none focus:ring-2 focus:ring-[#158A85] transition-colors cursor-pointer ${inputClassName}`}
      >
        <span className={`truncate ${value ? 'text-[#111827] font-medium' : 'text-slate-400'}`}>
          {value || placeholder}
        </span>
        <CalendarIcon className="w-4 h-4 text-[#158A85] shrink-0" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: `${pos.top}px`, left: `${pos.left}px`, width: '304px' }}
            className="fixed z-[100] rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
          >
            {/* Header Month/Year Navigation */}
            <div className="px-3.5 py-3 bg-[#E6F4F8]/60 border-b border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="Bulan sebelumnya"
                className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-[#158A85] hover:border-[#158A85]/50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Pilih bulan"
                  value={viewMonth}
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] font-semibold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                >
                  {ID_MONTHS.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Pilih tahun"
                  value={viewYear}
                  onChange={(e) => setViewYear(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] font-semibold text-[#111827] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="Bulan berikutnya"
                className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-[#158A85] hover:border-[#158A85]/50 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Weekday Header & Calendar Days Grid */}
            <div className="p-3">
              <div className="grid grid-cols-7 gap-1 mb-1.5">
                {ID_WEEKDAYS_SHORT.map((wd, idx) => (
                  <div
                    key={wd}
                    className={`text-center text-[11px] font-semibold py-1 ${
                      idx === 0 ? 'text-red-500' : 'text-slate-500'
                    }`}
                  >
                    {wd}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((day, idx) => {
                  if (day === null) {
                    return <div key={`empty-${idx}`} className="h-8" />;
                  }
                  const selected = isSelected(day);
                  const todayMatch = isToday(day);
                  const isSunday = idx % 7 === 0;

                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleSelectDay(day)}
                      className={`h-8 rounded-lg text-[12px] font-medium tabular-nums transition-colors flex items-center justify-center ${
                        selected
                          ? 'bg-[#158A85] text-white font-semibold shadow-xs'
                          : todayMatch
                            ? 'bg-[#E6F4F8] text-[#0F6E6A] font-semibold ring-1 ring-[#158A85]/40 hover:bg-[#d2ebf2]'
                            : isSunday
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-[#111827] hover:bg-slate-100'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer Options */}
            <div className="px-3.5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeWeekday}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIncludeWeekday(checked);
                    onChange(
                      formatIndonesianDate(parsed.year, parsed.month, parsed.day, checked)
                    );
                  }}
                  className="rounded border-slate-300 accent-[#158A85]"
                />
                <span>Tampilkan nama hari</span>
              </label>

              <button
                type="button"
                onClick={handlePickToday}
                className="text-[11px] font-semibold text-[#158A85] hover:underline whitespace-nowrap"
              >
                Hari Ini
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

/* ============================================================================
 * 2. Interactive Analog Clock Face Time Picker (Gambar Jam yang Dapat Diklik)
 * ============================================================================ */

type TimeZoneCode = 'WIB' | 'WITA' | 'WIT';

interface ParsedTimeState {
  startHour: number;
  startMinute: number;
  untilFinished: boolean;
  endHour: number;
  endMinute: number;
  zone: TimeZoneCode;
}

function parseIndonesianTime(value: string): ParsedTimeState {
  const defaults: ParsedTimeState = {
    startHour: 9,
    startMinute: 0,
    untilFinished: true,
    endHour: 16,
    endMinute: 0,
    zone: 'WIB',
  };

  if (!value || !value.trim()) return defaults;
  const text = value.trim();

  const zoneMatch = /\b(WITA|WIT|WIB)\b/i.exec(text);
  const zone = (zoneMatch ? zoneMatch[1].toUpperCase() : 'WIB') as TimeZoneCode;

  const times = Array.from(text.matchAll(/(\d{1,2})[:.](\d{2})/g));
  if (times.length === 0) return { ...defaults, zone };

  const startHour = Math.min(23, Math.max(0, Number(times[0][1])));
  const startMinute = Math.min(59, Math.max(0, Number(times[0][2])));

  if (times.length >= 2) {
    const endHour = Math.min(23, Math.max(0, Number(times[1][1])));
    const endMinute = Math.min(59, Math.max(0, Number(times[1][2])));
    return {
      startHour,
      startMinute,
      untilFinished: false,
      endHour,
      endMinute,
      zone,
    };
  }

  const untilFinished = /selesai/i.test(text);
  return {
    startHour,
    startMinute,
    untilFinished,
    endHour: (startHour + 3) % 24,
    endMinute: startMinute,
    zone,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatIndonesianTime(state: ParsedTimeState): string {
  const startStr = `${pad2(state.startHour)}:${pad2(state.startMinute)}`;
  if (state.untilFinished) {
    return `${startStr} ${state.zone} - Selesai`;
  }
  const endStr = `${pad2(state.endHour)}:${pad2(state.endMinute)}`;
  return `${startStr} – ${endStr} ${state.zone}`;
}

interface AnalogClockTimePickerProps {
  value: string;
  onChange: (nextTime: string) => void;
  placeholder?: string;
  inputClassName?: string;
  ariaLabel?: string;
}

const OUTER_HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const INNER_HOURS = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const MINUTE_MARKS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export const AnalogClockTimePicker: React.FC<AnalogClockTimePickerProps> = ({
  value,
  onChange,
  placeholder = 'Pilih waktu acara...',
  inputClassName = '',
  ariaLabel = 'Pilih waktu acara dengan jam',
}) => {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const dialRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [timeState, setTimeState] = useState<ParsedTimeState>(() =>
    parseIndonesianTime(value)
  );
  const [editingTarget, setEditingTarget] = useState<'start' | 'end'>('start');
  const [clockMode, setClockMode] = useState<'hour' | 'minute'>('hour');

  useEffect(() => {
    if (open) {
      setTimeState(parseIndonesianTime(value));
      setEditingTarget('start');
      setClockMode('hour');
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        anchorRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const pos = useFloatingPosition(open, anchorRef, 312, 438);

  const commitState = (next: ParsedTimeState) => {
    setTimeState(next);
    onChange(formatIndonesianTime(next));
  };

  const activeHour =
    editingTarget === 'start' ? timeState.startHour : timeState.endHour;
  const activeMinute =
    editingTarget === 'start' ? timeState.startMinute : timeState.endMinute;

  const setActiveHour = (hour: number, autoSwitchToMinute = false) => {
    const next: ParsedTimeState =
      editingTarget === 'start'
        ? { ...timeState, startHour: hour }
        : { ...timeState, endHour: hour, untilFinished: false };
    commitState(next);
    if (autoSwitchToMinute) {
      setClockMode('minute');
    }
  };

  const setActiveMinute = (minute: number) => {
    const next: ParsedTimeState =
      editingTarget === 'start'
        ? { ...timeState, startMinute: minute }
        : { ...timeState, endMinute: minute, untilFinished: false };
    commitState(next);
  };

  // Interactive pointer calculation directly on the analog clock face
  const updateFromClockPointer = (
    clientX: number,
    clientY: number,
    autoAdvance: boolean
  ) => {
    const dial = dialRef.current;
    if (!dial) return;
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const radius = rect.width / 2;

    // Angle in degrees where 12 o'clock is 0 deg, clockwise
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (angle < 0) angle += 360;

    if (clockMode === 'hour') {
      const sector = Math.round(angle / 30) % 12; // 0..11
      const isInnerRing = dist < radius * 0.68;
      const pickedHour = isInnerRing
        ? INNER_HOURS[sector]
        : OUTER_HOURS[sector];
      setActiveHour(pickedHour, autoAdvance);
    } else {
      const pickedMinute = Math.round(angle / 6) % 60;
      setActiveMinute(pickedMinute);
    }
  };

  // Clock hand geometry (in 224x224 viewBox, center 112, 112)
  const isInnerHourSelected =
    clockMode === 'hour' && (activeHour === 0 || activeHour >= 13);
  const handAngleDeg =
    clockMode === 'hour' ? (activeHour % 12) * 30 : activeMinute * 6;
  const handLength =
    clockMode === 'hour' ? (isInnerHourSelected ? 54 : 84) : 84;
  const handRad = ((handAngleDeg - 90) * Math.PI) / 180;
  const handX = 112 + Math.cos(handRad) * handLength;
  const handY = 112 + Math.sin(handRad) * handLength;

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-left text-[#111827] hover:border-[#158A85]/70 focus:outline-none focus:ring-2 focus:ring-[#158A85] transition-colors cursor-pointer ${inputClassName}`}
      >
        <span className={`truncate ${value ? 'text-[#111827] font-medium' : 'text-slate-400'}`}>
          {value || placeholder}
        </span>
        <ClockIcon className="w-4 h-4 text-[#158A85] shrink-0" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: `${pos.top}px`, left: `${pos.left}px`, width: '312px' }}
            className="fixed z-[100] rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
          >
            {/* Top Digital Readout & Mode Switcher */}
            <div className="px-4 py-3 bg-[#158A85] text-white space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/15 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTarget('start');
                      setClockMode('hour');
                    }}
                    className={`px-2 py-0.5 rounded-md transition-colors ${
                      editingTarget === 'start'
                        ? 'bg-white text-[#0F6E6A]'
                        : 'text-white/85 hover:text-white'
                    }`}
                  >
                    Jam Mulai
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...timeState, untilFinished: false };
                      commitState(next);
                      setEditingTarget('end');
                      setClockMode('hour');
                    }}
                    className={`px-2 py-0.5 rounded-md transition-colors ${
                      editingTarget === 'end' && !timeState.untilFinished
                        ? 'bg-white text-[#0F6E6A]'
                        : 'text-white/85 hover:text-white'
                    }`}
                  >
                    Jam Selesai
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Tutup pemilih waktu"
                  className="p-1 rounded-lg text-white/80 hover:bg-white/15 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-1 font-display tabular-nums">
                  <button
                    type="button"
                    onClick={() => setClockMode('hour')}
                    className={`px-2.5 py-1 rounded-xl text-[26px] font-bold leading-none transition-colors ${
                      clockMode === 'hour'
                        ? 'bg-white text-[#0F6E6A] shadow-xs'
                        : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                    title="Klik untuk memilih jam"
                  >
                    {pad2(activeHour)}
                  </button>
                  <span className="text-[24px] font-bold opacity-80">:</span>
                  <button
                    type="button"
                    onClick={() => setClockMode('minute')}
                    className={`px-2.5 py-1 rounded-xl text-[26px] font-bold leading-none transition-colors ${
                      clockMode === 'minute'
                        ? 'bg-white text-[#0F6E6A] shadow-xs'
                        : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                    title="Klik untuk memilih menit"
                  >
                    {pad2(activeMinute)}
                  </button>
                </div>

                <div className="flex items-center gap-1 bg-white/15 p-0.5 rounded-lg text-[11px] font-semibold">
                  {(['WIB', 'WITA', 'WIT'] as TimeZoneCode[]).map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => commitState({ ...timeState, zone: z })}
                      className={`px-1.5 py-1 rounded-md transition-colors ${
                        timeState.zone === z
                          ? 'bg-white text-[#0F6E6A]'
                          : 'text-white/80 hover:text-white'
                      }`}
                    >
                      {z}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-[11px] text-white/85">
                {clockMode === 'hour'
                  ? 'Klik angka pada gambar jam (lingkar luar 01–12, dalam 13–00)'
                  : 'Klik atau geser jarum pada gambar jam untuk memilih menit'}
              </div>
            </div>

            {/* Interactive Analog Clock Face */}
            <div className="p-4 flex flex-col items-center">
              <div
                ref={dialRef}
                onPointerDown={(e) => {
                  draggingRef.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  updateFromClockPointer(e.clientX, e.clientY, false);
                }}
                onPointerMove={(e) => {
                  if (!draggingRef.current) return;
                  updateFromClockPointer(e.clientX, e.clientY, false);
                }}
                onPointerUp={(e) => {
                  if (!draggingRef.current) return;
                  draggingRef.current = false;
                  updateFromClockPointer(e.clientX, e.clientY, clockMode === 'hour');
                }}
                className="relative w-[224px] h-[224px] rounded-full bg-slate-50 border-2 border-slate-200/90 shadow-inner select-none touch-none cursor-pointer"
              >
                {/* SVG Clock Face Ticks & Hand */}
                <svg
                  viewBox="0 0 224 224"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  {/* Subtle inner 24h ring guide in hour mode */}
                  {clockMode === 'hour' && (
                    <circle
                      cx="112"
                      cy="112"
                      r="54"
                      fill="none"
                      stroke="#E2E8F0"
                      strokeDasharray="2 3"
                      strokeWidth="1"
                    />
                  )}

                  {/* 60 subtle minute ticks on outer rim */}
                  {Array.from({ length: 60 }).map((_, i) => {
                    const a = ((i * 6 - 90) * Math.PI) / 180;
                    const r1 = i % 5 === 0 ? 103 : 106;
                    const r2 = 109;
                    return (
                      <line
                        key={i}
                        x1={112 + Math.cos(a) * r1}
                        y1={112 + Math.sin(a) * r1}
                        x2={112 + Math.cos(a) * r2}
                        y2={112 + Math.sin(a) * r2}
                        stroke={i % 5 === 0 ? '#94A3B8' : '#CBD5E1'}
                        strokeWidth={i % 5 === 0 ? 1.5 : 1}
                      />
                    );
                  })}

                  {/* Active Clock Hand */}
                  <line
                    x1="112"
                    y1="112"
                    x2={handX}
                    y2={handY}
                    stroke="#158A85"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* Tip Circle */}
                  <circle cx={handX} cy={handY} r="15" fill="#158A85" />
                  {clockMode === 'minute' && activeMinute % 5 !== 0 && (
                    <circle cx={handX} cy={handY} r="3.5" fill="#FFFFFF" />
                  )}

                  {/* Center Pivot */}
                  <circle cx="112" cy="112" r="4.5" fill="#0F6E6A" />
                </svg>

                {/* Clickable Number Labels */}
                {clockMode === 'hour' ? (
                  <>
                    {/* Outer 12-hour ring (01..12) */}
                    {OUTER_HOURS.map((hr, idx) => {
                      const rad = ((idx * 30 - 90) * Math.PI) / 180;
                      const x = 112 + Math.cos(rad) * 84;
                      const y = 112 + Math.sin(rad) * 84;
                      const selected = activeHour === hr;

                      return (
                        <button
                          key={hr}
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => setActiveHour(hr, true)}
                          style={{ left: `${x}px`, top: `${y}px` }}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-[12px] font-semibold tabular-nums flex items-center justify-center transition-colors ${
                            selected
                              ? 'text-white'
                              : 'text-[#111827] hover:bg-[#E6F4F8]'
                          }`}
                        >
                          {pad2(hr)}
                        </button>
                      );
                    })}

                    {/* Inner 24-hour ring (13..23, 00) */}
                    {INNER_HOURS.map((hr, idx) => {
                      const rad = ((idx * 30 - 90) * Math.PI) / 180;
                      const x = 112 + Math.cos(rad) * 54;
                      const y = 112 + Math.sin(rad) * 54;
                      const selected = activeHour === hr;

                      return (
                        <button
                          key={hr}
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => setActiveHour(hr, true)}
                          style={{ left: `${x}px`, top: `${y}px` }}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 w-6.5 h-6.5 rounded-full text-[11px] font-medium tabular-nums flex items-center justify-center transition-colors ${
                            selected
                              ? 'text-white font-semibold'
                              : 'text-slate-500 hover:bg-[#E6F4F8] hover:text-[#0F6E6A]'
                          }`}
                        >
                          {pad2(hr)}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  /* Minute Ring (00..55) */
                  MINUTE_MARKS.map((min, idx) => {
                    const rad = ((idx * 30 - 90) * Math.PI) / 180;
                    const x = 112 + Math.cos(rad) * 84;
                    const y = 112 + Math.sin(rad) * 84;
                    const selected = activeMinute === min;

                    return (
                      <button
                        key={min}
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setActiveMinute(min)}
                        style={{ left: `${x}px`, top: `${y}px` }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-[12px] font-semibold tabular-nums flex items-center justify-center transition-colors ${
                          selected
                            ? 'text-white'
                            : 'text-[#111827] hover:bg-[#E6F4F8]'
                        }`}
                      >
                        {pad2(min)}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Bottom Controls: "s/d Selesai" Toggle + Preview + Done */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={timeState.untilFinished}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      commitState({ ...timeState, untilFinished: checked });
                      if (checked) setEditingTarget('start');
                    }}
                    className="rounded border-slate-300 accent-[#158A85]"
                  />
                  <span>Sampai selesai (&ldquo;- Selesai&rdquo;)</span>
                </label>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1 rounded-lg bg-[#158A85] text-white text-[12px] font-semibold hover:brightness-95"
                >
                  Selesai
                </button>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                <span>Hasil format:</span>
                <span className="font-semibold text-[#111827] tabular-nums">
                  {formatIndonesianTime(timeState)}
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
