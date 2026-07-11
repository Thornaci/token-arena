import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';

export interface HeatSpot {
  labelKey: string;
  recallPct: number;
  /** Odds stay hidden ("?") until the player has run this spot. */
  revealed: boolean;
}

interface Props {
  spots: readonly HeatSpot[];
  selected: number | null;
  onSelect: (index: number) => void;
  disabled?: boolean;
  locale: Locale;
}

/**
 * The context strip: each cell is a position in the window. Brightness maps
 * to the scripted model's recall odds — bright at the edges, dim in the
 * middle once the player has probed enough positions to see the U-curve.
 */
export default function HeatStrip({ spots, selected, onSelect, disabled = false, locale }: Props) {
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  return (
    <div role="radiogroup" aria-label={t('heatstrip_aria')} className="flex gap-1.5">
      {spots.map((spot, i) => {
        const isSelected = selected === i;
        // 0.12 floor keeps unrevealed/low cells legible against the panel.
        const glow = spot.revealed ? Math.max(0.12, spot.recallPct / 100) : 0.12;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onSelect(i)}
            className={`flex min-h-16 flex-1 flex-col items-center justify-between rounded border px-1 py-2 font-mono text-[10px] transition-colors ${
              isSelected
                ? 'border-(--color-ice) text-(--color-ink)'
                : 'border-(--color-line) text-(--color-dim) enabled:hover:border-(--color-line-bright)'
            } ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
          >
            <span
              aria-hidden="true"
              className="block h-4 w-full rounded-sm"
              style={{ background: `color-mix(in srgb, var(--color-phosphor) ${glow * 100}%, var(--color-surface))` }}
            />
            <span className="mt-1 text-center leading-tight">{t(spot.labelKey)}</span>
            <span className={spot.revealed ? 'text-(--color-phosphor)' : 'text-(--color-faint)'}>
              {spot.revealed ? `${spot.recallPct}%` : '?'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
