import { useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { mascotEvent } from '@/stores/mascot';
import { PrimaryButton } from '@/components/mechanics/shared';
import SceneFrame from '../SceneFrame';
import { useAnimationQueue } from '../useAnimationQueue';
import { m, AnimatePresence } from '../motion';
import { DndScene, DraggableBlock, DropZone, type DragEndEvent } from '../dnd';

const PX_PER_TOKEN = 0.16;

/**
 * G3.4 — Rule Jenga. The bloated config file is a teetering tower of rule
 * blocks (height ∝ tokens) over the budget line. Pull blocks out to the
 * side tray; pull a load-bearing one and a scripted failure replays while
 * the block snaps back. Ship under budget with the load-bearing rules
 * intact — the same budgetFit evidence as the classic RulesTrim.
 */
export default function JengaScene({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'rules-trim') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'budgetFit') throw new Error('wrong pass type');
  const { introKey, fileName, rules, successKey } = lesson.params;
  const budget = lesson.pass.budget;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const [pulled, setPulled] = useState<Set<string>>(new Set());
  const [brokenRule, setBrokenRule] = useState<string | null>(null);
  const [result, setResult] = useState<'over' | 'ok' | null>(null);
  const passedRef = useRef(false);
  const beatIdRef = useRef(0);
  const animation = useAnimationQueue();

  const keptRules = rules.filter((rule) => !pulled.has(rule.id));
  const keptTokens = keptRules.reduce((sum, rule) => sum + rule.tokens, 0);
  const totalTokens = rules.reduce((sum, rule) => sum + rule.tokens, 0);
  const over = keptTokens > budget;
  // the tower physically prevents removing load-bearing rules
  const requiredKept = rules.filter((r) => r.loadBearing).every((r) => !pulled.has(r.id));
  const adherence = Math.round(Math.min(1, budget / Math.max(keptTokens, 1)) * 100);

  const onDragEnd = (event: DragEndEvent) => {
    const id = String(event.active.id);
    if (!event.over) return;
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    setResult(null);
    if (event.over.id === 'side-tray' && !pulled.has(id)) {
      if (rule.loadBearing) {
        // the one spectacle: a scripted run fails, the block flies back
        setBrokenRule(id);
        mascotEvent('confuse');
        animation.enqueue({
          id: `snapback-${++beatIdRef.current}`,
          kind: 'snapback',
          durationMs: 600,
          cinematic: true,
        });
        return;
      }
      setBrokenRule(null);
      setPulled((current) => new Set(current).add(id));
    }
    if (event.over.id === 'tower' && pulled.has(id)) {
      setPulled((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const ship = () => {
    mascotEvent('send');
    if (keptTokens > budget) {
      setResult('over');
      return;
    }
    setResult('ok');
    const verdict = evaluate(
      { type: 'budgetFit', budget },
      { type: 'budgetFit', totalTokens: keptTokens, requiredKept },
    );
    if (verdict.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  const broken = brokenRule ? rules.find((r) => r.id === brokenRule) : null;
  const status =
    result === 'over'
      ? t('rules_over_note', { over: nf.format(keptTokens - budget) })
      : result === 'ok'
        ? `✓ ${t(successKey, { tokens: nf.format(keptTokens) })}`
        : t('game_jenga_status', { kept: nf.format(keptTokens), budget: nf.format(budget), pct: adherence });

  return (
    <SceneFrame locale={locale} animation={animation} status={status}>
      <DndScene locale={locale} onDragEnd={onDragEnd}>
        <p className="mb-4 max-w-prose text-sm text-(--color-dim)">{t(introKey)}</p>
        <div className="flex flex-wrap items-start gap-5">
          {/* the tower */}
          <DropZone
            id="tower"
            label={fileName}
            className="rounded data-over:ring-2 data-over:ring-(--color-phosphor)"
          >
            <figure className="flex w-72 flex-col gap-1.5">
              <div
                className="relative flex flex-col-reverse justify-start gap-px rounded-lg border-2 border-(--color-line-bright) bg-(--color-bg)/60 px-1.5 py-1.5"
                style={{ minHeight: totalTokens * PX_PER_TOKEN + 24 }}
              >
                {/* budget line */}
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 z-10 border-t-2 border-dashed border-(--color-phosphor)"
                  style={{ bottom: budget * PX_PER_TOKEN + 6 }}
                >
                  <span className="absolute -top-4 right-1 bg-(--color-bg) px-1 font-mono text-[9px] text-(--color-phosphor)">
                    {t('game_jenga_budget_line', { budget: nf.format(budget) })}
                  </span>
                </div>
                <m.div
                  className="flex flex-col-reverse gap-px"
                  animate={
                    over
                      ? { rotate: [0, -0.8, 0.8, -0.5, 0.5], transition: { duration: 2.2, repeat: Infinity } }
                      : { rotate: 0 }
                  }
                  style={{ transformOrigin: '50% 100%' }}
                >
                  <AnimatePresence>
                    {keptRules.map((rule) => (
                      <m.div
                        key={rule.id}
                        layout
                        initial={{ scaleY: 1.25, opacity: 0.8 }}
                        animate={
                          brokenRule === rule.id &&
                          animation.activeBeat?.kind === 'snapback' &&
                          !animation.lastDelivery?.instant
                            ? { x: [40, -6, 0], scaleY: 1, opacity: 1 }
                            : { scaleY: 1, opacity: 1, x: 0 }
                        }
                        exit={{ opacity: 0, x: 30, transition: { duration: 0.15 } }}
                        transition={{ type: 'spring', stiffness: 480, damping: 26 }}
                      >
                        <DraggableBlock
                          id={rule.id}
                          label={`${t(rule.textKey)} · ${nf.format(rule.tokens)}`}
                          className="min-h-0"
                        >
                          <div
                            className="flex items-center gap-2 overflow-hidden rounded-sm border border-(--color-bg)/60 bg-(--color-raised) px-2"
                            style={{
                              height: Math.max(28, rule.tokens * PX_PER_TOKEN),
                              borderLeft: '3px solid var(--color-ice)',
                            }}
                          >
                            <span className="truncate text-xs text-(--color-ink)">
                              {t(rule.textKey)}
                            </span>
                            <span className="ml-auto shrink-0 font-mono text-[10px] text-(--color-dim)">
                              {rule.tokens}
                            </span>
                          </div>
                        </DraggableBlock>
                      </m.div>
                    ))}
                  </AnimatePresence>
                </m.div>
              </div>
              <figcaption className="font-mono text-[11px] text-(--color-faint)">
                {fileName} · {t('game_jenga_adherence', { pct: adherence })}
              </figcaption>
            </figure>
          </DropZone>

          {/* side tray + controls */}
          <div className="flex min-w-52 flex-1 flex-col gap-3">
            <DropZone
              id="side-tray"
              label={t('game_jenga_tray')}
              className="flex min-h-32 flex-col gap-1.5 rounded-lg border-2 border-dashed border-(--color-line-bright) p-3 transition-colors data-over:border-(--color-alert)"
            >
              <p className="font-mono text-[10px] uppercase tracking-widest text-(--color-faint)">
                {t('game_jenga_tray')}
              </p>
              <p className="text-xs text-(--color-faint)">{t('game_jenga_hint')}</p>
              {rules
                .filter((rule) => pulled.has(rule.id))
                .map((rule) => (
                  <DraggableBlock
                    key={rule.id}
                    id={rule.id}
                    label={`${t(rule.textKey)} · ${nf.format(rule.tokens)}`}
                    className="min-h-0"
                  >
                    <div className="flex items-center gap-2 rounded-sm border border-(--color-line) px-2 py-2 opacity-70">
                      <span className="truncate text-xs text-(--color-dim) line-through">
                        {t(rule.textKey)}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-(--color-faint)">
                        {rule.tokens}
                      </span>
                    </div>
                  </DraggableBlock>
                ))}
            </DropZone>

            {broken && (
              <div aria-live="polite" className="rounded border border-(--color-alert) p-3">
                <p className="text-sm text-(--color-alert)">✗ {t('rules_broke_note')}</p>
                <p className="mt-1 font-mono text-xs text-(--color-dim)">“{t(broken.textKey)}”</p>
              </div>
            )}

            <PrimaryButton onClick={ship}>{t('rules_submit_cta')}</PrimaryButton>

            {result === 'over' && (
              <p aria-live="polite" className="rounded border border-(--color-amber) p-3 font-mono text-sm text-(--color-amber)">
                {t('rules_over_note', { over: nf.format(keptTokens - budget) })}
              </p>
            )}
            {result === 'ok' && (
              <p aria-live="polite" className="rounded border border-(--color-phosphor-deep) p-3 text-sm text-(--color-phosphor)">
                ✓ {t(successKey, { tokens: nf.format(keptTokens) })}
              </p>
            )}
          </div>
        </div>
      </DndScene>
    </SceneFrame>
  );
}
