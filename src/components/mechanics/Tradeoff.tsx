import { useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { ChoiceQuestion, GhostButton } from './shared';

/**
 * The "no right answer" level. Every strategy is legitimate; what's scored
 * is whether the player can name the specific cost of the one they picked.
 */
export default function Tradeoff({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'tradeoff') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'tradeoff') throw new Error('wrong pass type');
  const { scenarioKey, strategies } = lesson.params;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  const [strategyIndex, setStrategyIndex] = useState<number | null>(null);
  const [predicted, setPredicted] = useState<number | null>(null);
  const passedRef = useRef(false);

  const strategy = strategyIndex !== null ? strategies[strategyIndex]! : null;

  const predict = (index: number) => {
    if (!strategy || predicted !== null) return;
    setPredicted(index);
    const verdict = evaluate(
      { type: 'tradeoff' },
      { type: 'tradeoff', predictedIndex: index, correctIndex: strategy.downsideCorrectIndex },
    );
    if (verdict.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  const reset = () => {
    setStrategyIndex(null);
    setPredicted(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="ta-panel max-w-prose p-4 text-sm text-(--color-ink)">{t(scenarioKey)}</p>

      {/* phase 1: pick a strategy — none of these is wrong */}
      {strategy === null && (
        <div className="flex flex-col gap-2" role="group" aria-label={t('tradeoff_pick_aria')}>
          <p className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
            {t('tradeoff_pick_title')}
          </p>
          {strategies.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStrategyIndex(i)}
              className="ta-panel cursor-pointer p-3 text-left text-sm text-(--color-ink) transition-colors hover:border-(--color-ice)"
            >
              {t(s.labelKey)}
            </button>
          ))}
          <p className="font-mono text-xs text-(--color-faint)">{t('tradeoff_no_wrong_note')}</p>
        </div>
      )}

      {/* phase 2: own the downside */}
      {strategy && (
        <div className="flex flex-col gap-3">
          <p className="rounded border border-(--color-ice) p-3 text-sm text-(--color-dim)">
            {t(strategy.outcomeKey)}
          </p>
          <ChoiceQuestion
            prompt={t(strategy.downsidePromptKey)}
            options={strategy.downsideOptionKeys.map((key) => t(key))}
            selected={predicted}
            onSelect={predict}
            verdict={predicted !== null ? { correctIndex: strategy.downsideCorrectIndex } : null}
          />
          {predicted !== null && (
            <p className="max-w-prose border-l-2 border-(--color-ice) pl-3 text-sm text-(--color-dim)">
              {t(strategy.explainKey)}
            </p>
          )}
          {predicted !== null && predicted !== strategy.downsideCorrectIndex && (
            <GhostButton onClick={reset}>{t('tradeoff_retry_cta')}</GhostButton>
          )}
          {predicted === null && (
            <GhostButton onClick={reset}>{t('tradeoff_back_cta')}</GhostButton>
          )}
        </div>
      )}
    </div>
  );
}
