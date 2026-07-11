import { useEffect, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { fillInfo, setReservedOutput, type ContextState } from '@/engine/contextModel';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { showInspector, signalSend, updateInspectorState } from '@/stores/inspector';
import BudgetMeter from './BudgetMeter';
import { buildContextState, PrimaryButton } from './shared';

const count = () => 0; // lesson blocks always carry authored fixedTokens

type SendResult = 'tooLong' | 'truncated' | 'ok';

export default function OutputReserve({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'output-reserve') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'budgetFit') throw new Error('wrong pass type');
  if (!lesson.initialState) throw new Error('missing initialState');
  const { requiredOutputTokens, sliderMax, sliderStep, taskKey, fullReplyKey, truncatedReplyKey, successKey } =
    lesson.params;
  const budget = lesson.pass.budget;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const [context, setContext] = useState<ContextState>(() => buildContextState(lesson.initialState!));
  const [result, setResult] = useState<SendResult | null>(null);
  const passedRef = useRef(false);

  useEffect(() => {
    showInspector(buildContextState(lesson.initialState!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fill = fillInfo(context, count);
  const total = fill.used + fill.reserved;

  const setReserve = (tokens: number) => {
    const next = setReservedOutput(context, tokens);
    setContext(next);
    updateInspectorState(next);
    setResult(null);
  };

  const send = () => {
    signalSend();
    if (total > budget) {
      setResult('tooLong');
      return;
    }
    if (fill.reserved < requiredOutputTokens) {
      setResult('truncated');
      return;
    }
    setResult('ok');
    const verdict = evaluate(
      { type: 'budgetFit', budget },
      { type: 'budgetFit', totalTokens: total, requiredKept: fill.reserved >= requiredOutputTokens },
    );
    if (verdict.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="ta-panel max-w-prose p-4 text-sm text-(--color-ink)">{t(taskKey)}</p>

      <BudgetMeter total={total} budget={budget} locale={locale} />

      {/* max_tokens, made physical */}
      <div className="ta-panel flex flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between">
          <label htmlFor="reserve-slider" className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
            {t('reserve_slider_label')}
          </label>
          <span className="font-mono text-sm text-(--color-ice)">{nf.format(fill.reserved)}</span>
        </div>
        <input
          id="reserve-slider"
          type="range"
          min={0}
          max={sliderMax}
          step={sliderStep}
          value={fill.reserved}
          onChange={(event) => setReserve(Number(event.target.value))}
          className="accent-(--color-ice)"
        />
        <p className="font-mono text-xs text-(--color-dim)">
          {t('reserve_input_line', { input: nf.format(fill.used) })}
        </p>
      </div>

      <PrimaryButton onClick={send}>{t('reserve_send_cta')}</PrimaryButton>

      {result === 'tooLong' && (
        <p aria-live="polite" className="ta-hatch rounded border border-(--color-alert) p-3 font-mono text-sm text-(--color-alert)">
          {t('ui_over_window_error', { over: nf.format(total - budget) })}
        </p>
      )}
      {result === 'truncated' && (
        <div aria-live="polite" className="ta-panel border border-(--color-amber) p-4">
          <p className="text-sm text-(--color-dim)">
            {t(truncatedReplyKey)}
            <span aria-hidden="true" className="motion-safe:animate-pulse text-(--color-amber)">▌</span>
          </p>
          <p className="mt-2 border-t border-(--color-line) pt-2 font-mono text-xs text-(--color-amber)">
            ⚠ {t('reserve_truncated_note', { reserved: nf.format(fill.reserved) })}
          </p>
        </div>
      )}
      {result === 'ok' && (
        <div aria-live="polite" className="ta-panel border border-(--color-phosphor-deep) p-4">
          <p className="text-sm text-(--color-ink)">{t(fullReplyKey)}</p>
          <p className="mt-2 border-t border-(--color-line) pt-2 font-mono text-xs text-(--color-phosphor)">
            ✓ {t(successKey, { reserved: nf.format(fill.reserved) })}
          </p>
        </div>
      )}
    </div>
  );
}
