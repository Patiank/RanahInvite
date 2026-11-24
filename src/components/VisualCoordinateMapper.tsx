import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  Italic,
  MessageSquareText,
  Minus,
  Move,
  Pipette,
  Plus,
  Type,
} from 'lucide-react';
import { BrandIcon, IconBadge } from './BrandIcon';
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
import { STUDIO_FONTS, ensureAllStudioFontsLoaded } from '../utils/fonts';
import { RSVP_QR_RENDER_OPTIONS, buildRsvpUrl } from '../utils/rsvp';
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

const FONT_OPTIONS: { value: OverlayFontFamily; label: string; group: string }[] =
  STUDIO_FONTS.map((f) => ({
    value: f.id,
    label: f.label,
    group: f.category === 'serif' ? 'Serif Elegan' : 'Sans-Serif Modern',
  }));

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
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
};

interface InteractivePageStageProps {
  pageNum: 1 | 2;
  hasPage2: boolean;
  isActivePage: boolean;
  imageUrl: string;
  imgW: number;
  imgH: number;
  overlays: OverlayBlock[];
  selectedBlockId: OverlayFieldKey;
  previewRecipient: Recipient;
  qrDataUrl: string;
  eyedropperActive: boolean;
  onSelectBlock: (blockId: OverlayFieldKey, pageNum: 1 | 2) => void;
  onUpdateBlock: (id: OverlayFieldKey, patch: Partial<OverlayBlock>) => void;
  onPickEyedropperColor: (hex: string) => void;
  onOpenFullPreview?: (page: 1 | 2) => void;
}

