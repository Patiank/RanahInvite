import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, User } from 'lucide-react';
import { Recipient } from '../types';

export const SAMPLE_PREVIEW_RECIPIENT: Recipient = {
  id: 'sample',
  salutation: 'Kepada Yth.',
  recipientName: 'Dr. H. Luhur Budianda, S.H., M.Si',
  institution: 'Kepala Dinas Pariwisata Provinsi Sumatera Barat',
  placeLabel: 'di tempat',
  invitationCode: 'FPM-2026-001',
  status: 'ready',
};

interface RecipientPickerDropdownProps {
  recipients: Recipient[];
  selectedRecipient: Recipient;
  onSelect: (recipient: Recipient) => void;
  align?: 'left' | 'right';
  showIndex?: boolean;
  maxWidthClass?: string;
  ariaLabel?: string;
}

export const RecipientPickerDropdown: React.FC<RecipientPickerDropdownProps> = ({
  recipients,
  selectedRecipient,
  onSelect,
  align = 'right',
  showIndex = false,
  maxWidthClass = 'max-w-[230px]',
  ariaLabel = 'Pilih penerima untuk pratinjau',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxListHeight: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const isUsingSample = recipients.length === 0;
  const effectiveList = useMemo(
    () => (isUsingSample ? [SAMPLE_PREVIEW_RECIPIENT] : recipients),
    [isUsingSample, recipients]
  );

  const selectedIdx = useMemo(
    () => effectiveList.findIndex((r) => r.id === selectedRecipient.id),
    [effectiveList, selectedRecipient.id]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return effectiveList;
    return effectiveList.filter(
      (r) =>
        r.recipientName.toLowerCase().includes(q) ||
        r.institution.toLowerCase().includes(q) ||
        (r.group ?? '').toLowerCase().includes(q) ||
        r.invitationCode.toLowerCase().includes(q)
    );
  }, [effectiveList, query]);

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const desiredWidth = Math.min(340, vw - margin * 2);

    let left = align === 'left' ? rect.left : rect.right - desiredWidth;
    if (left + desiredWidth > vw - margin) {
      left = vw - desiredWidth - margin;
    }
    if (left < margin) {
      left = margin;
    }

    const estimatedHeaderHeight = isUsingSample ? 102 : 58;
    const spaceBelow = vh - rect.bottom - margin - 6;
    const spaceAbove = rect.top - margin - 6;
    const preferAbove = spaceBelow < 220 && spaceAbove > spaceBelow;

    if (preferAbove) {
      const availableTotal = Math.min(360, spaceAbove);
      const maxListHeight = Math.max(120, availableTotal - estimatedHeaderHeight);
      const top = Math.max(margin, rect.top - availableTotal - 6);
      setCoords({ top, left, width: desiredWidth, maxListHeight });
    } else {
      const availableTotal = Math.min(360, Math.max(180, spaceBelow));
      const maxListHeight = Math.max(120, availableTotal - estimatedHeaderHeight);
      const top = Math.min(vh - margin - 120, rect.bottom + 6);
      setCoords({ top, left, width: desiredWidth, maxListHeight });
    }
  };

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
    const handleReposition = () => updatePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, align, isUsingSample]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setQuery('');
    }
  }, [open]);

  const dropdownPopover =
    open && coords && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 9999,
            }}
            className="rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden ring-1 ring-slate-900/5"
          >
            {/* Search Input */}
            <div className="p-2.5 border-b border-slate-100 bg-slate-50/70">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    isUsingSample
                      ? 'Data contoh aktif...'
                      : `Cari dari ${recipients.length} penerima...`
                  }
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] text-[#111827] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                />
              </div>
              {isUsingSample && (
                <p className="text-[11px] text-amber-700 mt-1.5">
                  Data contoh (daftar tamu kosong)
                </p>
              )}
            </div>

            {/* Options List */}
            <div
              style={{ maxHeight: `${coords.maxListHeight}px` }}
              className="overflow-y-auto divide-y divide-slate-100"
            >
              {filtered.length === 0 ? (
                <div className="py-6 px-4 text-center text-[12px] text-slate-500">
                  Tidak ada penerima yang cocok dengan &ldquo;{query}&rdquo;.
                </div>
              ) : (
                filtered.map((item) => {
                  const isSelected = item.id === selectedRecipient.id;
                  const realIdx = isUsingSample
                    ? -1
                    : recipients.findIndex((r) => r.id === item.id);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelect(item);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                        isSelected
                          ? 'bg-[#E6F4F8]/80 text-[#0F6E6A]'
                          : 'hover:bg-slate-50 text-[#111827]'
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 text-[#158A85]" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-slate-300" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-semibold truncate">
                            {realIdx >= 0 ? `${realIdx + 1}. ` : ''}
                            {item.recipientName}
                          </span>
                          {isUsingSample && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/70 shrink-0">
                              Contoh
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {item.institution}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center justify-between gap-2 ${maxWidthClass} w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-[#111827] hover:border-[#158A85]/60 focus:outline-none focus:ring-2 focus:ring-[#158A85] transition-colors`}
      >
        <span className="truncate text-left">
          {showIndex && !isUsingSample && selectedIdx >= 0
            ? `${selectedIdx + 1}. ${selectedRecipient.recipientName}`
            : selectedRecipient.recipientName}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
            open ? 'rotate-180 text-[#158A85]' : ''
          }`}
        />
      </button>

      {dropdownPopover}
    </div>
  );
};
