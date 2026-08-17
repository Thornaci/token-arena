import type { MechanicComponentProps } from '@/components/sim/registry';
import { fillInfo } from '@/engine/contextModel';
import { lessonText } from '@/lib/lessonText';
import RoundsQuiz from './RoundsQuiz';
import { PrimaryButton } from './shared';
import { useSimWalkthrough } from './useSimWalkthrough';
import WalkTranscript from './WalkTranscript';

const count = () => 0; // lesson blocks always carry authored fixedTokens

/**
 * A long agent session hits the window; compaction drops verbatim blocks and
 * leaves a summary. The transcript remembers what the agent no longer can —
 * struck-through rows the inspector doesn't show anymore.
 *
 * Also serves `session-sim`: the same stepped walkthrough + quiz, for lessons
 * that watch a session assemble without compacting it.
 */
export default function CompactionSim({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'compaction-sim' && lesson.mechanic !== 'session-sim') {
    throw new Error('wrong lesson');
  }
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const { rounds } = lesson.params;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const { entries, context, frozen, done, step } = useSimWalkthrough(lesson);
  const fill = fillInfo(context, count);

  return (
    <div className="flex flex-col gap-5">
      <div className="ta-panel flex flex-col gap-2 p-4">
        <p className="font-mono text-xs text-(--color-faint)">
          {t('compaction_fill_line', {
            used: nf.format(fill.used + fill.reserved),
            window: nf.format(fill.window),
          })}
        </p>

        <WalkTranscript entries={entries} locale={locale} sendFallbackKey="compaction_send_line" />

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

      {/* what does the agent still know? */}
      {done && (
        <RoundsQuiz
          rounds={rounds}
          correctIndexes={lesson.pass.correctIndexes}
          minCorrect={lesson.pass.minCorrect}
          locale={locale}
          onPass={onPass}
        />
      )}
    </div>
  );
}
