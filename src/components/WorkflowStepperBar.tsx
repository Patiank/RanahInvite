import React from 'react';
import { ArrowLeft, ArrowRight, Film, Home } from 'lucide-react';
import { NavTab, WorkflowStepStatus } from '../types';

export interface WorkflowStepMeta {
  id: Exclude<NavTab, 'dashboard'>;
  number: 1 | 2 | 3 | 4 | 5;
  shortTitle: string;
  fullTitle: string;
  description: string;
}

export const WORKFLOW_STEPS: WorkflowStepMeta[] = [
  {
    id: 'info',
    number: 1,
    shortTitle: 'Info',
    fullTitle: 'Info & Template Acara',
    description: 'Detail acara & unggah template surat PDF',
  },
  {
    id: 'guests',
    number: 2,
    shortTitle: 'Tamu',
    fullTitle: 'Daftar Tamu',
    description: 'Kelola daftar penerima undangan',
  },
  {
    id: 'layout',
    number: 3,
    shortTitle: 'PDF',
    fullTitle: 'Kanvas Undangan PDF',
    description: 'Tata letak teks & QR Code di surat PDF',
  },
  {
    id: 'video',
    number: 4,
    shortTitle: 'Video 3D',
    fullTitle: 'Studio Video Interaktif 3D',
    description: 'Segel emas 3D, animasi & link WhatsApp tamu',
  },
  {
    id: 'export',
    number: 5,
    shortTitle: 'Laporan',
    fullTitle: 'Generate & Rekap RSVP',
    description: 'Unduh ZIP PDF & pantau konfirmasi kehadiran',
  },
];

export function isStepDone(
  stepId: Exclude<NavTab, 'dashboard'>,
  status: WorkflowStepStatus
): boolean {
  switch (stepId) {
    case 'info':
      return status.infoReady;
    case 'guests':
      return status.guestsReady;
    case 'layout':
      return status.layoutReady;
    case 'video':
      return false;
    case 'export':
      return status.exportReady;
  }
}

interface WorkflowStepperBarProps {
  activeTab: Exclude<NavTab, 'dashboard'>;
  activeEventName: string;
  stepStatus: WorkflowStepStatus;
  recipientCount: number;
  onSelectTab: (tab: NavTab) => void;
}

export const WorkflowStepperBar: React.FC<WorkflowStepperBarProps> = ({
  activeTab,
  onSelectTab,
}) => {
  return (
    /* Compact 1-row quick switcher for Mobile & Tablet only (Desktop uses Sidebar — zero duplication!) */
    <div className="lg:hidden mb-3.5 rounded-2xl border border-[#E5F1F5] bg-[#F4FBFD] p-1.5 flex items-center gap-1 overflow-x-auto">
      <button
        type="button"
        onClick={() => onSelectTab('dashboard')}
        aria-label="Beranda Event"
        className="w-8 h-8 rounded-xl bg-white border border-[#DDEEF3] flex items-center justify-center text-[#167F7B] shrink-0"
      >
        <Home className="w-3.5 h-3.5" />
      </button>

      <nav
        aria-label="Navigasi cepat halaman"
        className="flex items-center gap-1 flex-1 min-w-0"
      >
        {WORKFLOW_STEPS.map((step) => {
          const isActive = activeTab === step.id;
          const isVideo = step.id === 'video';
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelectTab(step.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex-1 min-w-fit inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl text-[11.5px] font-bold transition-all whitespace-nowrap ${
                isActive
                  ? isVideo
                    ? 'bg-[#171512] text-[#FCE9B2] shadow-xs ring-1 ring-[#D4AF37]/50'
                    : 'bg-[#1F9B96] text-white shadow-xs'
                  : isVideo
                    ? 'bg-[#FFFBEB] text-[#7A5708] border border-[#F3D34F]/70'
                    : 'bg-white text-[#5A647B] border border-[#DDEEF3]'
              }`}
            >
              {isVideo && <Film className="w-3 h-3 shrink-0" />}
              <span>{step.shortTitle}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

interface WorkflowStepFooterProps {
  currentStep: Exclude<NavTab, 'dashboard'>;
  onNavigate: (tab: NavTab) => void;
  nextDisabled?: boolean;
  nextHint?: string;
}

export const WorkflowStepFooter: React.FC<WorkflowStepFooterProps> = ({
  currentStep,
  onNavigate,
  nextDisabled = false,
  nextHint,
}) => {
  const currentIndex = WORKFLOW_STEPS.findIndex((s) => s.id === currentStep);
  const prevStep = currentIndex > 0 ? WORKFLOW_STEPS[currentIndex - 1] : null;
  const nextStep =
    currentIndex >= 0 && currentIndex < WORKFLOW_STEPS.length - 1
      ? WORKFLOW_STEPS[currentIndex + 1]
      : null;

  return (
    <div className="mt-8 pt-5 border-t border-[#EDF6F9] flex flex-wrap items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => onNavigate(prevStep ? prevStep.id : 'dashboard')}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#DDEEF3] bg-white text-[13px] font-semibold text-[#1B1B4B] hover:bg-[#F4FBFD] transition-colors whitespace-nowrap"
      >
        <ArrowLeft className="w-4 h-4 text-[#757E96]" />
        <span>
          {prevStep
            ? `Kembali · ${prevStep.fullTitle}`
            : 'Kembali ke Beranda Event'}
        </span>
      </button>

      <div className="flex items-center gap-3 ml-auto">
        {nextHint && (
          <span className="hidden sm:inline text-[12px] text-[#757E96]">
            {nextHint}
          </span>
        )}
        {nextStep ? (
          <button
            type="button"
            disabled={nextDisabled}
            onClick={() => onNavigate(nextStep.id)}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-colors shadow-xs disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap ${
              nextStep.id === 'video'
                ? 'bg-[#171512] hover:bg-[#26221C] text-[#FCE9B2] border border-[#D4AF37]/50'
                : 'bg-[#1F9B96] hover:bg-[#167F7B] text-white'
            }`}
          >
            <span>Lanjut · {nextStep.fullTitle}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#F9DE6C] hover:bg-[#F3D34F] text-[#1B1B4B] text-[13px] font-bold transition-colors shadow-xs whitespace-nowrap"
          >
            <Home className="w-4 h-4" />
            <span>Selesai · Kembali ke Beranda</span>
          </button>
        )}
      </div>
    </div>
  );
};
