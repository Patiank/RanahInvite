import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BookmarkCheck,
  Check,
  Copy,
  Eye,
  EyeOff,
  Italic,
  Lock,
  MessageSquareText,
  Minus,
  Move,
  Pipette,
  Plus,
  QrCode,
  RotateCcw,
  Trash2,
  Type,
  Unlock,
} from 'lucide-react';
import {
  EventMetadata,
  OverlayBlock,
  OverlayFieldKey,
  OverlayFontFamily,
  Recipient,
  TemplateImages,
  TextAlign,
} from '../types';
import {
  computeBrowserWrappedLines,
  getBrowserCssFontFamily,
  getPdfReferenceWidth,
  isCustomTextField,
  resolveFieldText,
} from '../utils/pdfEngine';
import { buildRsvpUrl } from '../utils/rsvp';
import {
  RecipientPickerDropdown,
  SAMPLE_PREVIEW_RECIPIENT,
} from './RecipientPickerDropdown';

interface VisualCoordinateMapperProps {
  eventId: string;
  metadata: EventMetadata;
  templates: TemplateImages;
  overlays: OverlayBlock[];
  onChangeOverlays: (next: OverlayBlock[]) => void;
  recipients: Recipient[];
  previewRecipientId: string;
  onSelectPreviewRecipient: (id: string) => void;
  onResetOverlays: () => void;
  onSaveAsDefault?: () => void | Promise<void>;
  onClearCustomDefault?: () => void | Promise<void>;
  onCopyDefaultJson?: () => void | Promise<void>;
  hasCustomDefault?: boolean;
  customDefaultSavedAt?: number | null;
  onOpenFullPreview?: (recipient: Recipient, page: 1 | 2) => void;
}

const FONT_OPTIONS: { value: OverlayFontFamily; label: string; group: string }[] = [
  { value: 'Playfair Display', label: 'Playfair Display', group: 'Resmi / Seremonial' },
  { value: 'Fraunces', label: 'Fraunces', group: 'Resmi / Seremonial' },
  { value: 'Syne', label: 'Syne', group: 'Festival / Kreatif' },
  { value: 'Outfit', label: 'Outfit', group: 'Festival / Kreatif' },
  { value: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans', group: 'Modern Studio' },
  { value: 'DM Sans', label: 'DM Sans', group: 'Modern Studio' },
];

const QUICK_SWATCHES = [
  '#111827',
  '#158A85',
  '#D4A338',
  '#FFFFFF',
  '#4B5563',
  '#B91C1C',
];

const QR_INSTRUCTION_PRESETS: { title: string; text: string }[] = [
  {
    title: 'Scan QR',
    text: 'Mohon pindai QR Code untuk\nkonfirmasi kehadiran Anda',
  },
  {
    title: 'Scan Barcode',
    text: 'Silakan scan barcode berikut\nuntuk konfirmasi kehadiran (RSVP)',
  },
  {
    title: 'Singkat',
    text: 'Scan QR di atas untuk konfirmasi kehadiran',
  },
];

function getCleanBlockLabel(block: OverlayBlock): string {
  return block.label.replace(/\s*\(\{\{[^}]+\}\}\)\s*$/g, '').trim() || block.id;
}

function getCssFontFamily(family: OverlayFontFamily): string {
  return getBrowserCssFontFamily(family);
}

interface NumericInputProps {
  resetKey?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (nextValue: number) => void;
  className?: string;
  ariaLabel?: string;
}

