import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { Check, FileText, Film, X } from 'lucide-react';
import { NavTab, WorkflowStepStatus } from '../types';
import { BrandIcon, BrandIconName } from './BrandIcon';

interface SidebarProps {
  activeTab: NavTab;
  activeEventName: string;
  stepStatus: WorkflowStepStatus;
  onSelectTab: (tab: NavTab) => void;
  onGenerateAll: () => void;
  readyCount: number;
  totalCount: number;
  isGeneratingBatch: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface SidebarNavItem {
  id: Exclude<NavTab, 'dashboard'>;
  number?: 1 | 2;
  label: string;
  icon: BrandIconName;
  badge?: string;
}

const DATA_NAV_ITEMS: SidebarNavItem[] = [
  { id: 'info', number: 1, label: 'Info & Template', icon: 'doc-upload' },
  { id: 'guests', number: 2, label: 'Daftar Tamu', icon: 'nav-guests' },
];

const STUDIO_NAV_ITEMS: SidebarNavItem[] = [
  { id: 'layout', label: 'Kanvas Undangan PDF', icon: 'nav-design' },
  {
    id: 'video',
    label: 'Studio Video Interaktif',
    icon: 'nav-design',
    badge: '3D',
  },
];

const OUTPUT_NAV_ITEMS: SidebarNavItem[] = [
  { id: 'export', label: 'Generate & Rekap RSVP', icon: 'nav-export-pdf' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  activeEventName,
  stepStatus,
  onSelectTab,
  onGenerateAll,
  readyCount,
  totalCount,
  isGeneratingBatch,
  mobileOpen,
  onCloseMobile,
}) => {
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const isStepReady = (id: Exclude<NavTab, 'dashboard'>): boolean => {
    switch (id) {
      case 'info':
        return stepStatus.infoReady;
      case 'guests':
        return stepStatus.guestsReady;
      case 'layout':
        return stepStatus.layoutReady;
      case 'video':
        return false;
      case 'export':
        return stepStatus.exportReady;
    }
  };

  const renderNavItem = (item: SidebarNavItem) => {
    const isActive = activeTab === item.id;
    const ready = isStepReady(item.id);
    const isVideoTab = item.id === 'video';
    const isPdfTab = item.id === 'layout';

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          onSelectTab(item.id);
          onCloseMobile();
        }}
        aria-current={isActive ? 'page' : undefined}
        className={`relative flex items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-medium transition-colors duration-200 rounded-l-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F9DE6C] ${
          isActive
            ? 'text-[#1B1B4B] font-semibold'
            : isVideoTab
              ? 'text-[#FFF4CC] hover:text-white hover:bg-white/12'
              : 'text-white/90 hover:text-white hover:bg-white/10'
        }`}
      >
        {isActive && (
          <motion.div
            layoutId="sidebarActiveTab"
            transition={{
              type: 'spring',
              stiffness: 380,
              damping: 34,
            }}
            className="absolute inset-0 bg-white rounded-l-full"
            style={{ zIndex: 0 }}
          >
            <span className="pinhome-tab-scoop-top hidden lg:block" aria-hidden="true" />
            <span className="pinhome-tab-scoop-bottom hidden lg:block" aria-hidden="true" />
          </motion.div>
        )}

