import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { useTokenizer } from '@/components/tokenizer/useTokenizer';
import { evaluate, isSingleWord } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { mascotEvent } from '@/stores/mascot';
import { GhostButton, PrimaryButton } from '@/components/mechanics/shared';
import SceneFrame from '../SceneFrame';
import { useAnimationQueue } from '../useAnimationQueue';
import { m, AnimatePresence } from '../motion';
import { DndScene, DraggableBlock, DropZone, type DragEndEvent } from '../dnd';

const CHIP_COLORS = [
  'var(--color-chip-1)',
  'var(--color-chip-2)',
  'var(--color-chip-3)',
  'var(--color-chip-4)',
  'var(--color-chip-5)',
];

const visible = (text: string) => text.replace(/ /g, '␣').replace(/\n/g, '↵');
const byteLength = (text: string) => new TextEncoder().encode(text).length;

/**
 * G2.2 — Token Blocks. Text shatters into physical tiles that fall into
 * place as you type; the trim challenge reads on a weight scale; L1.2's
 * prediction becomes a bet chip dropped on a pan before the tiles land.
 * Same tokenizer, same evaluate calls, same pass evidence as the classics.
 */
export default function TokenScaleScene(props: MechanicComponentProps) {
  if (props.lesson.mechanic === 'tokenizer-playground') return <TileForge {...props} />;
  if (props.lesson.mechanic === 'token-compare') return <BetScales {...props} />;
  throw new Error('TokenScaleScene handles tokenizer-playground and token-compare only');
}

// ---------------------------------------------------------------------------
// tiles

function Tile({
  text,
  index,
  title,
  small,
}: {
  text: string;
  index: number;
  title?: string;
  small?: boolean;
}) {
  return (
    <m.span
      layout
      initial={{ y: -18, opacity: 0, scaleY: 1.3 }}
      animate={{ y: 0, opacity: 1, scaleY: 1 }}
      exit={{ y: 14, opacity: 0, transition: { duration: 0.12 } }}
      transition={{
        type: 'spring',
        stiffness: 600,
        damping: 30,
        delay: Math.min(index * 0.018, 0.15), // stagger stays ≤150ms end to end
      }}
      title={title}
      className={`rounded-sm border border-(--color-bg)/50 px-1.5 font-mono text-(--color-ink) ${
        small ? 'py-0.5 text-[10px]' : 'py-1 text-xs'
      }`}
      style={{ background: CHIP_COLORS[index % CHIP_COLORS.length] }}
    >
      {visible(text)}
    </m.span>
  );
}

/** Analog token scale: needle + target tick, amber when over target. */
function WeightScale({
  tokens,
  target,
  max,
  label,
  ariaLabel,
}: {
  tokens: number;
  target: number;
  max: number;
  label: string;
  ariaLabel: string;
}) {
  const angleOf = (value: number) => -90 + (Math.min(value, max) / max) * 180;
  const over = tokens > target;
  return (
    <div className="flex items-center gap-3">
      <svg
        role="meter"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(tokens, max)}
        width="88"
        height="50"
        viewBox="0 0 88 50"
      >
        <path
          d="M8 46 A 36 36 0 0 1 80 46"
          fill="none"
          stroke="var(--color-line-bright)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* target tick */}
        <line
          x1="44"
          y1="46"
          x2="44"
          y2="14"
          stroke="var(--color-phosphor)"
          strokeWidth="2"
          strokeDasharray="3 3"
          style={{ transformOrigin: '44px 46px', transform: `rotate(${angleOf(target)}deg)` }}
        />
        <m.line
          x1="44"
          y1="46"
          x2="44"
          y2="12"
          stroke={over ? 'var(--color-amber)' : 'var(--color-ink)'}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ transformOrigin: '44px 46px' }}
          initial={false}
          animate={{ rotate: angleOf(tokens) }}
          transition={{ type: 'spring', stiffness: 140, damping: 16 }}
        />
        <circle cx="44" cy="46" r="3" fill="var(--color-ink)" />
      </svg>
      <span className={`font-mono text-xs ${over ? 'text-(--color-amber)' : 'text-(--color-phosphor)'}`}>
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L1.1 — the forge: type, watch tiles fall, hit the targets

