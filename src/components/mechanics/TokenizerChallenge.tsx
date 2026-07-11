import { useCallback, useEffect, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import TokenizerPlayground from '@/components/tokenizer/TokenizerPlayground';
import { useTokenizer } from '@/components/tokenizer/useTokenizer';
import { evaluate, isSingleWord } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import type { EncodingId } from '@/lib/tokenizer';

export default function TokenizerChallenge({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'tokenizer-playground') throw new Error('wrong lesson');
  const { challenges, defaultEncoding } = lesson.params;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  const [done, setDone] = useState<Record<string, boolean>>({});
  const [wordInputs, setWordInputs] = useState<Record<string, string>>({});
  const [wordVerdicts, setWordVerdicts] = useState<Record<string, number | 'invalid' | null>>({});
  const { tokenizer } = useTokenizer(defaultEncoding);
  const passedRef = useRef(false);

  const reduceChallenge = challenges.find((c) => c.kind === 'reduceTokens');
  const firstSeed = reduceChallenge?.kind === 'reduceTokens' ? reduceChallenge.seedText : '';

  // Live check of every reduceTokens challenge as the player edits.
  const handleTokenize = useCallback(
    (info: { text: string; tokens: number; encoding: EncodingId }) => {
      if (info.encoding !== defaultEncoding) return;
      setDone((prev) => {
        let next = prev;
        for (const challenge of challenges) {
          if (challenge.kind !== 'reduceTokens') continue;
          const ok =
            info.tokens >= 2 &&
            evaluate(
              { type: 'tokenTarget', comparator: 'lte', target: challenge.targetTokens },
              { type: 'tokenCount', tokens: info.tokens },
            ).pass;
          // Solving is sticky: exploring afterwards must not undo the medal.
          if (ok && !prev[challenge.id]) {
            next = next === prev ? { ...prev } : next;
            next[challenge.id] = true;
          }
        }
        return next;
      });
    },
    [challenges, defaultEncoding],
  );

  const checkWord = (challengeId: string, minTokens: number) => {
    const word = (wordInputs[challengeId] ?? '').trim();
    if (!tokenizer || !isSingleWord(word)) {
      setWordVerdicts((v) => ({ ...v, [challengeId]: 'invalid' }));
      return;
    }
    const tokens = tokenizer.countTokens(word);
    setWordVerdicts((v) => ({ ...v, [challengeId]: tokens }));
    const ok = evaluate(
      { type: 'multiTokenWord', minTokens },
      { type: 'word', word, tokens },
    ).pass;
    if (ok) setDone((prev) => ({ ...prev, [challengeId]: true }));
  };

  const completedCount = challenges.filter((c) => done[c.id]).length;

  useEffect(() => {
    if (passedRef.current) return;
    const result = evaluate(
      { type: 'completeAll', count: challenges.length },
      { type: 'counter', completed: completedCount },
    );
    if (result.pass) {
      passedRef.current = true;
      onPass();
    }
  }, [completedCount, challenges.length, onPass]);

  return (
    <div className="flex flex-col gap-4">
      <TokenizerPlayground
        locale={locale}
        defaultEncoding={defaultEncoding}
        initialText={firstSeed}
        onTokenize={handleTokenize}
      />

      <ol className="flex flex-col gap-3">
        {challenges.map((challenge) => {
          const solved = !!done[challenge.id];
          return (
            <li
              key={challenge.id}
              className={`ta-panel flex flex-col gap-2 border-l-2 p-4 ${
                solved ? 'border-l-(--color-phosphor)' : 'border-l-(--color-line-bright)'
              }`}
            >
              <p className="flex items-baseline gap-2 text-sm text-(--color-ink)">
                <span
                  aria-hidden="true"
                  className={solved ? 'text-(--color-phosphor)' : 'text-(--color-faint)'}
                >
                  {solved ? '▣' : '▢'}
                </span>
                {t(challenge.promptKey)}
                {solved && <span className="sr-only">{t('challenge_done_sr')}</span>}
              </p>

              {challenge.kind === 'reduceTokens' && (
                <p className="font-mono text-xs text-(--color-dim)">
                  {t('l1_1_target_line', { target: challenge.targetTokens })}
                </p>
              )}

              {challenge.kind === 'findMultiTokenWord' && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={wordInputs[challenge.id] ?? ''}
                    onChange={(e) =>
                      setWordInputs((w) => ({ ...w, [challenge.id]: e.target.value }))
                    }
                    onKeyDown={(e) => e.key === 'Enter' && checkWord(challenge.id, challenge.minTokens)}
                    placeholder={t('l1_1_word_placeholder')}
                    className="rounded border border-(--color-line-bright) bg-(--color-bg) px-3 py-1.5 font-mono text-sm text-(--color-ink)"
                  />
                  <button
                    type="button"
                    onClick={() => checkWord(challenge.id, challenge.minTokens)}
                    className="rounded border border-(--color-line-bright) px-3 py-1.5 font-mono text-xs text-(--color-dim) hover:text-(--color-ink)"
                  >
                    {t('l1_1_check_cta')}
                  </button>
                  {typeof wordVerdicts[challenge.id] === 'number' && (
                    <span
                      className={`font-mono text-xs ${
                        (wordVerdicts[challenge.id] as number) >= challenge.minTokens
                          ? 'text-(--color-phosphor)'
                          : 'text-(--color-amber)'
                      }`}
                    >
                      {t('l1_1_word_count', { count: wordVerdicts[challenge.id] as number })}
                    </span>
                  )}
                  {wordVerdicts[challenge.id] === 'invalid' && (
                    <span className="font-mono text-xs text-(--color-alert)">
                      {t('l1_1_word_invalid')}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
