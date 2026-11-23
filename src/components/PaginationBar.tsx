import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

interface PaginationBarProps {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  compact?: boolean;
}

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push('ellipsis');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  totalItems,
  pageSize = 10,
  onPageChange,
  compact = false,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const startIdx = (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, totalItems);
  const pageNumbers = getPageNumbers(safePage, totalPages);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2.5 border-t border-[#EDF6F9] bg-[#F4FBFD] text-[12px] text-[#5B647E] tabular-nums ${
        compact ? 'px-3 py-2' : 'px-4 py-3'
      }`}
    >
      <div className="text-[#757E96]">
        <span className="font-semibold text-[#1B1B4B]">
          {startIdx}–{endIdx}
        </span>{' '}
        / {totalItems}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(1)}
          title="Halaman Pertama"
          aria-label="Halaman Pertama"
          className="p-1.5 rounded-full border border-[#DDEEF3] bg-white text-[#5B647E] hover:bg-[#E3F5FA] hover:text-[#1F9B96] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          title="Sebelumnya"
          aria-label="Sebelumnya"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-[#DDEEF3] bg-white text-[12px] font-medium text-[#1B1B4B] hover:bg-[#E3F5FA] hover:text-[#1F9B96] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </button>

        <div className="flex items-center gap-1 mx-0.5">
          {pageNumbers.map((item, idx) =>
            item === 'ellipsis' ? (
              <span key={`e-${idx}`} className="px-1 text-[#757E96] select-none">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === safePage ? 'page' : undefined}
                className={`min-w-[28px] h-7 px-2 rounded-full text-[12px] font-semibold transition-colors ${
                  item === safePage
                    ? 'bg-[#1F9B96] text-white shadow-xs'
                    : 'border border-[#DDEEF3] bg-white text-[#1B1B4B] hover:bg-[#E3F5FA] hover:text-[#1F9B96]'
                }`}
              >
                {item}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          title="Berikutnya"
          aria-label="Berikutnya"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-[#DDEEF3] bg-white text-[12px] font-medium text-[#1B1B4B] hover:bg-[#E3F5FA] hover:text-[#1F9B96] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          title="Halaman Terakhir"
          aria-label="Halaman Terakhir"
          className="p-1.5 rounded-full border border-[#DDEEF3] bg-white text-[#5B647E] hover:bg-[#E3F5FA] hover:text-[#1F9B96] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
