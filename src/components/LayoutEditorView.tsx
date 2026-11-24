import React, { useMemo } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Film,
  Sparkles,
} from 'lucide-react';
import {
  DEFAULT_INTERACTIVE_CONFIG,
  EventMetadata,
  InteractiveInviteConfig,
  NavTab,
  OverlayBlock,
  Recipient,
  TemplateImages,
} from '../types';
import { VisualCoordinateMapper } from './VisualCoordinateMapper';
import { InteractiveVideoStudio } from './InteractiveVideoStudio';
import { WorkflowStepFooter } from './WorkflowStepperBar';

interface LayoutEditorViewProps {
  activeMode?: 'pdf' | 'video';
  eventId: string;
  metadata: EventMetadata;
  templates: TemplateImages;
  overlays: OverlayBlock[];
  onChangeOverlays: (next: OverlayBlock[]) => void;
  interactiveConfig?: InteractiveInviteConfig;
  onChangeInteractiveConfig?: (next: InteractiveInviteConfig) => void;
  recipients: Recipient[];
  previewRecipientId: string;
  onSelectPreviewRecipient: (id: string) => void;
  onResetOverlays: () => void;
  onSaveAsDefault: () => void | Promise<void>;
  onClearCustomDefault?: () => void | Promise<void>;
  onCopyDefaultJson?: () => void | Promise<void>;
  hasCustomDefault: boolean;
  customDefaultSavedAt?: number | null;
  onOpenFullPreview: (recipient: Recipient, page: 1 | 2) => void;
  onOpenGuestLinks?: () => void;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
  onNavigate: (tab: NavTab) => void;
}

