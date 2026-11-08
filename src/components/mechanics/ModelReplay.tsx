import { useEffect, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import type { Lesson } from '@/content/schema';
import {
  finalAnswer,
  getScene,
  occlusionRanking,
  traceText,
  type AnswersScene,
  type ContinueScene,
  type NextScene,
  type OcclusionScene,
  type ReplayFile,
  type ThinkingScene,
  type TraceScene,
} from '@/engine/replay';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';
import DistributionBars, { visibleToken } from './DistributionBars';
import RoundsQuiz from './RoundsQuiz';
import { GhostButton } from './shared';

type ReplayParams = Extract<Lesson, { mechanic: 'model-replay' }>['params'];
type SceneSpec = ReplayParams['scenes'][number];
type T = (key: string, params?: Record<string, string | number>) => string;

/** Locale-aware percentage for prose lines (bars keep the compact fixed format). */
const percent = (p: number, locale: Locale) =>
  new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(p);
const isSpecial = (token: string) => /^<\|[^|]+\|>$/.test(token);
const shortModel = (repo: string) => repo.split('/').pop() ?? repo;

/** Shown instead of the evidence until the round's prediction is in. */
function Hidden({ t }: { t: T }) {
  return (
    <p className="rounded border border-dashed border-(--color-line-bright) px-3 py-4 text-center font-mono text-xs text-(--color-faint)">
      {t('replay_hidden')}
    </p>
  );
}

// ── trace: the generation loop, one step at a time ───────────────────────────
function TraceView({ scene, step, hidden, t }: { scene: TraceScene; step: number; hidden: boolean; t: T }) {
  const [cursor, setCursor] = useState(step);
  const atRound = cursor === step;
  const current = scene.steps[cursor]!;
  const formatToken = (token: string) => (isSpecial(token) ? t('replay_stop_token') : visibleToken(token));
  const written = traceText(scene, cursor).replace(/<\|[^|]+\|>/g, '');
  return (
    <div className="ta-panel flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2 font-mono text-sm">
        {scene.chat ? (
          <>
            <p>
              <span className="mr-2 text-[10px] uppercase tracking-widest text-(--color-role-user)">{t('replay_you')}</span>
              <span className="text-(--color-ink)">{scene.prompt}</span>
            </p>
            <p>
              <span className="mr-2 text-[10px] uppercase tracking-widest text-(--color-role-assistant)">{t('replay_model')}</span>
              <span className="text-(--color-phosphor)">{written}</span>
              <span aria-hidden="true" className="text-(--color-phosphor)">▌</span>
            </p>
          </>
        ) : (
          <p>
            <span className="text-(--color-ink)">{scene.prompt}</span>
            <span className="text-(--color-phosphor)">{written}</span>
            <span aria-hidden="true" className="text-(--color-phosphor)">▌</span>
          </p>
        )}
      </div>
      {hidden && atRound ? (
        <Hidden t={t} />
      ) : (
        <DistributionBars
          distribution={{ prompt: scene.prompt, candidates: current.top }}
          label={t('replay_next_label', { n: cursor + 1, total: scene.steps.length })}
          aria={t('replay_dist_aria')}
          hidePrompt
          formatToken={formatToken}
        />
      )}
      {!hidden && (
        <div className="flex flex-wrap items-center gap-3">
          <GhostButton onClick={() => setCursor((c) => Math.max(0, c - 1))}>{t('replay_prev')}</GhostButton>
          <GhostButton onClick={() => setCursor((c) => Math.min(scene.steps.length - 1, c + 1))}>{t('replay_next')}</GhostButton>
          <span className="font-mono text-xs text-(--color-faint)">
            {t('replay_step', { n: cursor + 1, total: scene.steps.length })}
          </span>
        </div>
      )}
    </div>
  );
}

/** Words that differ between two equally long prompts — the single change to look at. */
function changedWords(a: string, b: string): Set<number> {
  const wa = a.split(' ');
  const wb = b.split(' ');
  if (wa.length !== wb.length) return new Set();
  return new Set(wa.map((w, i) => (w !== wb[i] ? i : -1)).filter((i) => i >= 0));
}

function PromptText({ prompt, marks }: { prompt: string; marks: Set<number> }) {
  return (
    <p className="font-mono text-xs leading-relaxed text-(--color-dim)">
      {prompt.split(' ').map((word, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {marks.has(i) ? <mark className="rounded-sm bg-(--color-chip-3) px-0.5 text-(--color-amber)">{word}</mark> : word}
        </span>
      ))}
      <span aria-hidden="true" className="text-(--color-phosphor)">▌</span>
    </p>
  );
}

// ── next: one or two next-token distributions side by side ───────────────────
function NextView({ scene, spec, hidden, t }: { scene: NextScene; spec: Extract<SceneSpec, { kind: 'next' }>; hidden: boolean; t: T }) {
  const marks = scene.items.length === 2 ? changedWords(scene.items[0]!.prompt, scene.items[1]!.prompt) : new Set<number>();
  return (
    <div className="flex flex-col gap-4 md:flex-row">
      {scene.items.map((item, i) => (
        <div key={i} className="ta-panel flex min-w-0 flex-1 flex-col gap-3 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">{t(spec.items[i]!.labelKey)}</p>
          <PromptText prompt={item.prompt} marks={marks} />
          {hidden ? (
            <Hidden t={t} />
          ) : (
            <DistributionBars
              distribution={{ prompt: item.prompt, candidates: item.top }}
              label={t('replay_next_short')}
              aria={t('replay_dist_aria')}
              hidePrompt
              watch={item.watch}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── continue: the same request, different models ─────────────────────────────
function ContinueView({ scene, spec, hidden, t }: { scene: ContinueScene; spec: Extract<SceneSpec, { kind: 'continue' }>; hidden: boolean; t: T }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row">
      {scene.items.map((item, i) => (
        <div key={i} className="ta-panel flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="font-mono text-xs uppercase tracking-widest text-(--color-ink)">{t(spec.items[i]!.labelKey)}</p>
            <p className="font-mono text-[10px] text-(--color-faint)">{shortModel(item.model)}</p>
          </div>
          <p className="font-mono text-sm text-(--color-ink)">{item.prompt.trim()}</p>
          {hidden ? (
            <Hidden t={t} />
          ) : (
            <p className="whitespace-pre-wrap border-l-2 border-(--color-phosphor-deep) pl-3 font-mono text-xs leading-relaxed text-(--color-phosphor)">
              {item.text}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── occlusion: which words did the prediction depend on? ─────────────────────
function OcclusionView({ scene, hidden, locale, t }: { scene: OcclusionScene; hidden: boolean; locale: Locale; t: T }) {
  const pct = (p: number) => percent(p, locale);
  const [picked, setPicked] = useState<number | null>(null);
  const ranking = occlusionRanking(scene);
  const maxDrop = Math.max(...ranking.map((r) => r.drop), 1e-9);
  const dropOf = new Map(ranking.map((r) => [r.index, r.drop]));
  const answer = scene.answer.trim();
  return (
    <div className="ta-panel flex flex-col gap-3 p-4">
      <p className="font-mono text-xs text-(--color-dim)">
        {t('replay_occlusion_base', { answer, pct: pct(scene.base) })}
      </p>
      <p className="flex flex-wrap gap-1 font-mono text-sm leading-loose">
        {scene.words.map((w, i) => {
          const drop = Math.max(0, dropOf.get(i) ?? 0);
          const heat = hidden ? 0 : Math.round((drop / maxDrop) * 85);
          return (
            <button
              key={i}
              type="button"
              disabled={hidden}
              onClick={() => setPicked(i)}
              aria-label={hidden ? w.word : t('replay_occlusion_word_aria', { word: w.word, pct: pct(w.probability) })}
              className={`rounded px-1 text-(--color-ink) ${picked === i ? 'outline outline-2 outline-(--color-ice)' : ''} ${hidden ? 'cursor-default' : 'cursor-pointer'}`}
              style={{ background: `color-mix(in oklab, var(--color-amber) ${heat}%, transparent)` }}
            >
              {w.word}
            </button>
          );
        })}
        <span aria-hidden="true" className="text-(--color-phosphor)">▌</span>
      </p>
      {hidden ? (
        <Hidden t={t} />
      ) : (
        <p aria-live="polite" className="font-mono text-xs text-(--color-dim)">
          {picked === null
            ? t('replay_occlusion_hint', { answer })
            : t('replay_occlusion_picked', {
                word: scene.words[picked]!.word,
                answer,
                pct: pct(scene.words[picked]!.probability),
              })}
        </p>
      )}
    </div>
  );
}

// ── answers: greedy chat replies, one per prompt ─────────────────────────────
function AnswersView({ scene, spec, hidden, t }: { scene: AnswersScene; spec: Extract<SceneSpec, { kind: 'answers' }>; hidden: boolean; t: T }) {
  return (
    <div className="ta-panel flex flex-col gap-2 p-4">
      <ul className="flex flex-col gap-2">
        {scene.items.map((item, i) => {
          const verdict = spec.items[i]!.verdict;
          return (
            <li key={i} className="flex flex-col gap-1 border-b border-(--color-line) pb-2 last:border-0">
              <p className="font-mono text-xs text-(--color-ink)">{item.prompt}</p>
              {!hidden && (
                <p className="font-mono text-xs text-(--color-dim)">
                  <span
                    className={`mr-2 rounded border px-1 text-[10px] uppercase tracking-widest ${
                      verdict === 'invented'
                        ? 'border-(--color-alert) text-(--color-alert)'
                        : 'border-(--color-phosphor-deep) text-(--color-phosphor)'
                    }`}
                  >
                    {t(`replay_verdict_${verdict}`)}
                  </span>
                  {item.text}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {hidden && <Hidden t={t} />}
    </div>
  );
}

// ── thinking: same question, thinking off vs on ──────────────────────────────
function ThinkingView({ scene, spec, hidden, t }: { scene: ThinkingScene; spec: Extract<SceneSpec, { kind: 'thinking' }>; hidden: boolean; t: T }) {
  const maxThink = Math.max(...scene.runs.map((r) => r.thinkTokens + r.answerTokens), 1);
  return (
    <div className="ta-panel flex flex-col gap-4 p-4">
      <p className="font-mono text-sm text-(--color-ink)">{scene.question}</p>
      {hidden ? (
        <Hidden t={t} />
      ) : (
        <div className="flex flex-col gap-4 md:flex-row">
          {[false, true].map((thinking) => (
            <div key={String(thinking)} className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
                {t(thinking ? 'replay_thinking_on' : 'replay_thinking_off')}
              </p>
              {scene.runs
                .filter((run) => run.thinking === thinking)
                .map((run) => {
                  const correct = finalAnswer(run.answer, spec.answerKind) === spec.expected;
                  return (
                    <div key={run.seed} className="flex flex-col gap-1 rounded border border-(--color-line) p-2">
                      <p className="flex items-center gap-2 font-mono text-xs">
                        <span className={`shrink-0 ${correct ? 'text-(--color-phosphor)' : 'text-(--color-alert)'}`}>
                          {correct ? '✓' : '✗'}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-(--color-faint)">{t('replay_run', { n: run.seed })}</span>
                        <span className="truncate text-(--color-ink)">{run.answer.split('\n')[0]}</span>
                      </p>
                      <div className="flex h-2 overflow-hidden rounded-sm bg-(--color-surface)" aria-hidden="true">
                        <span style={{ width: `${(run.thinkTokens / maxThink) * 100}%`, background: 'var(--color-role-system)' }} />
                        <span style={{ width: `${(run.answerTokens / maxThink) * 100}%`, background: 'var(--color-phosphor)' }} />
                      </div>
                      <p className="font-mono text-[10px] text-(--color-dim)">
                        {t('replay_token_split', { think: run.thinkTokens, answer: run.answerTokens })}
                      </p>
                      {run.thought && (
                        <details className="font-mono text-[11px] text-(--color-dim)">
                          <summary className="cursor-pointer text-(--color-role-system)">{t('replay_show_thought')}</summary>
                          <p className="mt-1 whitespace-pre-wrap">{run.thought}</p>
                        </details>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SceneView({
  spec,
  file,
  step,
  hidden,
  locale,
  t,
}: {
  spec: SceneSpec;
  file: ReplayFile;
  step: number;
  hidden: boolean;
  locale: Locale;
  t: T;
}) {
  switch (spec.kind) {
    case 'trace':
      return <TraceView key={step} scene={getScene(file, spec.id, 'trace')} step={step} hidden={hidden} t={t} />;
    case 'next':
      return <NextView scene={getScene(file, spec.id, 'next')} spec={spec} hidden={hidden} t={t} />;
    case 'continue':
      return <ContinueView scene={getScene(file, spec.id, 'continue')} spec={spec} hidden={hidden} t={t} />;
    case 'occlusion':
      return <OcclusionView scene={getScene(file, spec.id, 'occlusion')} hidden={hidden} locale={locale} t={t} />;
    case 'answers':
      return <AnswersView scene={getScene(file, spec.id, 'answers')} spec={spec} hidden={hidden} t={t} />;
    case 'thinking':
      return <ThinkingView scene={getScene(file, spec.id, 'thinking')} spec={spec} hidden={hidden} t={t} />;
  }
}

function RecordedNote({ file, locale }: { file: ReplayFile; locale: Locale }) {
  const models = new Set<string>();
  for (const scene of Object.values(file.scenes)) {
    if (scene.kind === 'continue') scene.items.forEach((item) => models.add(shortModel(item.model)));
    else models.add(shortModel(scene.model));
  }
  return (
    <p className="font-mono text-xs text-(--color-faint)">
      {lessonText('replay_recorded_note', locale, {
        models: [...models].join(', '),
        date: file.recordedAt.slice(0, 10),
      })}
    </p>
  );
}

/**
 * Replays real small-model behaviour recorded by scripts/record.mjs: each
 * round shows one recorded scene above its question. With `reveal: "after"`
 * the recorded numbers stay hidden until the prediction is made.
 */
export default function ModelReplay({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'model-replay') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const { introKey, recordingPath, scenes, rounds } = lesson.params;
  const pass = lesson.pass;
  const t: T = (key, params) => lessonText(key, locale, params);

  const [file, setFile] = useState<ReplayFile | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    void fetch(`${base}/${recordingPath}`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((data: ReplayFile) => setFile(data))
      .catch(() => setLoadError(true));
  }, [recordingPath]);

  const specOf = (id: string) => scenes.find((scene) => scene.id === id)!;

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-prose text-sm text-(--color-dim)">{t(introKey)}</p>
      {loadError && <p className="font-mono text-xs text-(--color-alert)">{t('replay_load_error')}</p>}
      {!file && !loadError && <p className="font-mono text-xs text-(--color-faint)">{t('replay_loading')}</p>}
      {file && (
        <>
          <RoundsQuiz
            rounds={rounds}
            correctIndexes={pass.correctIndexes}
            minCorrect={pass.minCorrect}
            locale={locale}
            onPass={onPass}
            renderRound={(i, answered) => {
              const round = rounds[i]!;
              return (
                <SceneView
                  key={i}
                  spec={specOf(round.scene)}
                  file={file}
                  step={round.step ?? 0}
                  hidden={round.reveal === 'after' && !answered}
                  locale={locale}
                  t={t}
                />
              );
            }}
          />
          <RecordedNote file={file} locale={locale} />
        </>
      )}
    </div>
  );
}
