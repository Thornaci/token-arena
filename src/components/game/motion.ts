/**
 * The ONLY allowed import point for Framer Motion in this codebase.
 *
 * - Everything animates through `m.*` under one `<LazyMotion features={domAnimation} strict>`
 *   (SceneFrame provides it) — `strict` makes any stray full-`motion` import
 *   throw in dev, keeping the bundle at the small `m` + domAnimation slice.
 * - Never put Tailwind `transition-*` / `animate-*` utilities on `m.*`
 *   elements: Framer writes inline transform/opacity and they fight.
 */
export { LazyMotion, m, AnimatePresence, MotionConfig, domAnimation } from 'motion/react';
