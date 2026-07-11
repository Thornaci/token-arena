import type { MechanicComponentProps } from '@/components/sim/registry';
import RoundsQuiz from './RoundsQuiz';

/** Pure prediction rounds with no bespoke visualization. */
export default function Quiz({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'quiz') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  return (
    <RoundsQuiz
      rounds={lesson.params.rounds}
      correctIndexes={lesson.pass.correctIndexes}
      minCorrect={lesson.pass.minCorrect}
      locale={locale}
      onPass={onPass}
    />
  );
}
