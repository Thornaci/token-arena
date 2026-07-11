import { m, AnimatePresence } from '@/components/game/motion';
import type { MascotState } from '@/engine/mascot';

interface Props {
  state: MascotState;
  /** Rendered size in px (square). */
  size?: number;
  /** Localized state description for assistive tech. */
  ariaLabel: string;
}

/**
 * "The Model" — a context window with a face. Rigged SVG (body / glow /
 * eyes / pupils / brow layers), animated with Framer variants keyed by the
 * nine mascot states. Deliberately abstract: no vendor resemblance.
 *
 * Every variant's END pose is state-distinct, so under reduced motion the
 * static frame still tells the state apart (expressions are decorative —
 * the Confusion Meter carries the actual information).
 */
export default function Mascot({ state, size = 88, ariaLabel }: Props) {
  const showX = state === 'overflow';

  return (
    <m.svg
      role="img"
      aria-label={ariaLabel}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      initial={false}
      animate={state}
    >
      {/* glow — brightness is part of the expression */}
      <m.ellipse
        cx="48"
        cy="52"
        rx="34"
        ry="28"
        fill="var(--color-phosphor)"
        variants={{
          neutral: { opacity: 0.14 },
          focused: { opacity: 0.3 },
          confused: { opacity: 0.18 },
          overwhelmed: {
            opacity: [0.3, 0.08, 0.26, 0.12, 0.3],
            transition: { duration: 0.9, repeat: Infinity },
          },
          overflow: { opacity: 0.02 },
          foggy: { opacity: 0.1 },
          forgetful: { opacity: [0.14, 0.45, 0.14], transition: { duration: 1.1 } },
          uncertain: { opacity: 0.16 },
          confident: { opacity: 0.42 },
        }}
      />

      {/* body — a rounded context window */}
      <m.g
        variants={{
          neutral: { y: [0, -2, 0], transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } },
          focused: { y: 0, rotate: -2, x: 2 },
          confused: { rotate: [0, -4, 4, -2, 0], transition: { duration: 0.7 } },
          overwhelmed: { x: [0, -1.2, 1.2, 0], transition: { duration: 0.14, repeat: Infinity } },
          overflow: { y: 2, rotate: 0, opacity: [1, 0.25, 1], transition: { duration: 0.45 } },
          foggy: { y: 0, rotate: 0 },
          forgetful: { y: 0, rotate: 0 },
          uncertain: { y: 0, rotate: 0 },
          confident: { y: [0, -7, 0], transition: { type: 'spring', stiffness: 320, damping: 14 } },
        }}
      >
        <rect
          x="17"
          y="24"
          width="62"
          height="52"
          rx="13"
          fill="var(--color-raised)"
          stroke="var(--color-line-bright)"
          strokeWidth="2"
        />
        {/* window "title bar" notch — it IS a context window */}
        <rect x="26" y="24" width="44" height="4" rx="2" fill="var(--color-line)" />

        {/* eyes */}
        {!showX && (
          <>
            {/* eye whites (squint via scaleY) */}
            <m.g
              style={{ transformOrigin: '48px 50px' }}
              variants={{
                neutral: { scaleY: [1, 1, 0.12, 1], transition: { duration: 4, times: [0, 0.9, 0.95, 1], repeat: Infinity } },
                focused: { scaleY: 0.62 },
                confused: { scaleY: 1 },
                overwhelmed: { scaleY: 1.25 },
                foggy: { scaleY: 0.5 },
                forgetful: { scaleY: 0.9 },
                uncertain: { scaleY: 1 },
                confident: { scaleY: 0.75 },
              }}
            >
              <circle cx="37" cy="50" r="7" fill="var(--color-ink)" opacity="0.92" />
              <circle cx="59" cy="50" r="7" fill="var(--color-ink)" opacity="0.92" />
            </m.g>

            {/* pupils */}
            <m.g
              variants={{
                neutral: { x: 0 },
                focused: { x: 1.5 },
                confused: { x: 0 },
                overwhelmed: { x: 0 },
                foggy: { x: [-2.5, 2.5, -2.5], transition: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' } },
                forgetful: { x: 0, opacity: [1, 0.2, 1], transition: { duration: 1.1 } },
                uncertain: { x: [-2.5, 2.5], transition: { duration: 0.32, repeat: Infinity, repeatType: 'reverse' } },
                confident: { x: 0 },
              }}
            >
              {/* confused: pupils diverge via per-pupil cx */}
              <m.circle
                cy="51"
                r="2.6"
                fill="var(--color-bg)"
                variants={{ confused: { cx: 34.5 } }}
                cx="37"
              />
              <m.circle
                cy="51"
                r="2.6"
                fill="var(--color-bg)"
                variants={{ confused: { cx: 61.5 } }}
                cx="59"
              />
            </m.g>
          </>
        )}

        {/* X eyes — overflow only */}
        <AnimatePresence>
          {showX && (
            <m.g
              key="x-eyes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              stroke="var(--color-alert)"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <path d="M32 45 L42 55 M42 45 L32 55" />
              <path d="M54 45 L64 55 M64 45 L54 55" />
            </m.g>
          )}
        </AnimatePresence>

        {/* brow — knit when confused, raised when overwhelmed */}
        <m.g
          stroke="var(--color-dim)"
          strokeWidth="2"
          strokeLinecap="round"
          variants={{
            neutral: { opacity: 0 },
            focused: { opacity: 0.7, y: 0 },
            confused: { opacity: 1, y: 1 },
            overwhelmed: { opacity: 1, y: -3 },
            overflow: { opacity: 0 },
            foggy: { opacity: 0.5, y: 0 },
            forgetful: { opacity: 0 },
            uncertain: { opacity: 0.7, y: -1 },
            confident: { opacity: 0 },
          }}
        >
          {/* rotate, never path-morph — Framer sets d="undefined" for states
              that omit a d variant */}
          <m.path
            d="M31 40 L43 40"
            style={{ transformOrigin: '37px 40px' }}
            variants={{ confused: { rotate: 12 }, focused: { rotate: -4 } }}
          />
          <m.path
            d="M53 40 L65 40"
            style={{ transformOrigin: '59px 40px' }}
            variants={{ confused: { rotate: -12 }, focused: { rotate: 4 } }}
          />
        </m.g>

        {/* sweat drop — overwhelmed only */}
        <m.path
          d="M72 34 q3 5 0 7 q-3 -2 0 -7"
          fill="var(--color-ice)"
          variants={{
            neutral: { opacity: 0 },
            focused: { opacity: 0 },
            confused: { opacity: 0 },
            overwhelmed: { opacity: [0, 1, 1, 0], y: [0, 0, 6, 10], transition: { duration: 1.4, repeat: Infinity } },
            overflow: { opacity: 0 },
            foggy: { opacity: 0 },
            forgetful: { opacity: 0 },
            uncertain: { opacity: 0 },
            confident: { opacity: 0 },
          }}
        />

        {/* memory-wipe shimmer — forgetful only */}
        <m.rect
          x="17"
          y="24"
          width="10"
          height="52"
          fill="var(--color-ink)"
          variants={{
            neutral: { opacity: 0 },
            focused: { opacity: 0 },
            confused: { opacity: 0 },
            overwhelmed: { opacity: 0 },
            overflow: { opacity: 0 },
            foggy: { opacity: 0 },
            forgetful: { opacity: [0, 0.25, 0], x: [0, 52, 52], transition: { duration: 1.1 } },
            uncertain: { opacity: 0 },
            confident: { opacity: 0 },
          }}
        />
      </m.g>
    </m.svg>
  );
}