function TileForge({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'tokenizer-playground') throw new Error('wrong lesson');
  const { challenges, defaultEncoding } = lesson.params;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  const reduceChallenge = challenges.find((c) => c.kind === 'reduceTokens');
  const target = reduceChallenge?.kind === 'reduceTokens' ? reduceChallenge.targetTokens : 0;
  const [text, setText] = useState(
    reduceChallenge?.kind === 'reduceTokens' ? reduceChallenge.seedText : '',
  );
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [wordInputs, setWordInputs] = useState<Record<string, string>>({});
  const [wordVerdicts, setWordVerdicts] = useState<Record<string, number | 'invalid' | null>>({});
  const passedRef = useRef(false);
  const animation = useAnimationQueue();
  const { tokenizer } = useTokenizer(defaultEncoding);

  // typing stays instant; the tile cascade renders one deferred beat behind
  const deferredText = useDeferredValue(text);
  const pieces = useMemo(
    () => (tokenizer ? tokenizer.pieces(deferredText) : []),
    [tokenizer, deferredText],
  );
  const liveTokens = tokenizer ? tokenizer.countTokens(text) : 0;

  // identical live check to the classic TokenizerChallenge
  useEffect(() => {
    if (!tokenizer) return;
    setDone((prev) => {
      let next = prev;
      for (const challenge of challenges) {
        if (challenge.kind !== 'reduceTokens') continue;
        const ok =
          liveTokens >= 2 &&
          evaluate(
            { type: 'tokenTarget', comparator: 'lte', target: challenge.targetTokens },
            { type: 'tokenCount', tokens: liveTokens },
          ).pass;
        if (ok && !prev[challenge.id]) {
          next = next === prev ? { ...prev } : next;
          next[challenge.id] = true;
        }
      }
      return next;
    });
  }, [liveTokens, challenges, tokenizer]);

  const checkWord = (challengeId: string, minTokens: number) => {
    const word = (wordInputs[challengeId] ?? '').trim();
    if (!tokenizer || !isSingleWord(word)) {
      setWordVerdicts((v) => ({ ...v, [challengeId]: 'invalid' }));
      return;
    }
    const tokens = tokenizer.countTokens(word);
    setWordVerdicts((v) => ({ ...v, [challengeId]: tokens }));
    const ok = evaluate({ type: 'multiTokenWord', minTokens }, { type: 'word', word, tokens }).pass;
    if (ok) {
      setDone((prev) => ({ ...prev, [challengeId]: true }));
      mascotEvent('retrieve-hit');
    }
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
    <SceneFrame
      locale={locale}
      animation={animation}
      status={t('game_scale_needle_line', { tokens: liveTokens, target })}
    >
      <div className="flex flex-col gap-4">
        <div className="ta-panel flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">
              {defaultEncoding}
            </p>
            <WeightScale
              tokens={liveTokens}
              target={target}
              max={Math.max(target * 2, 16)}
              label={t('game_scale_needle_line', { tokens: liveTokens, target })}
              ariaLabel={t('game_scale_aria')}
            />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            aria-label={t('playground_input_label')}
            className="w-full rounded border border-(--color-line-bright) bg-(--color-bg) p-3 font-mono text-sm text-(--color-ink) focus:border-(--color-ice) focus:outline-none"
          />
          {/* the tiles — text, shattered */}
          <div className="flex min-h-10 flex-wrap gap-1" aria-hidden="true">
            <AnimatePresence mode="popLayout">
              {pieces.map((piece, i) => (
                <Tile
                  key={`${i}-${piece.token}`}
                  text={piece.text}
                  index={i}
                  title={t('game_scale_tile_title', {
                    id: piece.token,
                    bytes: byteLength(piece.text),
                  })}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

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
                      onKeyDown={(e) =>
                        e.key === 'Enter' && checkWord(challenge.id, challenge.minTokens)
                      }
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
    </SceneFrame>
  );
}

// ---------------------------------------------------------------------------
// L1.2 — the duel: place your bet, then the tiles drop and the scales settle

function BetScales({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'token-compare') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const { rounds, encoding } = lesson.params;
  const passCheck = lesson.pass;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const [round, setRound] = useState(0);
  const [selections, setSelections] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const passedRef = useRef(false);
  const animation = useAnimationQueue();

  const primary = useTokenizer(encoding);
  const secondary = useTokenizer(encoding === 'o200k_base' ? 'cl100k_base' : 'o200k_base');
  const current = rounds[round]!;
  const selectedIndex = selections[round];
  const correctIndex = passCheck.correctIndexes[round]!;

  const pick = (index: number) => {
    if (revealed) return;
    setSelections((s) => [...s, index]);
    setRevealed(true);
    mascotEvent(index === correctIndex ? 'retrieve-hit' : 'confuse');
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (event.active.id !== 'bet-chip' || !event.over) return;
    if (event.over.id === 'pan-0') pick(0);
    if (event.over.id === 'pan-1') pick(1);
  };

  const nextRound = () => {
    if (round + 1 < rounds.length) {
      setRound(round + 1);
      setRevealed(false);
      return;
    }
    setFinished(true);
    const result = evaluate(passCheck, { type: 'choices', selectedIndexes: selections });
    if (result.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  const retry = () => {
    setRound(0);
    setSelections([]);
    setRevealed(false);
    setFinished(false);
  };

  if (finished) {
    const result = evaluate(passCheck, { type: 'choices', selectedIndexes: selections });
    return (
      <div className="ta-panel ta-notched flex flex-col gap-4 p-6">
        <p className="font-mono text-lg">
          {t('l1_2_result_line', { correct: result.correctCount ?? 0, total: rounds.length })}
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
    { text: current.a, index: 0 },
    { text: current.b, index: 1 },
  ];
  const countOf = (text: string) => primary.tokenizer?.countTokens(text) ?? 0;
  const heavier = countOf(current.a) >= countOf(current.b) ? 0 : 1;

  return (
    <SceneFrame
      locale={locale}
      animation={animation}
      status={`${t('l1_2_round_line', { round: round + 1, total: rounds.length })} · ${encoding}`}
    >
      <DndScene locale={locale} onDragEnd={onDragEnd}>
        <div className="flex flex-col gap-4">
          <p className="max-w-prose text-(--color-ink)">{t(current.promptKey)}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {columns.map(({ text, index }) => {
              const isPick = selectedIndex === index;
              const isCorrect = revealed && index === correctIndex;
              const pieces = revealed ? (primary.tokenizer?.pieces(text) ?? []) : [];
              const other = secondary.tokenizer?.countTokens(text) ?? null;
              return (
                <DropZone
                  key={index}
                  id={`pan-${index}`}
                  label={`${index === 0 ? 'A' : 'B'}: ${text}`}
                  disabled={revealed}
                  className="min-h-11 rounded data-over:ring-2 data-over:ring-(--color-ice)"
                >
                  <m.div
                    animate={revealed ? { y: heavier === index ? 8 : -6 } : { y: 0 }}
                    transition={{ type: 'spring', stiffness: 180, damping: 14 }}
                    className={`ta-panel flex min-h-32 flex-col gap-3 p-4 ${
                      isCorrect
                        ? 'border border-(--color-phosphor)'
                        : revealed && isPick
                          ? 'border border-(--color-alert)'
                          : 'border border-transparent'
                    }`}
                  >
                    <span className="font-mono text-xs text-(--color-faint)">
                      {index === 0 ? 'A' : 'B'}
                      {isPick && ` · ${t('game_scale_bet_chip')}`}
                    </span>
                    <span className="whitespace-pre-wrap font-mono text-sm text-(--color-ink)">
                      {text}
                    </span>
                    {revealed && (
                      <>
                        <span className="flex flex-wrap gap-1" aria-hidden="true">
                          <AnimatePresence>
                            {pieces.map((piece, i) => (
                              <Tile key={`${round}-${i}`} text={piece.text} index={i} small />
                            ))}
                          </AnimatePresence>
                        </span>
                        <span className="mt-auto flex flex-col gap-0.5 font-mono text-xs">
                          <span className={isCorrect ? 'text-(--color-phosphor)' : 'text-(--color-dim)'}>
                            {encoding}: {nf.format(countOf(text))} {t('playground_tokens_label')}
                          </span>
                          <span className="text-(--color-faint)">
                            {secondary.tokenizer?.encoding}: {other === null ? '…' : nf.format(other)}{' '}
                            {t('playground_tokens_label')}
                          </span>
                        </span>
                      </>
                    )}
                  </m.div>
                </DropZone>
              );
            })}
          </div>

          {!revealed && (
            <div className="flex items-center gap-3">
              <DraggableBlock id="bet-chip" label={t('game_scale_bet_chip')} className="min-w-0">
                <span
                  className="flex h-11 w-24 items-center justify-center rounded-full border-2 border-(--color-amber) bg-(--color-raised) font-mono text-xs font-bold text-(--color-amber)"
                  style={{ boxShadow: '0 0 12px -4px var(--color-amber)' }}
                >
                  ● {t('game_scale_bet_chip')}
                </span>
              </DraggableBlock>
              <span className="font-mono text-xs text-(--color-faint)">
                {t('game_scale_bet_hint')}
              </span>
            </div>
          )}

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
      </DndScene>
    </SceneFrame>
  );
}
