import { useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { mascotEvent, mascotReport } from '@/stores/mascot';
import HeatStrip from './HeatStrip';
import { ChoiceQuestion, PrimaryButton } from './shared';

/**
 * Both rot experiments share one lab: probe authored recall tables until the
 * curve is visible, then commit. mode 'position' varies WHERE the needle
 * sits; mode 'length' varies how much filler surrounds a well-placed needle.
 */
export default function NeedleLab({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'needle-lab') throw new Error('wrong lesson');
  const params = lesson.params;
  const t = (key: string, params2?: Record<string, string | number>) =>
    lessonText(key, locale, params2);
  const nf = new Intl.NumberFormat(locale);

  const spots = params.mode === 'position' ? params.positions : params.options;
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [lastRun, setLastRun] = useState<number | null>(null);
  const [committed, setCommitted] = useState<number | null>(null);
  const passedRef = useRef(false);

  const runRetrieval = () => {
    if (selected === null) return;
    setRevealed((r) => new Set(r).add(selected));
    setLastRun(selected);
    const spot = spots[selected]!;
    mascotReport({ needleRecallPct: spot.recallPct });
    mascotEvent(spot.success ? 'retrieve-hit' : 'retrieve-miss');

    if (params.mode === 'position') {
      // The placement IS the answer: a successful retrieval passes the level.
      if (lesson.pass.type !== 'choiceOneOf') throw new Error('wrong pass type');
      const verdict = evaluate(lesson.pass, { type: 'choice', selectedIndex: selected });
      if (verdict.pass && spots[selected]!.success && !passedRef.current) {
        passedRef.current = true;
        onPass();
      }
    }
  };

  const commit = (index: number) => {
    if (params.mode !== 'length' || committed !== null) return;
    if (lesson.pass.type !== 'choice') throw new Error('wrong pass type');
    setCommitted(index);
    const verdict = evaluate(lesson.pass, { type: 'choice', selectedIndex: index });
    if (verdict.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  const lastSpot = lastRun !== null ? spots[lastRun]! : null;
  const correctIndex = lesson.pass.type === 'choice' ? lesson.pass.correctIndex : null;

  return (
    <div className="flex flex-col gap-4">
      {/* the needle */}
      <div className="ta-panel flex flex-col gap-1 p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-(--color-faint)">
          {t('needle_fact_tag')}
        </p>
        <p className="font-mono text-sm text-(--color-amber)">{t(params.needleKey)}</p>
        <p className="mt-2 text-sm text-(--color-dim)">{t(params.questionKey)}</p>
        {params.mode === 'position' && (
          <p className="mt-1 font-mono text-xs text-(--color-faint)">
            {t('needle_context_size', { tokens: nf.format(params.contextTokens) })}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
          {params.mode === 'position' ? t('needle_position_label') : t('needle_length_label')}
        </p>
        <HeatStrip
          spots={spots.map((spot, i) => ({
            labelKey: spot.labelKey,
            recallPct: spot.recallPct,
            revealed: revealed.has(i),
          }))}
          selected={selected}
          onSelect={(i) => {
            setSelected(i);
            setLastRun(null);
          }}
          disabled={committed !== null}
          locale={locale}
        />
      </div>

      {committed === null && (
        <PrimaryButton onClick={runRetrieval} disabled={selected === null}>
          {t('needle_run_cta')}
        </PrimaryButton>
      )}

      {lastSpot && (
        <p
          aria-live="polite"
          className={`rounded border p-3 text-sm ${
            lastSpot.success
              ? 'border-(--color-phosphor-deep) text-(--color-phosphor)'
              : 'border-(--color-alert) text-(--color-alert)'
          }`}
        >
          {lastSpot.success ? '✓ ' : '✗ '}
          {t(lastSpot.success ? params.hitKey : params.missKey, { pct: lastSpot.recallPct })}
        </p>
      )}

      {/* length mode: after probing, commit to the cheapest context that works */}
      {params.mode === 'length' && revealed.size >= 2 && (
        <ChoiceQuestion
          prompt={t(params.promptKey)}
          options={params.options.map((option) =>
            `${t(option.labelKey)} · ${nf.format(option.contextTokens)}`,
          )}
          selected={committed}
          onSelect={commit}
          verdict={committed !== null && correctIndex !== null ? { correctIndex } : null}
        />
      )}
      {params.mode === 'length' && committed !== null && (
        <p className="max-w-prose border-l-2 border-(--color-ice) pl-3 text-sm text-(--color-dim)">
          {t(params.explainKey)}
        </p>
      )}
      {params.mode === 'length' && committed !== null && committed !== correctIndex && (
        <PrimaryButton onClick={() => setCommitted(null)}>{t('ui_retry')}</PrimaryButton>
      )}
    </div>
  );
}
