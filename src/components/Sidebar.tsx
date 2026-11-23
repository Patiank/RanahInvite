import React from 'react';
import { motion } from 'motion/react';
import {
  FileStack,
  LayoutDashboard,
  PenTool,
  Users,
  FileDown,
  X,
} from 'lucide-react';
import { NavTab } from '../types';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onGenerateAll: () => void;
  readyCount: number;
  totalCount: number;
  isGeneratingBatch: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'design', label: 'Design & Upload', icon: PenTool },
  { id: 'guests', label: 'Guest & Target List', icon: Users },
  { id: 'batch', label: 'PDF Batch Queue', icon: FileStack },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  onGenerateAll,
  readyCount,
  totalCount,
  isGeneratingBatch,
  mobileOpen,
  onCloseMobile,
}) => {
  const sidebarBody = (
    <aside
      className="flex flex-col justify-between h-full w-[256px] shrink-0 text-white select-none py-6 pl-5 pr-0"
      style={{ backgroundColor: 'var(--bg-sidebar)' }}
    >
      <div>
        {/* Brand Header */}
        <div className="flex items-center justify-between pr-5 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20 shrink-0">
              {/* Minimalist Gonjong Crest SVG */}
              <svg
                viewBox="0 0 36 36"
                fill="none"
                className="w-6 h-6"
                aria-hidden="true"
              >
                <path
                  d="M4 25C7.5 21 9 13 7 6C10.5 11.5 14 13.5 18 5C22 13.5 25.5 11.5 29 6C27 13 28.5 21 32 25L27 29H9L4 25Z"
                  fill="#F6D458"
                />
                <path
                  d="M11 29H25"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-[17px] leading-tight tracking-tight text-white whitespace-nowrap">
                RanahInvite
              </div>
              <div className="text-[11px] font-medium text-white/75 tracking-wide whitespace-nowrap">
                Studio Undangan PDF
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
            aria-label="Tutup menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links with Shared-Element Sliding White Indicator */}
        <nav aria-label="Navigasi Utama" className="flex flex-col gap-1.5 relative">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`relative flex items-center gap-3 px-4 py-3 text-left text-[14px] font-medium transition-colors duration-200 rounded-l-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6D458] ${
                  isActive
                    ? 'text-[#111827] font-semibold'
                    : 'text-white/85 hover:text-white hover:bg-white/10'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebarActiveTab"
                    transition={{
                      type: 'spring',
                      stiffness: 380,
                      damping: 32,
                    }}
                    className="absolute inset-0 bg-white rounded-l-[18px] shadow-sm"
                    style={{ zIndex: 0 }}
                  />
                )}
                <Icon
                  className={`w-[18px] h-[18px] relative z-10 shrink-0 transition-colors duration-200 ${
                    isActive ? 'text-[#158A85]' : 'text-white/80'
                  }`}
                />
                <span className="relative z-10 whitespace-nowrap truncate">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom-left Quick Action Card with Iconic Gonjong & Jam Gadang Silhouette */}
      <div className="pr-5 mt-6">
        <div className="relative overflow-hidden rounded-2xl bg-[#0F6E6A] border border-white/15 p-4">
          {/* Minimalist Silhouette Illustration (Gonjong & Jam Gadang) */}
          <svg
            viewBox="0 0 200 72"
            fill="none"
            className="w-full h-14 mb-2.5 opacity-95"
            aria-hidden="true"
          >
            {/* Horizon hairline */}
            <line
              x1="6"
              y1="64"
              x2="194"
              y2="64"
              stroke="rgba(212, 163, 56, 0.45)"
              strokeWidth="1.2"
            />
            {/* Jam Gadang minimalist silhouette */}
            <rect x="30" y="24" width="16" height="40" rx="1" fill="rgba(255,255,255,0.16)" />
            <circle cx="38" cy="33" r="3.5" fill="#F6D458" />
            <path
              d="M25 24C29 19 31 12 30 6C33 11 35 12 38 6C41 12 43 11 46 6C45 12 47 19 51 24H25Z"
              fill="#D4A338"
            />
            {/* Rumah Gadang Gonjong silhouette */}
            <path
              d="M84 64V44L74 37C84 31 87 20 85 10C92 19 98 22 106 9C114 22 121 19 128 9C136 22 142 19 149 10C147 20 150 31 160 37L150 44V64H84Z"
              fill="rgba(255,255,255,0.14)"
              stroke="rgba(212, 163, 56, 0.75)"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <rect x="111" y="48" width="12" height="16" rx="1.5" fill="rgba(246, 212, 88, 0.35)" />
          </svg>

          <div className="mb-3">
            <p className="font-display font-semibold text-[13px] text-white leading-snug">
              Ekspor Batch Undangan
            </p>
            <p className="text-[11px] text-white/75 mt-0.5 tabular-nums">
              {totalCount} penerima terdaftar · {readyCount} belum diunduh
            </p>
          </div>

          <button
            type="button"
            disabled={totalCount === 0 || isGeneratingBatch}
            onClick={onGenerateAll}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-display font-semibold text-[13px] text-[#111827] transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <FileDown className="w-4 h-4 shrink-0" />
            <span>{isGeneratingBatch ? 'Memproses PDF...' : 'Generate All PDF'}</span>
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <div className="hidden lg:flex h-full shrink-0">{sidebarBody}</div>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{sidebarBody}</div>
        </div>
      )}
    </>
  );
};
