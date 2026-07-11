import { useMemo, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { computeBill } from '@/engine/billing';
import { blockTokens } from '@/engine/contextModel';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { buildContextState, ChoiceQuestion, GhostButton } from './shared';

const count = () => 0;

export default function HistoryBill({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'history-bill') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choice') throw new Error('wrong pass type');
  if (!lesson.initialState) throw new Error('missing initialState');
  const { turns, pricePerMTokIn, cachedReadFactor, question } = lesson.params;
  const correctIndex = lesson.pass.correctIndex;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const cf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  const [caching, setCaching] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<{ correctIndex: number } | null>(null);
  const passedRef = useRef(false);

  const initialTokens = useMemo(
    () =>
      buildContextState(lesson.initialState!).blocks.reduce(
        (sum, block) => sum + blockTokens(block, count),
        0,
      ),
    [lesson.initialState],
  );

  const billTurns = turns.map((turn) => ({
    inputTokens: turn.inputTokens,
    outputTokens: turn.outputTokens,
  }));
  const bill = computeBill(initialTokens, billTurns, pricePerMTokIn, {
    caching,
    cachedReadFactor,
  });
  const billOff = computeBill(initialTokens, billTurns, pricePerMTokIn, {
    caching: false,
    cachedReadFactor,
  });
  const maxTurnTokens = Math.max(...bill.turns.map((turn) => turn.prefixTokens + turn.freshTokens));

  const answer = (index: number) => {
    setSelected(index);
    setVerdict({ correctIndex });
    const result = evaluate({ type: 'choice', correctIndex }, { type: 'choice', selectedIndex: index });
    if (result.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="ta-panel flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-widest text-(--color-dim)">
            {t('l2_2_bill_title')}
          </p>
          <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-(--color-ink)">
            <input
              type="checkbox"
              checked={caching}
              onChange={(e) => setCaching(e.target.checked)}
              className="accent-(--color-phosphor)"
            />
            {t('l2_2_caching_toggle')}
          </label>
        </div>

        {/* per-turn stacked bars: dim prefix (re-sent) + bright fresh tokens */}
        <ol className="flex flex-col gap-2">
          {bill.turns.map((turn, i) => {
            const width = ((turn.prefixTokens + turn.freshTokens) / maxTurnTokens) * 100;
            const prefixShare = (turn.prefixTokens / (turn.prefixTokens + turn.freshTokens)) * 100;
            return (
              <li key={i} className="flex items-center gap-3">
                <span className="w-8 shrink-0 font-mono text-[10px] text-(--color-faint)">
                  #{i + 1}
                </span>
                <span
                  className="h-4 overflow-hidden rounded-sm border border-(--color-line)"
                  style={{ width: `${Math.max(width, 4)}%` }}
                  title={t(turns[i]!.labelKey)}
                >
                  <span className="flex h-full">
                    <span
                      className={caching ? 'ta-hatch h-full bg-(--color-faint)/40' : 'h-full bg-(--color-amber)/70'}
                      style={{ width: `${prefixShare}%` }}
                    />
                    <span className="h-full flex-1 bg-(--color-phosphor)/80" />
                  </span>
                </span>
                <span className="ml-auto shrink-0 font-mono text-[11px] text-(--color-dim)">
                  {nf.format(turn.prefixTokens + turn.freshTokens)} tok ·{' '}
                  <span className={caching ? 'text-(--color-phosphor)' : ''}>
                    {cf.format(turn.cost)} cr
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-(--color-line) pt-3 font-mono text-sm">
          <span>
            {t('l2_2_total_line')}:{' '}
            <strong className={caching ? 'text-(--color-phosphor) text-glow' : 'text-(--color-amber)'}>
              {cf.format(bill.totalCost)} cr
            </strong>
          </span>
          {caching && (
            <span className="text-xs text-(--color-dim)">
              {t('l2_2_saved_line', { amount: cf.format(billOff.totalCost - bill.totalCost) })}
            </span>
          )}
          <span className="ml-auto text-xs text-(--color-faint)" title={t('l2_2_window_note')}>
            {t('l2_2_window_line', { tokens: nf.format(bill.finalContextTokens) })}
          </span>
        </div>

        <p className="max-w-prose border-l-2 border-(--color-ice) pl-3 text-xs text-(--color-dim)">
          {t('l2_2_window_note')}
        </p>
      </div>

      <ChoiceQuestion
        prompt={t(question.promptKey)}
        options={question.optionKeys.map((key) => t(key))}
        selected={selected}
        onSelect={answer}
        verdict={verdict}
      />
      {verdict && selected !== correctIndex && (
        <>
          <p className="max-w-prose border-l-2 border-(--color-alert) pl-3 text-sm text-(--color-dim)">
            {t('l2_2_wrong_explain')}
          </p>
          <GhostButton
            onClick={() => {
              setSelected(null);
              setVerdict(null);
            }}
          >
            {t('ui_retry')}
          </GhostButton>
        </>
      )}
    </div>
  );
}
