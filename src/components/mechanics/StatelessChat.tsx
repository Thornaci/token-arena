import { useEffect, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { addBlock, usedTokens, type ContextState } from '@/engine/contextModel';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { showInspector, signalSend, updateInspectorState } from '@/stores/inspector';
import { buildContextState, ChoiceQuestion, GhostButton, PrimaryButton } from './shared';

const count = () => 0; // lesson blocks always carry authored fixedTokens

interface Bubble {
  role: 'user' | 'assistant';
  textKey: string;
  requestTokens?: number;
  blockCount?: number;
}

export default function StatelessChat({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'stateless-chat') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choice') throw new Error('wrong pass type');
  if (!lesson.initialState) throw new Error('missing initialState');
  const { turns, question } = lesson.params;
  const correctIndex = lesson.pass.correctIndex;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const [context, setContext] = useState<ContextState>(() => buildContextState(lesson.initialState!));
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [shipping, setShipping] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<{ correctIndex: number } | null>(null);
  const passedRef = useRef(false);

  useEffect(() => {
    showInspector(buildContextState(lesson.initialState!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allSent = turnIndex >= turns.length;

  const send = () => {
    if (shipping || allSent) return;
    const turn = turns[turnIndex]!;
    const withUser = addBlock(context, {
      id: `u${turnIndex}`,
      role: 'user',
      kind: 'message',
      labelKey: turn.userKey,
      fixedTokens: turn.userTokens,
    });
    const requestTokens = usedTokens(withUser, count);
    const blockCount = withUser.blocks.length;

    setShipping(true);
    setBubbles((b) => [...b, { role: 'user', textKey: turn.userKey, requestTokens, blockCount }]);
    setContext(withUser);
    updateInspectorState(withUser);
    signalSend();

    // The reply lands after the envelope has visibly shipped.
    setTimeout(() => {
      const withReply = addBlock(withUser, {
        id: `a${turnIndex}`,
        role: 'assistant',
        kind: 'message',
        labelKey: turn.assistantKey,
        fixedTokens: turn.assistantTokens,
      });
      setContext(withReply);
      updateInspectorState(withReply);
      setBubbles((b) => [...b, { role: 'assistant', textKey: turn.assistantKey }]);
      setTurnIndex((i) => i + 1);
      setShipping(false);
    }, 700);
  };

  const answer = (index: number) => {
    setSelected(index);
    setVerdict({ correctIndex });
    const result = evaluate({ type: 'choice', correctIndex }, { type: 'choice', selectedIndex: index });
    if (result.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* chat pane */}
      <div className="ta-panel relative flex flex-col gap-2 p-4">
        {bubbles.map((bubble, i) => (
          <div key={i} className={`flex ${bubble.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded px-3 py-2 text-sm motion-safe:animate-[ta-pop-in_0.25s_ease-out] ${
                bubble.role === 'user'
                  ? 'bg-(--color-raised) text-(--color-ink)'
                  : 'border border-(--color-line) text-(--color-dim)'
              }`}
            >
              <p>{t(bubble.textKey)}</p>
              {bubble.requestTokens !== undefined && (
                <p className="mt-1 border-t border-(--color-line) pt-1 font-mono text-[10px] text-(--color-amber)">
                  {t('l2_1_request_line', {
                    blocks: bubble.blockCount ?? 0,
                    tokens: nf.format(bubble.requestTokens),
                  })}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* the envelope: the WHOLE array ships every send */}
        {shipping && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-4 top-2 motion-safe:animate-[ta-envelope_0.7s_ease-in_forwards]"
            style={{ '--ta-envelope-distance': '70vw' } as React.CSSProperties}
          >
            <div className="rounded border border-(--color-phosphor) bg-(--color-raised) px-3 py-2 font-mono text-xs text-(--color-phosphor)">
              ▤ {t('l2_1_envelope_label', { blocks: context.blocks.length + 1 })}
            </div>
          </div>
        )}

        {!allSent ? (
          <div className="mt-2 flex items-center gap-3">
            <PrimaryButton onClick={send} disabled={shipping}>
              {t('l2_1_send_cta', { n: turnIndex + 1, total: turns.length })}
            </PrimaryButton>
            <span className="font-mono text-xs text-(--color-faint)">
              {t('l2_1_watch_note')}
            </span>
          </div>
        ) : (
          <p className="mt-2 font-mono text-xs text-(--color-phosphor)">
            ✓ {t('l2_1_all_sent_note')}
          </p>
        )}
      </div>

      {/* the check */}
      {allSent && (
        <div className="flex flex-col gap-3">
          <ChoiceQuestion
            prompt={t(question.promptKey)}
            options={question.optionKeys.map((key) => t(key))}
            selected={selected}
            onSelect={answer}
            verdict={verdict}
          />
          {verdict && selected !== correctIndex && (
            <>
              <p className="max-w-prose border-l-2 border-(--color-alert) pl-3 text-sm text-(--color-dim)">
                {t('l2_1_wrong_explain')}
              </p>
              <GhostButton
                onClick={() => {
                  setSelected(null);
                  setVerdict(null);
                }}
              >
                {t('ui_retry')}
              </GhostButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}
