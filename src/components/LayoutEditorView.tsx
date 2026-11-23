import React, { useMemo } from 'react';
import { AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import {
  EventMetadata,
  NavTab,
  OverlayBlock,
  Recipient,
  TemplateImages,
} from '../types';
import { VisualCoordinateMapper } from './VisualCoordinateMapper';
import { IconBadge } from './BrandIcon';
import { WorkflowStepFooter } from './WorkflowStepperBar';

interface LayoutEditorViewProps {
  eventId: string;
  metadata: EventMetadata;
  templates: TemplateImages;
  overlays: OverlayBlock[];
  onChangeOverlays: (next: OverlayBlock[]) => void;
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
  onNavigate: (tab: NavTab) => void;
}

export const LayoutEditorView: React.FC<LayoutEditorViewProps> = ({
  eventId,
  metadata,
  templates,
  overlays,
  onChangeOverlays,
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
  onNavigate,
}) => {
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EDF6F9] pb-4">
        <div className="flex items-center gap-3">
          <IconBadge name="nav-design" size="md" />
          <div>
            <h2 className="font-display font-bold text-[20px] text-[#1B1B4B]">
              Tahap 3 · Tata Letak Kanvas
            </h2>
            <p className="text-[12.5px] text-[#757E96] mt-0.5">
              Seret dan sesuaikan posisi teks, font, warna, serta QR Code langsung di atas desain.
            </p>
          </div>
        </div>

        {longestRecipient && (
          <button
            type="button"
            onClick={() => onSelectPreviewRecipient(longestRecipient.id)}
            title={`Uji kanvas dengan teks terpanjang: ${longestRecipient.recipientName}`}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12.5px] font-semibold transition-colors whitespace-nowrap border ${
              isPreviewingLongest
                ? 'bg-[#DCF5F1] border-[#1F9B96] text-[#157A76]'
                : 'bg-[#FFFDF2] border-[#F3D34F] text-[#1B1B4B] hover:bg-[#F9DE6C]/45'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#1F9B96]" />
            <span>
              {isPreviewingLongest ? 'Sedang Uji Nama Terpanjang' : 'Uji Nama Terpanjang'}
            </span>
          </button>
        )}
      </div>

      {/* Gentle Empty-State Reminder if Daftar Penerima is still empty */}
      {recipients.length === 0 && (
        <div className="rounded-2xl border border-[#F3D34F] bg-[#FFFBEB] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <AlertCircle className="w-4.5 h-4.5 text-[#9A7409] shrink-0 mt-0.5" />
            <div className="text-[12.5px] text-[#5C4506] leading-relaxed">
              <strong className="font-semibold text-[#1B1B4B]">
                Daftar penerima masih kosong.
              </strong>{' '}
              Saat ini kanvas menggunakan teks contoh. Anda tetap bisa mengatur tata letak, atau isi daftar penerima di Tahap 2 agar dapat menguji panjang nama tamu asli.
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('guests')}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[12px] font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <span>Isi Daftar Penerima</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Full-focus Visual Coordinate Mapper */}
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

      {/* Bottom Stepper Navigation */}
      <WorkflowStepFooter
        currentStep="layout"
        onNavigate={onNavigate}
        nextHint="Selanjutnya: generate massal PDF/ZIP & ekspor laporan"
      />
    </div>
  );
};