export const LayoutEditorView: React.FC<LayoutEditorViewProps> = ({
  activeMode = 'pdf',
  eventId,
  metadata,
  templates,
  overlays,
  onChangeOverlays,
  interactiveConfig,
  onChangeInteractiveConfig,
  recipients,
  previewRecipientId,
  onSelectPreviewRecipient,
  onResetOverlays,
  onSaveAsDefault,
  onClearCustomDefault,
  onCopyDefaultJson,
  hasCustomDefault,
  customDefaultSavedAt,
  onOpenFullPreview,
  onOpenGuestLinks,
  onNotify,
  onNavigate,
}) => {
  const editorMode = activeMode;
  const activeInteractiveConfig = useMemo<InteractiveInviteConfig>(
    () => ({ ...DEFAULT_INTERACTIVE_CONFIG, ...interactiveConfig }),
    [interactiveConfig]
  );

  const longestRecipient = useMemo(() => {
    if (recipients.length === 0) return null;
    return recipients.reduce((longest, current) => {
      const currentScore =
        (current.recipientName?.length ?? 0) * 1.4 +
        (current.institution?.length ?? 0);
      const longestScore =
        (longest.recipientName?.length ?? 0) * 1.4 +
        (longest.institution?.length ?? 0);
      return currentScore > longestScore ? current : longest;
    }, recipients[0]);
  }, [recipients]);

  const isPreviewingLongest =
    Boolean(longestRecipient) && previewRecipientId === longestRecipient?.id;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Bold High-Contrast Dual-Card Switcher: Kanvas PDF vs Studio Video Interaktif 3D */}
      <div
        role="tablist"
        aria-label="Pilih Studio Undangan"
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={editorMode === 'pdf'}
          onClick={() => onNavigate('layout')}
          className={`relative rounded-[20px] p-3.5 sm:p-4 text-left border-2 transition-all flex items-center gap-3.5 ${
            editorMode === 'pdf'
              ? 'border-[#1F9B96] bg-gradient-to-br from-[#F4FBFD] to-[#E3F5FA] shadow-sm ring-4 ring-[#1F9B96]/10'
              : 'border-[#E5F1F5] bg-white hover:border-[#B5E4F1] opacity-85 hover:opacity-100'
          }`}
        >
          <span
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              editorMode === 'pdf'
                ? 'bg-[#1F9B96] text-white shadow-xs'
                : 'bg-[#EDF8FB] text-[#167F7B]'
            }`}
          >
            <FileText className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-extrabold text-[14.5px] text-[#1B1B4B]">
                Kanvas Undangan PDF
              </span>
              {editorMode === 'pdf' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1F9B96] text-white text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  Sedang Aktif
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-[#5A647B] mt-0.5 leading-snug">
              Atur posisi nama, instansi, & QR Code di surat cetak/PDF massal.
            </p>
          </div>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={editorMode === 'video'}
          onClick={() => onNavigate('video')}
          className={`relative rounded-[20px] p-3.5 sm:p-4 text-left border-2 transition-all flex items-center gap-3.5 ${
            editorMode === 'video'
              ? 'border-[#D4AF37] bg-gradient-to-br from-[#171512] via-[#1F1B14] to-[#12100C] text-[#FDFBF7] shadow-md ring-4 ring-[#D4AF37]/20'
              : 'border-[#E9DFC1] bg-[#FFFDF6] hover:border-[#D4AF37] text-[#1B1B4B]'
          }`}
        >
          <span
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              editorMode === 'video'
                ? 'bg-gradient-to-br from-[#FCE9B2] to-[#C69535] text-[#151109] shadow-xs'
                : 'bg-[#171512] text-[#FCE9B2]'
            }`}
          >
            <Film className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-display font-extrabold text-[14.5px] ${
                  editorMode === 'video' ? 'text-[#FCE9B2]' : 'text-[#1B1B4B]'
                }`}
              >
                Studio Video Interaktif 3D
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  editorMode === 'video'
                    ? 'bg-[#FCE9B2] text-[#151109]'
                    : 'bg-[#F9DE6C] text-[#1B1B4B]'
                }`}
              >
                {editorMode === 'video' ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    Sedang Aktif
                  </>
                ) : (
                  'Link WA 3D'
                )}
              </span>
            </div>
            <p
              className={`text-[11.5px] mt-0.5 leading-snug ${
                editorMode === 'video' ? 'text-[#E6DEC8]/85' : 'text-[#5A647B]'
              }`}
            >
              Segel emas 3D, animasi buka, edit slide, & generate link per tamu.
            </p>
          </div>
        </button>
      </div>

      {/* PDF-only helper strip */}
      {editorMode === 'pdf' && longestRecipient && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="text-[12px] text-[#757E96]">
            Seret kotak teks & QR langsung di atas desain undangan PDF.
          </div>
          <button
            type="button"
            onClick={() => onSelectPreviewRecipient(longestRecipient.id)}
            title={`Uji kanvas dengan teks terpanjang: ${longestRecipient.recipientName}`}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors whitespace-nowrap border ${
              isPreviewingLongest
                ? 'bg-[#DCF5F1] border-[#1F9B96] text-[#157A76]'
                : 'bg-[#FFFDF2] border-[#F3D34F] text-[#1B1B4B] hover:bg-[#F9DE6C]/45'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#1F9B96]" />
            <span>
              {isPreviewingLongest
                ? 'Sedang Uji Nama Terpanjang'
                : 'Uji Nama Terpanjang'}
            </span>
          </button>
        </div>
      )}

      {/* Gentle Empty-State Reminder if Daftar Penerima is still empty */}
      {recipients.length === 0 && (
        <div className="rounded-2xl border border-[#F3D34F] bg-[#FFFBEB] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <AlertCircle className="w-4.5 h-4.5 text-[#9A7409] shrink-0 mt-0.5" />
            <div className="text-[12px] text-[#5C4506] leading-relaxed">
              <strong className="font-semibold text-[#1B1B4B]">
                Daftar tamu masih kosong.
              </strong>{' '}
              Isi daftar tamu agar nama & link undangan otomatis terpersonalisasi.
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('guests')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[12px] font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <span>Isi Daftar Tamu</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {editorMode === 'pdf' ? (
        <VisualCoordinateMapper
          eventId={eventId}
          metadata={metadata}
          templates={templates}
          overlays={overlays}
          onChangeOverlays={onChangeOverlays}
          recipients={recipients}
          previewRecipientId={previewRecipientId}
          onSelectPreviewRecipient={onSelectPreviewRecipient}
          onResetOverlays={onResetOverlays}
          onSaveAsDefault={onSaveAsDefault}
          onClearCustomDefault={onClearCustomDefault}
          onCopyDefaultJson={onCopyDefaultJson}
          hasCustomDefault={hasCustomDefault}
          customDefaultSavedAt={customDefaultSavedAt}
          onOpenFullPreview={onOpenFullPreview}
        />
      ) : (
        <InteractiveVideoStudio
          eventId={eventId}
          metadata={metadata}
          recipients={recipients}
          previewRecipientId={previewRecipientId}
          onSelectPreviewRecipient={onSelectPreviewRecipient}
          config={activeInteractiveConfig}
          onChangeConfig={(next) => onChangeInteractiveConfig?.(next)}
          onOpenGuestLinks={onOpenGuestLinks}
          onNotify={onNotify}
        />
      )}

      {/* Bottom Stepper Navigation */}
      <WorkflowStepFooter
        currentStep={editorMode === 'video' ? 'video' : 'layout'}
        onNavigate={onNavigate}
        nextHint={
          editorMode === 'pdf'
            ? 'Selanjutnya: buat undangan video interaktif 3D atau langsung generate PDF'
            : 'Selanjutnya: generate massal PDF/ZIP & pantau rekap RSVP'
        }
      />
    </div>
  );
};
