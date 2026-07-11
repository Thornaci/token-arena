import { useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { useTokenizer } from '@/components/tokenizer/useTokenizer';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { GhostButton, PrimaryButton } from './shared';

export default function TokenCompare({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'token-compare') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const { rounds, encoding } = lesson.params;
  const passCheck = lesson.pass;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  const [round, setRound] = useState(0);
  const [selections, setSelections] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const passedRef = useRef(false);

  const primary = useTokenizer(encoding);
  const secondary = useTokenizer(encoding === 'o200k_base' ? 'cl100k_base' : 'o200k_base');

  const current = rounds[round]!;
  const nf = new Intl.NumberFormat(locale);

  const counts = (text: string) => ({
    main: primary.tokenizer?.countTokens(text) ?? null,
    other: secondary.tokenizer?.countTokens(text) ?? null,
  });

  const pick = (index: number) => {
    if (revealed) return;
    setSelections((s) => [...s, index]);
    setRevealed(true);
  };

  const nextRound = () => {
    if (round + 1 < rounds.length) {
      setRound(round + 1);
      setRevealed(false);
    } else {
      setFinished(true);
      const result = evaluate(passCheck, { type: 'choices', selectedIndexes: selections });
      if (result.pass && !passedRef.current) {
        passedRef.current = true;
        onPass();
      }
    }
  };

  const retry = () => {
    setRound(0);
    setSelections([]);
    setRevealed(false);
    setFinished(false);
  };

  const result = finished
    ? evaluate(passCheck, { type: 'choices', selectedIndexes: selections })
    : null;

  if (finished && result) {
    return (
      <div className="ta-panel ta-notched flex flex-col gap-4 p-6">
        <p className="font-mono text-lg">
          {t('l1_2_result_line', {
            correct: result.correctCount ?? 0,
            total: rounds.length,
          })}
        </p>
        {!result.pass && (
          <>
            <p className="text-sm text-(--color-dim)">{t('l1_2_retry_note')}</p>
            <GhostButton onClick={retry}>{t('ui_retry')}</GhostButton>
          </>
        )}
      </div>
    );
  }

  const columns = [
    { label: 'A', text: current.a, index: 0 },
    { label: 'B', text: current.b, index: 1 },
  ];
  const selectedIndex = selections[round];
  const correctIndex = passCheck.correctIndexes[round]!;

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-xs text-(--color-faint)">
        {t('l1_2_round_line', { round: round + 1, total: rounds.length })} · {encoding}
      </p>
      <p className="max-w-prose text-(--color-ink)">{t(current.promptKey)}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {columns.map(({ label, text, index }) => {
          const isPick = selectedIndex === index;
          const isCorrect = revealed && index === correctIndex;
          const { main, other } = counts(text);
          return (
            <button
              key={label}
              type="button"
              disabled={revealed}
              onClick={() => pick(index)}
              className={`ta-panel flex min-h-28 flex-col gap-3 p-4 text-left transition-colors ${
                isCorrect
                  ? 'border border-(--color-phosphor)'
                  : revealed && isPick
                    ? 'border border-(--color-alert)'
                    : 'border border-transparent enabled:hover:border-(--color-line-bright)'
              }`}
            >
              <span className="font-mono text-xs text-(--color-faint)">{label}</span>
              <span className="whitespace-pre-wrap font-mono text-sm text-(--color-ink)">
                {text}
              </span>
              {revealed && (
                <span className="mt-auto flex flex-col gap-0.5 font-mono text-xs">
                  <span
                    className={isCorrect ? 'text-(--color-phosphor)' : 'text-(--color-dim)'}
                  >
                    {encoding}: {main === null ? '…' : nf.format(main)}{' '}
                    {t('playground_tokens_label')}
                  </span>
                  <span className="text-(--color-faint)">
                    {secondary.tokenizer?.encoding}:{' '}
                    {other === null ? '…' : nf.format(other)} {t('playground_tokens_label')}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div className="flex flex-col gap-3">
          {current.explainKey && (
            <p className="max-w-prose border-l-2 border-(--color-ice) pl-3 text-sm text-(--color-dim)">
              {t(current.explainKey)}
            </p>
          )}
          <PrimaryButton onClick={nextRound}>
            {round + 1 < rounds.length ? `${t('l1_2_next_round')} →` : t('l1_2_see_result')}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
