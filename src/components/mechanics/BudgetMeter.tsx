import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';

interface Props {
  /** Tokens currently spent (input + any reserve, per the lesson's rules). */
  total: number;
  budget: number;
  locale: Locale;
}

/** Compact budget bar shared by the trim-to-fit mechanics. */
export default function BudgetMeter({ total, budget, locale }: Props) {
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);
  const ratio = budget > 0 ? total / budget : Number.POSITIVE_INFINITY;
  const over = total > budget;
  const color = over
    ? 'var(--color-alert)'
    : ratio >= 0.85
      ? 'var(--color-amber)'
      : 'var(--color-phosphor)';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between font-mono text-xs">
        <span className="uppercase tracking-widest text-(--color-faint)">{t('budget_label')}</span>
        <span style={{ color }}>
          {nf.format(total)} / {nf.format(budget)}
          {over && ` (+${nf.format(total - budget)})`}
        </span>
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={Math.min(total, budget)}
        aria-label={t('budget_label')}
        className="h-2 overflow-hidden rounded-sm border border-(--color-line) bg-(--color-surface)"
      >
        <div
          className="h-full transition-[width] duration-300"
          style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }}
        />
      </div>
      {over && (
        <p className="font-mono text-xs text-(--color-alert)">▲ {t('ui_over_window')}</p>
      )}
    </div>
  );
}
