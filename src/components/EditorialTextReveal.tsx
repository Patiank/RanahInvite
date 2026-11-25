import React from 'react';
import { motion } from 'motion/react';
import { InteractiveTextAnimation } from '../types';

/** Luxury Exponential Deceleration (After Effects Easy-Ease Out) */
export const EDITORIAL_EASE: [number, number, number, number] = [0.19, 1, 0.22, 1];
export const SILK_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export interface EditorialTextRevealProps {
  text: string;
  preset: InteractiveTextAnimation;
  delay?: number;
  instant?: boolean;
  /** Applied directly onto each word span so bg-clip-text metallic gradients render intact */
  wordClassName?: string;
  className?: string;
  style?: React.CSSProperties;
  as?: 'h1' | 'h2' | 'div' | 'p' | 'span';
}

/**
 * Broadcast / Apple Keynote-grade Kinetic Typography Reveal.
 * - `cinematic-title`: Word-by-word masked curtain rise (`overflow-hidden` clip per word)
 * - `blur-reveal`: Soft optical lens de-blur word-by-word (`blur(9px) -> 0px`)
 * - `zoom-focus`: Editorial center clip-path unveil + letter-spacing settle
 * - `fade-up`: Ultra-clean minimalist vertical glide
 * - `none`: Instant render without animation
 */
export const EditorialTextReveal: React.FC<EditorialTextRevealProps> = ({
  text,
  preset,
  delay = 0,
  instant = false,
  wordClassName = '',
  className = '',
  style,
  as = 'div',
}) => {
  const safeText = text || '';
  const Tag = as;

  if (instant || preset === 'none' || !safeText.trim()) {
    return (
      <Tag style={style} className={`${className} ${wordClassName}`.trim()}>
        {safeText}
      </Tag>
    );
  }

  if (preset === 'fade-up') {
    return (
      <Tag style={style} className={className}>
        <motion.span
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.62, delay, ease: SILK_EASE }}
          className={`inline-block will-change-transform ${wordClassName}`}
        >
          {safeText}
        </motion.span>
      </Tag>
    );
  }

  if (preset === 'zoom-focus') {
    return (
      <Tag style={style} className={className}>
        <motion.span
          initial={{
            opacity: 0,
            clipPath: 'inset(0% 16% 0% 16%)',
            letterSpacing: '0.1em',
            scale: 0.985,
          }}
          animate={{
            opacity: 1,
            clipPath: 'inset(0% 0% 0% 0%)',
            letterSpacing: 'normal',
            scale: 1,
          }}
          transition={{ duration: 0.78, delay, ease: EDITORIAL_EASE }}
          className={`inline-block will-change-transform ${wordClassName}`}
        >
          {safeText}
        </motion.span>
      </Tag>
    );
  }

  // Word-by-word choreography for `cinematic-title` & `blur-reveal`
  const words = safeText.split(/\s+/).filter(Boolean);
  // Cap stagger so very long titles still feel crisp & never sluggish
  const perWordStagger = Math.min(0.055, Math.max(0.025, 0.36 / Math.max(words.length, 1)));

  if (preset === 'blur-reveal') {
    return (
      <Tag style={style} className={className}>
        {words.map((word, idx) => (
          <React.Fragment key={`${word}-${idx}`}>
            <motion.span
              initial={{
                opacity: 0,
                y: 8,
                scale: 1.04,
                filter: 'blur(9px)',
              }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                filter: 'blur(0px)',
              }}
              transition={{
                duration: 0.62,
                delay: delay + idx * perWordStagger,
                ease: SILK_EASE,
              }}
              className={`inline-block will-change-transform ${wordClassName}`}
            >
              {word}
            </motion.span>
            {idx < words.length - 1 ? ' ' : null}
          </React.Fragment>
        ))}
      </Tag>
    );
  }

  // Default: `cinematic-title` — Masked Curtain Rise per word (Apple Keynote / Luxury Editorial)
  return (
    <Tag style={style} className={className}>
      {words.map((word, idx) => (
        <React.Fragment key={`${word}-${idx}`}>
          <span className="inline-block overflow-hidden align-top py-[0.12em] -my-[0.12em] px-[0.04em] -mx-[0.04em]">
            <motion.span
              initial={{
                y: '112%',
                opacity: 0.001,
                rotateZ: 1.2,
              }}
              animate={{
                y: '0%',
                opacity: 1,
                rotateZ: 0,
              }}
              transition={{
                duration: 0.72,
                delay: delay + idx * perWordStagger,
                ease: EDITORIAL_EASE,
              }}
              style={{ transformOrigin: 'left bottom' }}
              className={`inline-block will-change-transform ${wordClassName}`}
            >
              {word}
            </motion.span>
          </span>
          {idx < words.length - 1 ? ' ' : null}
        </React.Fragment>
      ))}
    </Tag>
  );
};

/**
 * Returns orchestrated motion props for non-heading slide blocks (pills, cards, tiles, notes, buttons)
 * so every element on Slides 1–3 participates in a unified editorial rhythm.
 */
export function getEditorialBlockMotion(
  preset: InteractiveTextAnimation,
  delay = 0,
  instant = false
) {
  if (instant || preset === 'none') {
    return {
      initial: false as const,
      animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
      transition: { duration: 0 },
    };
  }

  if (preset === 'blur-reveal') {
    return {
      initial: { opacity: 0, y: 10, scale: 0.985, filter: 'blur(8px)' },
      animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
      transition: { duration: 0.62, delay, ease: SILK_EASE },
    };
  }

  if (preset === 'zoom-focus') {
    return {
      initial: { opacity: 0, y: 10, scale: 0.96 },
      animate: { opacity: 1, y: 0, scale: 1 },
      transition: { duration: 0.68, delay, ease: EDITORIAL_EASE },
    };
  }

  if (preset === 'fade-up') {
    return {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.56, delay, ease: SILK_EASE },
    };
  }

  // `cinematic-title`: crisp luxury lift with subtle scale settle
  return {
    initial: { opacity: 0, y: 18, scale: 0.985 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: 0.68, delay, ease: EDITORIAL_EASE },
  };
}
