import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface CountUpNumberProps {
  value: number;
  duration?: number;
  className?: string;
  suffix?: string;
}

/**
 * Smoothly counts from 0 on initial mount (and from previous value on subsequent updates)
 * using ease-out cubic easing and tabular numerals to prevent horizontal jitter.
 */
export const CountUpNumber: React.FC<CountUpNumberProps> = ({
  value,
  duration = 720,
  className = '',
  suffix = '',
}) => {
  const safeTarget = Number.isFinite(value) ? Math.round(value) : 0;
  const [displayValue, setDisplayValue] = useState<number>(() =>
    prefersReducedMotion() ? safeTarget : 0
  );
  const currentValueRef = useRef<number>(prefersReducedMotion() ? safeTarget : 0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      currentValueRef.current = safeTarget;
      setDisplayValue(safeTarget);
      return;
    }

    const from = currentValueRef.current;
    const delta = safeTarget - from;
    if (delta === 0) {
      setDisplayValue(safeTarget);
      return;
    }

    let rafId = 0;
    const startTime = performance.now();
    // Adapt duration subtly for very small deltas so counting 0->2 still feels crisp
    const effectiveDuration = Math.max(
      260,
      Math.min(duration, 240 + Math.abs(delta) * 18)
    );

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / effectiveDuration);
      // Smooth ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = Math.round(from + delta * eased);
      if (nextVal !== currentValueRef.current) {
        currentValueRef.current = nextVal;
        setDisplayValue(nextVal);
      }
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        currentValueRef.current = safeTarget;
        setDisplayValue(safeTarget);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [safeTarget, duration]);

  return (
    <span className={`tabular-nums ${className}`}>
      {displayValue.toLocaleString('id-ID')}
      {suffix}
    </span>
  );
};

interface HighlightedTextProps {
  text: string;
  query?: string;
  className?: string;
}

export const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  query = '',
  className = '',
}) => {
  const trimmed = query.trim();
  const parts = useMemo(() => {
    if (!trimmed) return null;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return text.split(regex);
  }, [text, trimmed]);

  if (!parts || parts.length <= 1) {
    return <span className={className}>{text}</span>;
  }

  const lowerQ = trimmed.toLowerCase();
  return (
    <span className={className}>
      {parts.map((part, idx) =>
        part.toLowerCase() === lowerQ ? (
          <mark
            key={idx}
            className="bg-[#F6D458]/55 text-[#111827] rounded-xs px-0.5 font-semibold"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={idx}>{part}</React.Fragment>
        )
      )}
    </span>
  );
};

interface SmartMarqueeTextProps {
  text: string;
  highlightQuery?: string;
  className?: string;
  speedPxPerSec?: number;
}

/**
 * Automatically detects whether text overflows its container width.
 * - If it fits: stays completely stationary and clean.
 * - If it overflows: smoothly glides back and forth with gentle pauses and edge fades,
 *   pausing automatically on hover so the user can read comfortably.
 */
export const SmartMarqueeText: React.FC<SmartMarqueeTextProps> = ({
  text,
  highlightQuery = '',
  className = '',
  speedPxPerSec = 26,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLSpanElement | null>(null);
  const [overflowPx, setOverflowPx] = useState<number>(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const measure = () => {
      const diff = Math.ceil(content.scrollWidth - container.clientWidth);
      setOverflowPx(diff > 3 ? diff : 0);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(content);

    // Re-check once web fonts settle
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }

    return () => ro.disconnect();
  }, [text]);

  const isOverflowing = overflowPx > 0;
  // Total round-trip duration includes start/end pauses (~32% of cycle)
  const travelSeconds = Math.max(2.6, (overflowPx + 14) / speedPxPerSec);
  const totalDuration = Math.min(26, Math.round((travelSeconds * 2 + 3.2) * 10) / 10);

  return (
    <div
      ref={containerRef}
      title={text}
      className={`relative overflow-hidden whitespace-nowrap ${
        isOverflowing ? 'smart-marquee-mask' : ''
      } ${className}`}
    >
      <span
        ref={contentRef}
        className={`inline-block whitespace-nowrap ${
          isOverflowing ? 'smart-marquee-track' : ''
        }`}
        style={
          isOverflowing
            ? ({
                '--marquee-shift': `${overflowPx + 14}px`,
                '--marquee-duration': `${totalDuration}s`,
              } as React.CSSProperties)
            : undefined
        }
      >
        <HighlightedText text={text} query={highlightQuery} />
      </span>
    </div>
  );
};

interface ProgressRingProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  percent,
  size = 46,
  strokeWidth = 4,
  color = '#158A85',
  trackColor = '#E2E8F0',
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-label={`${clamped}%`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: targetOffset }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-[#111827] tabular-nums">
        <CountUpNumber value={clamped} duration={700} suffix="%" />
      </span>
    </div>
  );
};

interface FloatingToastProps {
  toast: {
    id: number;
    type: 'success' | 'error';
    message: string;
  } | null;
  durationMs?: number;
  onDismiss: () => void;
}

export const FloatingToast: React.FC<FloatingToastProps> = ({
  toast,
  durationMs = 4000,
  onDismiss,
}) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed bottom-5 right-5 z-[9998] pointer-events-none max-w-[calc(100vw-2.5rem)] sm:max-w-md">
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto relative overflow-hidden rounded-2xl border shadow-xl backdrop-blur-md px-4 py-3 pr-10 flex items-center gap-2.5 text-[13px] font-medium ${
              toast.type === 'error'
                ? 'bg-white/95 border-red-200 text-red-700'
                : 'bg-white/95 border-[#158A85]/25 text-[#0F6E6A]'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#158A85]" />
            )}
            <span className="leading-snug text-[#111827]">{toast.message}</span>

            <button
              type="button"
              onClick={onDismiss}
              aria-label="Tutup notifikasi"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* Smooth countdown bar */}
            <motion.div
              key={`bar-${toast.id}`}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: durationMs / 1000, ease: 'linear' }}
              style={{ transformOrigin: 'left center' }}
              className={`absolute bottom-0 left-0 right-0 h-[2.5px] ${
                toast.type === 'error' ? 'bg-red-500/80' : 'bg-[#158A85]/80'
              }`}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
};
