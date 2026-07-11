import { useEffect, useMemo, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { fillInfo, type ContextBlock, type ContextState } from '@/engine/contextModel';
import { MODEL_PROFILES } from '@/engine/modelProfiles';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { showInspector, signalSend, updateInspectorState } from '@/stores/inspector';
import BudgetMeter from './BudgetMeter';
import { buildContextState, GhostButton, PrimaryButton, ROLE_COLOR, ROLE_TAG } from './shared';

const count = () => 0; // lesson blocks always carry authored fixedTokens

type BlockChoice = 'keep' | 'removed' | 'summary';
type SendResult = 'tooLong' | 'missing' | 'ok';

export default function WindowFit({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'window-fit') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'budgetFit') throw new Error('wrong pass type');
  if (!lesson.initialState) throw new Error('missing initialState');
  const { items, errorKey, successKey } = lesson.params;
  const budget = lesson.pass.budget;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const [choices, setChoices] = useState<Record<string, BlockChoice>>({});
  const [result, setResult] = useState<SendResult | null>(null);
  const passedRef = useRef(false);

  const itemOf = (blockId: string) => items.find((item) => item.blockId === blockId);

  const context: ContextState = useMemo(() => {
    const initial = buildContextState(lesson.initialState!);
    const blocks: ContextBlock[] = [];
    for (const block of initial.blocks) {
      const choice = choices[block.id] ?? 'keep';
      if (choice === 'removed') continue;
      if (choice === 'summary') {
        const item = itemOf(block.id)!;
        blocks.push({
          ...block,
          labelKey: item.summaryLabelKey ?? block.labelKey,
          fixedTokens: item.summaryTokens,
        });
        continue;
      }
      blocks.push(block);
    }
    return { ...initial, blocks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices]);

  useEffect(() => {
    showInspector(buildContextState(lesson.initialState!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    updateInspectorState(context);
  }, [context]);

  const fill = fillInfo(context, count);
  const total = fill.used + fill.reserved;
  const requiredKept = items
    .filter((item) => item.required)
    .every((item) => (choices[item.blockId] ?? 'keep') !== 'removed');

  const choose = (blockId: string, choice: BlockChoice) => {
    setChoices((current) => ({ ...current, [blockId]: choice }));
    setResult(null);
  };

  const send = () => {
    signalSend();
    if (total > budget) {
      setResult('tooLong');
      return;
    }
    if (!requiredKept) {
      setResult('missing');
      return;
    }
    setResult('ok');
    const verdict = evaluate(
      { type: 'budgetFit', budget },
      { type: 'budgetFit', totalTokens: total, requiredKept },
    );
    if (verdict.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  const initialBlocks = buildContextState(lesson.initialState!).blocks;

  return (
    <div className="flex flex-col gap-4">
      <BudgetMeter total={total} budget={budget} locale={locale} />

      {/* the payload, block by block */}
      <ul className="flex flex-col gap-2">
        {initialBlocks.map((block) => {
          const item = itemOf(block.id);
          const choice = choices[block.id] ?? 'keep';
          const tokensNow =
            choice === 'summary' ? item?.summaryTokens ?? 0 : block.fixedTokens ?? 0;
          return (
            <li
              key={block.id}
              className={`ta-panel flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 p-3 ${
                choice === 'removed' ? 'opacity-45' : ''
              }`}
              style={{ borderLeftColor: ROLE_COLOR[block.role] }}
            >
              <span className="font-mono text-[10px]" style={{ color: ROLE_COLOR[block.role] }}>
                {ROLE_TAG[block.role]}
              </span>
              <span
                className={`text-sm ${choice === 'removed' ? 'line-through' : ''} text-(--color-ink)`}
              >
                {block.labelKey ? t(block.labelKey) : block.id}
                {choice === 'summary' && (
                  <span className="ml-2 rounded border border-(--color-ice) px-1.5 py-0.5 font-mono text-[10px] text-(--color-ice)">
                    {t('windowfit_summarized_tag')}
                  </span>
                )}
              </span>
              <span className="ml-auto font-mono text-xs text-(--color-dim)">
                {choice === 'removed' ? '—' : nf.format(tokensNow)}
              </span>
              {item && (
                <span className="flex gap-1.5">
                  {choice !== 'keep' && (
                    <button
                      type="button"
                      onClick={() => choose(block.id, 'keep')}
                      className="rounded border border-(--color-line-bright) px-2 py-1 font-mono text-[10px] text-(--color-dim) hover:text-(--color-ink)"
                    >
                      {t('windowfit_restore_cta')}
                    </button>
                  )}
                  {item.summaryTokens !== undefined && choice !== 'summary' && (
                    <button
                      type="button"
                      onClick={() => choose(block.id, 'summary')}
                      className="rounded border border-(--color-ice) px-2 py-1 font-mono text-[10px] text-(--color-ice) hover:bg-(--color-raised)"
                    >
                      {t('windowfit_summarize_cta', { tokens: nf.format(item.summaryTokens) })}
                    </button>
                  )}
                  {item.removable && choice !== 'removed' && (
                    <button
                      type="button"
                      onClick={() => choose(block.id, 'removed')}
                      className="rounded border border-(--color-alert) px-2 py-1 font-mono text-[10px] text-(--color-alert) hover:bg-(--color-raised)"
                    >
                      {t('windowfit_remove_cta')}
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
        <li className="flex items-center justify-between px-3 font-mono text-xs text-(--color-dim)">
          <span>{t('windowfit_reserved_line')}</span>
          <span>{nf.format(fill.reserved)}</span>
        </li>
      </ul>

      {/* the same payload against bigger windows — the bar rescales, the bytes don't */}
      <div className="flex flex-wrap items-baseline gap-2 font-mono text-[10px] text-(--color-faint)">
        <span className="uppercase tracking-widest">{t('windowfit_other_windows')}</span>
        {MODEL_PROFILES.filter((p) => p.id !== context.model.id && p.family === 'generic').map(
          (profile) => (
            <span key={profile.id} className="rounded border border-(--color-line) px-2 py-0.5">
              {t(profile.labelKey)}: {Math.round((total / profile.contextWindow) * 100)}%
            </span>
          ),
        )}
      </div>

      <div className="flex items-center gap-3">
        <PrimaryButton onClick={send}>{t('windowfit_send_cta')}</PrimaryButton>
      </div>

      {result === 'tooLong' && (
        <p
          aria-live="polite"
          className="ta-hatch rounded border border-(--color-alert) p-3 font-mono text-sm text-(--color-alert)"
        >
          {t(errorKey, { over: nf.format(total - budget) })}
        </p>
      )}
      {result === 'missing' && (
        <div aria-live="polite" className="flex flex-col gap-2">
          <p className="rounded border border-(--color-amber) p-3 text-sm text-(--color-amber)">
            {t('ui_required_missing')}
          </p>
          <GhostButton onClick={() => setResult(null)}>{t('ui_retry')}</GhostButton>
        </div>
      )}
      {result === 'ok' && (
        <p aria-live="polite" className="rounded border border-(--color-phosphor-deep) p-3 text-sm text-(--color-phosphor)">
          ✓ {t(successKey, { total: nf.format(total) })}
        </p>
      )}
    </div>
  );
}
