import { useEffect, useMemo, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { normalizedEntropy } from '@/engine/mascot';
import { createRng, hashSeed } from '@/engine/rng';
import { sampleDistribution } from '@/engine/sampling';
import { lessonText } from '@/lib/lessonText';
import { mascotReport } from '@/stores/mascot';
import RoundsQuiz from '@/components/mechanics/RoundsQuiz';
import { PrimaryButton } from '@/components/mechanics/shared';
import SceneFrame from '../SceneFrame';
import { useAnimationQueue } from '../useAnimationQueue';
import ProbabilityWall from '../parts/ProbabilityWall';

/**
 * G3.3 — The Probability Wall. The top-k distribution becomes a wall of
 * columns that breathe as temperature/top-p move; the marble drop samples a
 * token through slots sized by probability. The ONE place randomness is
 * allowed (randomness IS the lesson) — driven by a seeded RNG so every
 * visit replays the same sequence. The graded part stays the rounds quiz.
 */
export default function ProbabilityWallScene({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'sampling-lab') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const { promptText, candidates, temperatures, topPStops, rounds } = lesson.params;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  const [tempIndex, setTempIndex] = useState(() =>
    Math.max(0, temperatures.findIndex((v) => v === 1)),
  );
  const [topPIndex, setTopPIndex] = useState(topPStops.length - 1);
  const [marbleToken, setMarbleToken] = useState<string | null>(null);
  const [marbleId, setMarbleId] = useState(0);
  const [tally, setTally] = useState<Record<string, number>>({});
  const rngRef = useRef(createRng(hashSeed(`${lesson.id}:marble`)));
  const animation = useAnimationQueue();

  const temperature = temperatures[tempIndex]!;
  const topP = topPStops[topPIndex]!;
  const distribution = useMemo(
    () => sampleDistribution(candidates, temperature, topP),
    [candidates, temperature, topP],
  );

  useEffect(() => {
    mascotReport({
      entropyNorm: normalizedEntropy(
        distribution.filter((c) => c.inNucleus).map((c) => c.probability),
      ),
    });
  }, [distribution]);

  // new distribution shape → old scatter no longer applies
  const resetScatter = () => {
    setTally({});
    setMarbleToken(null);
  };

  const dropMarble = () => {
    const pool = distribution.filter((c) => c.inNucleus);
    const token = rngRef.current.pickWeighted(
      pool.map((c) => c.token),
      pool.map((c) => c.probability),
    );
    setMarbleToken(token);
    setMarbleId((id) => id + 1);
    setTally((current) => ({ ...current, [token]: (current[token] ?? 0) + 1 }));
  };

  const totalDrops = Object.values(tally).reduce((sum, n) => sum + n, 0);

  return (
    <SceneFrame
      locale={locale}
      animation={animation}
      status={`temperature ${temperature.toFixed(1)} · top_p ${topP.toFixed(2)} · ${t('game_wall_samples', { n: totalDrops })}`}
    >
      <div className="flex flex-col gap-5">
        <div className="ta-panel ta-notched flex flex-col gap-4 p-4">
          <p className="font-mono text-sm text-(--color-dim)">
            {t('sampling_prompt_label')} <span className="text-(--color-ink)">“{promptText}”</span>
            <span aria-hidden="true" className="text-(--color-phosphor)">▌</span>
          </p>

          {/* sliders — identical engine math to the classic lab */}
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
                onChange={(e) => {
                  setTempIndex(Number(e.target.value));
                  resetScatter();
                }}
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
                onChange={(e) => {
                  setTopPIndex(Number(e.target.value));
                  resetScatter();
                }}
                className="accent-(--color-ice)"
              />
            </div>
          </div>

          {/* the wall */}
          <ProbabilityWall
            candidates={distribution}
            ariaLabel={t('game_wall_aria')}
            marbleToken={marbleToken}
            marbleId={marbleId}
            tally={tally}
          />

          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={dropMarble}>● {t('game_wall_drop_cta')}</PrimaryButton>
            <span className="font-mono text-xs text-(--color-faint)">{t('sampling_cut_note')}</span>
          </div>
        </div>

        {/* predictions — the graded step, unchanged */}
        <RoundsQuiz
          rounds={rounds}
          correctIndexes={lesson.pass.correctIndexes}
          minCorrect={lesson.pass.minCorrect}
          locale={locale}
          onPass={onPass}
        />
      </div>
    </SceneFrame>
  );
}
