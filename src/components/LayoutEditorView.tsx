import React, { useMemo } from 'react';
import {
  AlertCircle,
  ArrowRight,
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
    <div className="space-y-3.5">
      {/* Slim 1-Row Mode Switcher + Contextual Helper */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div
          role="tablist"
          aria-label="Pilih Studio Undangan"
          className="inline-flex items-center gap-1 p-1 rounded-full bg-[#F4FBFD] border border-[#DDEEF3]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={editorMode === 'pdf'}
            onClick={() => onNavigate('layout')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all whitespace-nowrap ${
              editorMode === 'pdf'
                ? 'bg-[#1F9B96] text-white shadow-xs'
                : 'text-[#5A647B] hover:text-[#1B1B4B]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Desain PDF</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={editorMode === 'video'}
            onClick={() => onNavigate('video')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all whitespace-nowrap ${
              editorMode === 'video'
                ? 'bg-[#171512] text-[#FCE9B2] shadow-xs'
                : 'text-[#5A647B] hover:text-[#1B1B4B]'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Video 3D</span>
          </button>
        </div>

        {editorMode === 'pdf' && longestRecipient && (
          <button
            type="button"
            onClick={() => onSelectPreviewRecipient(longestRecipient.id)}
            title={`Uji kanvas dengan teks terpanjang: ${longestRecipient.recipientName}`}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors whitespace-nowrap border ${
              isPreviewingLongest
                ? 'bg-[#DCF5F1] border-[#1F9B96] text-[#157A76]'
                : 'bg-[#FFFDF2] border-[#F3D34F] text-[#1B1B4B] hover:bg-[#F9DE6C]/45'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#1F9B96]" />
            <span>
              {isPreviewingLongest
                ? 'Menguji Nama Terpanjang'
                : 'Uji Nama Terpanjang'}
            </span>
          </button>
        )}
      </div>

      {/* Gentle Empty-State Reminder only when Daftar Tamu is empty */}
      {recipients.length === 0 && (
        <div className="rounded-2xl border border-[#F3D34F] bg-[#FFFBEB] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0 flex-1 text-[12px] text-[#5C4506]">
            <AlertCircle className="w-4 h-4 text-[#9A7409] shrink-0" />
            <span>Daftar tamu masih kosong.</span>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('guests')}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-white text-[11.5px] font-semibold transition-colors whitespace-nowrap shrink-0"
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
    </div>
  );
};
