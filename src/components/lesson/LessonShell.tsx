import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { Lesson } from '@/content/schema';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';
import { awardBadge, completeLevel, isLevelCompleted, progress, useHint } from '@/stores/progress';
import { mascotEvent } from '@/stores/mascot';
import MechanicHost from '@/components/sim/MechanicHost';

interface Props {
  lesson: Lesson;
  locale: Locale;
  /** Absolute (base-aware) href of the next lesson, or the map when last. */
  nextHref: string;
  nextIsMap: boolean;
}

export default function LessonShell({ lesson, locale, nextHref, nextIsMap }: Props) {
  const progressState = useStore(progress);
  const wasCompleted = isLevelCompleted(progressState, lesson.id);
  const [passed, setPassed] = useState(false);
  const [revealedHints, setRevealedHints] = useState(0);
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  // Each lesson starts the mascot from a clean slate.
  useEffect(() => {
    mascotEvent('reset');
  }, [lesson.id]);

  const handlePass = useCallback(() => {
    setPassed(true);
    completeLevel(lesson.id, lesson.xp);
    if (lesson.badge) awardBadge(lesson.badge);
    mascotEvent('pass');
  }, [lesson.id, lesson.xp, lesson.badge]);

  const revealHint = () => {
    const tier = Math.min(revealedHints + 1, 3);
    setRevealedHints(tier);
    useHint(lesson.id, tier);
  };

  return (
    <div className="flex flex-col gap-6">
      {wasCompleted && !passed && (
        <p className="font-mono text-xs text-(--color-phosphor)">✓ {t('lesson_replay_note')}</p>
      )}

      <MechanicHost lesson={lesson} locale={locale} onPass={handlePass} />

      {/* pass banner */}
      {passed && (
        <section
          aria-live="polite"
          className="ta-panel ta-notched motion-safe:animate-[ta-pop-in_0.3s_ease-out] border border-(--color-phosphor-deep) p-5"
        >
          <p className="font-display text-xl font-bold text-(--color-phosphor) text-glow">
            {t('lesson_passed_title')}
          </p>
          {!wasCompleted && (
            <p className="mt-1 font-mono text-sm text-(--color-ink)">
              +{t('hud_xp', { xp: lesson.xp })}
              {lesson.badge && (
                <span className="ml-3 rounded border border-(--color-amber) px-2 py-0.5 text-xs text-(--color-amber)">
                  ★ {t(`badge_${lesson.badge.replace(/-/g, '_')}`)}
                </span>
              )}
            </p>
          )}
          {lesson.misconceptionKey && (
            <p className="mt-3 max-w-prose text-sm text-(--color-dim)">
              <span className="font-semibold text-(--color-alert)">✗</span>{' '}
              <s className="decoration-(--color-alert)/60">{t(lesson.misconceptionKey)}</s>
            </p>
          )}
          <a
            href={nextHref}
            className="mt-4 inline-block rounded bg-(--color-phosphor) px-4 py-2 font-mono text-sm font-semibold text-(--color-bg) transition-transform hover:scale-[1.02]"
          >
            {nextIsMap ? t('lesson_back_to_map_cta') : t('lesson_next_cta')} →
          </a>
        </section>
      )}

      {/* tiered hints */}
      {!passed && (
        <section aria-label={t('hints_title')} className="flex flex-col gap-2">
          {lesson.hints.slice(0, revealedHints).map((hintKey, i) => (
            <p
              key={hintKey}
              className="rounded border-l-2 border-(--color-amber) bg-(--color-surface) px-3 py-2 text-sm text-(--color-dim)"
            >
              <span className="mr-2 font-mono text-xs text-(--color-amber)">{i + 1}/3</span>
              {t(hintKey)}
            </p>
          ))}
          {revealedHints < 3 && (
            <button
              type="button"
              onClick={revealHint}
              className="self-start font-mono text-xs text-(--color-faint) underline decoration-dotted underline-offset-4 hover:text-(--color-amber)"
            >
              {revealedHints === 0 ? t('hints_show_first') : t('hints_show_next')}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
