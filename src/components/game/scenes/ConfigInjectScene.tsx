import { useEffect, useMemo, useRef, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { usedTokens, type ContextState } from '@/engine/contextModel';
import { lessonText } from '@/lib/lessonText';
import { showInspector, updateInspectorState } from '@/stores/inspector';
import RoundsQuiz from '@/components/mechanics/RoundsQuiz';
import { buildContextState, ROLE_COLOR, ROLE_TAG } from '@/components/mechanics/shared';
import SceneFrame from '../SceneFrame';
import { useAnimationQueue } from '../useAnimationQueue';
import { m, AnimatePresence } from '../motion';
import { blockColor } from '../parts/segments';

const count = () => 0; // lesson blocks always carry authored fixedTokens

/** ~32 KiB in o200k tokens — the Codex AGENTS.md hard cap, made visible. */
const CODEX_CAP_TOKENS = 8000;

/**
 * G3.5 — config-file fly-in. Toggling a tab physically flies the file card
 * into the window stack (config files are prompt text, not settings); the
 * AGENTS.md tab shows the Codex 32 KiB guillotine line, driven by the
 * authored fixedTokens. Rounds stay the classic reflection quiz.
 */
export default function ConfigInjectScene({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'config-inject') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  if (!lesson.initialState) throw new Error('missing initialState');
  const { tabs, rounds } = lesson.params;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const [activeTab, setActiveTab] = useState(0);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const animation = useAnimationQueue();
  const beatIdRef = useRef(0);

  const context: ContextState = useMemo(() => {
    const initial = buildContextState(lesson.initialState!);
    const configBlocks = tabs.filter((tab) => loaded.has(tab.id)).map((tab) => tab.block);
    return { ...initial, blocks: [...configBlocks, ...initial.blocks] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    showInspector(buildContextState(lesson.initialState!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    updateInspectorState(context);
  }, [context]);

  const tab = tabs[activeTab]!;
  const isLoaded = loaded.has(tab.id);
  const isAgents = tab.id === 'agents';

  const toggle = () => {
    setLoaded((current) => {
      const next = new Set(current);
      if (next.has(tab.id)) next.delete(tab.id);
      else {
        next.add(tab.id);
        animation.enqueue({ id: `fly-${++beatIdRef.current}`, kind: 'file-fly', durationMs: 400 });
      }
      return next;
    });
  };

  return (
    <SceneFrame
      locale={locale}
      animation={animation}
      status={t('config_total_line', { tokens: nf.format(usedTokens(context, count)) })}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start gap-4">
          {/* file browser */}
          <div className="ta-panel ta-notched min-w-64 flex-[2] p-4">
            <div
              role="tablist"
              aria-label={t('config_tabs_aria')}
              className="flex flex-wrap gap-1 border-b border-(--color-line) pb-2"
            >
              {tabs.map((candidate, i) => (
                <button
                  key={candidate.id}
                  type="button"
                  role="tab"
                  aria-selected={i === activeTab}
                  onClick={() => setActiveTab(i)}
                  className={`rounded-t px-3 py-1.5 font-mono text-xs transition-colors ${
                    i === activeTab
                      ? 'bg-(--color-raised) text-(--color-ink)'
                      : 'text-(--color-dim) hover:text-(--color-ink)'
                  }`}
                >
                  {candidate.fileName}
                  {loaded.has(candidate.id) && (
                    <span className="ml-1.5 text-(--color-phosphor)">●</span>
                  )}
                </button>
              ))}
            </div>

            <div role="tabpanel" className="flex flex-col gap-3 pt-3">
              <ul className="flex list-none flex-col gap-2">
                {tab.factKeys.map((factKey) => (
                  <li key={factKey} className="flex gap-2 text-sm text-(--color-dim)">
                    <span aria-hidden="true" className="text-(--color-ice)">▸</span>
                    <span className="max-w-prose">{t(factKey)}</span>
                  </li>
                ))}
              </ul>

              <label className="flex cursor-pointer items-center gap-3 self-start rounded border border-(--color-line-bright) px-3 py-2">
                <input
                  type="checkbox"
                  checked={isLoaded}
                  onChange={toggle}
                  className="accent-(--color-phosphor)"
                />
                <span className="font-mono text-xs text-(--color-ink)">
                  {t('config_load_toggle', { file: tab.fileName })}
                </span>
                <span className="font-mono text-xs text-(--color-amber)">
                  +{nf.format(tab.block.fixedTokens ?? 0)}
                </span>
              </label>

              {isAgents && (
                <p className="max-w-prose border-l-2 border-(--color-amber) pl-3 text-xs text-(--color-dim)">
                  ✂ {t('game_config_guillotine')}{' '}
                  {(tab.block.fixedTokens ?? 0) <= CODEX_CAP_TOKENS &&
                    t('game_config_fits', {
                      file: tab.fileName,
                      tokens: nf.format(tab.block.fixedTokens ?? 0),
                    })}
                </p>
              )}

              <p aria-live="polite" className="font-mono text-xs text-(--color-faint)">
                {isLoaded
                  ? t('config_loaded_note', { file: tab.fileName })
                  : t('config_unloaded_note')}
              </p>
            </div>
          </div>

          {/* the window stack the files fly into */}
          <div className="ta-panel flex min-w-52 flex-1 flex-col gap-1 p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-(--color-faint)">
              {t('game_line_window')}
            </p>
            <div className="flex flex-col gap-1">
              <AnimatePresence>
                {context.blocks.map((block) => {
                  const isConfig = block.kind === 'config-file';
                  const overCap =
                    isConfig && block.id.includes('agents')
                      ? (block.fixedTokens ?? 0) > CODEX_CAP_TOKENS
                      : false;
                  return (
                    <m.div
                      key={block.id}
                      layout
                      initial={
                        isConfig ? { x: -90, y: -30, scale: 1.15, opacity: 0, rotate: -4 } : false
                      }
                      animate={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }}
                      exit={{ x: -60, opacity: 0, transition: { duration: 0.18 } }}
                      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                      className="relative flex items-center gap-2 rounded-sm px-2 py-1.5 font-mono text-[10px]"
                      style={{
                        background: `color-mix(in oklab, ${blockColor(block)} 22%, var(--color-raised))`,
                        borderLeft: `3px solid ${blockColor(block)}`,
                      }}
                    >
                      <span style={{ color: ROLE_COLOR[block.role] }}>{ROLE_TAG[block.role]}</span>
                      <span className="truncate text-(--color-ink)">
                        {block.labelKey ? t(block.labelKey) : block.id}
                      </span>
                      <span className="ml-auto text-(--color-dim)">{block.fixedTokens}</span>
                      {overCap && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 right-10 border-r-2 border-dashed border-(--color-alert)"
                          title={t('game_config_guillotine')}
                        />
                      )}
                    </m.div>
                  );
                })}
              </AnimatePresence>
            </div>
            <p className="mt-1 font-mono text-[10px] text-(--color-dim)">
              {t('config_total_line', { tokens: nf.format(usedTokens(context, count)) })}
            </p>
          </div>
        </div>

        {/* scenario predictions — the graded step, unchanged */}
        <RoundsQuiz
          rounds={rounds}
          correctIndexes={lesson.pass.correctIndexes}
          minCorrect={lesson.pass.minCorrect}
          locale={locale}
          onPass={onPass}
        />
      </div>
    </SceneFrame>
  );
}
