import type { ReactNode } from 'react';

/**
 * The context window as a literal transparent container (spec G1.1).
 * Purely presentational: the scene renders the stacked blocks as children
 * (bottom-up), the reserved-output "do not fill" zone sits at the top, and
 * physical vocabulary is fixed app-wide — token counts always map to height.
 */

export const VESSEL_HEIGHT_PX = 440;

/**
 * Proportional height with an accessibility floor: drop/drag targets must
 * stay ≥44px even when a block is only a few hundred tokens (the number on
 * the block carries the exact truth).
 */
export function tokensToPx(tokens: number, windowTokens: number, minPx = 24): number {
  return Math.max(minPx, (tokens / windowTokens) * VESSEL_HEIGHT_PX);
}

interface Props {
  windowTokens: number;
  reservedTokens: number;
  /** Localized caption under the vessel, e.g. "window: 8,000 tokens". */
  caption: string;
  ariaLabel: string;
  reservedLabel: string;
  /** Rim glows amber (strained) / red with rupture styling. */
  strained?: boolean;
  ruptured?: boolean;
  /** Extra content inside the reserved zone (e.g. the resize handle). */
  reservedExtra?: ReactNode;
  /** Full-vessel overlay (the 400 error card). */
  overlay?: ReactNode;
  children: ReactNode;
}

export default function Vessel({
  windowTokens,
  reservedTokens,
  caption,
  ariaLabel,
  reservedLabel,
  strained,
  ruptured,
  reservedExtra,
  overlay,
  children,
}: Props) {
  const reservedPx = reservedTokens > 0 ? tokensToPx(reservedTokens, windowTokens, 20) : 0;

  return (
    <figure className="flex w-full max-w-xs flex-col gap-1.5">
      <div
        role="group"
        aria-label={ariaLabel}
        className={`relative flex flex-col overflow-hidden rounded-lg border-2 bg-(--color-bg)/60 ${
          ruptured
            ? 'border-(--color-alert)'
            : strained
              ? 'border-(--color-amber)'
              : 'border-(--color-line-bright)'
        }`}
        style={{
          height: VESSEL_HEIGHT_PX + (reservedPx > 0 ? 0 : 0),
          boxShadow: ruptured
            ? '0 0 24px -4px var(--color-alert)'
            : strained
              ? '0 0 18px -6px var(--color-amber)'
              : undefined,
        }}
      >
        {/* reserved output — translucent "do not fill" zone pinned to the top */}
        {reservedPx > 0 && (
          <div
            className="ta-hatch relative z-10 flex shrink-0 items-start justify-between border-b border-dashed border-(--color-role-reserved) px-2 py-1"
            style={{ height: reservedPx }}
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-(--color-role-reserved)">
              {reservedLabel}
            </span>
            {reservedExtra}
          </div>
        )}

        {/* the stack fills from the bottom; overflow pushes past the rim */}
        <div className="relative flex min-h-0 flex-1 flex-col-reverse justify-start gap-px px-1.5 pb-1.5">
          {children}
        </div>

        {overlay}
      </div>
      <figcaption className="font-mono text-[11px] text-(--color-faint)">{caption}</figcaption>
    </figure>
  );
}
