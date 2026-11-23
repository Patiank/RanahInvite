import React, { useRef, useState } from 'react';
import {
  Calendar,
  Clock,
  FileImage,
  ImagePlus,
  MapPin,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  EventMetadata,
  OverlayBlock,
  Recipient,
  TemplateImages,
} from '../types';
import { VisualCoordinateMapper } from './VisualCoordinateMapper';
import { AnalogClockTimePicker, CalendarDatePicker } from './DateTimePickers';

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
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <h2 className="font-display font-bold text-[20px] text-[#111827]">
          Desain & Tata Letak
        </h2>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
          <button
            type="button"
            onClick={() => setSectionTab('mapper')}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
              sectionTab === 'mapper'
                ? 'bg-white text-[#111827] shadow-xs'
                : 'text-slate-600 hover:text-[#111827]'
            }`}
          >
            Editor Tata Letak
          </button>
          <button
            type="button"
            onClick={() => setSectionTab('upload')}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
              sectionTab === 'upload'
                ? 'bg-white text-[#111827] shadow-xs'
                : 'text-slate-600 hover:text-[#111827]'
            }`}
          >
            Info Acara & Gambar
          </button>
        </div>
      </div>

      {sectionTab === 'upload' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Event Metadata Form */}
          <div className="lg:col-span-6 rounded-2xl border border-slate-200/80 bg-white p-5 space-y-4">
            <h3 className="font-display font-semibold text-[15px] text-[#111827]">
              Info Acara
            </h3>

            <div className="space-y-3.5">
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">
                  Nama Acara / Kegiatan
                </label>
                <input
                  type="text"
                  value={metadata.eventName}
                  onChange={(e) =>
                    onChangeMetadata({ ...metadata, eventName: e.target.value })
                  }
                  placeholder="Contoh: Festival Pesona Minangkabau 2026"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">
                  Instansi Penyelenggara
                </label>
                <input
                  type="text"
                  value={metadata.organizer}
                  onChange={(e) =>
                    onChangeMetadata({ ...metadata, organizer: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
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
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700 mb-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
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
                <label className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>Lokasi Pelaksanaan</span>
                </label>
                <input
                  type="text"
                  value={metadata.location}
                  onChange={(e) =>
                    onChangeMetadata({ ...metadata, location: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                />
              </div>
            </div>
          </div>

          {/* Image Template Uploader (1 or 2 pages) */}
          <div className="lg:col-span-6 rounded-2xl border border-slate-200/80 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display font-semibold text-[15px] text-[#111827]">
                Gambar Undangan
              </h3>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    onChangeTemplates({ ...templates, pageCount: 1 });
                    onChangeOverlays(
                      overlays.map((o) => (o.page === 2 ? { ...o, page: 1 } : o))
                    );
                  }}
                  className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors ${
                    templates.pageCount === 1
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-slate-600'
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
                  className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors ${
                    templates.pageCount === 2
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  2 Halaman
                </button>
              </div>
            </div>

            {uploadError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-[12px] text-red-700">
                {uploadError}
              </div>
            )}

            {/* Page 1 Uploader */}
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={templates.page1DataUrl}
                    alt="Thumbnail Halaman 1"
                    className="w-14 h-20 object-cover rounded-lg border border-slate-200 bg-white shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[#111827]">
                      Halaman 1 · Sampul & Tujuan Undangan
                    </div>
                    <div className="text-[12px] text-slate-500 tabular-nums mt-0.5">
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
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-semibold text-white transition-colors hover:brightness-95 whitespace-nowrap"
                    style={{ backgroundColor: 'var(--bg-sidebar)' }}
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>Pilih Gambar Hal 1</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Page 2 Uploader */}
            {templates.pageCount === 2 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {templates.page2DataUrl ? (
                      <img
                        src={templates.page2DataUrl}
                        alt="Thumbnail Halaman 2"
                        className="w-14 h-20 object-cover rounded-lg border border-slate-200 bg-white shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-20 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 shrink-0">
                        <FileImage className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[#111827]">
                        Halaman 2 · Susunan Acara (Opsional)
                      </div>
                      <div className="text-[12px] text-slate-500 tabular-nums mt-0.5">
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
                        className="p-2 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Hapus Halaman 2"
                      >
                        <Trash2 className="w-4 h-4" />
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
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-semibold bg-white border border-slate-200 text-[#111827] hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      <ImagePlus className="w-4 h-4 text-[#158A85]" />
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
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-[#111827] transition-all hover:brightness-95"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <Sparkles className="w-4 h-4" />
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
