import type { MechanicComponentProps } from '@/components/sim/registry';
import { fillInfo } from '@/engine/contextModel';
import { lessonText } from '@/lib/lessonText';
import RoundsQuiz from './RoundsQuiz';
import { PrimaryButton } from './shared';
import { useSimWalkthrough } from './useSimWalkthrough';
import WalkTranscript from './WalkTranscript';

const count = () => 0; // lesson blocks always carry authored fixedTokens

/**
 * Two windows. The MAIN agent walks lesson.steps and mirrors the Context
 * Inspector; at the first freeze (the delegation beat) a SUBAGENT panel
 * unlocks with its own context window that never touches the inspector.
 * Main can only continue once the subagent is done — then its result block
 * crosses back as the next main step. The contrast between the two fill
 * lines IS the lesson.
 */
export default function SubagentSim({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'subagent-sim') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const { sub, rounds } = lesson.params;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const main = useSimWalkthrough(lesson);
  const subWalk = useSimWalkthrough(sub, { mirrorInspector: false });

  // The delegation beat: schema guarantees a freeze exists in lesson.steps.
  const delegateAt = lesson.steps.findIndex((step) => step.type === 'freeze');
  const delegated = main.cursor > delegateAt;
  const waitingForSub = delegated && !subWalk.done;

  const mainFill = fillInfo(main.context, count);
  const subFill = fillInfo(subWalk.context, count);
  const fillLine = (fill: typeof mainFill) =>
    t('compaction_fill_line', {
      used: nf.format(fill.used + fill.reserved),
      window: nf.format(fill.window),
    });

  return (
    <div className="flex flex-col gap-5">
      {/* main window — mirrored to the inspector */}
      <section aria-label={t('subagent_main_label')} className="ta-panel flex flex-col gap-2 p-4">
        <p className="font-mono text-xs text-(--color-faint)">
          <span className="text-(--color-dim)">{t('subagent_main_label')}</span> · {fillLine(mainFill)}
        </p>

        <WalkTranscript entries={main.entries} locale={locale} sendFallbackKey="compaction_send_line" />

        {main.frozen && (
          <p className="rounded border border-(--color-amber) p-2 text-sm text-(--color-amber)">
            {t(main.frozen.noteKey)}
          </p>
        )}
        {waitingForSub && (
          <p aria-live="polite" className="font-mono text-xs text-(--color-faint)">
            {t('subagent_waiting_note')}
          </p>
        )}
        {!main.done && (
          <PrimaryButton onClick={main.step} disabled={waitingForSub}>
            {main.frozen ? t('ui_continue') : t('compaction_step_cta')}
          </PrimaryButton>
        )}
      </section>

      {/* subagent window — its own context; the inspector never sees it */}
      {delegated && (
        <section
          aria-label={t(sub.labelKey)}
          className="ta-panel flex flex-col gap-2 border-l-4 border-(--color-ice) p-4"
        >
          <p className="font-mono text-xs text-(--color-faint)">
            <span className="text-(--color-ice)">{t(sub.labelKey)}</span> · {fillLine(subFill)}
          </p>

          <WalkTranscript
            entries={subWalk.entries}
            locale={locale}
            sendFallbackKey="compaction_send_line"
          />

          {subWalk.frozen && (
            <p className="rounded border border-(--color-amber) p-2 text-sm text-(--color-amber)">
              {t(subWalk.frozen.noteKey)}
            </p>
          )}
          {!subWalk.done ? (
            <PrimaryButton onClick={subWalk.step}>
              {subWalk.frozen ? t('ui_continue') : t('subagent_step_cta')}
            </PrimaryButton>
          ) : (
            <p className="font-mono text-xs text-(--color-phosphor)">✓ {t('subagent_done_note')}</p>
          )}
        </section>
      )}

      {main.done && subWalk.done && (
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