const NumericInput: React.FC<NumericInputProps> = ({
  resetKey,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onChange,
  className,
  ariaLabel,
}) => {
  const [draft, setDraft] = useState<string>(String(value));
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    setIsFocused(false);
    setDraft(String(value));
  }, [resetKey]);

  useEffect(() => {
    if (!isFocused) {
      setDraft(String(value));
    }
  }, [value, isFocused]);

  const commitDraft = () => {
    const normalized = draft.replace(',', '.').trim();
    const parsed = Number(normalized);
    if (normalized === '' || !Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, parsed));
    const rounded = step < 1 ? Math.round(clamped * 10) / 10 : Math.round(clamped);
    setDraft(String(rounded));
    if (rounded !== value) {
      onChange(rounded);
    }
  };

  return (
    <input
      type="number"
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={isFocused ? draft : String(value)}
      onFocus={() => {
        if (disabled) return;
        setDraft(String(value));
        setIsFocused(true);
      }}
      onChange={(e) => {
        if (disabled) return;
        const raw = e.target.value;
        setDraft(raw);
        const normalized = raw.replace(',', '.').trim();
        if (normalized === '' || normalized.endsWith('.')) return;
        const parsed = Number(normalized);
        if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
          onChange(parsed);
        }
      }}
      onBlur={() => {
        setIsFocused(false);
        commitDraft();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
};

export const VisualCoordinateMapper: React.FC<VisualCoordinateMapperProps> = ({
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
}) => {
  const [activePage, setActivePage] = useState<1 | 2>(1);
  const [justSavedDefault, setJustSavedDefault] = useState(false);
  const [justCopiedJson, setJustCopiedJson] = useState(false);
  const [confirmClearDefault, setConfirmClearDefault] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<OverlayFieldKey>('recipient_name');
  const [stageWidth, setStageWidth] = useState<number>(560);
  const [eyedropperActive, setEyedropperActive] = useState<boolean>(false);
  const [eyedropperHover, setEyedropperHover] = useState<{
    x: number;
    y: number;
    hex: string;
  } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [guides, setGuides] = useState<{ v: number | null; h: number | null }>({
    v: null,
    h: null,
  });

  const stageRef = useRef<HTMLDivElement | null>(null);
  const samplerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStateRef = useRef<{
    blockId: OverlayFieldKey;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const hasPage2 = templates.pageCount === 2 && Boolean(templates.page2DataUrl);
  const effectivePage: 1 | 2 = activePage === 2 && hasPage2 ? 2 : 1;

  const activeImageUrl =
    effectivePage === 2 && templates.page2DataUrl
      ? templates.page2DataUrl
      : templates.page1DataUrl;
  const activeImgW =
    effectivePage === 2 && templates.page2Width > 0
      ? templates.page2Width
      : templates.page1Width || 1240;
  const activeImgH =
    effectivePage === 2 && templates.page2Height > 0
      ? templates.page2Height
      : templates.page1Height || 1754;

  const previewRecipient = useMemo(
    () =>
      recipients.find((r) => r.id === previewRecipientId) ??
      recipients[0] ??
      SAMPLE_PREVIEW_RECIPIENT,
    [recipients, previewRecipientId]
  );

  // Measure canvas stage width immediately and on resize for 1:1 proportional font sizing vs pdf-lib
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const initialW = el.getBoundingClientRect().width;
    if (initialW > 0) {
      setStageWidth(initialW);
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setStageWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeImgW, activeImgH, effectivePage]);

  // Load current page image into hidden offscreen canvas for eyedropper sampling
  useEffect(() => {
    if (!activeImageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || activeImgW;
      c.height = img.naturalHeight || activeImgH;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        samplerCanvasRef.current = c;
      }
    };
    img.src = activeImageUrl;
  }, [activeImageUrl, activeImgW, activeImgH]);

  // Generate QR preview data URL for selected recipient (scannable RSVP URL)
  useEffect(() => {
    let cancelled = false;
    const rsvpUrl = buildRsvpUrl(eventId, metadata, previewRecipient);
    QRCode.toDataURL(rsvpUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#111827', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId, previewRecipient, metadata]);

  const refPdfWidth = getPdfReferenceWidth(activeImgW, activeImgH);
  const scaleRatio = stageWidth / refPdfWidth;

  const selectedBlock =
    overlays.find((b) => b.id === selectedBlockId) ?? overlays[0];

  const updateBlock = (id: OverlayFieldKey, patch: Partial<OverlayBlock>) => {
    onChangeOverlays(
      overlays.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleAddCustomTextBlock = () => {
    const existingCustomCount = overlays.filter((o) =>
      o.id.startsWith('custom_text_')
    ).length;
    const nextNum = existingCustomCount + 1;
    const newId: OverlayFieldKey = `custom_text_${Date.now()}`;
    const newBlock: OverlayBlock = {
      id: newId,
      label: `Teks Tambahan ${nextNum}`,
      placeholder: 'Silakan pindai QR Code untuk konfirmasi kehadiran Anda.',
      page: effectivePage,
      visible: true,
      locked: false,
      x: 50,
      y: 84,
      width: 48,
      fontFamily: 'DM Sans',
      fontSize: 10,
      fontWeight: 600,
      italic: false,
      align: 'center',
      color: '#1F2937',
    };
    onChangeOverlays([...overlays, newBlock]);
    setSelectedBlockId(newId);
  };

  const handleDeleteCustomTextBlock = (id: OverlayFieldKey) => {
    const next = overlays.filter((o) => o.id !== id);
    onChangeOverlays(next);
    if (selectedBlockId === id && next[0]) {
      setSelectedBlockId(next[0].id);
    }
  };

  const handleSelectBlock = (block: OverlayBlock) => {
    const prevWindowY = window.scrollY;
    const scrollParent = stageRef.current?.closest('.overflow-y-auto') as HTMLElement | null;
    const prevParentY = scrollParent ? scrollParent.scrollTop : 0;

    setSelectedBlockId(block.id);
    if (block.page !== effectivePage && hasPage2) {
      setActivePage(block.page);
    }

    requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - prevWindowY) > 1) {
        window.scrollTo({ top: prevWindowY, behavior: 'instant' as ScrollBehavior });
      }
      if (scrollParent && Math.abs(scrollParent.scrollTop - prevParentY) > 1) {
        scrollParent.scrollTop = prevParentY;
      }
    });
  };

  const samplePixelHex = (clientX: number, clientY: number): string | null => {
    const stage = stageRef.current;
    const sampler = samplerCanvasRef.current;
    if (!stage || !sampler) return null;
    const rect = stage.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const px = Math.min(sampler.width - 1, Math.floor(relX * sampler.width));
    const py = Math.min(sampler.height - 1, Math.floor(relY * sampler.height));
    const ctx = sampler.getContext('2d');
    if (!ctx) return null;
    const [r, g, b] = ctx.getImageData(px, py, 1, 1).data;
    return (
      '#' +
      [r, g, b]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    );
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (eyedropperActive && stageRef.current) {
      const rect = stageRef.current.getBoundingClientRect();
      const hex = samplePixelHex(e.clientX, e.clientY);
      if (hex) {
        setEyedropperHover({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          hex,
        });
      }
      return;
    }

    const drag = dragStateRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;

    const rect = stage.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;

    let nextX = Math.max(3, Math.min(97, drag.startX + dxPct));
    let nextY = Math.max(3, Math.min(97, drag.startY + dyPct));

    // Smart alignment snapping (center & sibling blocks)
    const snapThreshold = 1.2;
    let guideV: number | null = null;
    let guideH: number | null = null;

    const otherBlocks = overlays.filter(
      (b) => b.id !== drag.blockId && b.visible && b.page === effectivePage
    );

    if (Math.abs(nextX - 50) <= snapThreshold) {
      nextX = 50;
      guideV = 50;
    } else {
      for (const other of otherBlocks) {
        if (Math.abs(nextX - other.x) <= snapThreshold) {
          nextX = other.x;
          guideV = other.x;
          break;
        }
      }
    }

    if (Math.abs(nextY - 50) <= snapThreshold) {
      nextY = 50;
      guideH = 50;
    } else {
      for (const other of otherBlocks) {
        if (Math.abs(nextY - other.y) <= snapThreshold) {
          nextY = other.y;
          guideH = other.y;
          break;
        }
      }
    }

    setGuides({ v: guideV, h: guideH });
    updateBlock(drag.blockId, {
      x: Math.round(nextX * 10) / 10,
      y: Math.round(nextY * 10) / 10,
    });
  };

  const handleStagePointerUp = () => {
    dragStateRef.current = null;
    setGuides({ v: null, h: null });
  };

  const handleStageClickForEyedropper = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!eyedropperActive) return;
    const hex = samplePixelHex(e.clientX, e.clientY);
    if (hex && selectedBlock) {
      updateBlock(selectedBlock.id, { color: hex });
    }
    setEyedropperActive(false);
    setEyedropperHover(null);
  };

  const visibleOnCurrentPage = overlays.filter(
    (b) => b.visible && (hasPage2 ? b.page : 1) === effectivePage
  );

  return (
    <div
      className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
      style={{ overflowAnchor: 'none' }}
    >
      {/* Left/Center: Interactive Canvas Stage (Sticky on desktop so canvas stays steady) */}
      <div className="xl:col-span-7 flex flex-col gap-3 xl:sticky xl:top-4">
        {/* Canvas Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white border border-slate-200">
              <button
                type="button"
                onClick={() => setActivePage(1)}
                className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors whitespace-nowrap ${
                  effectivePage === 1
                    ? 'bg-[#158A85] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hal 1
              </button>
              {templates.pageCount === 2 && templates.page2DataUrl && (
                <button
                  type="button"
                  onClick={() => setActivePage(2)}
                  className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors whitespace-nowrap ${
                    effectivePage === 2
                      ? 'bg-[#158A85] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Hal 2
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-600 whitespace-nowrap">
              Pratinjau:
            </span>
            <RecipientPickerDropdown
              recipients={recipients}
              selectedRecipient={previewRecipient}
              onSelect={(rec) => onSelectPreviewRecipient(rec.id)}
              align="right"
              maxWidthClass="max-w-[205px] min-w-[160px]"
              ariaLabel="Pilih penerima untuk pratinjau kanvas"
            />
            {onOpenFullPreview && (
              <button
                type="button"
                onClick={() => onOpenFullPreview(previewRecipient, effectivePage)}
                title="Full Preview Hasil Edit"
                aria-label="Full Preview Hasil Edit"
                className="p-2 rounded-lg border border-slate-200 bg-white text-[#158A85] hover:bg-[#E6F4F8] hover:border-[#158A85]/40 transition-colors shrink-0"
              >
                <Eye className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Canvas Frame */}
        <div className="rounded-2xl border border-slate-200/90 bg-slate-100/80 p-4 sm:p-6 flex justify-center">
          <div
            ref={stageRef}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerUp}
            onPointerLeave={() => {
              handleStagePointerUp();
              setEyedropperHover(null);
            }}
            onClick={handleStageClickForEyedropper}
            className={`relative w-full max-w-[600px] shadow-md rounded-lg overflow-hidden select-none bg-white ${
              eyedropperActive ? 'cursor-crosshair' : ''
            }`}
            style={{
              aspectRatio: `${activeImgW} / ${activeImgH}`,
            }}
          >
            <img
              src={activeImageUrl}
              alt="Pratinjau Desain Undangan"
              referrerPolicy="no-referrer"
              draggable={false}
              className="w-full h-full object-contain block pointer-events-none"
            />

            {/* Smart Alignment Guides */}
            {guides.v !== null && (
              <div
                className="absolute top-0 bottom-0 w-px border-l border-dashed border-[#158A85] pointer-events-none z-30"
                style={{ left: `${guides.v}%` }}
              />
            )}
            {guides.h !== null && (
              <div
                className="absolute left-0 right-0 h-px border-t border-dashed border-[#D4A338] pointer-events-none z-30"
                style={{ top: `${guides.h}%` }}
              />
            )}

            {/* Interactive Overlay Blocks */}
            {visibleOnCurrentPage.map((block) => {
              const isSelected = selectedBlock?.id === block.id && !eyedropperActive;
              const translateX =
                block.id === 'qr_code'
                  ? '-50%'
                  : block.align === 'center'
                    ? '-50%'
                    : block.align === 'right'
                      ? '-100%'
                      : '0%';

              const resolvedText = resolveFieldText(
                block.id,
                previewRecipient,
                block.placeholder
              );
              const isEmptyCustom = isCustomTextField(block.id) && !resolvedText.trim();
              const textValue = isEmptyCustom
                ? '(Ketik teks informasi...)'
                : resolvedText || block.placeholder;
              const maxWidthPx = (stageWidth * block.width) / 100;
              const isInstitution = block.id === 'institution';
              const fitted =
                block.id === 'qr_code'
                  ? { lines: [] as string[], scaledFontSizePx: 12 }
                  : computeBrowserWrappedLines(
                      textValue,
                      block.fontFamily,
                      block.fontWeight,
                      block.italic,
                      block.fontSize,
                      scaleRatio,
                      maxWidthPx,
                      isInstitution
                    );

              return (
                <div
                  key={block.id}
                  onPointerDown={(e) => {
                    if (eyedropperActive) return;
                    e.stopPropagation();
                    setSelectedBlockId(block.id);
                    if (block.locked) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragStateRef.current = {
                      blockId: block.id,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      startX: block.x,
                      startY: block.y,
                    };
                  }}
                  style={{
                    left: `${block.x}%`,
                    top: `${block.y}%`,
                    width: `${block.width}%`,
                    transform: `translate(${translateX}, -50%)`,
                  }}
                  className={`absolute z-20 transition-shadow ${
                    eyedropperActive
                      ? 'pointer-events-none'
                      : block.locked
                        ? 'cursor-default'
                        : 'cursor-grab active:cursor-grabbing'
                  } ${
                    isSelected
                      ? block.locked
                        ? 'ring-2 ring-amber-500 ring-offset-2 rounded-md bg-amber-500/5'
                        : 'ring-2 ring-[#158A85] ring-offset-2 rounded-md bg-[#158A85]/5'
                      : 'hover:ring-1 hover:ring-[#D4A338]/70 rounded-md'
                  }`}
                >
                  {block.id === 'qr_code' ? (
                    <div className="w-full aspect-square bg-white p-1 rounded-xs shadow-xs border border-slate-200/80">
                      {qrDataUrl ? (
                        <img
                          src={qrDataUrl}
                          alt="QR Code Verifikasi"
                          draggable={false}
                          className="w-full h-full object-contain block pointer-events-none"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <QrCode className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`flex flex-col ${
                        block.align === 'center'
                          ? 'items-center'
                          : block.align === 'right'
                            ? 'items-end'
                            : 'items-start'
                      }`}
                      style={{
                        fontFamily: getCssFontFamily(block.fontFamily),
                        fontSize: `${fitted.scaledFontSizePx}px`,
                        fontWeight: block.fontWeight,
                        fontStyle: block.italic ? 'italic' : 'normal',
                        textAlign: block.align,
                        color: block.color,
                        lineHeight: 1.28,
                      }}
                    >
                      {fitted.lines.map((line, lineIdx) => (
                        <div key={lineIdx} className="whitespace-nowrap">
                          {line || '\u00A0'}
                        </div>
                      ))}
                    </div>
                  )}

                  {isSelected && (
                    <div
                      className={`absolute -top-5 left-0 px-1.5 py-0.5 rounded-xs text-white text-[10px] font-medium whitespace-nowrap flex items-center gap-1 pointer-events-none ${
                        block.locked ? 'bg-amber-600' : 'bg-[#158A85]'
                      }`}
                    >
                      {block.locked ? (
                        <Lock className="w-2.5 h-2.5" />
                      ) : (
                        <Move className="w-2.5 h-2.5" />
                      )}
                      <span>
                        {block.id === 'rsvp_note'
                          ? block.locked
                            ? 'info_teks · Terkunci'
                            : 'info_teks'
                          : block.id.startsWith('custom_text_')
                            ? block.locked
                              ? 'teks_kustom · Terkunci'
                              : 'teks_kustom'
                            : block.locked
                              ? `${block.id} · Terkunci`
                              : block.id}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Eyedropper Floating Color Loupe */}
            {eyedropperActive && eyedropperHover && (
              <div
                className="absolute z-40 pointer-events-none flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#111827] text-white text-[11px] font-mono shadow-lg"
                style={{
                  left: Math.min(stageWidth - 110, eyedropperHover.x + 14),
                  top: Math.max(8, eyedropperHover.y - 34),
                }}
              >
                <span
                  className="w-3.5 h-3.5 rounded-xs border border-white/40"
                  style={{ backgroundColor: eyedropperHover.hex }}
                />
                <span>{eyedropperHover.hex}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Variable Layer List & Visual Inspector */}
      <div className="xl:col-span-5 flex flex-col gap-4" style={{ overflowAnchor: 'none' }}>
        {/* Layer List */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h4 className="font-display font-semibold text-[14px] text-[#111827]">
              Blok Variabel
            </h4>
            <div className="flex flex-wrap items-center gap-1.5">
              {(() => {
                const allLocked =
                  overlays.length > 0 && overlays.every((b) => Boolean(b.locked));
                return (
                  <button
                    type="button"
                    onClick={() =>
                      onChangeOverlays(
                        overlays.map((b) => ({ ...b, locked: !allLocked }))
                      )
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-colors whitespace-nowrap ${
                      allLocked
                        ? 'bg-amber-100 text-amber-800 hover:bg-amber-200/70'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                    }`}
                  >
                    {allLocked ? (
                      <Unlock className="w-3.5 h-3.5" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                    <span>{allLocked ? 'Buka' : 'Kunci'}</span>
                  </button>
                );
              })()}

              {onSaveAsDefault && (
                <button
                  type="button"
                  onClick={async () => {
                    await onSaveAsDefault();
                    setJustSavedDefault(true);
                    setConfirmClearDefault(false);
                    setTimeout(() => setJustSavedDefault(false), 2200);
                  }}
                  title="Simpan kondisi & pengaturan saat ini sebagai Default Sistem"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-colors whitespace-nowrap ${
                    justSavedDefault
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#E6F4F8] text-[#158A85] hover:bg-[#d3ecf3]'
                  }`}
                >
                  <BookmarkCheck className="w-3.5 h-3.5" />
                  <span>{justSavedDefault ? 'Tersimpan!' : 'Simpan Default'}</span>
                </button>
              )}

              {onCopyDefaultJson && (
                <button
                  type="button"
                  onClick={async () => {
                    await onCopyDefaultJson();
                    setJustCopiedJson(true);
                    setTimeout(() => setJustCopiedJson(false), 2000);
                  }}
                  title="Salin JSON pengaturan saat ini"
                  aria-label="Salin JSON pengaturan saat ini"
                  className={`inline-flex items-center justify-center p-1.5 rounded-lg transition-colors ${
                    justCopiedJson
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-[#111827]'
                  }`}
                >
                  {justCopiedJson ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleAddCustomTextBlock}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-semibold bg-[#158A85] text-white hover:bg-[#0F6E6A] transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Teks</span>
              </button>

              <button
                type="button"
                onClick={onResetOverlays}
                title="Reset Posisi"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-medium text-slate-600 hover:text-[#158A85] hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {hasCustomDefault && (
            <div className="mb-2.5 px-2.5 py-1.5 rounded-lg bg-emerald-50/70 border border-emerald-200/70 flex items-center justify-between gap-2 text-[11px] text-emerald-800">
              <span className="inline-flex items-center gap-1.5 truncate">
                <BookmarkCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="font-medium truncate">
                  Default aktif
                  {customDefaultSavedAt
                    ? ` · ${new Date(customDefaultSavedAt).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : ''}
                </span>
              </span>
              {onClearCustomDefault && (
                confirmClearDefault ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmClearDefault(false)}
                      className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 font-medium"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await onClearCustomDefault();
                        setConfirmClearDefault(false);
                      }}
                      className="px-2 py-0.5 rounded bg-red-600 text-white font-semibold"
                    >
                      Hapus
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearDefault(true)}
                    className="text-emerald-700 hover:text-red-600 underline font-medium shrink-0"
                  >
                    Hapus
                  </button>
                )
              )}
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {overlays.map((block) => {
              const isSelected = selectedBlock?.id === block.id;
              return (
                <div
                  key={block.id}
                  onClick={() => handleSelectBlock(block)}
                  className={`flex items-center justify-between gap-2 py-2 px-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#E6F4F8]/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {block.id === 'qr_code' ? (
                      <QrCode className="w-4 h-4 text-[#158A85] shrink-0" />
                    ) : isCustomTextField(block.id) ? (
                      <MessageSquareText className="w-4 h-4 text-[#158A85] shrink-0" />
                    ) : (
                      <Type className="w-4 h-4 text-[#158A85] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[#111827] truncate">
                        {getCleanBlockLabel(block)}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums truncate">
                        Hal {hasPage2 ? block.page : 1} · X {block.x.toFixed(1)}% · Y {block.y.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {block.id.startsWith('custom_text_') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCustomTextBlock(block.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Hapus"
                        aria-label={`Hapus ${getCleanBlockLabel(block)}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateBlock(block.id, { locked: !block.locked });
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        block.locked
                          ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                      }`}
                      title={block.locked ? 'Buka kunci' : 'Kunci posisi'}
                      aria-label={block.locked ? `Buka kunci ${block.id}` : `Kunci ${block.id}`}
                    >
                      {block.locked ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Unlock className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateBlock(block.id, { visible: !block.visible });
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        block.visible
                          ? 'text-[#158A85] hover:bg-[#158A85]/10'
                          : 'text-slate-400 hover:bg-slate-100'
                      }`}
                      title={block.visible ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {block.visible ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Block Inspector — Fixed minimum height prevents page height jump when switching blocks */}
        {selectedBlock && (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3.5 min-h-[580px]">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <h4 className="font-display font-semibold text-[14px] text-[#111827] truncate">
                {getCleanBlockLabel(selectedBlock)}
              </h4>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    updateBlock(selectedBlock.id, { locked: !selectedBlock.locked })
                  }
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    selectedBlock.locked
                      ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {selectedBlock.locked ? (
                    <>
                      <Lock className="w-3 h-3" />
                      <span>Terkunci</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3 h-3" />
                      <span>Bebas</span>
                    </>
                  )}
                </button>
                {templates.pageCount === 2 && templates.page2DataUrl && (
                  <select
                    aria-label="Pilih Halaman Blok"
                    disabled={Boolean(selectedBlock.locked)}
                    value={selectedBlock.page}
                    onChange={(e) => {
                      const nextPage = Number(e.target.value) as 1 | 2;
                      updateBlock(selectedBlock.id, { page: nextPage });
                      setActivePage(nextPage);
                    }}
                    className={`rounded-lg border border-slate-200 px-2 py-1 text-[12px] font-medium ${
                      selectedBlock.locked
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'text-[#111827]'
                    }`}
                  >
                    <option value={1}>Hal 1</option>
                    <option value={2}>Hal 2</option>
                  </select>
                )}
              </div>
            </div>

            {/* Coordinates X & Y (kept in consistent top slot across all blocks) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-slate-600 mb-1">
                  Posisi X (%)
                </label>
                <NumericInput
                  resetKey={selectedBlock.id}
                  ariaLabel="Posisi X (%)"
                  min={0}
                  max={100}
                  step={0.5}
                  disabled={Boolean(selectedBlock.locked)}
                  value={selectedBlock.x}
                  onChange={(next) => updateBlock(selectedBlock.id, { x: next })}
                  className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#158A85] ${
                    selectedBlock.locked
                      ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
                      : 'text-[#111827]'
                  }`}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-slate-600 mb-1">
                  Posisi Y (%)
                </label>
                <NumericInput
                  resetKey={selectedBlock.id}
                  ariaLabel="Posisi Y (%)"
                  min={0}
                  max={100}
                  step={0.5}
                  disabled={Boolean(selectedBlock.locked)}
                  value={selectedBlock.y}
                  onChange={(next) => updateBlock(selectedBlock.id, { y: next })}
                  className={`w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#158A85] ${
                    selectedBlock.locked
                      ? 'bg-slate-100 text-slate-500 cursor-not-allowed'
                      : 'text-[#111827]'
                  }`}
                />
              </div>
            </div>

            {selectedBlock.id === 'qr_code' ? (
              <div>
                <div className="flex items-center justify-between text-[12px] font-medium text-slate-600 mb-1.5">
                  <span>Ukuran QR (%)</span>
                  <span className="tabular-nums text-[#111827]">{selectedBlock.width}%</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={28}
                  step={0.5}
                  value={selectedBlock.width}
                  onChange={(e) =>
                    updateBlock(selectedBlock.id, { width: Number(e.target.value) })
                  }
                  className="w-full accent-[#158A85]"
                />
              </div>
            ) : (
              <>
                {isCustomTextField(selectedBlock.id) && (
                  <div className="space-y-2">
                    {selectedBlock.id.startsWith('custom_text_') && (
                      <input
                        type="text"
                        aria-label="Nama Blok"
                        value={selectedBlock.label}
                        onChange={(e) =>
                          updateBlock(selectedBlock.id, { label: e.target.value })
                        }
                        placeholder="Nama blok..."
                        className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                      />
                    )}
                    <div>
                      <label className="block text-[12px] font-medium text-slate-600 mb-1">
                        Teks Informasi
                      </label>
                      <textarea
                        rows={2}
                        value={selectedBlock.placeholder}
                        onChange={(e) =>
                          updateBlock(selectedBlock.id, { placeholder: e.target.value })
                        }
                        placeholder="Ketik teks informasi..."
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] text-[#111827] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#158A85] resize-none"
                      />
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {QR_INSTRUCTION_PRESETS.map((preset) => (
                          <button
                            key={preset.title}
                            type="button"
                            onClick={() =>
                              updateBlock(selectedBlock.id, { placeholder: preset.text })
                            }
                            className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-600 hover:bg-[#E6F4F8] hover:text-[#158A85] transition-colors"
                          >
                            {preset.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {selectedBlock.id === 'place_label' && (
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 mb-1">
                      Teks Tempat
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.placeholder}
                      onChange={(e) =>
                        updateBlock(selectedBlock.id, { placeholder: e.target.value })
                      }
                      placeholder="di tempat"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                    />
                  </div>
                )}

                {/* Font Family */}
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 mb-1">
                    Jenis Huruf
                  </label>
                  <select
                    value={selectedBlock.fontFamily}
                    onChange={(e) =>
                      updateBlock(selectedBlock.id, {
                        fontFamily: e.target.value as OverlayFontFamily,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                  >
                    {FONT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Font Size & Width */}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-medium text-slate-600 mb-1">
                        Ukuran (pt)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateBlock(selectedBlock.id, {
                              fontSize: Math.max(4, Math.round((Number(selectedBlock.fontSize) || 14) - 1)),
                            })
                          }
                          aria-label="Perkecil ukuran teks"
                          className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-[#158A85] transition-colors shrink-0"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <NumericInput
                          resetKey={selectedBlock.id}
                          ariaLabel="Ukuran (pt)"
                          min={4}
                          max={96}
                          step={1}
                          value={Number(selectedBlock.fontSize) || 14}
                          onChange={(next) => updateBlock(selectedBlock.id, { fontSize: next })}
                          className="w-full min-w-0 text-center rounded-xl border border-slate-200 px-2 py-2 text-[13px] font-semibold tabular-nums text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateBlock(selectedBlock.id, {
                              fontSize: Math.min(96, Math.round((Number(selectedBlock.fontSize) || 14) + 1)),
                            })
                          }
                          aria-label="Perbesar ukuran teks"
                          className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-[#158A85] transition-colors shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-slate-600 mb-1">
                        Lebar (%)
                      </label>
                      <NumericInput
                        resetKey={selectedBlock.id}
                        ariaLabel="Lebar (%)"
                        min={10}
                        max={98}
                        step={1}
                        value={Number(selectedBlock.width) || 60}
                        onChange={(next) => updateBlock(selectedBlock.id, { width: next })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] tabular-nums text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                      />
                    </div>
                  </div>

                  {/* Quick Visual Font Size Slider */}
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">4</span>
                    <input
                      type="range"
                      aria-label="Geser ukuran teks"
                      min={4}
                      max={72}
                      step={1}
                      value={Math.min(72, Math.max(4, Number(selectedBlock.fontSize) || 14))}
                      onChange={(e) =>
                        updateBlock(selectedBlock.id, { fontSize: Number(e.target.value) })
                      }
                      className="w-full accent-[#158A85] cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">72</span>
                  </div>
                </div>

                {/* Weight, Italic, Alignment */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
                    {([400, 600, 700] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => updateBlock(selectedBlock.id, { fontWeight: w })}
                        className={`px-2.5 py-1 rounded-lg text-[12px] transition-colors ${
                          selectedBlock.fontWeight === w
                            ? 'bg-white text-[#111827] font-semibold shadow-xs'
                            : 'text-slate-600 hover:text-[#111827]'
                        }`}
                      >
                        {w === 400 ? 'Reg' : w === 600 ? 'Semi' : 'Bold'}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        updateBlock(selectedBlock.id, { italic: !selectedBlock.italic })
                      }
                      className={`p-1.5 rounded-lg transition-colors ${
                        selectedBlock.italic
                          ? 'bg-white text-[#158A85] shadow-xs'
                          : 'text-slate-600 hover:text-[#111827]'
                      }`}
                      title="Miring"
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
                    {(
                      [
                        { id: 'left', icon: AlignLeft, label: 'Rata Kiri' },
                        { id: 'center', icon: AlignCenter, label: 'Rata Tengah' },
                        { id: 'right', icon: AlignRight, label: 'Rata Kanan' },
                      ] as { id: TextAlign; icon: React.ComponentType<{ className?: string }>; label: string }[]
                    ).map((item) => {
                      const AlignIcon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => updateBlock(selectedBlock.id, { align: item.id })}
                          title={item.label}
                          className={`p-1.5 rounded-lg transition-colors ${
                            selectedBlock.align === item.id
                              ? 'bg-white text-[#158A85] shadow-xs'
                              : 'text-slate-600 hover:text-[#111827]'
                          }`}
                        >
                          <AlignIcon className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color Picker + Eyedropper */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[12px] font-medium text-slate-600">
                      Warna
                    </label>
                    <button
                      type="button"
                      onClick={() => setEyedropperActive((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors ${
                        eyedropperActive
                          ? 'bg-[#F6D458] text-[#111827]'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Pipette className="w-3.5 h-3.5" />
                      <span>{eyedropperActive ? 'Klik Gambar...' : 'Pipet Warna'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedBlock.color}
                      onChange={(e) =>
                        updateBlock(selectedBlock.id, { color: e.target.value.toUpperCase() })
                      }
                      className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white"
                    />
                    <input
                      type="text"
                      value={selectedBlock.color}
                      onChange={(e) =>
                        updateBlock(selectedBlock.id, { color: e.target.value })
                      }
                      className="w-28 rounded-xl border border-slate-200 px-3 py-1.5 text-[13px] font-mono text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#158A85]"
                    />
                    <div className="flex items-center gap-1.5 ml-auto">
                      {QUICK_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => updateBlock(selectedBlock.id, { color: hex })}
                          title={hex}
                          className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 ${
                            selectedBlock.color.toUpperCase() === hex
                              ? 'ring-2 ring-[#158A85] ring-offset-1 border-white'
                              : 'border-slate-300'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
