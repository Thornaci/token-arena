import { useEffect, useMemo, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { fillInfo } from '@/engine/contextModel';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { GhostButton, PrimaryButton, ROLE_COLOR, ROLE_TAG } from '@/components/mechanics/shared';
import { useSimWalkthrough } from '@/components/mechanics/useSimWalkthrough';
import SceneFrame from '../SceneFrame';
import { useAnimationQueue } from '../useAnimationQueue';
import { m, AnimatePresence } from '../motion';
import { DndScene, DraggableBlock, DropZone, type DragEndEvent } from '../dnd';

const count = () => 0; // lesson blocks always carry authored fixedTokens

/**
 * G3.1 — The Compactor. The same deterministic walkthrough as the classic
 * (useSimWalkthrough, untouched), but compaction is a press: dropped turns
 * slide into the shredder, the summary emerges as a small cube with the
 * token collapse on its face. The "what does the agent still know?" rounds
 * become fact cards dragged into the remembered tray — same choiceRounds
 * evidence as the classic RoundsQuiz.
 */
export default function CompactorScene({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'compaction-sim') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const { rounds } = lesson.params;
  const passCheck = lesson.pass;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const { entries, context, frozen, done, step } = useSimWalkthrough(lesson);
  const fill = fillInfo(context, count);
  const animation = useAnimationQueue();
  const beatIdRef = useRef(0);

  const removedEntries = entries.filter((entry) => entry.removed);
  const summaryBlock = context.blocks.find((block) => block.id === 'summary');
  const removedTokens = removedEntries.reduce(
    (sum, entry) => sum + (entry.block?.fixedTokens ?? 0),
    0,
  );

  // a new drop into the press = the level's one spectacle
  const removedCount = removedEntries.length;
  const prevRemoved = useRef(0);
  useEffect(() => {
    if (removedCount > prevRemoved.current) {
      animation.enqueue({
        id: `press-${++beatIdRef.current}`,
        kind: 'press',
        durationMs: 500,
        cinematic: true,
      });
    }
    prevRemoved.current = removedCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removedCount]);

  const pressing = animation.activeBeat?.kind === 'press' && !animation.lastDelivery?.instant;

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
        {/* transcript — the memory the agent will lose */}
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
                  ▸ {entry.textKey ? t(entry.textKey) : t('compaction_send_line')}
                </p>
              );
            }
            const block = entry.block!;
            return (
              <m.p
                key={i}
                layout
                className={`flex items-center gap-2 border-l-2 pl-2 font-mono text-xs ${
                  entry.removed ? 'opacity-45' : ''
                }`}
                style={{ borderLeftColor: ROLE_COLOR[block.role] }}
              >
                <span style={{ color: ROLE_COLOR[block.role] }}>{ROLE_TAG[block.role]}</span>
                <span className={`text-(--color-ink) ${entry.removed ? 'line-through' : ''}`}>
                  {block.labelKey ? t(block.labelKey) : block.id}
                </span>
                {entry.removed && (
                  <span className="rounded border border-(--color-alert) px-1.5 font-mono text-[10px] text-(--color-alert)">
                    {t('compaction_dropped_tag')}
                  </span>
                )}
                <span className="ml-auto text-(--color-dim)">
                  {entry.removed ? '—' : `+${block.fixedTokens}`}
                </span>
              </m.p>
            );
          })}

          {frozen && (
            <p className="rounded border border-(--color-amber) p-2 text-sm text-(--color-amber)">
              {t(frozen.noteKey)}
            </p>
          )}
          {!done && (
            <PrimaryButton onClick={step}>
              {frozen ? t('ui_continue') : t('compaction_step_cta')}
            </PrimaryButton>
          )}
        </div>

        {/* the compactor: press + shredder + summary cube */}
        {removedCount > 0 && (
          <div className="ta-panel relative flex flex-col gap-3 overflow-hidden p-4">
            <AnimatePresence>
              {pressing && (
                <m.div
                  key={`slam-${beatIdRef.current}`}
                  aria-hidden="true"
                  initial={{ y: '-100%' }}
                  animate={{ y: ['-100%', '0%', '-100%'] }}
                  transition={{ duration: 0.5, times: [0, 0.45, 1], ease: 'easeIn' }}
                  className="absolute inset-x-0 top-0 z-10 h-full border-b-4 border-(--color-line-bright) bg-(--color-raised)/90"
                >
                  <p className="p-3 text-center font-mono text-xs uppercase tracking-[0.3em] text-(--color-dim)">
                    ▼ {t('game_press_title')} ▼
                  </p>
                </m.div>
              )}
            </AnimatePresence>

            <p className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
              {t('game_press_title')}
            </p>
            <div className="flex flex-wrap items-start gap-4">
              {/* shredder tray */}
              <div className="flex min-w-48 flex-1 flex-col gap-1.5 rounded border border-dashed border-(--color-alert)/60 p-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-(--color-alert)">
                  {t('game_press_shredder')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {removedEntries.map((entry, i) => (
                    <m.span
                      key={i}
                      initial={{ scale: 1.2, opacity: 0 }}
                      animate={{ scale: 1, opacity: 0.7, rotate: (i % 2 ? -1 : 1) * 3 }}
                      className="rounded-sm border border-(--color-line) px-1.5 py-0.5 font-mono text-[10px] text-(--color-faint) line-through"
                    >
                      ▨ {entry.block?.labelKey ? t(entry.block.labelKey) : entry.block?.id}
                    </m.span>
                  ))}
                </div>
              </div>

              {/* summary cube */}
              {summaryBlock && (
                <m.div
                  initial={{ scale: 1.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  className="flex flex-col gap-1 rounded border-2 border-(--color-phosphor) bg-(--color-raised) p-3"
                  style={{ boxShadow: '0 0 16px -6px var(--color-phosphor)' }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-widest text-(--color-phosphor)">
                    ▣ {t('game_press_cube')}
                  </p>
                  <p className="max-w-56 text-xs text-(--color-ink)">
                    {summaryBlock.labelKey ? t(summaryBlock.labelKey) : summaryBlock.id}
                  </p>
                  <p className="font-mono text-xs text-(--color-amber)">
                    {t('game_press_cube_line', {
                      from: nf.format(removedTokens),
                      to: nf.format(summaryBlock.fixedTokens ?? 0),
                    })}
                  </p>
                </m.div>
              )}
            </div>
          </div>
        )}

        {/* what survived? — drag the surviving fact into the remembered tray */}
        {done && (
          <RememberedRounds
            rounds={rounds}
            correctIndexes={passCheck.correctIndexes}
            minCorrect={passCheck.minCorrect}
            locale={locale}
            onPass={onPass}
          />
        )}
      </div>
    </SceneFrame>
  );
}

// ---------------------------------------------------------------------------

function RememberedRounds({
  rounds,
  correctIndexes,
  minCorrect,
  locale,
  onPass,
}: {
  rounds: readonly { promptKey: string; optionKeys: readonly string[]; explainKey?: string }[];
  correctIndexes: readonly number[];
  minCorrect: number;
  locale: MechanicComponentProps['locale'];
  onPass: () => void;
}) {
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const [round, setRound] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const passedRef = useRef(false);

  const current = rounds[round]!;
  const correctIndex = correctIndexes[round]!;
  const answered = selected !== null;

  const options = useMemo(
    () => current.optionKeys.map((key, index) => ({ key, index })),
    [current],
  );

  const answer = (index: number) => {
    if (answered) return;
    setSelected(index);
    setAnswers((a) => [...a, index]);
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (event.over?.id !== 'remembered') return;
    const id = String(event.active.id);
    if (id.startsWith('fact-')) answer(Number(id.slice(5)));
  };

  const next = () => {
    if (round + 1 < rounds.length) {
      setRound(round + 1);
      setSelected(null);
      return;
    }
    setFinished(true);
    const result = evaluate(
      { type: 'choiceRounds', correctIndexes: [...correctIndexes], minCorrect },
      { type: 'choices', selectedIndexes: [...answers] },
    );
    if (result.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  const retry = () => {
    setRound(0);
    setAnswers([]);
    setSelected(null);
    setFinished(false);
  };

  if (finished) {
    const correctCount = answers.reduce(
      (sum, pick, i) => sum + (pick === correctIndexes[i] ? 1 : 0),
      0,
    );
    const passed = correctCount >= minCorrect;
    return (
      <div className="flex flex-col gap-3" aria-live="polite">
        <p
          className={`font-mono text-sm ${passed ? 'text-(--color-phosphor)' : 'text-(--color-alert)'}`}
        >
          {passed ? '✓' : '✗'}{' '}
          {t('rounds_score_line', { correct: correctCount, total: rounds.length, min: minCorrect })}
        </p>
        {!passed && <GhostButton onClick={retry}>{t('ui_retry')}</GhostButton>}
      </div>
    );
  }

  return (
    <DndScene locale={locale} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
          {t('rounds_progress', { n: round + 1, total: rounds.length })}
        </p>
        <p className="max-w-prose font-medium text-(--color-ink)">{t(current.promptKey)}</p>

        <div className="flex flex-col gap-2">
          {options.map(({ key, index }) => {
            const isPick = selected === index;
            const isCorrect = answered && index === correctIndex;
            const isWrongPick = answered && isPick && index !== correctIndex;
            const card = (
              <div
                className={`rounded border px-3 py-2.5 text-sm ${
                  isCorrect
                    ? 'border-(--color-phosphor) bg-(--color-raised) text-(--color-ink)'
                    : isWrongPick
                      ? 'border-(--color-alert) bg-(--color-raised) text-(--color-ink)'
                      : 'border-(--color-line) text-(--color-dim)'
                }`}
              >
                {t(key)}
                {isCorrect && <span className="ml-2 text-(--color-phosphor)">✓</span>}
                {isWrongPick && (
                  <span className="ml-2 font-mono text-xs text-(--color-alert)">
                    ✗ {t('game_press_wrong')}
                  </span>
                )}
              </div>
            );
            return answered ? (
              <div key={key}>{card}</div>
            ) : (
              <DraggableBlock key={key} id={`fact-${index}`} label={t(key)}>
                {card}
              </DraggableBlock>
            );
          })}
        </div>

        <DropZone
          id="remembered"
          label={t('game_press_remembered')}
          disabled={answered}
          className="flex min-h-14 items-center justify-center rounded border-2 border-dashed border-(--color-phosphor)/60 p-2 text-center font-mono text-xs text-(--color-phosphor) transition-colors data-over:bg-(--color-raised)"
        >
          ▣ {t('game_press_remembered')} — {t('game_press_hint')}
        </DropZone>

        {answered && (
          <>
            {current.explainKey && (
              <p className="max-w-prose border-l-2 border-(--color-ice) pl-3 text-sm text-(--color-dim)">
                {t(current.explainKey)}
              </p>
            )}
            <PrimaryButton onClick={next}>
              {round + 1 < rounds.length ? t('rounds_next_cta') : t('rounds_finish_cta')}
            </PrimaryButton>
          </>
        )}
      </div>
    </DndScene>
  );
}
