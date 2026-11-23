import React from 'react';
import { ArrowLeft, ArrowRight, Check, Home } from 'lucide-react';
import { NavTab, WorkflowStepStatus } from '../types';

export interface WorkflowStepMeta {
  id: Exclude<NavTab, 'dashboard'>;
  number: 1 | 2 | 3 | 4;
  shortTitle: string;
  fullTitle: string;
  description: string;
}

export const WORKFLOW_STEPS: WorkflowStepMeta[] = [
  {
    id: 'info',
    number: 1,
    shortTitle: 'Info & Template',
    fullTitle: 'Tahap 1 · Info & Template',
    description: 'Lengkapi detail acara & unggah desain 1 atau 2 halaman',
  },
  {
    id: 'guests',
    number: 2,
    shortTitle: 'Daftar Penerima',
    fullTitle: 'Tahap 2 · Daftar Penerima',
    description: 'Isi target undangan dari Bank Daftar, Excel, atau manual',
  },
  {
    id: 'layout',
    number: 3,
    shortTitle: 'Tata Letak',
    fullTitle: 'Tahap 3 · Tata Letak',
    description: 'Atur posisi teks & QR Code dengan data tamu asli',
  },
  {
    id: 'export',
    number: 4,
    shortTitle: 'Generate & Laporan',
    fullTitle: 'Tahap 4 · Generate & Laporan',
    description: 'Render massal PDF/ZIP, unduh satuan, & ekspor rekap',
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
  activeEventName,
  stepStatus,
  recipientCount,
  onSelectTab,
}) => {
  return (
    <div className="mb-6 rounded-[22px] border border-[#E5F1F5] bg-[#F4FBFD] px-4 py-3.5 space-y-3">
      {/* Active Event Context Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#DCF5F1] text-[#157A76] text-[11px] font-bold uppercase tracking-wide shrink-0">
            Event Aktif
          </span>
          <span
            title={activeEventName}
            className="text-[13px] font-display font-bold text-[#1B1B4B] truncate"
          >
            {activeEventName || 'Event Tanpa Nama'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#167F7B] hover:text-[#1B1B4B] transition-colors whitespace-nowrap shrink-0"
        >
          <Home className="w-3.5 h-3.5" />
          <span>Beranda Event</span>
        </button>
      </div>

      {/* 4-Step Interactive Pipeline */}
      <nav aria-label="Tahapan Pembuatan Undangan">
        <ol className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {WORKFLOW_STEPS.map((step) => {
            const isActive = activeTab === step.id;
            const done = isStepDone(step.id, stepStatus);
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => onSelectTab(step.id)}
                  aria-current={isActive ? 'step' : undefined}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl border text-left transition-all ${
                    isActive
                      ? 'bg-white border-[#1F9B96] ring-2 ring-[#1F9B96]/15 shadow-xs'
                      : done
                        ? 'bg-white/80 border-[#CFEAE5] hover:bg-white hover:border-[#1F9B96]/50'
                        : 'bg-white/50 border-[#E5F1F5] hover:bg-white hover:border-[#B5E4F1]'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 tabular-nums transition-colors ${
                      isActive
                        ? 'bg-[#1F9B96] text-white'
                        : done
                          ? 'bg-[#DCF5F1] text-[#157A76]'
                          : 'bg-[#E5F1F5] text-[#757E96]'
                    }`}
                  >
                    {done && !isActive ? (
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    ) : (
                      step.number
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-[12px] font-display font-bold truncate ${
                        isActive ? 'text-[#1B1B4B]' : 'text-[#5B647E]'
                      }`}
                    >
                      {step.shortTitle}
                    </div>
                    <div className="text-[10.5px] text-[#757E96] truncate tabular-nums">
                      {step.id === 'guests'
                        ? `${recipientCount} penerima`
                        : done
                          ? 'Siap'
                          : isActive
                            ? 'Sedang dikerjakan'
                            : 'Belum lengkap'}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
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
    currentIndex < WORKFLOW_STEPS.length - 1
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
            ? `Kembali · Tahap ${prevStep.number} (${prevStep.shortTitle})`
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
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[13px] font-semibold transition-colors shadow-xs disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <span>
              Lanjut · Tahap {nextStep.number} ({nextStep.shortTitle})
            </span>
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
