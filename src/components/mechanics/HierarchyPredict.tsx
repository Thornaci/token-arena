import { useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { lessonText } from '@/lib/lessonText';
import RoundsQuiz from './RoundsQuiz';
import { ROLE_COLOR, ROLE_TAG } from './shared';

export default function HierarchyPredict({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'hierarchy-predict') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const { rounds } = lesson.params;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  // Which rounds have been answered — the winner only lights up afterwards.
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  return (
    <RoundsQuiz
      rounds={rounds}
      correctIndexes={lesson.pass.correctIndexes}
      minCorrect={lesson.pass.minCorrect}
      locale={locale}
      onPass={onPass}
      onAnswered={(round) => setRevealed((r) => new Set(r).add(round))}
      renderRound={(round) => {
        const { blocks, winnerIndex } = rounds[round]!;
        const showWinner = revealed.has(round);
        return (
          <ol className="flex flex-col gap-2" aria-label={t('hierarchy_stack_aria')}>
            {blocks.map((block, i) => {
              const wins = showWinner && i === winnerIndex;
              const loses = showWinner && i !== winnerIndex;
              return (
                <li
                  key={i}
                  className={`ta-panel flex items-start gap-3 border-l-2 p-3 transition-opacity ${
                    wins ? 'border border-(--color-phosphor-deep)' : ''
                  } ${loses ? 'opacity-50' : ''}`}
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
                </li>
              );
            })}
          </ol>
        );
      }}
    />
  );
}
