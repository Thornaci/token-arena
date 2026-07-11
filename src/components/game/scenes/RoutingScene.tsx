import { useEffect, useMemo, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import type { ContextState } from '@/engine/contextModel';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { showInspector, signalSend, updateInspectorState } from '@/stores/inspector';
import { mascotEvent, mascotReport } from '@/stores/mascot';
import { buildContextState, GhostButton, PrimaryButton } from '@/components/mechanics/shared';
import SceneFrame from '../SceneFrame';
import { useAnimationQueue } from '../useAnimationQueue';
import { m } from '../motion';
import { DndScene, DraggableBlock, DropZone, type DragEndEvent } from '../dnd';

type AttackResult = 'resist' | 'breach-shields' | 'breach-routing';

/**
 * G2.3 — the injection mini-game. An incoming tool-result card carries a
 * hidden instruction (revealed by scanning). Raise shields, then route the
 * card into the DATA tray — never the instruction stack. Resolved attempts
 * feed the same completeAll counter as the classic InjectionDefense.
 */
export default function RoutingScene({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'injection-defense') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'completeAll') throw new Error('wrong pass type');
  if (!lesson.initialState) throw new Error('missing initialState');
  const { defenses, attempts } = lesson.params;
  const passCount = lesson.pass.count;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [attemptIndex, setAttemptIndex] = useState(0);
  const [resisted, setResisted] = useState(0);
  const [scanned, setScanned] = useState(false);
  const [lastResult, setLastResult] = useState<AttackResult | null>(null);
  const passedRef = useRef(false);
  const beatIdRef = useRef(0);
  const animation = useAnimationQueue();

  // shields are context too — same derivation as the classic
  const context: ContextState = useMemo(() => {
    const initial = buildContextState(lesson.initialState!);
    const guardBlocks = defenses
      .filter((d) => enabled.has(d.id))
      .map((d) => ({
        id: `guard-${d.id}`,
        role: 'system' as const,
        kind: 'config-file' as const,
        labelKey: d.labelKey,
        fixedTokens: d.costTokens,
      }));
    return { ...initial, blocks: [...initial.blocks, ...guardBlocks] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    showInspector(buildContextState(lesson.initialState!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    updateInspectorState(context);
  }, [context]);

  const attempt = attempts[attemptIndex];
  const allDone = attemptIndex >= attempts.length;

  useEffect(() => {
    mascotReport({ injectionActive: !allDone && lastResult !== 'resist' });
    return () => mascotReport({ injectionActive: false });
  }, [allDone, lastResult]);

  const toggle = (id: string) => {
    if (allDone) return;
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (lastResult !== 'resist') setLastResult(null);
  };

  const scan = () => {
    setScanned(true);
    animation.enqueue({ id: `scan-${++beatIdRef.current}`, kind: 'scan', durationMs: 400 });
  };

  const route = (target: 'data' | 'tower') => {
    if (!attempt || lastResult === 'resist') return;
    signalSend();
    mascotEvent('send');
    if (target === 'tower') {
      setLastResult('breach-routing');
      mascotEvent('confuse');
      return;
    }
    const holds = attempt.requiredDefenseIds.every((id) => enabled.has(id));
    if (!holds) {
      setLastResult('breach-shields');
      mascotEvent('confuse');
      return;
    }
    setLastResult('resist');
    mascotEvent('retrieve-hit');
    const nextResisted = resisted + 1;
    setResisted(nextResisted);
    const verdict = evaluate(
      { type: 'completeAll', count: passCount },
      { type: 'counter', completed: nextResisted },
    );
    if (verdict.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (event.active.id !== 'attack-card' || !event.over) return;
    if (event.over.id === 'data-tray') route('data');
    if (event.over.id === 'instruction-stack') route('tower');
  };

  const nextAttempt = () => {
    setAttemptIndex((i) => i + 1);
    setLastResult(null);
    setScanned(false);
  };

  const status = allDone
    ? `✓ ${t('injection_all_resisted', { total: attempts.length })}`
    : t('injection_attempt_progress', { n: attemptIndex + 1, total: attempts.length });

  return (
    <SceneFrame locale={locale} animation={animation} status={status}>
      <DndScene locale={locale} onDragEnd={onDragEnd}>
        <div className="flex flex-col gap-4">
          {/* shield console */}
          <fieldset className="ta-panel ta-notched p-4">
            <legend className="px-1 font-mono text-xs uppercase tracking-widest text-(--color-faint)">
              {t('injection_defenses_title')}
            </legend>
            <div className="flex flex-col gap-2">
              {defenses.map((defense) => {
                const on = enabled.has(defense.id);
                return (
                  <label
                    key={defense.id}
                    className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2 transition-colors ${
                      on ? 'border-(--color-ice) bg-(--color-raised)' : 'border-(--color-line)'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(defense.id)}
                      className="mt-1 accent-(--color-ice)"
                    />
                    <span className="flex flex-col">
                      <span className="text-sm text-(--color-ink)">
                        {on ? '🛡 ' : ''}
                        {t(defense.labelKey)}
                      </span>
                      <span className="text-xs text-(--color-dim)">{t(defense.descKey)}</span>
                    </span>
                    <span className="ml-auto self-center font-mono text-xs text-(--color-amber)">
                      +{nf.format(defense.costTokens)}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {!allDone && attempt && (
            <div className="flex flex-col gap-3">
              <p className="max-w-prose text-sm text-(--color-dim)">{t(attempt.introKey)}</p>

              {/* the incoming card */}
              <div className="flex flex-wrap items-start gap-4">
                {lastResult !== 'resist' && (
                  <DraggableBlock
                    id="attack-card"
                    label={t('game_route_card')}
                    disabled={!scanned}
                    className="min-w-0"
                  >
                    <div className="ta-hatch relative w-72 overflow-hidden rounded border border-(--color-amber) p-3">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-(--color-amber)">
                        ⌁ {t('game_route_card')}
                      </p>
                      {scanned ? (
                        <p className="mt-1 font-mono text-sm text-(--color-ink)">
                          “{t(attempt.attackKey)}”
                        </p>
                      ) : (
                        <p className="mt-1 font-mono text-sm text-(--color-faint)">▒▒▒▒▒▒▒▒▒▒▒▒▒</p>
                      )}
                      {animation.activeBeat?.kind === 'scan' && !animation.lastDelivery?.instant && (
                        <m.span
                          aria-hidden="true"
                          initial={{ left: '-20%' }}
                          animate={{ left: '110%' }}
                          transition={{ duration: 0.4, ease: 'linear' }}
                          className="absolute top-0 h-full w-10"
                          style={{
                            background:
                              'linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-ice) 45%, transparent), transparent)',
                          }}
                        />
                      )}
                    </div>
                  </DraggableBlock>
                )}

                {/* routing targets */}
                {scanned && lastResult !== 'resist' && (
                  <div className="flex min-w-52 flex-1 flex-col gap-2">
                    <DropZone
                      id="data-tray"
                      label={t('game_route_data_tray')}
                      className="flex min-h-16 items-center justify-center rounded border-2 border-dashed border-(--color-ice) p-2 text-center font-mono text-xs text-(--color-ice) transition-colors data-over:bg-(--color-raised)"
                    >
                      🗄 {t('game_route_data_tray')}
                    </DropZone>
                    <DropZone
                      id="instruction-stack"
                      label={t('game_route_tower')}
                      className="flex min-h-16 items-center justify-center rounded border-2 border-dashed border-(--color-role-system) p-2 text-center font-mono text-xs text-(--color-role-system) transition-colors data-over:bg-(--color-raised)"
                    >
                      ⌂ {t('game_route_tower')}
                    </DropZone>
                  </div>
                )}
              </div>

              {!scanned && (
                <PrimaryButton onClick={scan}>{t('game_route_scan_cta')}</PrimaryButton>
              )}
              {scanned && lastResult === null && (
                <p className="font-mono text-xs text-(--color-faint)">{t('game_route_hint')}</p>
              )}

              {lastResult === 'breach-routing' && (
                <div aria-live="polite" className="flex flex-col gap-2">
                  <p className="rounded border border-(--color-alert) p-3 text-sm text-(--color-alert)">
                    ✗ {t('game_route_tower_breach')}
                  </p>
                  <GhostButton onClick={() => setLastResult(null)}>
                    {t('injection_adjust_cta')}
                  </GhostButton>
                </div>
              )}
              {lastResult === 'breach-shields' && (
                <div aria-live="polite" className="flex flex-col gap-2">
                  <p className="rounded border border-(--color-alert) p-3 text-sm text-(--color-alert)">
                    ✗ {t(attempt.breachKey)}
                  </p>
                  <GhostButton onClick={() => setLastResult(null)}>
                    {t('injection_adjust_cta')}
                  </GhostButton>
                </div>
              )}
              {lastResult === 'resist' && (
                <div aria-live="polite" className="flex flex-col gap-2">
                  <p className="rounded border border-(--color-phosphor-deep) p-3 text-sm text-(--color-phosphor)">
                    ✓ {t(attempt.resistKey)}
                  </p>
                  <PrimaryButton onClick={nextAttempt}>
                    {attemptIndex + 1 < attempts.length
                      ? t('injection_next_cta')
                      : t('injection_done_cta')}
                  </PrimaryButton>
                </div>
              )}
            </div>
          )}

          {allDone && (
            <p aria-live="polite" className="font-mono text-sm text-(--color-phosphor)">
              ✓ {t('injection_all_resisted', { total: attempts.length })}
            </p>
          )}
        </div>
      </DndScene>
    </SceneFrame>
  );
}
