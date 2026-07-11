import { useState } from 'react';
import { m } from '@/components/game/motion';
import type { Contributor } from '@/engine/mascot';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';

interface Props {
  locale: Locale;
  value: number;
  contributors: Contributor[];
  /** compact hides the contributor toggle (header dock). */
  compact?: boolean;
}

/**
 * Analog 0–100 gauge next to the mascot. A teaching instrument: expanding it
 * lists the deterministic contributors ("+30: two instructions contradict").
 */
export default function ConfusionMeter({ locale, value, contributors, compact }: Props) {
  const [open, setOpen] = useState(false);
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const angle = -90 + (Math.max(0, Math.min(100, value)) / 100) * 180;
  const color =
    value >= 70 ? 'var(--color-alert)' : value >= 35 ? 'var(--color-amber)' : 'var(--color-phosphor)';

  const gauge = (
    <div className="flex items-center gap-2">
      <svg
        role="meter"
        aria-label={t('mascot_meter_aria')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        width={compact ? 34 : 56}
        height={compact ? 20 : 32}
        viewBox="0 0 56 32"
      >
        <path
          d="M6 28 A 22 22 0 0 1 50 28"
          fill="none"
          stroke="var(--color-line-bright)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <m.line
          x1="28"
          y1="28"
          x2="28"
          y2="10"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ transformOrigin: '28px 28px' }}
          initial={false}
          animate={{ rotate: angle }}
          transition={{ type: 'spring', stiffness: 160, damping: 18 }}
        />
        <circle cx="28" cy="28" r="2.5" fill={color} />
      </svg>
      <span className="font-mono text-xs" style={{ color }}>
        {Math.round(value)}
      </span>
    </div>
  );

  if (compact) return gauge;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-left"
        title={t('mascot_meter_title')}
      >
        {gauge}
        <span className="font-mono text-[10px] uppercase tracking-widest text-(--color-faint)">
          {t('mascot_meter_title')} {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <ul className="flex flex-col gap-1 font-mono text-[11px] text-(--color-dim)">
          {contributors.length === 0 && <li>{t('mascot_contrib_none')}</li>}
          {contributors.map((c) => (
            <li key={c.key + JSON.stringify(c.params ?? {})}>
              <span className="text-(--color-amber)">+{c.points}</span> · {t(c.key, c.params)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
