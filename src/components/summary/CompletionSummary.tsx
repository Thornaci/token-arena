import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';
import { exportProgress, importProgress, progress, solvedWithoutHints } from '@/stores/progress';
import { drawShareCard, downloadShareCard, type ShareCardData } from './shareCard';

export interface SummaryLesson {
  id: string;
  titleKey: string;
  xp: number;
  badge: string | null;
}

interface Props {
  locale: Locale;
  /** Modules 0–9 — "full completion" counts exactly these. */
  coreLessons: SummaryLesson[];
  /** Module 10 sandbox — optional bonus, never required. */
  bonusLessons: SummaryLesson[];
}

const badgeLabelKey = (badgeId: string) => `badge_${badgeId.replace(/-/g, '_')}`;

export default function CompletionSummary({ locale, coreLessons, bonusLessons }: Props) {
  const state = useStore(progress);
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [importResult, setImportResult] = useState<'ok' | 'invalid' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const done = (lessons: SummaryLesson[]) =>
    lessons.filter((lesson) => state.completedLevels.includes(lesson.id));
  const coreDone = done(coreLessons);
  const bonusDone = done(bonusLessons);
  const coreComplete = coreDone.length === coreLessons.length;
  const hintFree = [...coreLessons, ...bonusLessons].filter((lesson) =>
    solvedWithoutHints(state, lesson.id),
  ).length;

  const allBadges = [...coreLessons, ...bonusLessons]
    .filter((lesson): lesson is SummaryLesson & { badge: string } => lesson.badge !== null)
    .map((lesson) => ({
      id: lesson.badge,
      label: t(badgeLabelKey(lesson.badge)),
      earned: state.badges.includes(lesson.badge),
    }));

  const cardData: ShareCardData = {
    tagline: t('app_tagline'),
    xpLine: t('hud_xp', { xp: nf.format(state.xp) }),
    coreLine: coreComplete
      ? t('summary_core_complete')
      : t('summary_core_line', { done: coreDone.length, total: coreLessons.length }),
    bonusLine: bonusDone.length > 0 ? t('summary_bonus_line', { done: bonusDone.length }) : null,
    hintFreeLine: hintFree > 0 ? t('summary_hintfree_line', { count: hintFree }) : null,
    badges: allBadges.map(({ label, earned }) => ({ label, earned })),
    footer: 'thornaci.github.io/token-arena',
  };

  // Live preview; the same canvas is what gets downloaded.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void document.fonts.ready.then(() => drawShareCard(canvas, cardData));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cardData)]);

  const onExport = () => {
    const blob = new Blob([exportProgress()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'token-arena-progress.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (file: File) => {
    const result = importProgress(await file.text());
    setImportResult(result.ok ? 'ok' : 'invalid');
  };

  return (
    <div className="flex flex-col gap-8">
      {/* status banner */}
      <section
        className={`ta-panel ta-notched p-5 ${coreComplete ? 'border-(--color-phosphor-deep)' : ''}`}
      >
        <p
          className={`font-mono text-sm font-semibold uppercase tracking-widest ${
            coreComplete ? 'text-(--color-phosphor) text-glow' : 'text-(--color-dim)'
          }`}
        >
          {coreComplete
            ? t('summary_core_complete')
            : t('summary_core_line', { done: coreDone.length, total: coreLessons.length })}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm text-(--color-dim)">
          <span className="text-(--color-phosphor)">
            ▲ {t('hud_xp', { xp: nf.format(state.xp) })}
          </span>
          {bonusLessons.length > 0 && (
            <span className={bonusDone.length > 0 ? 'text-(--color-amber)' : ''}>
              {t('summary_bonus_line', { done: bonusDone.length })}
            </span>
          )}
          <span>{t('summary_hintfree_line', { count: hintFree })}</span>
        </div>
      </section>

      {/* badge gallery */}
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-(--color-faint)">
          {t('summary_badges_title')}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {allBadges.map((badge) => (
            <li
              key={badge.id}
              className={`rounded border px-3 py-1.5 font-mono text-xs ${
                badge.earned
                  ? 'border-(--color-phosphor-deep) text-(--color-phosphor)'
                  : 'border-(--color-line) text-(--color-faint)'
              }`}
            >
              <span aria-hidden="true">{badge.earned ? '▣' : '▢'}</span> {badge.label}
              {!badge.earned && (
                <span className="sr-only"> — {t('summary_badge_locked')}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* share card */}
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-(--color-faint)">
          {t('summary_share_title')}
        </h2>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t('summary_share_aria')}
          className="w-full max-w-xl rounded border border-(--color-line)"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const canvas = canvasRef.current;
              if (canvas) void downloadShareCard(canvas, 'token-arena-report.png');
            }}
            className="self-start rounded bg-(--color-phosphor) px-4 py-2 font-mono text-sm font-semibold text-(--color-bg) transition-transform enabled:hover:scale-[1.02]"
          >
            {t('summary_share_button')}
          </button>
          <p className="font-mono text-xs text-(--color-faint)">{t('summary_share_note')}</p>
        </div>
      </section>

      {/* progress portability */}
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-(--color-faint)">
          {t('summary_progress_title')}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onExport}
            className="rounded border border-(--color-line-bright) px-4 py-2 font-mono text-sm text-(--color-dim) transition-colors hover:text-(--color-ink)"
          >
            {t('summary_export_button')}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded border border-(--color-line-bright) px-4 py-2 font-mono text-sm text-(--color-dim) transition-colors hover:text-(--color-ink)"
          >
            {t('summary_import_button')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label={t('summary_import_button')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImportFile(file);
              e.target.value = '';
            }}
          />
          {importResult && (
            <p
              aria-live="polite"
              className={`font-mono text-xs ${
                importResult === 'ok' ? 'text-(--color-phosphor)' : 'text-(--color-alert)'
              }`}
            >
              {importResult === 'ok' ? t('summary_import_ok') : t('summary_import_invalid')}
            </p>
          )}
        </div>
        <p className="max-w-xl text-xs text-(--color-faint)">{t('summary_progress_note')}</p>
      </section>
    </div>
  );
}
