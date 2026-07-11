import { useEffect, useMemo, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { normalizedEntropy } from '@/engine/mascot';
import { sampleDistribution, topCandidate } from '@/engine/sampling';
import { lessonText } from '@/lib/lessonText';
import { mascotReport } from '@/stores/mascot';
import RoundsQuiz from './RoundsQuiz';

/** Render a token's whitespace the way the tokenizer sees it. */
const visible = (token: string) => token.replace(/ /g, '␣').replace(/\n/g, '↵');

export default function SamplingLab({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'sampling-lab') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const { promptText, candidates, temperatures, topPStops, rounds } = lesson.params;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  const [tempIndex, setTempIndex] = useState(() =>
    Math.max(0, temperatures.findIndex((v) => v === 1)),
  );
  const [topPIndex, setTopPIndex] = useState(topPStops.length - 1);

  const temperature = temperatures[tempIndex]!;
  const topP = topPStops[topPIndex]!;

  const distribution = useMemo(
    () => sampleDistribution(candidates, temperature, topP),
    [candidates, temperature, topP],
  );
  const greedy = topCandidate(distribution);

  // The mascot's uncertainty tracks the actual sampling pool (in-nucleus).
  useEffect(() => {
    mascotReport({
      entropyNorm: normalizedEntropy(
        distribution.filter((c) => c.inNucleus).map((c) => c.probability),
      ),
    });
  }, [distribution]);

  return (
    <div className="flex flex-col gap-5">
      {/* the lab */}
      <div className="ta-panel ta-notched flex flex-col gap-4 p-4">
        <p className="font-mono text-sm text-(--color-dim)">
          {t('sampling_prompt_label')}{' '}
          <span className="text-(--color-ink)">“{promptText}”</span>
          <span aria-hidden="true" className="motion-safe:animate-pulse text-(--color-phosphor)">▌</span>
        </p>

        {/* sliders */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between font-mono text-xs">
              <label htmlFor="temp-slider" className="uppercase tracking-widest text-(--color-faint)">
                temperature
              </label>
              <span className="text-(--color-amber)">{temperature.toFixed(1)}</span>
            </div>
            <input
              id="temp-slider"
              type="range"
              min={0}
              max={temperatures.length - 1}
              step={1}
              value={tempIndex}
              onChange={(e) => setTempIndex(Number(e.target.value))}
              className="accent-(--color-amber)"
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between font-mono text-xs">
              <label htmlFor="topp-slider" className="uppercase tracking-widest text-(--color-faint)">
                top_p
              </label>
              <span className="text-(--color-ice)">{topP.toFixed(2)}</span>
            </div>
            <input
              id="topp-slider"
              type="range"
              min={0}
              max={topPStops.length - 1}
              step={1}
              value={topPIndex}
              onChange={(e) => setTopPIndex(Number(e.target.value))}
              className="accent-(--color-ice)"
            />
          </div>
        </div>

        {/* the distribution */}
        <ol className="flex flex-col gap-1.5" aria-label={t('sampling_dist_aria')}>
          {distribution.map((candidate) => {
            const isTop = candidate.token === greedy.token && candidate.inNucleus;
            return (
              <li key={candidate.token} className="flex items-center gap-2">
                <span
                  className={`w-24 shrink-0 truncate text-right font-mono text-xs ${
                    candidate.inNucleus ? 'text-(--color-ink)' : 'text-(--color-faint) line-through'
                  }`}
                >
                  {visible(candidate.token)}
                </span>
                <span className="h-4 flex-1 overflow-hidden rounded-sm bg-(--color-surface)">
                  <span
                    className={`block h-full transition-[width] duration-300 ${
                      candidate.inNucleus ? '' : 'opacity-30'
                    }`}
                    style={{
                      width: `${Math.max(0.5, candidate.probability * 100)}%`,
                      background: isTop ? 'var(--color-phosphor)' : 'var(--color-ice)',
                    }}
                  />
                </span>
                <span
                  className={`w-14 shrink-0 font-mono text-[10px] ${
                    candidate.inNucleus ? 'text-(--color-dim)' : 'text-(--color-faint)'
                  }`}
                >
                  {(candidate.probability * 100).toFixed(1)}%
                  {!candidate.inNucleus && ' ✂'}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="font-mono text-xs text-(--color-faint)">{t('sampling_cut_note')}</p>
      </div>

      {/* predictions */}
      <RoundsQuiz
        rounds={rounds}
        correctIndexes={lesson.pass.correctIndexes}
        minCorrect={lesson.pass.minCorrect}
        locale={locale}
        onPass={onPass}
      />
    </div>
  );
}
