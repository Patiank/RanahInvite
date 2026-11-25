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
  onGenerateAll?: () => void;
  readyCount?: number;
  totalCount: number;
  isGeneratingBatch?: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface SidebarNavItem {
  id: Exclude<NavTab, 'dashboard'>;
  label: string;
  icon: BrandIconName;
  badge?: string;
}

const DATA_NAV_ITEMS: SidebarNavItem[] = [
  { id: 'info', label: 'Info & Template', icon: 'doc-upload' },
  { id: 'guests', label: 'Daftar Tamu', icon: 'nav-guests' },
];

const STUDIO_NAV_ITEMS: SidebarNavItem[] = [
  { id: 'layout', label: 'Desain PDF', icon: 'nav-design' },
  {
    id: 'video',
    label: 'Video 3D',
    icon: 'nav-design',
    badge: '3D',
  },
];

const OUTPUT_NAV_ITEMS: SidebarNavItem[] = [
  { id: 'export', label: 'Generate & Rekap', icon: 'nav-export-pdf' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  activeEventName,
  stepStatus,
  onSelectTab,
  totalCount,
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

        {isVideoTab ? (
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

        {item.id === 'info' && ready && !isActive && (
          <span
            aria-label="Siap"
            className="relative z-10 mr-2 w-4 h-4 rounded-full bg-[#F9DE6C]/90 text-[#1B1B4B] flex items-center justify-center shrink-0"
          >
            <Check className="w-2.5 h-2.5 stroke-[3]" />
          </span>
        )}
      </button>
    );
  };

  const sidebarBody = (
    <aside
      className="flex flex-col justify-between h-full w-[240px] shrink-0 text-white select-none py-5 pl-4 pr-0"
      style={{ backgroundColor: 'var(--bg-sidebar)' }}
    >
      <div>
        {/* Brand Header */}
        <div className="flex items-center justify-between pr-4 pl-2 mb-6">
          <div className="flex items-center gap-2.5">
            <BrandIcon
              name="brand-rumah-gadang"
              className="w-9 h-9 shrink-0 text-[#F9E99B]"
            />
            <div className="min-w-0">
              <div className="font-display font-bold text-[17px] leading-tight tracking-tight text-white whitespace-nowrap">
                Ranah Invite
              </div>
              <div className="text-[11px] font-medium text-white/75 tracking-wide whitespace-nowrap">
                Studio Undangan
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

        {/* Clean Active Event Context Pill */}
        {activeEventName && (
          <div className="pr-4 pl-2 mb-5">
            <div className="rounded-2xl bg-white/12 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/65">
                Acara Aktif
              </div>
              <div
                title={activeEventName}
                className="text-[12px] font-semibold text-[#F9E99B] truncate mt-0.5"
              >
                {activeEventName}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <nav aria-label="Navigasi Utama" className="flex flex-col gap-1 relative">
          {/* Beranda */}
          <button
            type="button"
            onClick={() => {
              onSelectTab('dashboard');
              onCloseMobile();
            }}
            className={`relative flex items-center gap-3 px-4 py-2.5 text-left text-[13px] font-medium transition-colors duration-200 rounded-l-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F9DE6C] ${
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
              className={`w-5 h-5 relative z-10 shrink-0 transition-colors duration-200 ${
                activeTab === 'dashboard' ? 'text-[#1F9B96]' : 'text-[#F9E99B]'
              }`}
            />
            <span className="relative z-10 whitespace-nowrap truncate">
              Beranda
            </span>
          </button>

          {/* Group: Acara */}
          <div className="pr-4 pl-3 pt-4 pb-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
              Acara
            </div>
          </div>
          {DATA_NAV_ITEMS.map(renderNavItem)}

          {/* Group: Desain */}
          <div className="pr-4 pl-3 pt-4 pb-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
              Desain
            </div>
          </div>
          {STUDIO_NAV_ITEMS.map(renderNavItem)}

          {/* Group: Distribusi */}
          <div className="pr-4 pl-3 pt-4 pb-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
              Distribusi
            </div>
          </div>
          {OUTPUT_NAV_ITEMS.map(renderNavItem)}
        </nav>
      </div>

      {/* Minimal Calm Footer */}
      <div className="pr-4 pl-3 pt-6">
        <div className="text-[11px] text-white/60">
          {totalCount > 0 ? `${totalCount} tamu terdaftar` : 'Belum ada tamu'}
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