        {item.number ? (
          <span
            className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 tabular-nums transition-colors ${
              isActive
                ? 'bg-[#1F9B96] text-white'
                : ready
                  ? 'bg-[#F9DE6C] text-[#1B1B4B]'
                  : 'bg-white/18 text-white'
            }`}
          >
            {ready && !isActive ? (
              <Check className="w-3.5 h-3.5 stroke-[2.6]" />
            ) : (
              item.number
            )}
          </span>
        ) : isVideoTab ? (
          <span
            className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              isActive
                ? 'bg-[#171512] text-[#FCE9B2]'
                : 'bg-[#171512]/80 text-[#FCE9B2] ring-1 ring-[#F9DE6C]/50'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
          </span>
        ) : isPdfTab ? (
          <span
            className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              isActive
                ? 'bg-[#1F9B96] text-white'
                : 'bg-white/18 text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
          </span>
        ) : (
          <BrandIcon
            name={item.icon}
            className={`w-5 h-5 relative z-10 shrink-0 transition-colors ${
              isActive ? 'text-[#1F9B96]' : 'text-[#F9E99B]'
            }`}
          />
        )}

        <span className="relative z-10 whitespace-nowrap truncate flex-1">
          {item.label}
        </span>

        {item.badge && (
          <span
            className={`relative z-10 mr-2 px-1.5 py-0.5 rounded-full text-[9.5px] font-extrabold tracking-wide shrink-0 ${
              isActive
                ? 'bg-[#171512] text-[#FCE9B2]'
                : 'bg-[#F9DE6C] text-[#1B1B4B]'
            }`}
          >
            {item.badge}
          </span>
        )}

        {item.id === 'guests' && totalCount > 0 && (
          <span
            className={`relative z-10 mr-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
              isActive
                ? 'bg-[#E3F5FA] text-[#167F7B]'
                : 'bg-white/15 text-white/95'
            }`}
          >
            {totalCount}
          </span>
        )}
      </button>
    );
  };

  const sidebarBody = (
    <aside
      className="flex flex-col justify-between h-full w-[252px] shrink-0 text-white select-none py-5 pl-4 pr-0"
      style={{ backgroundColor: 'var(--bg-sidebar)' }}
    >
      <div>
        {/* Brand Header */}
        <div className="flex items-center justify-between pr-4 pl-2 mb-7">
          <div className="flex items-center gap-3">
            <BrandIcon
              name="brand-rumah-gadang"
              className="w-10 h-10 shrink-0 text-[#F9E99B]"
            />
            <div className="min-w-0">
              <div className="font-display font-bold text-[18px] leading-tight tracking-tight text-white whitespace-nowrap">
                Ranah Invite
              </div>
              <div className="text-[11px] font-medium text-white/80 tracking-wide whitespace-nowrap">
                Undangan PDF & Video 3D
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-full text-white/85 hover:text-white hover:bg-white/15"
            aria-label="Tutup menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links with PinHome Concave Curved White Cutout Active Indicator */}
        <nav aria-label="Navigasi Utama" className="flex flex-col gap-1.5 relative">
          {/* Beranda Event (Hub) */}
          <button
            type="button"
            onClick={() => {
              onSelectTab('dashboard');
              onCloseMobile();
            }}
            className={`relative flex items-center gap-3 px-4 py-3 text-left text-[13.5px] font-medium transition-colors duration-200 rounded-l-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F9DE6C] ${
              activeTab === 'dashboard'
                ? 'text-[#1B1B4B] font-semibold'
                : 'text-white/90 hover:text-white hover:bg-white/10'
            }`}
          >
            {activeTab === 'dashboard' && (
              <motion.div
                layoutId="sidebarActiveTab"
                transition={{
                  type: 'spring',
                  stiffness: 380,
                  damping: 34,
                }}
                className="absolute inset-0 bg-white rounded-l-full"
                style={{ zIndex: 0 }}
              >
                <span className="pinhome-tab-scoop-top hidden lg:block" aria-hidden="true" />
                <span className="pinhome-tab-scoop-bottom hidden lg:block" aria-hidden="true" />
              </motion.div>
            )}
            <BrandIcon
              name="nav-dashboard"
              className={`w-5.5 h-5.5 relative z-10 shrink-0 transition-colors duration-200 ${
                activeTab === 'dashboard' ? 'text-[#1F9B96]' : 'text-[#F9E99B]'
              }`}
            />
            <span className="relative z-10 whitespace-nowrap truncate">
              Beranda Event
            </span>
          </button>

          {/* Group 1: Data Acara (Shared by PDF & Video) */}
          <div className="pr-4 pl-3 pt-3.5 pb-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/65">
              1 · Data Acara
            </div>
            <div
              title={activeEventName}
              className="text-[11px] font-medium text-[#F9E99B] truncate mt-0.5"
            >
              {activeEventName || 'Event Aktif'}
            </div>
          </div>
          {DATA_NAV_ITEMS.map(renderNavItem)}

          {/* Group 2: Studio Undangan (PDF vs Video 3D side-by-side) */}
          <div className="pr-4 pl-3 pt-3.5 pb-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/65">
              2 · Pilih Studio Undangan
            </div>
          </div>
          {STUDIO_NAV_ITEMS.map(renderNavItem)}

          {/* Group 3: Generate & Laporan */}
          <div className="pr-4 pl-3 pt-3.5 pb-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/65">
              3 · Hasil & Rekap
            </div>
          </div>
          {OUTPUT_NAV_ITEMS.map(renderNavItem)}
        </nav>
      </div>

      {/* Bottom-left PinHome Frosted Pastel Adaptive Action Card */}
      <div className="pr-4 pl-1 mt-6 space-y-3.5">
        <div
          aria-label="Ikon Pariwisata Sumatera Barat"
          className="flex items-center justify-between px-1.5 py-0.5"
        >
          {(
            [
              { icon: 'sumbar-rumah-gadang', label: 'Rumah Gadang' },
              { icon: 'sumbar-jam-gadang', label: 'Jam Gadang' },
              { icon: 'sumbar-mountain', label: 'Danau & Gunung' },
              { icon: 'sumbar-surfer', label: 'Ombak Mentawai' },
              { icon: 'sumbar-boat', label: 'Wisata Bahari' },
              { icon: 'sumbar-beach', label: 'Pantai Sumbar' },
            ] as const
          ).map((emblem) => (
            <span
              key={emblem.icon}
              title={emblem.label}
              className="inline-flex items-center justify-center opacity-85 hover:opacity-100 transition-opacity"
            >
              <BrandIcon
                name={emblem.icon}
                className="w-5.5 h-5.5 text-[#F9E99B]"
              />
            </span>
          ))}
        </div>

        <div className="relative overflow-hidden rounded-[24px] bg-white/18 backdrop-blur-xs p-4 text-center">
          {/* Playful PinHome blush-pink geometric accent orb */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-3 right-3 w-11 h-11 rounded-full bg-[#F7B7C6]/85"
          />

          <div className="relative z-10 flex items-center justify-center mb-2.5 pt-1">
            <BrandIcon
              name="brand-skyline"
              white
              className="w-full h-14 drop-shadow-xs"
            />
          </div>

          {totalCount === 0 ? (
            <>
              <div className="relative z-10 mb-3.5">
                <p className="font-display font-bold text-[14.5px] text-white leading-snug">
                  Daftar Penerima Kosong
                </p>
                <p className="text-[11.5px] text-white/85 mt-1 leading-relaxed">
                  Tambahkan target undangan dulu sebelum generate PDF
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onSelectTab('guests');
                  onCloseMobile();
                }}
                className="relative z-10 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full font-display font-bold text-[13px] text-[#1B1B4B] transition-all duration-200 hover:brightness-95 active:scale-[0.98] whitespace-nowrap shadow-xs"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <BrandIcon name="nav-guests" className="w-4.5 h-4.5 text-[#1B1B4B]" />
                <span>Isi Daftar Penerima</span>
              </button>
            </>
          ) : (
            <>
              <div className="relative z-10 mb-3.5">
                <p className="font-display font-bold text-[14.5px] text-white leading-snug">
                  Ekspor Batch PDF
                </p>
                <p className="text-[11.5px] text-white/85 mt-1 leading-relaxed tabular-nums">
                  {totalCount} penerima · {readyCount} siap digenerate
                </p>
              </div>

              <button
                type="button"
                disabled={isGeneratingBatch}
                onClick={() => {
                  onGenerateAll();
                  onCloseMobile();
                }}
                className="relative z-10 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full font-display font-bold text-[13px] text-[#1B1B4B] transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-xs"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <BrandIcon name="nav-export-pdf" className="w-5 h-5 text-[#1B1B4B]" />
                <span>{isGeneratingBatch ? 'Memproses PDF...' : 'Generate Semua PDF'}</span>
              </button>
            </>
          )}
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
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu Navigasi Mobile"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          <div
            aria-hidden="true"
            className="fixed inset-0 bg-[#1B1B4B]/40 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{sidebarBody}</div>
        </div>
      )}
    </>
  );
};
