import { useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import BudgetMeter from './BudgetMeter';
import { GhostButton, PrimaryButton } from './shared';

type SubmitResult = 'over' | 'missing' | 'ok';

/**
 * The wall-of-rules anti-pattern: cut a bloated config file down to budget
 * without severing the rules the workflow actually depends on. Which ones
 * are load-bearing is the puzzle — the file itself doesn't say.
 */
export default function RulesTrim({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'rules-trim') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'budgetFit') throw new Error('wrong pass type');
  const { introKey, fileName, rules, successKey } = lesson.params;
  const budget = lesson.pass.budget;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const [cut, setCut] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<SubmitResult | null>(null);
  const passedRef = useRef(false);

  const keptTokens = rules.reduce((sum, rule) => sum + (cut.has(rule.id) ? 0 : rule.tokens), 0);
  const requiredKept = rules.filter((r) => r.loadBearing).every((r) => !cut.has(r.id));

  const toggle = (id: string) => {
    setCut((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setResult(null);
  };

  const submit = () => {
    if (keptTokens > budget) {
      setResult('over');
      return;
    }
    if (!requiredKept) {
      setResult('missing');
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

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-(--color-dim)">{t(introKey)}</p>

      <BudgetMeter total={keptTokens} budget={budget} locale={locale} />

      {/* the file, rule by rule */}
      <div className="ta-panel p-0">
        <p className="border-b border-(--color-line) px-4 py-2 font-mono text-xs text-(--color-faint)">
          {fileName}
        </p>
        <ul className="flex flex-col">
          {rules.map((rule) => {
            const isCut = cut.has(rule.id);
            return (
              <li key={rule.id} className="border-b border-(--color-line) last:border-b-0">
                <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={!isCut}
                    onChange={() => toggle(rule.id)}
                    aria-label={t('rules_keep_aria')}
                    className="mt-1 accent-(--color-phosphor)"
                  />
                  <span
                    className={`flex-1 text-sm ${
                      isCut ? 'text-(--color-faint) line-through' : 'text-(--color-ink)'
                    }`}
                  >
                    {t(rule.textKey)}
                  </span>
                  <span className="font-mono text-xs text-(--color-dim)">{nf.format(rule.tokens)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <PrimaryButton onClick={submit}>{t('rules_submit_cta')}</PrimaryButton>

      {result === 'over' && (
        <p aria-live="polite" className="rounded border border-(--color-alert) p-3 font-mono text-sm text-(--color-alert)">
          {t('rules_over_note', { over: nf.format(keptTokens - budget) })}
        </p>
      )}
      {result === 'missing' && (
        <div aria-live="polite" className="flex flex-col gap-2">
          <p className="rounded border border-(--color-amber) p-3 text-sm text-(--color-amber)">
            {t('rules_broke_note')}
          </p>
          <GhostButton onClick={() => setResult(null)}>{t('ui_retry')}</GhostButton>
        </div>
      )}
      {result === 'ok' && (
        <p aria-live="polite" className="rounded border border-(--color-phosphor-deep) p-3 text-sm text-(--color-phosphor)">
          ✓ {t(successKey, { tokens: nf.format(keptTokens) })}
        </p>
      )}
    </div>
  );
}
