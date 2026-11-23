import React, { useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import {
  EventMetadata,
  OverlayBlock,
  Recipient,
  TemplateImages,
} from '../types';
import { VisualCoordinateMapper } from './VisualCoordinateMapper';
import { AnalogClockTimePicker, CalendarDatePicker } from './DateTimePickers';
import { BrandIcon, IconBadge } from './BrandIcon';

interface DesignUploadViewProps {
  eventId: string;
  metadata: EventMetadata;
  onChangeMetadata: (next: EventMetadata) => void;
  templates: TemplateImages;
  onChangeTemplates: (next: TemplateImages) => void;
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
}

function readFileAsImage(file: File): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        resolve({
          dataUrl,
          width: img.naturalWidth || 1240,
          height: img.naturalHeight || 1754,
        });
      };
      img.onerror = () => reject(new Error('Berkas gambar tidak valid.'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.readAsDataURL(file);
  });
}

export const DesignUploadView: React.FC<DesignUploadViewProps> = ({
  eventId,
  metadata,
  onChangeMetadata,
  templates,
  onChangeTemplates,
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
}) => {
  const [sectionTab, setSectionTab] = useState<'mapper' | 'upload'>('mapper');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const page1InputRef = useRef<HTMLInputElement | null>(null);
  const page2InputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadPage = async (pageNum: 1 | 2, file?: File) => {
    if (!file) return;
    setUploadError(null);
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setUploadError('Format gambar harus .PNG, .JPG, atau .WEBP.');
      return;
    }

    try {
      const { dataUrl, width, height } = await readFileAsImage(file);
      if (pageNum === 1) {
        onChangeTemplates({
          ...templates,
          activeTemplateId: 'custom-upload',
          page1DataUrl: dataUrl,
          page1Width: width,
          page1Height: height,
        });
      } else {
        onChangeTemplates({
          ...templates,
          activeTemplateId: 'custom-upload',
          pageCount: 2,
          page2DataUrl: dataUrl,
          page2Width: width,
          page2Height: height,
        });
        // Move unlocked QR / info blocks to Page 2 only if they were previously on Page 1,
        // without overwriting their saved X/Y/width coordinates.
        onChangeOverlays(
          overlays.map((o) =>
            (o.id === 'qr_code' || o.id === 'rsvp_note') && o.page === 1 && !o.locked
              ? { ...o, page: 2 }
              : o
          )
        );
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal memuat gambar.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EDF6F9] pb-4">
        <div className="flex items-center gap-3">
          <IconBadge name="nav-design" size="md" />
          <h2 className="font-display font-bold text-[20px] text-[#1B1B4B]">
            Desain & Tata Letak
          </h2>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-full bg-[#F4FBFD] border border-[#E5F1F5]">
          <button
            type="button"
            onClick={() => setSectionTab('mapper')}
            className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors whitespace-nowrap ${
              sectionTab === 'mapper'
                ? 'bg-[#1F9B96] text-white shadow-xs'
                : 'text-[#757E96] hover:text-[#1B1B4B]'
            }`}
          >
            Editor Tata Letak
          </button>
          <button
            type="button"
            onClick={() => setSectionTab('upload')}
            className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors whitespace-nowrap ${
              sectionTab === 'upload'
                ? 'bg-[#1F9B96] text-white shadow-xs'
                : 'text-[#757E96] hover:text-[#1B1B4B]'
            }`}
          >
            Info Acara & Gambar
          </button>
        </div>
      </div>

      {sectionTab === 'upload' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Event Metadata Form */}
          <div className="lg:col-span-6 rounded-[22px] border border-[#E5F1F5] bg-white p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <IconBadge name="sumbar-rumah-gadang" size="sm" />
              <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
                Info Acara
              </h3>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-medium text-[#1B1B4B] mb-1">
                  Nama Acara / Kegiatan
                </label>
                <input
                  type="text"
                  value={metadata.eventName}
                  onChange={(e) =>
                    onChangeMetadata({ ...metadata, eventName: e.target.value })
                  }
                  placeholder="Contoh: Festival Pesona Minangkabau 2026"
                  className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2.5 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#1B1B4B] mb-1">
                  Instansi Penyelenggara
                </label>
                <input
                  type="text"
                  value={metadata.organizer}
                  onChange={(e) =>
                    onChangeMetadata({ ...metadata, organizer: e.target.value })
                  }
                  className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2.5 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-[#1B1B4B] mb-1">
                    <BrandIcon name="schedule-datetime" className="w-4 h-4 text-[#757E96]" />
                    <span>Tanggal Acara</span>
                  </label>
                  <CalendarDatePicker
                    value={metadata.date}
                    onChange={(nextDate) =>
                      onChangeMetadata({ ...metadata, date: nextDate })
                    }
                    ariaLabel="Pilih Tanggal Acara dari kalender"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-[#1B1B4B] mb-1">
                    <BrandIcon name="rsvp-pending" className="w-3.5 h-3.5 text-[#757E96]" />
                    <span>Waktu</span>
                  </label>
                  <AnalogClockTimePicker
                    value={metadata.time}
                    onChange={(nextTime) =>
                      onChangeMetadata({ ...metadata, time: nextTime })
                    }
                    ariaLabel="Pilih Waktu Acara dari gambar jam"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[12px] font-medium text-[#1B1B4B] mb-1">
                  <MapPin className="w-3.5 h-3.5 text-[#1F9B96]" />
                  <span>Lokasi Pelaksanaan</span>
                </label>
                <input
                  type="text"
                  value={metadata.location}
                  onChange={(e) =>
                    onChangeMetadata({ ...metadata, location: e.target.value })
                  }
                  className="w-full rounded-xl border border-[#DDEEF3] px-3.5 py-2.5 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                />
              </div>
            </div>
          </div>

          {/* Image Template Uploader (1 or 2 pages) */}
          <div className="lg:col-span-6 rounded-[22px] border border-[#E5F1F5] bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <IconBadge name="action-edit-design" size="sm" />
                <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
                  Gambar Undangan
                </h3>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-full bg-[#F4FBFD] border border-[#E5F1F5]">
                <button
                  type="button"
                  onClick={() => {
                    onChangeTemplates({ ...templates, pageCount: 1 });
                    onChangeOverlays(
                      overlays.map((o) => (o.page === 2 ? { ...o, page: 1 } : o))
                    );
                  }}
                  className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-colors ${
                    templates.pageCount === 1
                      ? 'bg-[#1F9B96] text-white shadow-xs'
                      : 'text-[#757E96] hover:text-[#1B1B4B]'
                  }`}
                >
                  1 Halaman
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangeTemplates({ ...templates, pageCount: 2 });
                    if (templates.page2DataUrl) {
                      onChangeOverlays(
                        overlays.map((o) =>
                          o.id === 'qr_code' || (o.id === 'rsvp_note' && !o.locked)
                            ? { ...o, page: 2 }
                            : o
                        )
                      );
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-colors ${
                    templates.pageCount === 2
                      ? 'bg-[#1F9B96] text-white shadow-xs'
                      : 'text-[#757E96] hover:text-[#1B1B4B]'
                  }`}
                >
                  2 Halaman
                </button>
              </div>
            </div>

            {uploadError && (
              <div className="rounded-2xl bg-[#FDE8EE] border border-[#F5C6D2] px-3.5 py-2.5 text-[12px] text-[#B83B5E]">
                {uploadError}
              </div>
            )}

            {/* Page 1 Uploader */}
            <div className="rounded-2xl border border-dashed border-[#B5E4F1] bg-[#F4FBFD] p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={templates.page1DataUrl}
                    alt="Thumbnail Halaman 1"
                    className="w-16 h-20 object-contain rounded-xl border border-[#DDEEF3] bg-white p-0.5 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-[#1B1B4B]">
                      Halaman 1 · Sampul & Tujuan Undangan
                    </div>
                    <div className="text-[12px] text-[#757E96] tabular-nums mt-0.5">
                      Resolusi aktif: {templates.page1Width} × {templates.page1Height} px
                    </div>
                  </div>
                </div>

                <div>
                  <input
                    ref={page1InputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => handleUploadPage(1, e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => page1InputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold text-white bg-[#1F9B96] hover:bg-[#167F7B] transition-colors whitespace-nowrap"
                  >
                    <BrandIcon name="action-upload" white className="w-4 h-4" />
                    <span>Pilih Gambar Hal 1</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Page 2 Uploader */}
            {templates.pageCount === 2 && (
              <div className="rounded-2xl border border-dashed border-[#B5E4F1] bg-[#F4FBFD] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {templates.page2DataUrl ? (
                      <img
                        src={templates.page2DataUrl}
                        alt="Thumbnail Halaman 2"
                        className="w-16 h-20 object-contain rounded-xl border border-[#DDEEF3] bg-white p-0.5 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-20 rounded-xl border border-[#DDEEF3] bg-white flex items-center justify-center text-[#1F9B96]/60 shrink-0">
                        <BrandIcon name="doc-upload" className="w-6 h-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-[#1B1B4B]">
                        Halaman 2 · Susunan Acara (Opsional)
                      </div>
                      <div className="text-[12px] text-[#757E96] tabular-nums mt-0.5">
                        {templates.page2DataUrl
                          ? `Resolusi aktif: ${templates.page2Width} × ${templates.page2Height} px`
                          : 'Belum ada gambar halaman 2'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {templates.page2DataUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          onChangeTemplates({
                            ...templates,
                            page2DataUrl: null,
                            page2Width: 0,
                            page2Height: 0,
                          });
                          onChangeOverlays(
                            overlays.map((o) => (o.page === 2 ? { ...o, page: 1 } : o))
                          );
                        }}
                        className="p-2 rounded-full text-[#757E96] hover:bg-[#FDE8EE] hover:text-[#B83B5E] transition-colors"
                        title="Hapus Halaman 2"
                      >
                        <BrandIcon name="action-trash" className="w-4 h-4" />
                      </button>
                    )}
                    <input
                      ref={page2InputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => handleUploadPage(2, e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      onClick={() => page2InputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold bg-white border border-[#DDEEF3] text-[#1B1B4B] hover:bg-[#E3F5FA] transition-colors whitespace-nowrap"
                    >
                      <BrandIcon name="action-upload" className="w-4 h-4 text-[#1F9B96]" />
                      <span>Pilih Gambar Hal 2</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSectionTab('mapper')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-bold text-[#1B1B4B] bg-[#F9DE6C] hover:bg-[#F3D34F] transition-colors shadow-xs"
              >
                <BrandIcon name="action-edit-design" className="w-4 h-4 text-[#1B1B4B]" />
                <span>Atur Tata Letak</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );
};
