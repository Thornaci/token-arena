import { useEffect, useMemo, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { mascotEvent, mascotReport } from '@/stores/mascot';
import { ChoiceQuestion, PrimaryButton } from '@/components/mechanics/shared';
import SceneFrame from '../SceneFrame';
import { useAnimationQueue } from '../useAnimationQueue';
import { m, AnimatePresence } from '../motion';
import { DndScene, DraggableBlock, DropZone, type DragEndEvent } from '../dnd';

/**
 * G1.2 — The Fog Corridor. The context is a corridor of document slabs; both
 * ends are lit, the middle is fogged. Light IS recall (fixed physical
 * vocabulary) — the gradient is driven by the same authored recallPct tables
 * the classic NeedleLab uses, and the pass evidence is identical.
 */
export default function CorridorScene(props: MechanicComponentProps) {
  const { lesson } = props;
  if (lesson.mechanic !== 'needle-lab') throw new Error('wrong lesson');
  return lesson.params.mode === 'position' ? (
    <PositionCorridor {...props} />
  ) : (
    <LengthCorridor {...props} />
  );
}

// ---------------------------------------------------------------------------
// corridor rendering

/** Linear interpolation of slot recalls across `slabCount` slabs. */
function slabRecalls(slotRecalls: number[], slabCount: number): number[] {
  const slots = slotRecalls.length;
  return Array.from({ length: slabCount }, (_, j) => {
    const pos = (j / (slabCount - 1)) * (slots - 1);
    const k = Math.min(slots - 2, Math.floor(pos));
    const f = pos - k;
    return slotRecalls[k]! * (1 - f) + slotRecalls[k + 1]! * f;
  });
}

function Slab({ recall }: { recall: number }) {
  // light = recall: phosphor glow at high recall, gray fog at low
  const lit = recall / 100;
  return (
    <div
      aria-hidden="true"
      className="h-24 flex-1 rounded-[2px] border border-(--color-line)"
      style={{
        background: `color-mix(in oklab, var(--color-phosphor) ${Math.round(lit * 26)}%, var(--color-raised))`,
        opacity: 0.35 + lit * 0.65,
        boxShadow: lit > 0.8 ? '0 0 12px -4px var(--color-phosphor)' : undefined,
      }}
    />
  );
}

function NeedleCard({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded border border-(--color-amber) bg-(--color-raised) px-2 py-1 text-center font-mono text-(--color-amber) ${
        compact ? 'text-[9px]' : 'text-xs'
      }`}
      style={{ boxShadow: '0 0 14px -4px var(--color-amber)' }}
    >
      ◈ {label}
    </div>
  );
}

/** The sweep: a light bar racing to the target; it wobbles when it will miss. */
function Beam({ targetPct, willMiss }: { targetPct: number; willMiss: boolean }) {
  return (
    <m.div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 h-full w-10 rounded"
      style={{
        background:
          'linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-ice) 55%, transparent), transparent)',
      }}
      initial={{ left: '0%', opacity: 0.9 }}
      animate={
        willMiss
          ? {
              left: [`0%`, `${targetPct}%`, `${Math.max(0, targetPct - 8)}%`, `${targetPct}%`],
              opacity: [0.9, 0.9, 0.25, 0.6],
            }
          : { left: `${targetPct}%`, opacity: [0.9, 1] }
      }
      transition={{ duration: 1.1, ease: 'easeInOut' }}
    />
  );
}

// ---------------------------------------------------------------------------
// L5.1 — position mode

function PositionCorridor({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'needle-lab' || lesson.params.mode !== 'position')
    throw new Error('wrong lesson');
  const params = lesson.params;
  const t = (key: string, p?: Record<string, string | number>) => lessonText(key, locale, p);
  const nf = new Intl.NumberFormat(locale);

  const [placed, setPlaced] = useState<number | null>(null);
  const [verdictSlot, setVerdictSlot] = useState<number | null>(null);
  const [beaming, setBeaming] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const passedRef = useRef(false);
  const beatIdRef = useRef(0);
  const animation = useAnimationQueue();

  const spots = params.positions;
  const recalls = useMemo(
    () => slabRecalls(spots.map((s) => s.recallPct), 21),
    [spots],
  );
  // slots sit evenly along the corridor
  const slotAt = (i: number) => (i / (spots.length - 1)) * 100;

  useEffect(() => {
    const beat = animation.lastDelivery?.beat;
    if (!beat) return;
    if (beat.kind === 'beam-sweep') setBeaming(!animation.lastDelivery!.instant);
    if (beat.kind === 'verdict') {
      setBeaming(false);
      const slot = (beat.payload as { slot: number }).slot;
      const spot = spots[slot]!;
      setVerdictSlot(slot);
      setRevealed((r) => new Set(r).add(slot));
      mascotReport({ needleRecallPct: spot.recallPct });
      mascotEvent(spot.success ? 'retrieve-hit' : 'retrieve-miss');
      if (lesson.pass.type !== 'choiceOneOf') throw new Error('wrong pass type');
      const result = evaluate(lesson.pass, { type: 'choice', selectedIndex: slot });
      if (result.pass && spot.success && !passedRef.current) {
        passedRef.current = true;
        onPass();
      }
    }
  }, [animation.lastDelivery]); // eslint-disable-line react-hooks/exhaustive-deps

  const retrieve = () => {
    if (placed === null || beaming) return;
    setVerdictSlot(null);
    mascotEvent('send');
    animation.enqueue([
      {
        id: `beam-${++beatIdRef.current}`,
        kind: 'beam-sweep',
        durationMs: 1100,
        cinematic: true,
      },
      { id: `verdict-${++beatIdRef.current}`, kind: 'verdict', durationMs: 0, payload: { slot: placed } },
    ]);
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (event.active.id !== 'needle' || !event.over) return;
    const overId = String(event.over.id);
    if (overId.startsWith('slot-')) {
      setPlaced(Number(overId.slice(5)));
      setVerdictSlot(null);
    }
    if (overId === 'needle-home') setPlaced(null);
  };

  const verdictSpot = verdictSlot !== null ? spots[verdictSlot]! : null;
  const status = beaming
    ? t('game_corridor_beam_note')
    : verdictSpot
      ? `${verdictSpot.success ? '✓' : '✗'} ${t(verdictSpot.success ? params.hitKey : params.missKey, { pct: verdictSpot.recallPct })}`
      : placed !== null
        ? t(spots[placed]!.labelKey)
        : t('game_corridor_hand_hint');

  return (
    <SceneFrame locale={locale} animation={animation} status={status}>
      <DndScene locale={locale} onDragEnd={onDragEnd}>
        <div className="flex flex-col gap-4">
          {/* the needle & the question */}
          <div className="ta-panel flex flex-col gap-1 p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-(--color-faint)">
              {t('needle_fact_tag')}
            </p>
            <p className="font-mono text-sm text-(--color-amber)">{t(params.needleKey)}</p>
            <p className="mt-2 text-sm text-(--color-dim)">{t(params.questionKey)}</p>
            <p className="mt-1 font-mono text-xs text-(--color-faint)">
              {t('needle_context_size', { tokens: nf.format(params.contextTokens) })}
            </p>
          </div>

          {/* the corridor */}
          <div role="group" aria-label={t('game_corridor_aria')} className="flex flex-col gap-2">
            <div className="relative">
              <div className="flex gap-1">
                {recalls.map((recall, j) => (
                  <Slab key={j} recall={recall} />
                ))}
              </div>
              {/* slots overlay */}
              <div className="absolute inset-0">
                {spots.map((spot, i) => {
                  const isPlaced = placed === i;
                  const isRevealed = revealed.has(i);
                  return (
                    <DropZone
                      key={i}
                      id={`slot-${i}`}
                      label={t(spot.labelKey)}
                      className="absolute top-0 flex h-full w-14 -translate-x-1/2 items-center justify-center rounded border border-dashed border-transparent transition-colors data-over:border-(--color-ice)"
                      style={{ left: `${slotAt(i)}%` }}
                    >
                      {isPlaced ? (
                        <DraggableBlock id="needle" label={t('game_corridor_needle_label')} className="min-w-0">
                          <NeedleCard label="◈" compact />
                        </DraggableBlock>
                      ) : (
                        <span
                          aria-hidden="true"
                          className="h-4/5 w-10 rounded border border-dashed border-(--color-line-bright) opacity-60"
                        />
                      )}
                      {isRevealed && (
                        <span className="absolute -bottom-5 font-mono text-[10px] text-(--color-dim)">
                          {spot.recallPct}%
                        </span>
                      )}
                    </DropZone>
                  );
                })}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-full" aria-hidden="true">
                  <AnimatePresence>
                    {beaming && placed !== null && (
                      <Beam
                        key={`beam-${placed}-${beatIdRef.current}`}
                        targetPct={slotAt(placed)}
                        willMiss={!spots[placed]!.success}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
            {/* slot labels */}
            <div className="flex justify-between font-mono text-[10px] text-(--color-faint)">
              {spots.map((spot, i) => (
                <span key={i} className={placed === i ? 'text-(--color-ice)' : ''}>
                  {t(spot.labelKey)}
                </span>
              ))}
            </div>
            <p className="font-mono text-xs text-(--color-faint)">{t('game_corridor_fog_note')}</p>
          </div>

          {/* needle home + retrieve */}
          <div className="flex flex-wrap items-center gap-3">
            <DropZone
              id="needle-home"
              label={t('game_corridor_needle_home')}
              className="flex min-w-44 items-center justify-center rounded border border-dashed border-(--color-line-bright) p-2 data-over:border-(--color-amber)"
            >
              {placed === null ? (
                <DraggableBlock id="needle" label={t('game_corridor_needle_label')}>
                  <NeedleCard label={t(params.needleKey)} />
                </DraggableBlock>
              ) : (
                <span className="font-mono text-[10px] text-(--color-faint)">
                  {t('game_corridor_needle_home')}
                </span>
              )}
            </DropZone>
            <PrimaryButton onClick={retrieve} disabled={placed === null || beaming}>
              {t('game_corridor_retrieve_cta')}
            </PrimaryButton>
          </div>

          {verdictSpot && (
            <p
              aria-live="polite"
              className={`rounded border p-3 text-sm ${
                verdictSpot.success
                  ? 'border-(--color-phosphor-deep) text-(--color-phosphor)'
                  : 'border-(--color-alert) text-(--color-alert)'
              }`}
            >
              {verdictSpot.success ? '✓ ' : '✗ '}
              {t(verdictSpot.success ? params.hitKey : params.missKey, {
                pct: verdictSpot.recallPct,
              })}
            </p>
          )}
        </div>
      </DndScene>
    </SceneFrame>
  );
}

// ---------------------------------------------------------------------------
// L5.2 — length mode (context rot): the corridor grows, the fog thickens

const SLABS_BY_SIZE = [6, 12, 20, 30];

function LengthCorridor({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'needle-lab' || lesson.params.mode !== 'length')
    throw new Error('wrong lesson');
  const params = lesson.params;
  const t = (key: string, p?: Record<string, string | number>) => lessonText(key, locale, p);
  const nf = new Intl.NumberFormat(locale);

  const [sizeIndex, setSizeIndex] = useState(0);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [verdictSize, setVerdictSize] = useState<number | null>(null);
  const [beaming, setBeaming] = useState(false);
  const [committed, setCommitted] = useState<number | null>(null);
  const passedRef = useRef(false);
  const beatIdRef = useRef(0);
  const animation = useAnimationQueue();

  const options = params.options;
  const option = options[sizeIndex]!;
  const slabCount = SLABS_BY_SIZE[sizeIndex] ?? 12;
  const correctIndex = lesson.pass.type === 'choice' ? lesson.pass.correctIndex : null;

  useEffect(() => {
    const beat = animation.lastDelivery?.beat;
    if (!beat) return;
    if (beat.kind === 'beam-sweep') setBeaming(!animation.lastDelivery!.instant);
    if (beat.kind === 'verdict') {
      setBeaming(false);
      const size = (beat.payload as { size: number }).size;
      const spot = options[size]!;
      setVerdictSize(size);
      setRevealed((r) => new Set(r).add(size));
      mascotReport({ needleRecallPct: spot.recallPct });
      mascotEvent(spot.success ? 'retrieve-hit' : 'retrieve-miss');
    }
  }, [animation.lastDelivery]); // eslint-disable-line react-hooks/exhaustive-deps

  const retrieve = () => {
    if (beaming || committed !== null) return;
    setVerdictSize(null);
    mascotEvent('send');
    animation.enqueue([
      { id: `beam-${++beatIdRef.current}`, kind: 'beam-sweep', durationMs: 1100, cinematic: true },
      { id: `verdict-${++beatIdRef.current}`, kind: 'verdict', durationMs: 0, payload: { size: sizeIndex } },
    ]);
  };

  const commit = (index: number) => {
    if (committed !== null) return;
    if (lesson.pass.type !== 'choice') throw new Error('wrong pass type');
    setCommitted(index);
    const verdict = evaluate(lesson.pass, { type: 'choice', selectedIndex: index });
    if (verdict.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  // fog: base U-curve scaled so the whole corridor dims as recall drops
  const recalls = useMemo(() => {
    const scale = option.recallPct / 100;
    return slabRecalls([100, 62, 45, 62, 100], slabCount).map((r) => r * scale);
  }, [option.recallPct, slabCount]);

  const verdictSpot = verdictSize !== null ? options[verdictSize]! : null;
  const status = beaming
    ? t('game_corridor_beam_note')
    : verdictSpot
      ? `${verdictSpot.success ? '✓' : '✗'} ${t(verdictSpot.success ? params.hitKey : params.missKey, { pct: verdictSpot.recallPct })}`
      : t('game_corridor_length_line', { tokens: nf.format(option.contextTokens) });

  return (
    <SceneFrame locale={locale} animation={animation} status={status}>
      <div className="flex flex-col gap-4">
        <div className="ta-panel flex flex-col gap-1 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-(--color-faint)">
            {t('needle_fact_tag')}
          </p>
          <p className="font-mono text-sm text-(--color-amber)">{t(params.needleKey)}</p>
          <p className="mt-2 text-sm text-(--color-dim)">{t(params.questionKey)}</p>
        </div>

        {/* the growing corridor — needle pinned near the start */}
        <div role="group" aria-label={t('game_corridor_aria')} className="flex flex-col gap-2">
          <div className="relative">
            <m.div layout className="flex gap-1">
              {recalls.map((recall, j) => (
                <Slab key={j} recall={recall} />
              ))}
            </m.div>
            <div className="absolute left-[4%] top-1/2 w-12 -translate-y-1/2">
              <NeedleCard label="◈" compact />
            </div>
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <AnimatePresence>
                {beaming && (
                  <Beam
                    key={`beam-${sizeIndex}-${beatIdRef.current}`}
                    targetPct={6}
                    willMiss={!option.success}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="flex items-baseline justify-between font-mono text-xs">
            <span className="text-(--color-dim)">
              {t(option.labelKey)} · {t('game_corridor_length_line', { tokens: nf.format(option.contextTokens) })}
            </span>
            {revealed.has(sizeIndex) && (
              <span className="text-(--color-faint)">{option.recallPct}%</span>
            )}
          </div>
          <p className="font-mono text-xs text-(--color-faint)">{t('game_corridor_fog_note')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setSizeIndex((i) => Math.max(0, i - 1))}
            disabled={sizeIndex === 0 || committed !== null}
            className="rounded border border-(--color-line-bright) px-3 py-2 font-mono text-xs text-(--color-dim) enabled:hover:text-(--color-ink) disabled:opacity-40"
          >
            {t('game_corridor_shrink_cta')}
          </button>
          <button
            type="button"
            onClick={() => setSizeIndex((i) => Math.min(options.length - 1, i + 1))}
            disabled={sizeIndex === options.length - 1 || committed !== null}
            className="rounded border border-(--color-line-bright) px-3 py-2 font-mono text-xs text-(--color-dim) enabled:hover:text-(--color-ink) disabled:opacity-40"
          >
            {t('game_corridor_grow_cta')}
          </button>
          <PrimaryButton onClick={retrieve} disabled={beaming || committed !== null}>
            {t('game_corridor_retrieve_cta')}
          </PrimaryButton>
        </div>

        {verdictSpot && committed === null && (
          <p
            aria-live="polite"
            className={`rounded border p-3 text-sm ${
              verdictSpot.success
                ? 'border-(--color-phosphor-deep) text-(--color-phosphor)'
                : 'border-(--color-alert) text-(--color-alert)'
            }`}
          >
            {verdictSpot.success ? '✓ ' : '✗ '}
            {t(verdictSpot.success ? params.hitKey : params.missKey, { pct: verdictSpot.recallPct })}
          </p>
        )}

        {/* reflection: commit to the cheapest context that works (same pass) */}
        {revealed.size >= 2 && (
          <ChoiceQuestion
            prompt={t(params.promptKey)}
            options={options.map(
              (opt) => `${t(opt.labelKey)} · ${nf.format(opt.contextTokens)}`,
            )}
            selected={committed}
            onSelect={commit}
            verdict={committed !== null && correctIndex !== null ? { correctIndex } : null}
          />
        )}
        {committed !== null && (
          <p className="max-w-prose border-l-2 border-(--color-ice) pl-3 text-sm text-(--color-dim)">
            {t(params.explainKey)}
          </p>
        )}
        {committed !== null && committed !== correctIndex && (
          <PrimaryButton onClick={() => setCommitted(null)}>{t('ui_retry')}</PrimaryButton>
        )}
      </div>
    </SceneFrame>
  );
}
