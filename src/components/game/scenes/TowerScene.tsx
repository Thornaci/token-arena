import { useEffect, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import type { Role } from '@/engine/contextModel';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { mascotEvent, mascotReport } from '@/stores/mascot';
import { GhostButton, PrimaryButton, ROLE_COLOR, ROLE_TAG } from '@/components/mechanics/shared';
import SceneFrame from '../SceneFrame';
import { useAnimationQueue } from '../useAnimationQueue';
import { m } from '../motion';
import { DndScene, DraggableBlock, DropZone, type DragEndEvent } from '../dnd';

/** Authority maps to vertical position, app-wide (spec §7). */
const ROLE_RANK: Record<Role, number> = {
  system: 0,
  developer: 1,
  user: 2,
  assistant: 3,
  tool: 4,
};

/**
 * G2.3 — The Chain of Command. Instructions stack in an authority tower
 * (system on top). The player drags the obedience token onto an answer
 * card; on resolve a pulse travels top-down and the higher card stamps
 * OVERRIDDEN onto the losers. Same choiceRounds evidence as the classic.
 */
export default function TowerScene({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'hierarchy-predict') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const { rounds } = lesson.params;
  const passCheck = lesson.pass;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  const [round, setRound] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [stamped, setStamped] = useState(false);
  const [finished, setFinished] = useState(false);
  const passedRef = useRef(false);
  const beatIdRef = useRef(0);
  const animation = useAnimationQueue();

  const current = rounds[round]!;
  const correctIndex = passCheck.correctIndexes[round]!;
  const answered = selected !== null;

  // conflicting instructions are on screen until this round resolves
  useEffect(() => {
    mascotReport({ conflictCount: answered || finished ? 0 : 1 });
    return () => mascotReport({ conflictCount: 0 });
  }, [answered, finished, round]);

  useEffect(() => {
    const beat = animation.lastDelivery?.beat;
    if (!beat) return;
    if (beat.kind === 'stamp') setStamped(true);
  }, [animation.lastDelivery]);

  const answer = (index: number) => {
    if (answered) return;
    setSelected(index);
    setAnswers((a) => [...a, index]);
    setStamped(false);
    mascotEvent(index === correctIndex ? 'retrieve-hit' : 'confuse');
    animation.enqueue([
      { id: `pulse-${++beatIdRef.current}`, kind: 'pulse', durationMs: 350 },
      { id: `stamp-${++beatIdRef.current}`, kind: 'stamp', durationMs: 250 },
    ]);
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (event.active.id !== 'obedience' || !event.over) return;
    const overId = String(event.over.id);
    if (overId.startsWith('option-')) answer(Number(overId.slice(7)));
  };

  const next = () => {
    if (round + 1 < rounds.length) {
      setRound(round + 1);
      setSelected(null);
      setStamped(false);
      return;
    }
    setFinished(true);
    const result = evaluate(passCheck, { type: 'choices', selectedIndexes: [...answers] });
    if (result.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  const retry = () => {
    setRound(0);
    setAnswers([]);
    setSelected(null);
    setStamped(false);
    setFinished(false);
  };

  if (finished) {
    const correctCount = answers.reduce(
      (sum, pick, i) => sum + (pick === passCheck.correctIndexes[i] ? 1 : 0),
      0,
    );
    const passed = correctCount >= passCheck.minCorrect;
    return (
      <div className="flex flex-col gap-3" aria-live="polite">
        <p
          className={`font-mono text-sm ${passed ? 'text-(--color-phosphor)' : 'text-(--color-alert)'}`}
        >
          {passed ? '✓' : '✗'}{' '}
          {t('rounds_score_line', {
            correct: correctCount,
            total: rounds.length,
            min: passCheck.minCorrect,
          })}
        </p>
        {!passed && <GhostButton onClick={retry}>{t('ui_retry')}</GhostButton>}
      </div>
    );
  }

  const sortedBlocks = current.blocks
    .map((block, originalIndex) => ({ ...block, originalIndex }))
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role]);

  return (
    <SceneFrame
      locale={locale}
      animation={animation}
      status={t('rounds_progress', { n: round + 1, total: rounds.length })}
    >
      <DndScene locale={locale} onDragEnd={onDragEnd}>
        <div className="flex flex-col gap-4">
          {/* the tower — authority = height */}
          <div className="relative" role="group" aria-label={t('game_tower_aria')}>
            <span
              aria-hidden="true"
              className="absolute -left-1 top-0 flex h-full w-4 flex-col items-center"
            >
              <span className="flex-1 border-l-2 border-dashed border-(--color-alert)/60" />
              <span className="font-mono text-[10px] text-(--color-alert)">⚡</span>
              <span className="flex-1 border-l-2 border-dashed border-(--color-alert)/60" />
            </span>
            <ol className="ml-4 flex flex-col gap-2">
              {sortedBlocks.map((block) => {
                const wins = answered && stamped && block.originalIndex === current.winnerIndex;
                const loses = answered && stamped && block.originalIndex !== current.winnerIndex;
                return (
                  <m.li
                    key={block.originalIndex}
                    initial={false}
                    animate={
                      animation.activeBeat?.kind === 'pulse' && !animation.lastDelivery?.instant
                        ? { x: [0, 3, 0] }
                        : { x: 0 }
                    }
                    className={`ta-panel relative flex items-start gap-3 border-l-2 p-3 ${
                      wins ? 'border border-(--color-phosphor-deep)' : ''
                    } ${loses ? 'opacity-55' : ''}`}
                    style={{ borderLeftColor: ROLE_COLOR[block.role] }}
                  >
                    <span
                      className="mt-0.5 font-mono text-[10px]"
                      style={{ color: ROLE_COLOR[block.role] }}
                    >
                      {ROLE_TAG[block.role]}
                    </span>
                    <span className="text-sm text-(--color-ink)">{t(block.textKey)}</span>
                    {wins && (
                      <span className="ml-auto self-center rounded border border-(--color-phosphor) px-2 py-0.5 font-mono text-[10px] text-(--color-phosphor)">
                        {t('hierarchy_wins_tag')}
                      </span>
                    )}
                    {loses && (
                      <m.span
                        initial={{ scale: 1.8, opacity: 0, rotate: -14 }}
                        animate={{ scale: 1, opacity: 1, rotate: -8 }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded border-2 border-(--color-alert) px-2 py-0.5 font-mono text-[10px] font-bold text-(--color-alert)"
                      >
                        {t('game_tower_overridden')}
                      </m.span>
                    )}
                  </m.li>
                );
              })}
            </ol>
          </div>

          {/* the prediction — options are drop targets */}
          <p className="max-w-prose font-medium text-(--color-ink)">{t(current.promptKey)}</p>
          <div className="flex flex-col gap-2">
            {current.optionKeys.map((optionKey, index) => {
              const isPick = selected === index;
              const isCorrect = answered && index === correctIndex;
              const isWrongPick = answered && isPick && index !== correctIndex;
              return (
                <DropZone
                  key={optionKey}
                  id={`option-${index}`}
                  label={t(optionKey)}
                  disabled={answered}
                  className={`rounded border px-3 py-2.5 text-sm transition-colors data-over:border-(--color-ice) ${
                    isCorrect
                      ? 'border-(--color-phosphor) bg-(--color-raised) text-(--color-ink)'
                      : isWrongPick
                        ? 'border-(--color-alert) bg-(--color-raised) text-(--color-ink)'
                        : 'border-(--color-line) text-(--color-dim)'
                  }`}
                >
                  {t(optionKey)}
                  {isCorrect && (
                    <span aria-hidden="true" className="ml-2 text-(--color-phosphor)">
                      ✓
                    </span>
                  )}
                  {isWrongPick && (
                    <span aria-hidden="true" className="ml-2 text-(--color-alert)">
                      ✗
                    </span>
                  )}
                </DropZone>
              );
            })}
          </div>

          {!answered && (
            <div className="flex items-center gap-3">
              <DraggableBlock id="obedience" label={t('game_tower_token')} className="min-w-0">
                <span
                  className="flex h-11 items-center justify-center rounded-full border-2 border-(--color-phosphor) bg-(--color-raised) px-4 font-mono text-xs font-bold text-(--color-phosphor)"
                  style={{ boxShadow: '0 0 12px -4px var(--color-phosphor)' }}
                >
                  ◉ {t('game_tower_token')}
                </span>
              </DraggableBlock>
              <span className="font-mono text-xs text-(--color-faint)">{t('game_tower_hint')}</span>
            </div>
          )}

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
    </SceneFrame>
  );
}
