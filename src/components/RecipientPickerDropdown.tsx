import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import { Recipient } from '../types';
import { BrandIcon } from './BrandIcon';

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
            className="rounded-[22px] bg-white shadow-2xl border border-[#DDEEF3] overflow-hidden ring-1 ring-[#1F9B96]/10"
          >
            {/* Search Input */}
            <div className="p-2.5 border-b border-[#EDF6F9] bg-[#F4FBFD]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#757E96] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                  className="w-full pl-8 pr-3 py-1.5 rounded-full border border-[#DDEEF3] bg-white text-[12px] text-[#1B1B4B] placeholder:text-[#757E96] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                />
              </div>
              {isUsingSample && (
                <p className="text-[11px] text-[#9A7409] mt-1.5 px-1">
                  Data contoh (daftar tamu kosong)
                </p>
              )}
            </div>

            {/* Options List */}
            <div
              style={{ maxHeight: `${coords.maxListHeight}px` }}
              className="overflow-y-auto divide-y divide-[#EDF6F9]"
            >
              {filtered.length === 0 ? (
                <div className="py-6 px-4 text-center text-[12px] text-[#757E96]">
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
                          ? 'bg-[#E3F5FA] text-[#167F7B]'
                          : 'hover:bg-[#F4FBFD] text-[#1B1B4B]'
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {isSelected ? (
                          <BrandIcon name="status-check" className="w-3.5 h-3.5 text-[#1F9B96]" />
                        ) : (
                          <BrandIcon name="status-user" className="w-3.5 h-3.5 text-[#9AA4BC]" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-semibold truncate">
                            {realIdx >= 0 ? `${realIdx + 1}. ` : ''}
                            {item.recipientName}
                          </span>
                          {isUsingSample && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#FFF7D6] text-[#9A7409] border border-[#F4DF89] shrink-0">
                              Contoh
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#757E96] truncate">
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
        className={`inline-flex items-center justify-between gap-2 ${maxWidthClass} w-full rounded-full border border-[#DDEEF3] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#1B1B4B] hover:border-[#1F9B96]/70 focus:outline-none focus:ring-2 focus:ring-[#1F9B96] transition-colors`}
      >
        <span className="truncate text-left">
          {showIndex && !isUsingSample && selectedIdx >= 0
            ? `${selectedIdx + 1}. ${selectedRecipient.recipientName}`
            : selectedRecipient.recipientName}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#757E96] shrink-0 transition-transform ${
            open ? 'rotate-180 text-[#1F9B96]' : ''
          }`}
        />
      </button>

      {dropdownPopover}
    </div>
  );
};
