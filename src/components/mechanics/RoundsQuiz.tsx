import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';
import { ChoiceQuestion, GhostButton, PrimaryButton } from './shared';

export interface QuizRound {
  promptKey: string;
  optionKeys: readonly string[];
  explainKey?: string;
}

interface Props {
  rounds: readonly QuizRound[];
  correctIndexes: readonly number[];
  minCorrect: number;
  locale: Locale;
  onPass: () => void;
  /** Fired the moment a round is answered — e.g. to reveal a visualization. */
  onAnswered?: (round: number, selectedIndex: number) => void;
  /** Rendered above the current round's question (scenario, message stack…). */
  renderRound?: (round: number) => ReactNode;
}

/**
 * Generic runner for choiceRounds lessons: one prediction at a time, verdict
 * and explanation after each answer, scored against the authored key at the
 * end. Failing the threshold resets the run — predictions only count when
 * made fresh.
 */
export default function RoundsQuiz({
  rounds,
  correctIndexes,
  minCorrect,
  locale,
  onPass,
  onAnswered,
  renderRound,
}: Props) {
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

  const answer = (index: number) => {
    if (answered) return;
    setSelected(index);
    setAnswers((a) => [...a, index]);
    onAnswered?.(round, index);
  };

  const next = () => {
    if (round + 1 < rounds.length) {
      setRound(round + 1);
      setSelected(null);
      return;
    }
    setFinished(true);
    const result = evaluate(
      { type: 'choiceRounds', correctIndexes, minCorrect },
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
    <div className="flex flex-col gap-3">
      <p className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
        {t('rounds_progress', { n: round + 1, total: rounds.length })}
      </p>
      {renderRound?.(round)}
      <ChoiceQuestion
        prompt={t(current.promptKey)}
        options={current.optionKeys.map((key) => t(key))}
        selected={selected}
        onSelect={answer}
        verdict={answered ? { correctIndex } : null}
      />
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
  );
}