const InteractivePageStage: React.FC<InteractivePageStageProps> = ({
  pageNum,
  hasPage2,
  isActivePage,
  imageUrl,
  imgW,
  imgH,
  overlays,
  selectedBlockId,
  previewRecipient,
  qrDataUrl,
  eyedropperActive,
  onSelectBlock,
  onUpdateBlock,
  onPickEyedropperColor,
  onOpenFullPreview,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const samplerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStateRef = useRef<{
    blockId: OverlayFieldKey;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const [naturalDims, setNaturalDims] = useState<{ w: number; h: number }>({
    w: imgW || 1240,
    h: imgH || 1754,
  });

  useEffect(() => {
    setNaturalDims({ w: imgW || 1240, h: imgH || 1754 });
  }, [imageUrl, imgW, imgH]);

  const safeImgW = naturalDims.w;
  const safeImgH = naturalDims.h;
  const isLandscape = safeImgW >= safeImgH;

  const [stageWidth, setStageWidth] = useState<number>(
    hasPage2 ? (isLandscape ? 520 : 300) : 560
  );
  const [eyedropperHover, setEyedropperHover] = useState<{
    x: number;
    y: number;
    hex: string;
  } | null>(null);
  const [guides, setGuides] = useState<{ v: number | null; h: number | null }>({
    v: null,
    h: null,
  });

  // Measure this page stage width for 1:1 proportional font sizing vs pdf-lib
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
  }, [safeImgW, safeImgH, hasPage2]);

  // Offscreen canvas for pixel-accurate eyedropper sampling on this page
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || safeImgW;
      c.height = img.naturalHeight || safeImgH;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        samplerCanvasRef.current = c;
      }
    };
    img.src = imageUrl;
  }, [imageUrl, safeImgW, safeImgH]);

  const refPdfWidth = getPdfReferenceWidth(safeImgW, safeImgH);
  const scaleRatio = stageWidth / refPdfWidth;

  const visibleOnPage = overlays.filter(
    (b) => b.visible && (hasPage2 ? b.page : 1) === pageNum
  );

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

    const snapThreshold = 1.2;
    let guideV: number | null = null;
    let guideH: number | null = null;

    const otherBlocks = overlays.filter(
      (b) => b.id !== drag.blockId && b.visible && (hasPage2 ? b.page : 1) === pageNum
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
    onUpdateBlock(drag.blockId, {
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
    if (hex) {
      onPickEyedropperColor(hex);
    }
    setEyedropperHover(null);
  };

  const stageMaxWidthClass = hasPage2
    ? isLandscape
      ? 'max-w-[540px]'
      : 'max-w-[310px]'
    : isLandscape
      ? 'max-w-[600px]'
      : 'max-w-[520px]';

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {/* Compact Page Label Header */}
      <div className={`w-full ${stageMaxWidthClass} flex items-center justify-between gap-2 px-0.5`}>
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-[12px] font-display font-bold whitespace-nowrap ${
              isActivePage ? 'text-[#167F7B]' : 'text-[#757E96]'
            }`}
          >
            {pageNum === 1 ? 'Halaman 1 · Sampul & Tujuan' : 'Halaman 2 · Susunan Acara & QR'}
          </span>
          <span className="text-[11px] text-[#757E96] tabular-nums whitespace-nowrap">
            ({visibleOnPage.length} blok)
          </span>
        </div>

        {onOpenFullPreview && (
          <button
            type="button"
            onClick={() => onOpenFullPreview(pageNum)}
            title={`Full Preview Halaman ${pageNum}`}
            aria-label={`Full Preview Halaman ${pageNum}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#DDEEF3] bg-white text-[11px] font-semibold text-[#1B1B4B] hover:border-[#1F9B96]/50 hover:bg-[#E3F5FA] transition-colors whitespace-nowrap shrink-0"
          >
            <BrandIcon name="action-eye" className="w-3.5 h-3.5 text-[#1B1B4B]" />
            <span>Preview</span>
          </button>
        )}
      </div>

      {/* Interactive Stage Surface — Strict natural width/height proportion (never stretched) */}
      <div
        ref={stageRef}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerLeave={() => {
          handleStagePointerUp();
          setEyedropperHover(null);
        }}
        onClick={handleStageClickForEyedropper}
        className={`relative w-full ${stageMaxWidthClass} self-center shadow-md rounded-xl overflow-hidden select-none bg-white transition-shadow ${
          eyedropperActive ? 'cursor-crosshair' : ''
        } ${isActivePage && hasPage2 ? 'ring-2 ring-[#1F9B96]/45' : 'ring-1 ring-[#DDEEF3]'}`}
      >
        <img
          src={imageUrl}
          alt={`Pratinjau Desain Undangan Halaman ${pageNum}`}
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={(e) => {
            const nw = e.currentTarget.naturalWidth;
            const nh = e.currentTarget.naturalHeight;
            if (nw > 0 && nh > 0 && (nw !== naturalDims.w || nh !== naturalDims.h)) {
              setNaturalDims({ w: nw, h: nh });
            }
          }}
          className="w-full h-auto block pointer-events-none select-none"
        />

        {/* Smart Alignment Guides */}
        {guides.v !== null && (
          <div
            className="absolute top-0 bottom-0 w-px border-l border-dashed border-[#1F9B96] pointer-events-none z-30"
            style={{ left: `${guides.v}%` }}
          />
        )}
        {guides.h !== null && (
          <div
            className="absolute left-0 right-0 h-px border-t border-dashed border-[#F9DE6C] pointer-events-none z-30"
            style={{ top: `${guides.h}%` }}
          />
        )}

        {/* Interactive Overlay Blocks */}
        {visibleOnPage.map((block) => {
          const isSelected = selectedBlockId === block.id && !eyedropperActive;
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
                onSelectBlock(block.id, pageNum);
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
                    ? 'ring-2 ring-[#E5C656] ring-offset-2 rounded-md bg-[#F9DE6C]/15'
                    : 'ring-2 ring-[#1F9B96] ring-offset-2 rounded-md bg-[#1F9B96]/10'
                  : 'hover:ring-1 hover:ring-[#1F9B96]/60 rounded-md'
              }`}
            >
              {block.id === 'qr_code' ? (
                <div className="w-full aspect-square bg-white p-1 rounded-xs shadow-xs border border-[#E5F1F5]">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR Code Verifikasi"
                      draggable={false}
                      className="w-full h-full object-contain block pointer-events-none"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#757E96]">
                      <BrandIcon name="action-qr" className="w-6 h-6" />
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
                  className={`absolute -top-5 left-0 px-1.5 py-0.5 rounded-xs text-[10px] font-semibold whitespace-nowrap flex items-center gap-1 pointer-events-none ${
                    block.locked
                      ? 'bg-[#F9DE6C] text-[#1B1B4B]'
                      : 'bg-[#1F9B96] text-white'
                  }`}
                >
                  {block.locked ? (
                    <BrandIcon name="action-lock" className="w-2.5 h-2.5 text-[#1B1B4B]" />
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
            className="absolute z-40 pointer-events-none flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-[#1B1B4B] text-white text-[11px] font-mono shadow-lg"
            style={{
              left: Math.min(stageWidth - 110, eyedropperHover.x + 14),
              top: Math.max(8, eyedropperHover.y - 34),
            }}
          >
            <span
              className="w-3.5 h-3.5 rounded-full border border-white/40"
              style={{ backgroundColor: eyedropperHover.hex }}
            />
            <span>{eyedropperHover.hex}</span>
          </div>
        )}
      </div>
    </div>
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
  useEffect(() => {
    ensureAllStudioFontsLoaded();
  }, []);
  const [activePage, setActivePage] = useState<1 | 2>(1);
  const [justSavedDefault, setJustSavedDefault] = useState(false);
  const [justCopiedJson, setJustCopiedJson] = useState(false);
  const [confirmClearDefault, setConfirmClearDefault] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<OverlayFieldKey>('recipient_name');
  const [eyedropperActive, setEyedropperActive] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const hasPage2 = templates.pageCount === 2 && Boolean(templates.page2DataUrl);
  const effectivePage: 1 | 2 = activePage === 2 && hasPage2 ? 2 : 1;

  const previewRecipient = useMemo(
    () =>
      recipients.find((r) => r.id === previewRecipientId) ??
      recipients[0] ??
      SAMPLE_PREVIEW_RECIPIENT,
    [recipients, previewRecipientId]
  );

  // Generate QR preview data URL for selected recipient (scannable RSVP URL)
  useEffect(() => {
    let cancelled = false;
    const rsvpUrl = buildRsvpUrl(eventId, metadata, previewRecipient);
    QRCode.toDataURL(rsvpUrl, {
      ...RSVP_QR_RENDER_OPTIONS,
      width: 240,
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId, previewRecipient, metadata]);

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
      fontFamily: 'Manrope',
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
    setSelectedBlockId(block.id);
    if (hasPage2) {
      setActivePage(block.page);
    }
  };

  const handlePickEyedropperColor = (hex: string) => {
    if (selectedBlock) {
      updateBlock(selectedBlock.id, { color: hex });
    }
    setEyedropperActive(false);
  };

  return (
    <div
      className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch"
      style={{ overflowAnchor: 'none' }}
    >
      {/* Left/Center: Stacked Dual-Page Interactive Canvas matching Right Inspector Height */}
      <div className="xl:col-span-7 flex flex-col gap-3">
        {/* Canvas Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[#E5F1F5] bg-[#F4FBFD] px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <BrandIcon name="nav-design" className="w-5 h-5 text-[#1B1B4B]" />
            <span className="text-[12px] font-bold text-[#1B1B4B] whitespace-nowrap">
              {hasPage2 ? 'Kanvas 2 Halaman (Hal 1 & Hal 2)' : 'Kanvas 1 Halaman'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#757E96] whitespace-nowrap">
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
                className="p-2 rounded-full border border-[#DDEEF3] bg-white text-[#1B1B4B] hover:bg-[#E3F5FA] hover:border-[#1F9B96]/50 transition-colors shrink-0"
              >
                <BrandIcon name="action-eye" className="w-5 h-5 text-[#1B1B4B]" />
              </button>
            )}
          </div>
        </div>

        {/* Stacked Canvas Frame — Stretches to match right panel height seamlessly */}
        <div
          className={`flex-1 rounded-[22px] border border-[#DFEFF4] bg-[#EDF8FC] p-4 sm:p-5 flex flex-col items-center ${
            hasPage2 ? 'justify-evenly gap-5' : 'justify-center'
          }`}
        >
          <InteractivePageStage
            pageNum={1}
            hasPage2={hasPage2}
            isActivePage={effectivePage === 1}
            imageUrl={templates.page1DataUrl}
            imgW={templates.page1Width}
            imgH={templates.page1Height}
            overlays={overlays}
            selectedBlockId={selectedBlock?.id ?? selectedBlockId}
            previewRecipient={previewRecipient}
            qrDataUrl={qrDataUrl}
            eyedropperActive={eyedropperActive}
            onSelectBlock={(blockId, p) => {
              setSelectedBlockId(blockId);
              setActivePage(p);
            }}
            onUpdateBlock={updateBlock}
            onPickEyedropperColor={handlePickEyedropperColor}
            onOpenFullPreview={
              onOpenFullPreview
                ? (p) => onOpenFullPreview(previewRecipient, p)
                : undefined
            }
          />

          {hasPage2 && templates.page2DataUrl && (
            <>
              <div className="w-full max-w-[540px] border-t border-slate-200/90" />
              <InteractivePageStage
                pageNum={2}
                hasPage2={hasPage2}
                isActivePage={effectivePage === 2}
                imageUrl={templates.page2DataUrl}
                imgW={templates.page2Width || templates.page1Width}
                imgH={templates.page2Height || templates.page1Height}
                overlays={overlays}
                selectedBlockId={selectedBlock?.id ?? selectedBlockId}
                previewRecipient={previewRecipient}
                qrDataUrl={qrDataUrl}
                eyedropperActive={eyedropperActive}
                onSelectBlock={(blockId, p) => {
                  setSelectedBlockId(blockId);
                  setActivePage(p);
                }}
                onUpdateBlock={updateBlock}
                onPickEyedropperColor={handlePickEyedropperColor}
                onOpenFullPreview={
                  onOpenFullPreview
                    ? (p) => onOpenFullPreview(previewRecipient, p)
                    : undefined
                }
              />
            </>
          )}
        </div>
      </div>

      {/* Right: Variable Layer List & Visual Inspector */}
      <div className="xl:col-span-5 flex flex-col gap-4" style={{ overflowAnchor: 'none' }}>
        {/* Layer List */}
        <div className="rounded-[22px] border border-[#E5F1F5] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <IconBadge name="action-settings" size="xs" />
              <h4 className="font-display font-bold text-[14px] text-[#1B1B4B]">
                Blok Variabel
              </h4>
            </div>
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
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold transition-colors whitespace-nowrap ${
                      allLocked
                        ? 'bg-[#FFF7D6] text-[#9A7409] hover:bg-[#FCEFA8]'
                        : 'bg-[#F4FBFD] text-[#757E96] hover:bg-[#E3F5FA] hover:text-[#1B1B4B]'
                    }`}
                  >
                    {allLocked ? (
                      <BrandIcon name="action-unlock" className="w-3.5 h-3.5" />
                    ) : (
                      <BrandIcon name="action-lock" className="w-3.5 h-3.5" />
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
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold transition-colors whitespace-nowrap ${
                    justSavedDefault
                      ? 'bg-[#1F9B96] text-white'
                      : 'bg-[#E3F5FA] text-[#167F7B] hover:bg-[#CCEBF4]'
                  }`}
                >
                  <BrandIcon
                    name="action-save"
                    white={justSavedDefault}
                    className="w-3.5 h-3.5"
                  />
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
                  className={`inline-flex items-center justify-center p-1.5 rounded-full transition-colors ${
                    justCopiedJson
                      ? 'bg-[#1F9B96] text-white'
                      : 'bg-[#F4FBFD] text-[#757E96] hover:bg-[#E3F5FA] hover:text-[#1B1B4B]'
                  }`}
                >
                  {justCopiedJson ? (
                    <BrandIcon name="status-check" white className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleAddCustomTextBlock}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#1F9B96] text-white hover:bg-[#167F7B] transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Teks</span>
              </button>

              <button
                type="button"
                onClick={onResetOverlays}
                title="Reset Posisi"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium text-[#757E96] hover:text-[#1F9B96] hover:bg-[#F4FBFD] transition-colors whitespace-nowrap"
              >
                <BrandIcon name="action-sync" className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {hasCustomDefault && (
            <div className="mb-2.5 px-3 py-1.5 rounded-full bg-[#DCF5F1] border border-[#B5E9E0] flex items-center justify-between gap-2 text-[11px] text-[#157A76]">
              <span className="inline-flex items-center gap-1.5 truncate">
                <BrandIcon name="action-save" className="w-3.5 h-3.5 text-[#157A76]" />
                <span className="font-semibold truncate">
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
                      className="px-2 py-0.5 rounded-full bg-white border border-[#DDEEF3] text-[#757E96] font-medium"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await onClearCustomDefault();
                        setConfirmClearDefault(false);
                      }}
                      className="px-2 py-0.5 rounded-full bg-[#B83B5E] text-white font-semibold"
                    >
                      Hapus
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearDefault(true)}
                    className="text-[#157A76] hover:text-[#B83B5E] underline font-semibold shrink-0"
                  >
                    Hapus
                  </button>
                )
              )}
            </div>
          )}

          <div className="divide-y divide-[#EDF6F9]">
            {overlays.map((block) => {
              const isSelected = selectedBlock?.id === block.id;
              return (
                <div
                  key={block.id}
                  onClick={() => handleSelectBlock(block)}
                  className={`flex items-center justify-between gap-2 py-2 px-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#E3F5FA]' : 'hover:bg-[#F4FBFD]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {block.id === 'qr_code' ? (
                      <BrandIcon name="action-qr" className="w-4 h-4 text-[#1F9B96]" />
                    ) : isCustomTextField(block.id) ? (
                      <MessageSquareText className="w-4 h-4 text-[#1F9B96] shrink-0" />
                    ) : (
                      <Type className="w-4 h-4 text-[#1F9B96] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[#1B1B4B] truncate">
                        {getCleanBlockLabel(block)}
                      </div>
                      <div className="text-[11px] text-[#757E96] tabular-nums truncate">
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
                        className="p-1.5 rounded-full text-[#757E96] hover:bg-[#FDE8EE] hover:text-[#B83B5E] transition-colors"
                        title="Hapus"
                        aria-label={`Hapus ${getCleanBlockLabel(block)}`}
                      >
                        <BrandIcon name="action-trash" className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateBlock(block.id, { locked: !block.locked });
                      }}
                      className={`p-1.5 rounded-full transition-colors ${
                        block.locked
                          ? 'text-[#9A7409] bg-[#FFF7D6] hover:bg-[#FCEFA8]'
                          : 'text-[#757E96] hover:bg-white hover:text-[#1B1B4B]'
                      }`}
                      title={block.locked ? 'Buka kunci' : 'Kunci posisi'}
                      aria-label={block.locked ? `Buka kunci ${block.id}` : `Kunci ${block.id}`}
                    >
                      {block.locked ? (
                        <BrandIcon name="action-lock" className="w-4 h-4" />
                      ) : (
                        <BrandIcon name="action-unlock" className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateBlock(block.id, { visible: !block.visible });
                      }}
                      className={`p-1.5 rounded-full transition-colors ${
                        block.visible
                          ? 'text-[#1F9B96] hover:bg-white'
                          : 'text-[#757E96]/60 hover:bg-white'
                      }`}
                      title={block.visible ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {block.visible ? (
                        <BrandIcon name="action-eye" className="w-4 h-4" />
                      ) : (
                        <BrandIcon name="action-eye-off" className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Block Inspector — Stretches cleanly so left canvas & right inspector share identical bottom alignment */}
        {selectedBlock && (
          <div className="flex-1 rounded-[22px] border border-[#E5F1F5] bg-white p-4 space-y-3.5 min-h-[540px]">
            <div className="flex items-center justify-between gap-2 border-b border-[#EDF6F9] pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <IconBadge name="action-edit-design" size="xs" />
                <h4 className="font-display font-bold text-[14px] text-[#1B1B4B] truncate">
                  {getCleanBlockLabel(selectedBlock)}
                </h4>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    updateBlock(selectedBlock.id, { locked: !selectedBlock.locked })
                  }
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    selectedBlock.locked
                      ? 'bg-[#FFF7D6] text-[#9A7409] hover:bg-[#FCEFA8]'
                      : 'bg-[#F4FBFD] text-[#757E96] hover:bg-[#E3F5FA]'
                  }`}
                >
                  {selectedBlock.locked ? (
                    <>
                      <BrandIcon name="action-lock" className="w-3 h-3" />
                      <span>Terkunci</span>
                    </>
                  ) : (
                    <>
                      <BrandIcon name="action-unlock" className="w-3 h-3" />
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
                    className={`rounded-full border border-[#DDEEF3] px-2.5 py-1 text-[12px] font-semibold ${
                      selectedBlock.locked
                        ? 'bg-[#F4FBFD] text-[#757E96]/60 cursor-not-allowed'
                        : 'text-[#1B1B4B] bg-white'
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
                <label className="block text-[12px] font-medium text-[#757E96] mb-1">
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
                  className={`w-full rounded-xl border border-[#DDEEF3] px-3 py-2 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1F9B96] ${
                    selectedBlock.locked
                      ? 'bg-[#F4FBFD] text-[#757E96] cursor-not-allowed'
                      : 'text-[#1B1B4B]'
                  }`}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#757E96] mb-1">
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
                  className={`w-full rounded-xl border border-[#DDEEF3] px-3 py-2 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1F9B96] ${
                    selectedBlock.locked
                      ? 'bg-[#F4FBFD] text-[#757E96] cursor-not-allowed'
                      : 'text-[#1B1B4B]'
                  }`}
                />
              </div>
            </div>

            {selectedBlock.id === 'qr_code' ? (
              <div>
                <div className="flex items-center justify-between text-[12px] font-medium text-[#757E96] mb-1.5">
                  <span>Ukuran QR (%)</span>
                  <span className="tabular-nums font-semibold text-[#1B1B4B]">{selectedBlock.width}%</span>
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
                  className="w-full accent-[#1F9B96]"
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
                        className="w-full rounded-xl border border-[#DDEEF3] px-3 py-1.5 text-[12px] font-medium text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                      />
                    )}
                    <div>
                      <label className="block text-[12px] font-medium text-[#757E96] mb-1">
                        Teks Informasi
                      </label>
                      <textarea
                        rows={2}
                        value={selectedBlock.placeholder}
                        onChange={(e) =>
                          updateBlock(selectedBlock.id, { placeholder: e.target.value })
                        }
                        placeholder="Ketik teks informasi..."
                        className="w-full rounded-xl border border-[#DDEEF3] px-3 py-2 text-[13px] text-[#1B1B4B] placeholder:text-[#757E96]/70 focus:outline-none focus:ring-2 focus:ring-[#1F9B96] resize-none"
                      />
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {QR_INSTRUCTION_PRESETS.map((preset) => (
                          <button
                            key={preset.title}
                            type="button"
                            onClick={() =>
                              updateBlock(selectedBlock.id, { placeholder: preset.text })
                            }
                            className="px-2.5 py-0.5 rounded-full bg-[#F4FBFD] border border-[#E5F1F5] text-[11px] font-medium text-[#757E96] hover:bg-[#E3F5FA] hover:text-[#167F7B] transition-colors"
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
                    <label className="block text-[12px] font-medium text-[#757E96] mb-1">
                      Teks Tempat
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.placeholder}
                      onChange={(e) =>
                        updateBlock(selectedBlock.id, { placeholder: e.target.value })
                      }
                      placeholder="di tempat"
                      className="w-full rounded-xl border border-[#DDEEF3] px-3 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                    />
                  </div>
                )}

                {/* Font Family */}
                <div>
                  <label className="block text-[12px] font-medium text-[#757E96] mb-1">
                    Jenis Huruf
                  </label>
                  <select
                    value={
                      FONT_OPTIONS.some((o) => o.value === selectedBlock.fontFamily)
                        ? selectedBlock.fontFamily
                        : 'Manrope'
                    }
                    onChange={(e) =>
                      updateBlock(selectedBlock.id, {
                        fontFamily: e.target.value as OverlayFontFamily,
                      })
                    }
                    className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[13px] font-medium text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
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
                      <label className="block text-[12px] font-medium text-[#757E96] mb-1">
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
                          className="p-2 rounded-full border border-[#DDEEF3] bg-white text-[#757E96] hover:bg-[#E3F5FA] hover:text-[#1F9B96] transition-colors shrink-0"
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
                          className="w-full min-w-0 text-center rounded-xl border border-[#DDEEF3] px-2 py-2 text-[13px] font-semibold tabular-nums text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateBlock(selectedBlock.id, {
                              fontSize: Math.min(96, Math.round((Number(selectedBlock.fontSize) || 14) + 1)),
                            })
                          }
                          aria-label="Perbesar ukuran teks"
                          className="p-2 rounded-full border border-[#DDEEF3] bg-white text-[#757E96] hover:bg-[#E3F5FA] hover:text-[#1F9B96] transition-colors shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#757E96] mb-1">
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
                        className="w-full rounded-xl border border-[#DDEEF3] px-3 py-2 text-[13px] tabular-nums text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                      />
                    </div>
                  </div>

                  {/* Quick Visual Font Size Slider */}
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] text-[#757E96] tabular-nums shrink-0">4</span>
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
                      className="w-full accent-[#1F9B96] cursor-pointer"
                    />
                    <span className="text-[11px] text-[#757E96] tabular-nums shrink-0">72</span>
                  </div>
                </div>

                {/* Weight, Italic, Alignment */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 p-1 rounded-full bg-[#F4FBFD] border border-[#E5F1F5]">
                    {([400, 600, 700] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => updateBlock(selectedBlock.id, { fontWeight: w })}
                        className={`px-2.5 py-1 rounded-full text-[12px] transition-colors ${
                          selectedBlock.fontWeight === w
                            ? 'bg-[#1F9B96] text-white font-semibold shadow-xs'
                            : 'text-[#757E96] hover:text-[#1B1B4B]'
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
                      className={`p-1.5 rounded-full transition-colors ${
                        selectedBlock.italic
                          ? 'bg-[#1F9B96] text-white shadow-xs'
                          : 'text-[#757E96] hover:text-[#1B1B4B]'
                      }`}
                      title="Miring"
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1 p-1 rounded-full bg-[#F4FBFD] border border-[#E5F1F5]">
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
                          className={`p-1.5 rounded-full transition-colors ${
                            selectedBlock.align === item.id
                              ? 'bg-[#1F9B96] text-white shadow-xs'
                              : 'text-[#757E96] hover:text-[#1B1B4B]'
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
                    <label className="text-[12px] font-medium text-[#757E96]">
                      Warna
                    </label>
                    <button
                      type="button"
                      onClick={() => setEyedropperActive((prev) => !prev)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold transition-colors ${
                        eyedropperActive
                          ? 'bg-[#F9DE6C] text-[#1B1B4B]'
                          : 'bg-[#F4FBFD] border border-[#E5F1F5] text-[#1B1B4B] hover:bg-[#E3F5FA]'
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
                      className="w-9 h-9 rounded-full border border-[#DDEEF3] cursor-pointer p-0.5 bg-white"
                    />
                    <input
                      type="text"
                      value={selectedBlock.color}
                      onChange={(e) =>
                        updateBlock(selectedBlock.id, { color: e.target.value })
                      }
                      className="w-28 rounded-xl border border-[#DDEEF3] px-3 py-1.5 text-[13px] font-mono text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
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
                              ? 'ring-2 ring-[#1F9B96] ring-offset-1 border-white'
                              : 'border-[#DDEEF3]'
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
