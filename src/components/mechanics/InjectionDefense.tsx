import { useEffect, useMemo, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import type { ContextState } from '@/engine/contextModel';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { showInspector, signalSend, updateInspectorState } from '@/stores/inspector';
import { buildContextState, GhostButton, PrimaryButton } from './shared';

type AttackResult = 'resist' | 'breach';

export default function InjectionDefense({ lesson, locale, onPass }: MechanicComponentProps) {
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
  const [lastResult, setLastResult] = useState<AttackResult | null>(null);
  const passedRef = useRef(false);

  // Every guard is context too: enabled defenses appear as config blocks.
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

  const toggle = (id: string) => {
    if (allDone) return;
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastResult(null);
  };

  const runAttack = () => {
    if (!attempt) return;
    signalSend();
    const holds = attempt.requiredDefenseIds.every((id) => enabled.has(id));
    if (!holds) {
      setLastResult('breach');
      return;
    }
    setLastResult('resist');
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

  const nextAttempt = () => {
    setAttemptIndex((i) => i + 1);
    setLastResult(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* defense console */}
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
                  <span className="text-sm text-(--color-ink)">{t(defense.labelKey)}</span>
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

      {/* incoming attack */}
      {!allDone && attempt && (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
            {t('injection_attempt_progress', { n: attemptIndex + 1, total: attempts.length })}
          </p>
          <p className="max-w-prose text-sm text-(--color-dim)">{t(attempt.introKey)}</p>
          <div className="ta-hatch rounded border border-(--color-amber) p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-(--color-amber)">
              {t('injection_untrusted_tag')}
            </p>
            <p className="mt-1 font-mono text-sm text-(--color-ink)">“{t(attempt.attackKey)}”</p>
          </div>

          {lastResult === null && (
            <PrimaryButton onClick={runAttack}>{t('injection_run_cta')}</PrimaryButton>
          )}
          {lastResult === 'breach' && (
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
  );
}
