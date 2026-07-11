import { useStore } from '@nanostores/react';
import type { ModuleInfo } from '@/content/modules';
import { firstOpenLesson, isUnlocked, sortLessons, type LessonMeta } from '@/lib/curriculum';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';
import { progress } from '@/stores/progress';

interface Props {
  locale: Locale;
  modules: readonly ModuleInfo[];
  lessons: readonly LessonMeta[];
}

/**
 * The curriculum as a circuit board: each module is an IC package on a
 * vertical bus; lessons are its pads. Completed traces light up phosphor.
 */
export default function WorldMap({ locale, modules, lessons }: Props) {
  const { completedLevels } = useStore(progress);
  const sorted = sortLessons(lessons);
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  const continueTarget = firstOpenLesson(sorted, completedLevels);

  return (
    <nav aria-label={t('map_aria')} className="relative">
      {/* the bus */}
      <span
        aria-hidden="true"
        className="absolute top-2 bottom-2 left-[11px] w-0.5 bg-(--color-line)"
      />

      <ol className="flex flex-col gap-6">
        {modules.map((mod) => {
          const moduleLessons = sorted.filter((lesson) => lesson.module === mod.id);
          const done =
            moduleLessons.length > 0 &&
            moduleLessons.every((lesson) => completedLevels.includes(lesson.id));
          const soon = moduleLessons.length === 0;
          const active = moduleLessons.some((lesson) => {
            const index = sorted.indexOf(lesson);
            return isUnlocked(sorted, index, completedLevels) && !completedLevels.includes(lesson.id);
          });

          const padColor = done
            ? 'var(--color-phosphor)'
            : active
              ? 'var(--color-ice)'
              : 'var(--color-line-bright)';

          return (
            <li key={mod.id} className="relative pl-10">
              {/* bus pad + stub trace */}
              <span
                aria-hidden="true"
                className={`absolute top-4 left-[6px] size-3 rounded-[2px] ${
                  active ? 'motion-safe:animate-[ta-pulse-pad_2s_ease-in-out_infinite]' : ''
                }`}
                style={{ background: padColor }}
              />
              <span
                aria-hidden="true"
                className="absolute top-[21px] left-[18px] h-0.5 w-5"
                style={{ background: done ? 'var(--color-phosphor)' : 'var(--color-line)' }}
              />

              <section
                aria-label={t(mod.titleKey)}
                className={`ta-panel ta-notched p-4 ${soon ? 'opacity-50' : ''}`}
              >
                <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-(--color-faint)">
                    M{mod.order}
                  </span>
                  <h2 className="font-display text-lg font-semibold text-(--color-ink)">
                    {t(mod.titleKey)}
                  </h2>
                  {done && (
                    <span className="font-mono text-xs text-(--color-phosphor)">✓ {t('map_done')}</span>
                  )}
                  {soon && (
                    <span className="ml-auto rounded border border-dashed border-(--color-line-bright) px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-(--color-faint)">
                      {t('map_soon')}
                    </span>
                  )}
                </header>

                {moduleLessons.length > 0 && (
                  <ol className="mt-3 flex flex-wrap gap-2">
                    {moduleLessons.map((lesson) => {
                      const index = sorted.indexOf(lesson);
                      const isDone = completedLevels.includes(lesson.id);
                      const unlocked = isUnlocked(sorted, index, completedLevels);
                      const title = `${lesson.id} · ${t(lesson.titleKey)}`;

                      if (!unlocked) {
                        return (
                          <li key={lesson.id}>
                            <span
                              aria-disabled="true"
                              title={`${title} — ${t('map_locked')}`}
                              className="flex items-center gap-2 rounded border border-(--color-line) px-2.5 py-1.5 font-mono text-xs text-(--color-faint)"
                            >
                              <span aria-hidden="true">▪</span> {lesson.id}
                            </span>
                          </li>
                        );
                      }

                      return (
                        <li key={lesson.id}>
                          <a
                            href={`${base}/${locale}/lessons/${lesson.slug}/`}
                            aria-label={title}
                            className={`flex items-center gap-2 rounded border px-2.5 py-1.5 font-mono text-xs transition-colors ${
                              isDone
                                ? 'border-(--color-phosphor-deep) text-(--color-phosphor) hover:bg-(--color-raised)'
                                : 'border-(--color-ice) text-(--color-ice) hover:bg-(--color-raised) ' +
                                  (continueTarget?.id === lesson.id
                                    ? 'motion-safe:animate-[ta-pulse-pad_2s_ease-in-out_infinite]'
                                    : '')
                            }`}
                          >
                            <span aria-hidden="true">{isDone ? '▣' : '▢'}</span>
                            <span>{lesson.id}</span>
                            <span className="hidden text-(--color-dim) sm:inline">
                              {t(lesson.titleKey)}
                            </span>
                          </a>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
