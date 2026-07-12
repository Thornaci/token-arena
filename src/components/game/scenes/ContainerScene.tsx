import { useEffect, useMemo, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import {
  fillInfo,
  setReservedOutput,
  type ContextBlock,
  type ContextState,
} from '@/engine/contextModel';
import { MODEL_PROFILES } from '@/engine/modelProfiles';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';
import { showInspector, signalSend, updateInspectorState } from '@/stores/inspector';
import { mascotEvent } from '@/stores/mascot';
import { buildContextState, GhostButton, PrimaryButton, ROLE_TAG } from '@/components/mechanics/shared';
import SceneFrame from '../SceneFrame';
import { useAnimationQueue, type SceneAnimation } from '../useAnimationQueue';
import { m, AnimatePresence } from '../motion';
import { DndScene, DraggableBlock, DropZone, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '../dnd';
import Vessel, { tokensToPx, VESSEL_HEIGHT_PX } from '../parts/Vessel';
import { blockColor } from '../parts/segments';

const count = () => 0; // lesson blocks always carry authored fixedTokens

/**
 * G1.1 — The Context Container. The window is a vessel; every context element
 * is a block whose height ∝ its token count. window-fit: drag blocks out to
 * the trim tray. output-reserve: drag the reserved-zone handle. Same engine
 * math and budgetFit evidence as the classic renderers.
 */
export default function ContainerScene(props: MechanicComponentProps) {
  if (props.lesson.mechanic === 'window-fit') return <WindowFitScene {...props} />;
  if (props.lesson.mechanic === 'output-reserve') return <OutputReserveScene {...props} />;
  throw new Error('ContainerScene handles window-fit and output-reserve only');
}

// ---------------------------------------------------------------------------
// shared bits

function VesselBlock({
  block,
  tokens,
  label,
  windowTokens,
  scatter,
  minPx,
  tag,
}: {
  block: ContextBlock;
  tokens: number;
  label: string;
  windowTokens: number;
  /** deterministic per-index rupture offset; null = settled */
  scatter: { rotate: number; x: number } | null;
  minPx: number;
  tag?: string;
}) {
  return (
    <m.div
      layout
      initial={{ scaleY: 1.25, y: -14, opacity: 0.8 }}
      animate={
        scatter
          ? { rotate: scatter.rotate, x: scatter.x, opacity: 0.55, scaleY: 1, y: 0 }
          : { scaleY: 1, y: 0, opacity: 1, rotate: 0, x: 0 }
      }
      transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      className="flex items-center gap-2 overflow-hidden rounded-sm border border-(--color-bg)/60 px-2"
      style={{
        height: tokensToPx(tokens, windowTokens, minPx),
        background: `color-mix(in oklab, ${blockColor(block)} 26%, var(--color-raised))`,
        borderLeft: `3px solid ${blockColor(block)}`,
      }}
    >
      <span className="font-mono text-[9px] tracking-widest" style={{ color: blockColor(block) }}>
        {ROLE_TAG[block.role]}
      </span>
      <span className="truncate text-xs text-(--color-ink)">{label}</span>
      {tag && (
        <span className="rounded border border-(--color-ice) px-1 font-mono text-[9px] text-(--color-ice)">
          {tag}
        </span>
      )}
      <span className="ml-auto shrink-0 font-mono text-[10px] text-(--color-ink)">{tokens}</span>
    </m.div>
  );
}

function GhostWindows({ total, modelId, locale }: { total: number; modelId: string; locale: Locale }) {
  const t = (key: string) => lessonText(key, locale);
  return (
    <div className="flex flex-wrap items-baseline gap-2 font-mono text-[10px] text-(--color-faint)">
      <span className="uppercase tracking-widest">{t('windowfit_other_windows')}</span>
      {MODEL_PROFILES.filter((p) => p.id !== modelId && p.family === 'generic').map((profile) => (
        <span key={profile.id} className="rounded border border-(--color-line) px-2 py-0.5">
          {t(profile.labelKey)}: {Math.round((total / profile.contextWindow) * 100)}%
        </span>
      ))}
    </div>
  );
}

function RuptureOverlay({ locale, detail }: { locale: Locale; detail: string }) {
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-(--color-bg)/85 p-4 text-center"
      role="alert"
    >
      <p className="font-mono text-lg font-bold text-(--color-alert)">
        {lessonText('game_container_rupture_title', locale)}
      </p>
      <p className="font-mono text-xs text-(--color-dim)">{detail}</p>
    </m.div>
  );
}

function useSpectacle(animation: SceneAnimation) {
  const [spectacle, setSpectacle] = useState<'none' | 'strain' | 'ruptured'>('none');
  useEffect(() => {
    const beat = animation.lastDelivery?.beat;
    if (!beat) return;
    if (beat.kind === 'strain') setSpectacle('strain');
    if (beat.kind === 'rupture') setSpectacle('ruptured');
  }, [animation.lastDelivery]);
  return [spectacle, setSpectacle] as const;
}

// ---------------------------------------------------------------------------
// window-fit

type BlockChoice = 'keep' | 'removed' | 'summary';
type SendResult = 'tooLong' | 'missing' | 'ok';

function WindowFitScene({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'window-fit') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'budgetFit') throw new Error('wrong pass type');
  if (!lesson.initialState) throw new Error('missing initialState');
  const { items, errorKey, successKey } = lesson.params;
  const budget = lesson.pass.budget;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const [choices, setChoices] = useState<Record<string, BlockChoice>>({});
  const [result, setResult] = useState<SendResult | null>(null);
  const passedRef = useRef(false);
  const beatIdRef = useRef(0);
  const animation = useAnimationQueue();
  const [spectacle, setSpectacle] = useSpectacle(animation);

  const itemOf = (blockId: string) => items.find((item) => item.blockId === blockId);
  const initialBlocks = useMemo(() => buildContextState(lesson.initialState!).blocks, [lesson]);

  // identical derivation to the classic WindowFit — the evidence must match
  const context: ContextState = useMemo(() => {
    const initial = buildContextState(lesson.initialState!);
    const blocks: ContextBlock[] = [];
    for (const block of initial.blocks) {
      const choice = choices[block.id] ?? 'keep';
      if (choice === 'removed') continue;
      if (choice === 'summary') {
        const item = itemOf(block.id)!;
        blocks.push({
          ...block,
          labelKey: item.summaryLabelKey ?? block.labelKey,
          fixedTokens: item.summaryTokens,
        });
        continue;
      }
      blocks.push(block);
    }
    return { ...initial, blocks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices]);

  useEffect(() => {
    showInspector(buildContextState(lesson.initialState!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    updateInspectorState(context);
  }, [context]);

  const fill = fillInfo(context, count);
  const total = fill.used + fill.reserved;
  const over = total > budget;
  const requiredKept = items
    .filter((item) => item.required)
    .every((item) => (choices[item.blockId] ?? 'keep') !== 'removed');

  const choose = (blockId: string, choice: BlockChoice) => {
    setChoices((current) => ({ ...current, [blockId]: choice }));
    setResult(null);
    setSpectacle('none');
    animation.clear();
  };

  const send = () => {
    signalSend();
    mascotEvent('send');
    if (total > budget) {
      setResult('tooLong');
      animation.enqueue([
        { id: `strain-${++beatIdRef.current}`, kind: 'strain', durationMs: 250 },
        { id: `rupture-${++beatIdRef.current}`, kind: 'rupture', durationMs: 600, cinematic: true },
      ]);
      return;
    }
    if (!requiredKept) {
      setResult('missing');
      return;
    }
    setResult('ok');
    const verdict = evaluate(
      { type: 'budgetFit', budget },
      { type: 'budgetFit', totalTokens: total, requiredKept },
    );
    if (verdict.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  const reset = () => {
    setResult(null);
    setSpectacle('none');
    animation.clear();
  };

  const onDragEnd = (event: DragEndEvent) => {
    const blockId = String(event.active.id);
    const item = itemOf(blockId);
    if (!item) return;
    if (event.over?.id === 'tray' && item.removable) choose(blockId, 'removed');
    if (event.over?.id === 'vessel' && (choices[blockId] ?? 'keep') === 'removed')
      choose(blockId, 'keep');
  };

  const status =
    result === 'tooLong'
      ? t(errorKey, { over: nf.format(total - budget) })
      : result === 'missing'
        ? t('ui_required_missing')
        : result === 'ok'
          ? `✓ ${t(successKey, { total: nf.format(total) })}`
          : t('game_container_status', {
              total: nf.format(total),
              window: nf.format(budget),
              pct: Math.round((total / budget) * 100),
            });

  const keptBlocks = context.blocks;
  const removedBlocks = initialBlocks.filter((b) => (choices[b.id] ?? 'keep') === 'removed');
  const ruptured = spectacle === 'ruptured';

  const labelFor = (block: ContextBlock, tokens: number) =>
    `${block.labelKey ? t(block.labelKey) : block.id} · ${nf.format(tokens)}`;

  return (
    <SceneFrame locale={locale} animation={animation} status={status} onReset={reset}>
      <DndScene locale={locale} onDragEnd={onDragEnd}>
        <div className="flex flex-wrap items-start gap-5">
          {/* the vessel */}
          <DropZone
            id="vessel"
            label={t('game_container_vessel_aria')}
            className="data-over:opacity-90"
          >
            <Vessel
              windowTokens={budget}
              reservedTokens={fill.reserved}
              caption={t('game_container_window_line', { window: nf.format(budget) })}
              ariaLabel={t('game_container_vessel_aria')}
              reservedLabel={t('game_container_reserved_label')}
              strained={(over && spectacle !== 'ruptured') || spectacle === 'strain'}
              ruptured={ruptured}
              overlay={
                ruptured ? (
                  <RuptureOverlay
                    locale={locale}
                    detail={t(errorKey, { over: nf.format(total - budget) })}
                  />
                ) : undefined
              }
            >
              <AnimatePresence>
                {keptBlocks.map((block, i) => {
                  const item = itemOf(block.id);
                  const tokens = block.fixedTokens ?? 0;
                  const isSummary = (choices[block.id] ?? 'keep') === 'summary';
                  const scatter = ruptured
                    ? { rotate: (i % 2 ? -1 : 1) * (6 + i * 4), x: (i % 2 ? -1 : 1) * (8 + i * 5) }
                    : null;
                  const inner = (
                    <VesselBlock
                      block={block}
                      tokens={tokens}
                      label={block.labelKey ? t(block.labelKey) : block.id}
                      windowTokens={budget}
                      scatter={scatter}
                      minPx={item?.removable ? 44 : 24}
                      tag={isSummary ? t('windowfit_summarized_tag') : undefined}
                    />
                  );
                  return item?.removable ? (
                    <DraggableBlock
                      key={block.id}
                      id={block.id}
                      label={labelFor(block, tokens)}
                      className="min-h-0"
                    >
                      {inner}
                    </DraggableBlock>
                  ) : (
                    <div key={block.id} title={t('game_container_locked')}>
                      {inner}
                    </div>
                  );
                })}
              </AnimatePresence>
            </Vessel>
          </DropZone>

          {/* the trim tray */}
          <div className="flex min-w-52 flex-1 flex-col gap-2">
            <DropZone
              id="tray"
              label={t('game_container_tray_title')}
              className="flex min-h-36 flex-col gap-1.5 rounded-lg border-2 border-dashed border-(--color-line-bright) p-3 transition-colors data-over:border-(--color-phosphor)"
            >
              <p className="font-mono text-[10px] uppercase tracking-widest text-(--color-faint)">
                {t('game_container_tray_title')}
              </p>
              <p className="text-xs text-(--color-faint)">
                {removedBlocks.length === 0
                  ? t('game_container_tray_hint')
                  : t('game_container_tray_restore_hint')}
              </p>
              {removedBlocks.map((block) => (
                <DraggableBlock
                  key={block.id}
                  id={block.id}
                  label={labelFor(block, block.fixedTokens ?? 0)}
                  className="min-h-0"
                >
                  <div
                    className="flex items-center gap-2 rounded-sm border border-(--color-line) px-2 py-2 opacity-70"
                    style={{ borderLeft: `3px solid ${blockColor(block)}` }}
                  >
                    <span className="truncate text-xs text-(--color-dim) line-through">
                      {block.labelKey ? t(block.labelKey) : block.id}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-(--color-faint)">
                      {nf.format(block.fixedTokens ?? 0)}
                    </span>
                  </div>
                </DraggableBlock>
              ))}
            </DropZone>

            {/* compress controls for summarizable blocks */}
            {items
              .filter((item) => item.summaryTokens !== undefined)
              .map((item) => {
                const block = initialBlocks.find((b) => b.id === item.blockId)!;
                const choice = choices[item.blockId] ?? 'keep';
                if (choice === 'removed') return null;
                return (
                  <button
                    key={item.blockId}
                    type="button"
                    onClick={() =>
                      choose(item.blockId, choice === 'summary' ? 'keep' : 'summary')
                    }
                    className="self-start rounded border border-(--color-ice) px-3 py-1.5 font-mono text-xs text-(--color-ice) hover:bg-(--color-raised)"
                  >
                    {choice === 'summary'
                      ? `${block.labelKey ? t(block.labelKey) : block.id}: ${t('game_container_expand_cta')}`
                      : t('windowfit_summarize_cta', { tokens: nf.format(item.summaryTokens!) })}
                  </button>
                );
              })}

            <GhostWindows total={total} modelId={context.model.id} locale={locale} />

            <PrimaryButton onClick={send}>{t('windowfit_send_cta')}</PrimaryButton>

            {result === 'missing' && (
              <div aria-live="polite" className="flex flex-col gap-2">
                <p className="rounded border border-(--color-amber) p-3 text-sm text-(--color-amber)">
                  {t('ui_required_missing')}
                </p>
                <GhostButton onClick={() => setResult(null)}>{t('ui_retry')}</GhostButton>
              </div>
            )}
            {result === 'ok' && (
              <p
                aria-live="polite"
                className="rounded border border-(--color-phosphor-deep) p-3 text-sm text-(--color-phosphor)"
              >
                ✓ {t(successKey, { total: nf.format(total) })}
              </p>
            )}
          </div>
        </div>
      </DndScene>
    </SceneFrame>
  );
}

// ---------------------------------------------------------------------------
// output-reserve

type ReserveResult = 'tooLong' | 'truncated' | 'ok';

function OutputReserveScene({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'output-reserve') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'budgetFit') throw new Error('wrong pass type');
  if (!lesson.initialState) throw new Error('missing initialState');
  const {
    requiredOutputTokens,
    sliderMax,
    sliderStep,
    taskKey,
    fullReplyKey,
    truncatedReplyKey,
    successKey,
  } = lesson.params;
  const budget = lesson.pass.budget;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const [context, setContext] = useState<ContextState>(() =>
    buildContextState(lesson.initialState!),
  );
  const [result, setResult] = useState<ReserveResult | null>(null);
  const passedRef = useRef(false);
  const beatIdRef = useRef(0);
  const dragStartReserve = useRef(0);
  const animation = useAnimationQueue();
  const [spectacle, setSpectacle] = useSpectacle(animation);

  useEffect(() => {
    showInspector(buildContextState(lesson.initialState!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fill = fillInfo(context, count);
  const total = fill.used + fill.reserved;
  const over = total > budget;

  const setReserve = (tokens: number) => {
    const snapped = Math.round(tokens / sliderStep) * sliderStep;
    const clamped = Math.max(0, Math.min(sliderMax, snapped));
    const next = setReservedOutput(context, clamped);
    setContext(next);
    updateInspectorState(next);
    setResult(null);
    setSpectacle('none');
  };

  const onDragStart = (event: DragStartEvent) => {
    if (event.active.id === 'reserve-handle') dragStartReserve.current = fill.reserved;
  };
  const onDragMove = (event: DragMoveEvent) => {
    if (event.active.id !== 'reserve-handle') return;
    // dragging DOWN grows the zone (its handle hangs from the zone's bottom)
    const tokensPerPx = budget / VESSEL_HEIGHT_PX;
    setReserve(dragStartReserve.current + event.delta.y * tokensPerPx);
  };

  const send = () => {
    signalSend();
    mascotEvent('send');
    if (total > budget) {
      setResult('tooLong');
      animation.enqueue([
        { id: `strain-${++beatIdRef.current}`, kind: 'strain', durationMs: 250 },
        { id: `rupture-${++beatIdRef.current}`, kind: 'rupture', durationMs: 600, cinematic: true },
      ]);
      return;
    }
    if (fill.reserved < requiredOutputTokens) {
      setResult('truncated');
      return;
    }
    setResult('ok');
    const verdict = evaluate(
      { type: 'budgetFit', budget },
      {
        type: 'budgetFit',
        totalTokens: total,
        requiredKept: fill.reserved >= requiredOutputTokens,
      },
    );
    if (verdict.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  const ruptured = spectacle === 'ruptured';
  const status =
    result === 'tooLong'
      ? t('ui_over_window_error', { over: nf.format(total - budget) })
      : result === 'truncated'
        ? t('reserve_truncated_note', { reserved: nf.format(fill.reserved) })
        : result === 'ok'
          ? `✓ ${t(successKey, { reserved: nf.format(fill.reserved) })}`
          : t('game_container_status', {
              total: nf.format(total),
              window: nf.format(budget),
              pct: Math.round((total / budget) * 100),
            });

  return (
    <SceneFrame
      locale={locale}
      animation={animation}
      status={status}
      onReset={() => {
        setResult(null);
        setSpectacle('none');
        animation.clear();
      }}
    >
      <DndScene locale={locale} onDragStart={onDragStart} onDragMove={onDragMove}>
        <p className="ta-panel mb-4 max-w-prose p-4 text-sm text-(--color-ink)">{t(taskKey)}</p>
        <div className="flex flex-wrap items-start gap-5">
          <Vessel
            windowTokens={budget}
            reservedTokens={fill.reserved}
            caption={t('game_container_window_line', { window: nf.format(budget) })}
            ariaLabel={t('game_container_vessel_aria')}
            reservedLabel={`${t('game_container_reserved_label')} · ${nf.format(fill.reserved)}`}
            strained={(over && !ruptured) || spectacle === 'strain'}
            ruptured={ruptured}
            reservedExtra={
              <DraggableBlock
                id="reserve-handle"
                label={t('game_container_reserve_handle')}
                applyTransform={false}
                className="absolute -bottom-5 left-1/2 min-h-0 -translate-x-1/2"
              >
                <span className="flex h-10 w-16 cursor-row-resize items-center justify-center rounded border border-(--color-role-reserved) bg-(--color-raised) font-mono text-xs text-(--color-ink)">
                  ⇕
                </span>
              </DraggableBlock>
            }
            overlay={
              ruptured ? (
                <RuptureOverlay
                  locale={locale}
                  detail={t('ui_over_window_error', { over: nf.format(total - budget) })}
                />
              ) : undefined
            }
          >
            {context.blocks.map((block, i) => (
              <VesselBlock
                key={block.id}
                block={block}
                tokens={block.fixedTokens ?? 0}
                label={block.labelKey ? t(block.labelKey) : block.id}
                windowTokens={budget}
                scatter={ruptured ? { rotate: (i % 2 ? -1 : 1) * 8, x: (i % 2 ? -1 : 1) * 10 } : null}
                minPx={24}
              />
            ))}
          </Vessel>

          <div className="flex min-w-52 flex-1 flex-col gap-3">
            <p className="text-xs text-(--color-dim)">{t('game_container_reserve_hint')}</p>
            <div className="flex items-center gap-2 font-mono text-sm">
              <button
                type="button"
                aria-label={`− ${sliderStep}`}
                onClick={() => setReserve(fill.reserved - sliderStep)}
                className="h-11 w-11 rounded border border-(--color-line-bright) text-(--color-dim) hover:text-(--color-ink)"
              >
                −
              </button>
              <span className="min-w-20 text-center text-(--color-ice)">
                {nf.format(fill.reserved)}
              </span>
              <button
                type="button"
                aria-label={`+ ${sliderStep}`}
                onClick={() => setReserve(fill.reserved + sliderStep)}
                className="h-11 w-11 rounded border border-(--color-line-bright) text-(--color-dim) hover:text-(--color-ink)"
              >
                +
              </button>
            </div>
            <p className="font-mono text-xs text-(--color-dim)">
              {t('reserve_input_line', { input: nf.format(fill.used) })}
            </p>

            <PrimaryButton onClick={send}>{t('reserve_send_cta')}</PrimaryButton>

            {result === 'truncated' && (
              <div aria-live="polite" className="ta-panel border border-(--color-amber) p-4">
                <p className="text-sm text-(--color-dim)">
                  {t(truncatedReplyKey)}
                  <span aria-hidden="true" className="text-(--color-amber)">▌</span>
                </p>
                <p className="mt-2 border-t border-(--color-line) pt-2 font-mono text-xs text-(--color-amber)">
                  ⚠ {t('reserve_truncated_note', { reserved: nf.format(fill.reserved) })}
                </p>
              </div>
            )}
            {result === 'ok' && (
              <div aria-live="polite" className="ta-panel border border-(--color-phosphor-deep) p-4">
                <p className="text-sm text-(--color-ink)">{t(fullReplyKey)}</p>
                <p className="mt-2 border-t border-(--color-line) pt-2 font-mono text-xs text-(--color-phosphor)">
                  ✓ {t(successKey, { reserved: nf.format(fill.reserved) })}
                </p>
              </div>
            )}
          </div>
        </div>
      </DndScene>
    </SceneFrame>
  );
}
