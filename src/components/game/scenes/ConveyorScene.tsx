import { useEffect, useMemo, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { computeBill } from '@/engine/billing';
import { addBlock, blockTokens, usedTokens, type ContextState } from '@/engine/contextModel';
import { evaluate } from '@/engine/scoring';
import { lessonText } from '@/lib/lessonText';
import { showInspector, signalSend, updateInspectorState } from '@/stores/inspector';
import { mascotEvent, mascotReport } from '@/stores/mascot';
import {
  buildContextState,
  ChoiceQuestion,
  GhostButton,
  PrimaryButton,
} from '@/components/mechanics/shared';
import SceneFrame from '../SceneFrame';
import { useAnimationQueue } from '../useAnimationQueue';
import { m, AnimatePresence } from '../motion';
import { DndScene, DraggableBlock, DropZone, type DragEndEvent } from '../dnd';

const count = () => 0; // lesson blocks always carry authored fixedTokens

/**
 * G2.1 — The Conveyor. Every send packages the ENTIRE conversation onto the
 * belt: envelopes → shrink-wrapped parcel (token stamp grows every turn) →
 * the MODEL doorway. stateless-chat adds the turn-4 "choose what ships"
 * drag; history-bill prints receipts with CACHED −90% seals that still
 * occupy belt space. Pass evidence identical to the classic renderers.
 */
export default function ConveyorScene(props: MechanicComponentProps) {
  if (props.lesson.mechanic === 'stateless-chat') return <StatelessConveyor {...props} />;
  if (props.lesson.mechanic === 'history-bill') return <BillConveyor {...props} />;
  throw new Error('ConveyorScene handles stateless-chat and history-bill only');
}

// ---------------------------------------------------------------------------
// shared belt furniture

function Envelope({ label, tokens, dim }: { label: string; tokens: number; dim?: boolean }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded border px-2 py-1.5 font-mono text-[10px] ${
        dim
          ? 'border-(--color-line) text-(--color-faint)'
          : 'border-(--color-line-bright) bg-(--color-raised) text-(--color-ink)'
      }`}
    >
      ✉ <span className="max-w-36 truncate">{label}</span>
      <span className={dim ? 'text-(--color-dim)' : 'text-(--color-ink)'}>{tokens}</span>
    </span>
  );
}

function ModelDoor({ label }: { label: string }) {
  return (
    <div className="flex h-16 w-20 shrink-0 flex-col items-center justify-center rounded border-2 border-(--color-line-bright) bg-(--color-bg)">
      <span aria-hidden="true" className="text-(--color-phosphor)">
        ▣
      </span>
      <span className="font-mono text-[9px] uppercase tracking-widest text-(--color-dim)">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L2.1 — stateless chat

type ShipPhase = 'idle' | 'collect' | 'wrap' | 'ship';

interface Bubble {
  role: 'user' | 'assistant';
  textKey: string;
  requestTokens?: number;
  blockCount?: number;
  amnesia?: boolean;
}

function StatelessConveyor({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'stateless-chat') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choice') throw new Error('wrong pass type');
  if (!lesson.initialState) throw new Error('missing initialState');
  const { turns, question } = lesson.params;
  const correctIndex = lesson.pass.correctIndex;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const [context, setContext] = useState<ContextState>(() =>
    buildContextState(lesson.initialState!),
  );
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [phase, setPhase] = useState<ShipPhase>('idle');
  const [shipTokens, setShipTokens] = useState(0);
  // turn 4: which envelope groups sit on the belt
  const [onBelt, setOnBelt] = useState<Set<string>>(new Set());
  const [amnesia, setAmnesia] = useState(false);
  const [finalSent, setFinalSent] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<{ correctIndex: number } | null>(null);
  const passedRef = useRef(false);
  const beatIdRef = useRef(0);
  const animation = useAnimationQueue();

  useEffect(() => {
    showInspector(buildContextState(lesson.initialState!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // belt theater is pure presentation over already-committed state
  useEffect(() => {
    const delivery = animation.lastDelivery;
    if (!delivery) return;
    if (delivery.instant) {
      setPhase('idle');
      return;
    }
    const kind = delivery.beat.kind;
    if (kind === 'collect' || kind === 'wrap' || kind === 'ship') setPhase(kind);
    if (kind === 'reply') setPhase('idle');
  }, [animation.lastDelivery]);

  const lastTurn = turnIndex === turns.length - 1;

  const shipTheater = (tokens: number) => {
    setShipTokens(tokens);
    animation.enqueue([
      { id: `collect-${++beatIdRef.current}`, kind: 'collect', durationMs: 300 },
      { id: `wrap-${++beatIdRef.current}`, kind: 'wrap', durationMs: 250 },
      { id: `ship-${++beatIdRef.current}`, kind: 'ship', durationMs: 400 },
      { id: `reply-${++beatIdRef.current}`, kind: 'reply', durationMs: 150 },
    ]);
  };

  /** Commits a full turn instantly (sim first); the belt replays it. */
  const commitTurn = (index: number) => {
    const turn = turns[index]!;
    const withUser = addBlock(context, {
      id: `u${index}`,
      role: 'user',
      kind: 'message',
      labelKey: turn.userKey,
      fixedTokens: turn.userTokens,
    });
    const requestTokens = usedTokens(withUser, count);
    const withReply = addBlock(withUser, {
      id: `a${index}`,
      role: 'assistant',
      kind: 'message',
      labelKey: turn.assistantKey,
      fixedTokens: turn.assistantTokens,
    });
    setContext(withReply);
    updateInspectorState(withReply);
    setBubbles((current) => [
      ...current,
      { role: 'user', textKey: turn.userKey, requestTokens, blockCount: withUser.blocks.length },
      { role: 'assistant', textKey: turn.assistantKey },
    ]);
    setTurnIndex(index + 1);
    signalSend();
    mascotEvent('send');
    shipTheater(requestTokens);
  };

  // turn-4 envelope groups: sys + one per completed turn + the new message
  const groups = useMemo(() => {
    if (!lastTurn) return [];
    const sys = buildContextState(lesson.initialState!).blocks.reduce(
      (sum, block) => sum + blockTokens(block, count),
      0,
    );
    const items = [
      { id: 'sys', label: t(lesson.initialState!.blocks[0]!.labelKey ?? 'l2_1_sys'), tokens: sys },
      ...turns.slice(0, turns.length - 1).map((turn, i) => ({
        id: `turn-${i + 1}`,
        label: t('game_conveyor_group_turn', { n: i + 1 }),
        tokens: turn.userTokens + turn.assistantTokens,
      })),
      {
        id: 'new',
        label: t('game_conveyor_envelope_new'),
        tokens: turns[turns.length - 1]!.userTokens,
      },
    ];
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastTurn, locale]);

  const onDragEnd = (event: DragEndEvent) => {
    const id = String(event.active.id);
    if (!event.over) return;
    setAmnesia(false);
    setOnBelt((current) => {
      const next = new Set(current);
      if (event.over!.id === 'belt') next.add(id);
      if (event.over!.id === 'hand') next.delete(id);
      return next;
    });
  };

  const sendFinal = () => {
    if (onBelt.size === 0 || finalSent) return;
    signalSend();
    mascotEvent('send');
    if (onBelt.size < groups.length) {
      // subset shipped → the model answers from an empty room
      setAmnesia(true);
      setBubbles((current) => [
        ...current,
        { role: 'assistant', textKey: 'l2_1_game_amnesia', amnesia: true },
      ]);
      mascotEvent('compaction'); // forgetful beat
      shipTheater(groups.filter((g) => onBelt.has(g.id)).reduce((s, g) => s + g.tokens, 0));
      return;
    }
    setAmnesia(false);
    mascotReport({ compacted: false });
    setFinalSent(true);
    commitTurn(turnIndex);
  };

  const retryFinal = () => {
    setOnBelt(new Set());
    setAmnesia(false);
    mascotReport({ compacted: false });
    setBubbles((current) => current.filter((bubble) => !bubble.amnesia));
  };

  const answer = (index: number) => {
    setSelected(index);
    setVerdict({ correctIndex });
    const result = evaluate(
      { type: 'choice', correctIndex },
      { type: 'choice', selectedIndex: index },
    );
    if (result.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  const status =
    phase !== 'idle'
      ? t('l2_1_envelope_label', { blocks: context.blocks.length })
      : lastTurn && !finalSent
        ? t('game_conveyor_hand_hint')
        : t('l2_1_watch_note');

  return (
    <SceneFrame locale={locale} animation={animation} status={status}>
      <DndScene locale={locale} onDragEnd={onDragEnd}>
        <div className="flex flex-col gap-4">
          {/* the belt */}
          <div className="ta-panel flex items-center gap-3 p-3">
            <DropZone
              id="belt"
              label={t('game_conveyor_belt')}
              disabled={!lastTurn || finalSent}
              className="relative flex min-h-16 flex-1 flex-wrap items-center gap-1.5 rounded border-2 border-dashed border-(--color-line-bright) bg-[repeating-linear-gradient(90deg,transparent_0_22px,rgb(217_231_222/0.05)_22px_24px)] p-2 transition-colors data-over:border-(--color-phosphor)"
            >
              <span className="absolute -top-2.5 left-2 bg-(--color-bg) px-1 font-mono text-[9px] uppercase tracking-widest text-(--color-dim)">
                {t('game_conveyor_belt')}
              </span>
              {/* scripted turns: the whole current context rides as envelopes */}
              {!lastTurn &&
                phase !== 'wrap' &&
                phase !== 'ship' &&
                context.blocks.map((block) => (
                  <m.span
                    key={block.id}
                    layout
                    initial={{ y: -8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                  >
                    <Envelope
                      label={block.labelKey ? t(block.labelKey) : block.id}
                      tokens={block.fixedTokens ?? 0}
                    />
                  </m.span>
                ))}
              {/* turn 4: only what the player put on the belt */}
              {lastTurn &&
                !finalSent &&
                groups
                  .filter((group) => onBelt.has(group.id))
                  .map((group) => (
                    <DraggableBlock
                      key={group.id}
                      id={group.id}
                      label={`${group.label} · ${nf.format(group.tokens)}`}
                      className="min-h-0"
                    >
                      <Envelope label={group.label} tokens={group.tokens} />
                    </DraggableBlock>
                  ))}
              {/* the shrink-wrapped parcel */}
              <AnimatePresence>
                {(phase === 'wrap' || phase === 'ship') && (
                  <m.div
                    key="parcel"
                    initial={{ scale: 1.15, opacity: 0.6 }}
                    animate={
                      phase === 'ship' ? { x: '70%', scale: 0.9, opacity: 1 } : { scale: 1, opacity: 1 }
                    }
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: 'easeIn' }}
                    className="flex items-center gap-2 rounded border-2 border-(--color-phosphor) bg-(--color-raised) px-3 py-2 font-mono text-xs text-(--color-phosphor)"
                  >
                    ▣ {t('game_conveyor_parcel', { tokens: nf.format(shipTokens) })}
                  </m.div>
                )}
              </AnimatePresence>
            </DropZone>
            <ModelDoor label={t('game_conveyor_model_door')} />
          </div>

          {/* turn 4 staging hand */}
          {lastTurn && !finalSent && (
            <DropZone
              id="hand"
              label={t('game_conveyor_hand')}
              className="flex min-h-16 flex-wrap items-center gap-1.5 rounded border border-(--color-line) p-2"
            >
              <span className="w-full font-mono text-[10px] uppercase tracking-widest text-(--color-faint)">
                {t('game_conveyor_hand')}
              </span>
              {groups
                .filter((group) => !onBelt.has(group.id))
                .map((group) => (
                  <DraggableBlock
                    key={group.id}
                    id={group.id}
                    label={`${group.label} · ${nf.format(group.tokens)}`}
                    className="min-h-0"
                  >
                    <Envelope label={group.label} tokens={group.tokens} />
                  </DraggableBlock>
                ))}
            </DropZone>
          )}

          {/* transcript */}
          <div className="ta-panel flex flex-col gap-2 p-4">
            {bubbles.map((bubble, i) => (
              <div
                key={i}
                className={`flex ${bubble.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded px-3 py-2 text-sm ${
                    bubble.amnesia
                      ? 'border border-(--color-alert) text-(--color-alert)'
                      : bubble.role === 'user'
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

            {!lastTurn && !finalSent && (
              <div className="mt-1 flex items-center gap-3">
                <PrimaryButton onClick={() => commitTurn(turnIndex)} disabled={phase !== 'idle'}>
                  {t('l2_1_send_cta', { n: turnIndex + 1, total: turns.length })}
                </PrimaryButton>
                <span className="font-mono text-xs text-(--color-faint)">{t('l2_1_watch_note')}</span>
              </div>
            )}
            {lastTurn && !finalSent && (
              <div className="mt-1 flex flex-col gap-2">
                {amnesia && (
                  <>
                    <p className="max-w-prose border-l-2 border-(--color-alert) pl-3 text-sm text-(--color-dim)">
                      {t('l2_1_game_amnesia_explain')}
                    </p>
                    <GhostButton onClick={retryFinal}>{t('ui_retry')}</GhostButton>
                  </>
                )}
                {!amnesia && (
                  <PrimaryButton onClick={sendFinal} disabled={onBelt.size === 0 || phase !== 'idle'}>
                    {t('l2_1_send_cta', { n: turnIndex + 1, total: turns.length })}
                  </PrimaryButton>
                )}
              </div>
            )}
            {finalSent && (
              <p className="mt-2 font-mono text-xs text-(--color-phosphor)">
                ✓ {t('l2_1_all_sent_note')}
              </p>
            )}
          </div>

          {/* reflection — the graded step, unchanged */}
          {finalSent && (
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
      </DndScene>
    </SceneFrame>
  );
}

// ---------------------------------------------------------------------------
// L2.2 — history bill: receipts on the belt

function BillConveyor({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'history-bill') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choice') throw new Error('wrong pass type');
  if (!lesson.initialState) throw new Error('missing initialState');
  const { turns, pricePerMTokIn, cachedReadFactor, question } = lesson.params;
  const correctIndex = lesson.pass.correctIndex;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const cf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  const [caching, setCaching] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<{ correctIndex: number } | null>(null);
  const passedRef = useRef(false);
  const animation = useAnimationQueue();

  const initialTokens = useMemo(
    () =>
      buildContextState(lesson.initialState!).blocks.reduce(
        (sum, block) => sum + blockTokens(block, count),
        0,
      ),
    [lesson.initialState],
  );
  const billTurns = turns.map((turn) => ({
    inputTokens: turn.inputTokens,
    outputTokens: turn.outputTokens,
  }));
  const bill = computeBill(initialTokens, billTurns, pricePerMTokIn, { caching, cachedReadFactor });
  const billOff = computeBill(initialTokens, billTurns, pricePerMTokIn, {
    caching: false,
    cachedReadFactor,
  });
  const maxTurnTokens = Math.max(...bill.turns.map((turn) => turn.prefixTokens + turn.freshTokens));

  const answer = (index: number) => {
    setSelected(index);
    setVerdict({ correctIndex });
    const result = evaluate(
      { type: 'choice', correctIndex },
      { type: 'choice', selectedIndex: index },
    );
    if (result.pass && !passedRef.current) {
      passedRef.current = true;
      onPass();
    }
  };

  return (
    <SceneFrame
      locale={locale}
      animation={animation}
      status={`${t('l2_2_total_line')}: ${cf.format(bill.totalCost)} cr`}
    >
      <div className="flex flex-col gap-4">
        <div className="ta-panel flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-widest text-(--color-dim)">
              {t('l2_2_bill_title')}
            </p>
            <label className="flex cursor-pointer items-center gap-2 font-mono text-xs text-(--color-ink)">
              <input
                type="checkbox"
                checked={caching}
                onChange={(e) => setCaching(e.target.checked)}
                className="accent-(--color-phosphor)"
              />
              {t('l2_2_caching_toggle')}
            </label>
          </div>

          {/* the belt: one parcel per turn — width IS tokens, seals only change price */}
          <div className="flex items-stretch gap-3">
            <ol className="flex flex-1 flex-col gap-2">
              {bill.turns.map((turn, i) => {
                const total = turn.prefixTokens + turn.freshTokens;
                const width = (total / maxTurnTokens) * 100;
                const prefixShare = (turn.prefixTokens / total) * 100;
                return (
                  <li key={i} className="flex items-center gap-3">
                    <span className="w-8 shrink-0 font-mono text-[10px] text-(--color-faint)">
                      #{i + 1}
                    </span>
                    <m.span
                      layout
                      className="relative h-8 overflow-hidden rounded-sm border border-(--color-line-bright) bg-(--color-raised)"
                      style={{ width: `${Math.max(width, 8)}%` }}
                      title={t(turns[i]!.labelKey)}
                    >
                      <span className="flex h-full">
                        <span
                          className={`h-full ${caching ? 'ta-hatch bg-(--color-faint)/25' : 'bg-(--color-amber)/60'}`}
                          style={{ width: `${prefixShare}%` }}
                        />
                        <span className="h-full flex-1 bg-(--color-phosphor)/70" />
                      </span>
                      {caching && turn.prefixTokens > 0 && (
                        <m.span
                          initial={{ scale: 1.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="absolute left-1 top-1/2 -translate-y-1/2 rotate-[-6deg] rounded border border-(--color-ice) px-1 font-mono text-[8px] font-bold text-(--color-ice)"
                        >
                          {t('game_conveyor_cached_seal')}
                        </m.span>
                      )}
                    </m.span>
                    {/* the receipt */}
                    <span className="ml-auto shrink-0 text-right font-mono text-[11px] leading-tight text-(--color-dim)">
                      {nf.format(total)} tok
                      <br />
                      <span className={caching ? 'text-(--color-phosphor)' : 'text-(--color-amber)'}>
                        {cf.format(turn.cost)} cr
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
            <ModelDoor label={t('game_conveyor_model_door')} />
          </div>

          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-(--color-line) pt-3 font-mono text-sm">
            <span>
              {t('l2_2_total_line')}:{' '}
              <strong
                className={caching ? 'text-(--color-phosphor) text-glow' : 'text-(--color-amber)'}
              >
                {cf.format(bill.totalCost)} cr
              </strong>
            </span>
            {caching && (
              <span className="text-xs text-(--color-dim)">
                {t('l2_2_saved_line', { amount: cf.format(billOff.totalCost - bill.totalCost) })}
              </span>
            )}
            <span className="ml-auto text-xs text-(--color-faint)">
              {t('l2_2_window_line', { tokens: nf.format(bill.finalContextTokens) })}
            </span>
          </div>

          <p className="max-w-prose border-l-2 border-(--color-ice) pl-3 text-xs text-(--color-dim)">
            {t('game_conveyor_space_note')}
          </p>
        </div>

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
              {t('l2_2_wrong_explain')}
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
    </SceneFrame>
  );
}
