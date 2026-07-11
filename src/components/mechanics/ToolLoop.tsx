import { useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { PrimaryButton, ROLE_COLOR, ROLE_TAG } from './shared';
import { useSimWalkthrough } from './useSimWalkthrough';

export default function ToolLoop({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'tool-loop') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'ordering') throw new Error('wrong pass type');
  const { cards, initialOrder, orderPromptKey } = lesson.params;
  const size = lesson.pass.size;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  const { entries, frozen, done, step } = useSimWalkthrough(lesson);

  // arrangement[displayPosition] = canonical card index.
  const [arrangement, setArrangement] = useState<number[]>([...initialOrder]);
  const [orderResult, setOrderResult] = useState<boolean | null>(null);
  const passedRef = useRef(false);

  const move = (position: number, delta: -1 | 1) => {
    const target = position + delta;
    if (target < 0 || target >= arrangement.length) return;
    setArrangement((current) => {
      const next = [...current];
      [next[position], next[target]] = [next[target]!, next[position]!];
      return next;
    });
    setOrderResult(null);
  };

  const checkOrder = () => {
    const verdict = evaluate({ type: 'ordering', size }, { type: 'ordering', order: arrangement });
    setOrderResult(verdict.pass);
    if (verdict.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* phase 1: watch one tool turn happen, block by block */}
      <div className="ta-panel flex flex-col gap-2 p-4">
        {entries.map((entry, i) => {
          if (entry.kind === 'narration') {
            return (
              <p key={i} className="max-w-prose text-sm text-(--color-dim)">
                {t(entry.textKey!)}
              </p>
            );
          }
          if (entry.kind === 'send') {
            return (
              <p key={i} className="font-mono text-xs text-(--color-phosphor)">
                ▸ {entry.textKey ? t(entry.textKey) : t('toolloop_send_line')}
              </p>
            );
          }
          const block = entry.block!;
          return (
            <p
              key={i}
              className="flex items-center gap-2 border-l-2 pl-2 font-mono text-xs motion-safe:animate-[ta-pop-in_0.25s_ease-out]"
              style={{ borderLeftColor: ROLE_COLOR[block.role] }}
            >
              <span style={{ color: ROLE_COLOR[block.role] }}>{ROLE_TAG[block.role]}</span>
              <span className="text-(--color-ink)">{block.labelKey ? t(block.labelKey) : block.id}</span>
              <span className="ml-auto text-(--color-dim)">+{block.fixedTokens}</span>
            </p>
          );
        })}

        {frozen && (
          <p className="rounded border border-(--color-amber) p-2 text-sm text-(--color-amber)">
            {t(frozen.noteKey)}
          </p>
        )}
        {!done && (
          <PrimaryButton onClick={step}>
            {frozen ? t('ui_continue') : t('toolloop_step_cta')}
          </PrimaryButton>
        )}
      </div>

      {/* phase 2: rebuild the loop from memory */}
      {done && (
        <div className="flex flex-col gap-3">
          <p className="max-w-prose text-sm text-(--color-ink)">{t(orderPromptKey)}</p>
          <ol className="flex flex-col gap-2">
            {arrangement.map((cardIndex, position) => (
              <li key={cardIndex} className="ta-panel flex items-center gap-3 p-3">
                <span className="font-mono text-xs text-(--color-faint)">{position + 1}.</span>
                <span className="flex-1 text-sm text-(--color-ink)">{t(cards[cardIndex]!.textKey)}</span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(position, -1)}
                    disabled={position === 0}
                    aria-label={t('toolloop_move_up_aria')}
                    className="rounded border border-(--color-line-bright) px-2 py-1 font-mono text-xs text-(--color-dim) enabled:hover:text-(--color-ink) disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(position, 1)}
                    disabled={position === arrangement.length - 1}
                    aria-label={t('toolloop_move_down_aria')}
                    className="rounded border border-(--color-line-bright) px-2 py-1 font-mono text-xs text-(--color-dim) enabled:hover:text-(--color-ink) disabled:opacity-30"
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <PrimaryButton onClick={checkOrder}>{t('toolloop_check_cta')}</PrimaryButton>
          {orderResult === false && (
            <p aria-live="polite" className="font-mono text-sm text-(--color-alert)">
              ✗ {t('toolloop_wrong_note')}
            </p>
          )}
          {orderResult === true && (
            <p aria-live="polite" className="font-mono text-sm text-(--color-phosphor)">
              ✓ {t('toolloop_right_note')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
