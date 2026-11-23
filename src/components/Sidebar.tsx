import React from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { NavTab } from '../types';
import { BrandIcon, BrandIconName } from './BrandIcon';

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

const NAV_ITEMS: { id: NavTab; label: string; icon: BrandIconName }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'nav-dashboard' },
  { id: 'design', label: 'Design & Upload', icon: 'nav-design' },
  { id: 'guests', label: 'Guest & Target List', icon: 'nav-guests' },
  { id: 'batch', label: 'PDF Batch Queue', icon: 'nav-export-pdf' },
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
      className="flex flex-col justify-between h-full w-[244px] shrink-0 text-white select-none py-5 pl-4 pr-0"
      style={{ backgroundColor: 'var(--bg-sidebar)' }}
    >
      <div>
        {/* Brand Header */}
        <div className="flex items-center justify-between pr-4 pl-2 mb-9">
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
                Studio Undangan PDF
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
        <nav aria-label="Navigasi Utama" className="flex flex-col gap-2 relative">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`relative flex items-center gap-3.5 px-4 py-3 text-left text-[14px] font-medium transition-colors duration-200 rounded-l-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F9DE6C] ${
                  isActive
                    ? 'text-[#1B1B4B] font-semibold'
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
                <BrandIcon
                  name={item.icon}
                  className={`w-6 h-6 relative z-10 shrink-0 transition-colors duration-200 ${
                    isActive ? 'text-[#1F9B96]' : 'text-[#F9E99B]'
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

      {/* Bottom-left PinHome Frosted Pastel Action Card */}
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
              className="w-full h-16 drop-shadow-xs"
            />
          </div>

          <div className="relative z-10 mb-3.5">
            <p className="font-display font-bold text-[15px] text-white leading-snug">
              Ekspor Batch PDF
            </p>
            <p className="text-[11.5px] text-white/85 mt-1 leading-relaxed tabular-nums">
              {totalCount} penerima terdaftar · {readyCount} belum diunduh
            </p>
          </div>

          <button
            type="button"
            disabled={totalCount === 0 || isGeneratingBatch}
            onClick={onGenerateAll}
            className="relative z-10 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full font-display font-bold text-[13px] text-[#1B1B4B] transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-xs"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <BrandIcon name="nav-export-pdf" className="w-5 h-5 text-[#1B1B4B]" />
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
            className="fixed inset-0 bg-[#1B1B4B]/40 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{sidebarBody}</div>
        </div>
      )}
    </>
  );
};
