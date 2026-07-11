import { useEffect, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { fillInfo } from '@/engine/contextModel';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { GhostButton, PrimaryButton, ROLE_COLOR, ROLE_TAG } from '@/components/mechanics/shared';
import { useSimWalkthrough } from '@/components/mechanics/useSimWalkthrough';
import SceneFrame from '../SceneFrame';
import { useAnimationQueue } from '../useAnimationQueue';
import { m, AnimatePresence } from '../motion';
import {
  arrayMove,
  DndScene,
  SortableList,
  SortableRow,
  sortableKeyboardCoordinates,
  type DragEndEvent,
} from '../dnd';

const count = () => 0; // lesson blocks always carry authored fixedTokens

/**
 * G3.2 — The Assembly Line. The walkthrough runs the two-request tool turn
 * with a robot arm (host code) dropping each result back INTO the window box
 * — tool results visibly consume context. The ordering pass becomes
 * arranging the line's stations with the shared sortable rows; evidence is
 * the same `ordering` permutation the classic checks.
 */
export default function AssemblyLineScene({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'tool-loop') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'ordering') throw new Error('wrong pass type');
  const { cards, initialOrder, orderPromptKey } = lesson.params;
  const size = lesson.pass.size;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const { entries, context, frozen, done, step } = useSimWalkthrough(lesson);
  const fill = fillInfo(context, count);
  const animation = useAnimationQueue();
  const beatIdRef = useRef(0);

  const [arrangement, setArrangement] = useState<number[]>([...initialOrder]);
  const [orderResult, setOrderResult] = useState<boolean | null>(null);
  const passedRef = useRef(false);

  // the arm swings whenever a tool-result block lands in the window
  const toolResultCount = entries.filter((e) => e.block?.kind === 'tool-result').length;
  const prevToolResults = useRef(0);
  useEffect(() => {
    if (toolResultCount > prevToolResults.current) {
      animation.enqueue({
        id: `arm-${++beatIdRef.current}`,
        kind: 'arm',
        durationMs: 450,
        cinematic: true,
      });
    }
    prevToolResults.current = toolResultCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolResultCount]);

  const armSwinging = animation.activeBeat?.kind === 'arm' && !animation.lastDelivery?.instant;

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setArrangement((current) => {
      const oldIndex = current.indexOf(Number(active.id));
      const newIndex = current.indexOf(Number(over.id));
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
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
    <SceneFrame
      locale={locale}
      animation={animation}
      status={t('compaction_fill_line', {
        used: nf.format(fill.used + fill.reserved),
        window: nf.format(fill.window),
      })}
    >
      <div className="flex flex-col gap-5">
        {/* phase 1: the line runs one tool turn */}
        <div className="flex flex-wrap items-start gap-4">
          <div className="ta-panel flex min-w-64 flex-[2] flex-col gap-2 p-4">
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
                  className="flex items-center gap-2 border-l-2 pl-2 font-mono text-xs"
                  style={{ borderLeftColor: ROLE_COLOR[block.role] }}
                >
                  <span style={{ color: ROLE_COLOR[block.role] }}>{ROLE_TAG[block.role]}</span>
                  <span className="text-(--color-ink)">
                    {block.labelKey ? t(block.labelKey) : block.id}
                  </span>
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

          {/* the window box the arm feeds */}
          <div className="relative flex min-w-52 flex-1 flex-col gap-1.5">
            <AnimatePresence>
              {armSwinging && (
                <m.div
                  key={`arm-${beatIdRef.current}`}
                  aria-hidden="true"
                  initial={{ rotate: -60, opacity: 0 }}
                  animate={{ rotate: [null, 0, 10], opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  className="absolute -top-6 right-2 z-10 origin-bottom-right font-mono text-xl text-(--color-role-tool)"
                >
                  ⌁🦾
                </m.div>
              )}
            </AnimatePresence>
            <div className="ta-panel flex flex-col gap-1 p-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-(--color-faint)">
                {t('game_line_window')}
              </p>
              <div className="flex flex-col-reverse gap-1">
                {context.blocks.map((block) => (
                  <m.div
                    key={block.id}
                    layout
                    initial={{ y: -12, opacity: 0, scaleY: 1.3 }}
                    animate={{ y: 0, opacity: 1, scaleY: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                    className="flex items-center gap-2 rounded-sm px-2 py-1 font-mono text-[10px]"
                    style={{
                      background: `color-mix(in oklab, ${ROLE_COLOR[block.role]} 22%, var(--color-raised))`,
                      borderLeft: `3px solid ${ROLE_COLOR[block.role]}`,
                    }}
                  >
                    <span style={{ color: ROLE_COLOR[block.role] }}>{ROLE_TAG[block.role]}</span>
                    <span className="truncate text-(--color-ink)">
                      {block.labelKey ? t(block.labelKey) : block.id}
                    </span>
                    <span className="ml-auto text-(--color-dim)">{block.fixedTokens}</span>
                  </m.div>
                ))}
              </div>
              <p className="mt-1 font-mono text-[10px] text-(--color-dim)">
                {t('compaction_fill_line', {
                  used: nf.format(fill.used + fill.reserved),
                  window: nf.format(fill.window),
                })}
              </p>
            </div>
          </div>
        </div>

        {/* phase 2: arrange the stations */}
        {done && (
          <DndScene
            locale={locale}
            onDragEnd={onDragEnd}
            keyboardCoordinateGetter={sortableKeyboardCoordinates}
          >
            <div className="flex flex-col gap-3">
              <p className="max-w-prose text-sm text-(--color-ink)">{t(orderPromptKey)}</p>
              <p className="font-mono text-xs text-(--color-faint)">{t('game_line_sort_hint')}</p>
              <SortableList ids={arrangement.map(String)}>
                <ol className="flex flex-col gap-2">
                  {arrangement.map((cardIndex, position) => (
                    <SortableRow
                      key={cardIndex}
                      id={String(cardIndex)}
                      label={t(cards[cardIndex]!.textKey)}
                      className="rounded"
                    >
                      <div className="ta-panel flex items-center gap-3 p-3">
                        <span className="font-mono text-xs text-(--color-faint)">
                          {position + 1}.
                        </span>
                        <span aria-hidden="true" className="cursor-grab text-(--color-faint)">
                          ⠿
                        </span>
                        <span className="flex-1 text-sm text-(--color-ink)">
                          {t(cards[cardIndex]!.textKey)}
                        </span>
                      </div>
                    </SortableRow>
                  ))}
                </ol>
              </SortableList>
              <PrimaryButton onClick={checkOrder}>{t('toolloop_check_cta')}</PrimaryButton>
              {orderResult === false && (
                <div className="flex flex-col gap-2">
                  <p aria-live="polite" className="font-mono text-sm text-(--color-alert)">
                    ✗ {t('toolloop_wrong_note')}
                  </p>
                  <GhostButton onClick={() => setOrderResult(null)}>{t('ui_retry')}</GhostButton>
                </div>
              )}
              {orderResult === true && (
                <p aria-live="polite" className="font-mono text-sm text-(--color-phosphor)">
                  ✓ {t('toolloop_right_note')}
                </p>
              )}
            </div>
          </DndScene>
        )}
      </div>
    </SceneFrame>
  );
}
