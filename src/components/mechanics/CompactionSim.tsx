import type { MechanicComponentProps } from '@/components/sim/registry';
import { fillInfo } from '@/engine/contextModel';
import { lessonText } from '@/lib/lessonText';
import RoundsQuiz from './RoundsQuiz';
import { PrimaryButton, ROLE_COLOR, ROLE_TAG } from './shared';
import { useSimWalkthrough } from './useSimWalkthrough';

const count = () => 0; // lesson blocks always carry authored fixedTokens

/**
 * A long agent session hits the window; compaction drops verbatim blocks and
 * leaves a summary. The transcript remembers what the agent no longer can —
 * struck-through rows the inspector doesn't show anymore.
 */
export default function CompactionSim({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'compaction-sim') throw new Error('wrong lesson');
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
            <p
              key={i}
              className={`flex items-center gap-2 border-l-2 pl-2 font-mono text-xs motion-safe:animate-[ta-pop-in_0.25s_ease-out] ${
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
