import { useEffect, useMemo, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { usedTokens, type ContextState } from '@/engine/contextModel';
import { lessonText } from '@/lib/lessonText';
import { showInspector, updateInspectorState } from '@/stores/inspector';
import RoundsQuiz from './RoundsQuiz';
import { buildContextState } from './shared';

const count = () => 0; // lesson blocks always carry authored fixedTokens

/**
 * Config files are not settings — they are prompt text. Toggle one on and it
 * materializes as a block in the Context Inspector, eating window space.
 */
export default function ConfigInject({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'config-inject') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  if (!lesson.initialState) throw new Error('missing initialState');
  const { tabs, rounds } = lesson.params;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  const nf = new Intl.NumberFormat(locale);

  const [activeTab, setActiveTab] = useState(0);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());

  const context: ContextState = useMemo(() => {
    const initial = buildContextState(lesson.initialState!);
    // Config blocks land at the FRONT of the payload — before the history.
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

  const toggle = () => {
    setLoaded((current) => {
      const next = new Set(current);
      if (next.has(tab.id)) next.delete(tab.id);
      else next.add(tab.id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="ta-panel ta-notched p-4">
        {/* file tabs */}
        <div role="tablist" aria-label={t('config_tabs_aria')} className="flex flex-wrap gap-1 border-b border-(--color-line) pb-2">
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
              {loaded.has(candidate.id) && <span className="ml-1.5 text-(--color-phosphor)">●</span>}
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
            <input type="checkbox" checked={isLoaded} onChange={toggle} className="accent-(--color-phosphor)" />
            <span className="font-mono text-xs text-(--color-ink)">
              {t('config_load_toggle', { file: tab.fileName })}
            </span>
            <span className="font-mono text-xs text-(--color-amber)">
              +{nf.format(tab.block.fixedTokens ?? 0)}
            </span>
          </label>

          <p aria-live="polite" className="font-mono text-xs text-(--color-faint)">
            {isLoaded ? t('config_loaded_note', { file: tab.fileName }) : t('config_unloaded_note')}
            {' · '}
            {t('config_total_line', { tokens: nf.format(usedTokens(context, count)) })}
          </p>
        </div>
      </div>

      {/* scenario predictions */}
      <RoundsQuiz
        rounds={rounds}
        correctIndexes={lesson.pass.correctIndexes}
        minCorrect={lesson.pass.minCorrect}
        locale={locale}
        onPass={onPass}
      />
    </div>
  );
}
