import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  blockTokens,
  fillInfo,
  promptTooLong,
  segmentTotals,
  type ContextBlock,
  type CountFn,
} from '@/engine/contextModel';
import { MODEL_PROFILES, getModelProfile } from '@/engine/modelProfiles';
import { inspectorStore, setInspectorModel } from '@/stores/inspector';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';
import { ROLE_COLOR, ROLE_TAG } from '@/components/mechanics/shared';

/** Lesson blocks always carry authored counts; this fallback only guards
    future free-text blocks (≈4 chars/token, the OpenAI rule of thumb). */
const fallbackCount: CountFn = (text) => Math.ceil(text.length / 4);

const KIND_GLYPH: Record<ContextBlock['kind'], string | null> = {
  message: null,
  'config-file': '⚙',
  attachment: '🗎',
  'tool-def': '⌁',
  'tool-result': '⌁',
};

const SEGMENTS = [
  { key: 'system', labelKey: 'inspector_segment_system', color: 'var(--color-role-system)' },
  { key: 'config', labelKey: 'inspector_segment_config', color: 'var(--color-ice)' },
  { key: 'files', labelKey: 'inspector_segment_files', color: 'var(--color-role-file)' },
  { key: 'tools', labelKey: 'inspector_segment_tools', color: 'var(--color-role-tool)' },
  { key: 'history', labelKey: 'inspector_segment_history', color: 'var(--color-phosphor)' },
  { key: 'reservedOutput', labelKey: 'inspector_segment_reserved', color: 'var(--color-role-reserved)' },
] as const;

interface Props {
  locale: Locale;
}

export default function ContextInspector({ locale }: Props) {
  const view = useStore(inspectorStore);
  const [expanded, setExpanded] = useState(true);
  const [pulsing, setPulsing] = useState(false);
  const lastSend = useRef(0);
  const listRef = useRef<HTMLOListElement>(null);

  // Collapse to a drawer handle on small screens, stay open on desktop.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)');
    setExpanded(wide.matches);
    const onChange = (e: MediaQueryListEvent) => setExpanded(e.matches);
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, []);

  // "The whole array ships" pulse whenever a mechanic signals a send.
  useEffect(() => {
    if (!view || view.sendSignal === lastSend.current) return;
    lastSend.current = view.sendSignal;
    setPulsing(true);
    const timer = setTimeout(() => setPulsing(false), 450);
    return () => clearTimeout(timer);
  }, [view]);

  useEffect(() => {
    if (!view?.highlightBlockId || !listRef.current) return;
    listRef.current
      .querySelector(`[data-block-id="${view.highlightBlockId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [view?.highlightBlockId]);

  if (!view) return null;

  const { state } = view;
  const info = fillInfo(state, fallbackCount);
  const segments = segmentTotals(state, fallbackCount);
  const tooLong = promptTooLong(state, fallbackCount);
  const nf = new Intl.NumberFormat(locale);
  const t = (key: string) => lessonText(key, locale);

  const statusColor =
    info.status === 'over'
      ? 'var(--color-alert)'
      : info.status === 'warn'
        ? 'var(--color-amber)'
        : 'var(--color-phosphor)';

  return (
    <section
      aria-label={t('inspector_title')}
      className={`ta-panel flex max-h-full flex-col overflow-hidden font-mono text-sm ${
        tooLong ? 'motion-safe:animate-[ta-alarm_1.2s_ease-in-out_infinite] border border-(--color-alert)' : ''
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 border-b border-(--color-line) px-4 py-3 text-left lg:cursor-default"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }}
        />
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-(--color-dim)">
          {t('inspector_title')}
        </span>
        <span className="ml-auto text-xs text-(--color-faint)">
          {nf.format(info.used + info.reserved)} / {nf.format(info.window)}
        </span>
        <span aria-hidden="true" className="text-(--color-faint) lg:hidden">
          {expanded ? '▾' : '▴'}
        </span>
      </button>

      {expanded && (
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
          {/* model row */}
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="ta-model" className="text-xs uppercase tracking-widest text-(--color-faint)">
              {t('inspector_model_label')}
            </label>
            {view.allowModelChange ? (
              <select
                id="ta-model"
                className="rounded border border-(--color-line-bright) bg-(--color-raised) px-2 py-1 text-xs text-(--color-ink)"
                value={state.model.id}
                onChange={(e) => setInspectorModel(getModelProfile(e.target.value))}
              >
                {MODEL_PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {t(p.labelKey)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-(--color-dim)">{t(state.model.labelKey)}</span>
            )}
          </div>

          {state.model.countIsEstimate && (
            <p
              className="rounded border border-(--color-line) bg-(--color-raised) px-2 py-1 text-[11px] text-(--color-amber)"
              title={t('tokens_estimate_note')}
            >
              ≈ {t('tokens_estimate_badge')} — {t('tokens_estimate_note')}
            </p>
          )}

          {/* fill gauge */}
          <div>
            <div
              role="meter"
              aria-label={t('inspector_gauge_label')}
              aria-valuemin={0}
              aria-valuemax={info.window}
              aria-valuenow={Math.min(info.used + info.reserved, info.window)}
              className="relative h-5 overflow-hidden rounded border border-(--color-line-bright) bg-(--color-bg)"
            >
              <div className="absolute inset-0 flex">
                {SEGMENTS.map(({ key, color }) => {
                  const tokens = segments[key];
                  if (!tokens) return null;
                  const width = Math.min((tokens / info.window) * 100, 100);
                  return (
                    <div
                      key={key}
                      className={`h-full transition-[width] duration-500 ${key === 'reservedOutput' ? 'ta-hatch' : ''}`}
                      style={{ width: `${width}%`, background: color, opacity: 0.85 }}
                    />
                  );
                })}
              </div>
              {/* 10% tick marks */}
              {Array.from({ length: 9 }, (_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="absolute top-0 h-full w-px bg-(--color-bg)/70"
                  style={{ left: `${(i + 1) * 10}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex items-baseline justify-between text-[11px]">
              <span style={{ color: statusColor }}>
                {tooLong
                  ? '400 prompt_too_long'
                  : info.status === 'warn'
                    ? t('inspector_status_warn')
                    : `${Math.round(info.ratio * 100)}%`}
              </span>
              {info.reserved > 0 && (
                <span className="text-(--color-faint)">
                  {t('inspector_reserved_label')}: {nf.format(info.reserved)}
                </span>
              )}
            </div>
          </div>

          {/* legend */}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-(--color-dim)">
            {SEGMENTS.map(({ key, labelKey, color }) => {
              const tokens = segments[key];
              if (!tokens) return null;
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={`inline-block size-2 rounded-[2px] ${key === 'reservedOutput' ? 'ta-hatch' : ''}`}
                    style={{ background: color }}
                  />
                  <dt className="flex-1 truncate">{t(labelKey)}</dt>
                  <dd>{nf.format(tokens)}</dd>
                </div>
              );
            })}
          </dl>

          {/* the message array — what actually ships */}
          <ol
            ref={listRef}
            className={`flex flex-col gap-1.5 transition-transform ${
              pulsing ? 'motion-safe:scale-x-95 motion-safe:opacity-60' : ''
            }`}
          >
            {state.blocks.map((block, i) => {
              const highlighted = view.highlightBlockId === block.id;
              const glyph = KIND_GLYPH[block.kind];
              return (
                <li
                  key={block.id}
                  data-block-id={block.id}
                  className={`motion-safe:animate-[ta-pop-in_0.25s_ease-out] rounded-r border-l-2 bg-(--color-raised) px-2.5 py-1.5 ${
                    highlighted ? 'ring-2 ring-(--color-phosphor)' : ''
                  }`}
                  style={{ borderLeftColor: ROLE_COLOR[block.role] }}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] text-(--color-faint)">{i}</span>
                    <span
                      className="text-[10px] font-semibold tracking-widest"
                      style={{ color: ROLE_COLOR[block.role] }}
                    >
                      {ROLE_TAG[block.role]}
                      {glyph ? ` ${glyph}` : ''}
                    </span>
                    <span className="ml-auto text-xs text-(--color-dim)">
                      {nf.format(blockTokens(block, fallbackCount))}
                    </span>
                  </div>
                  {block.labelKey && (
                    <p className="mt-0.5 truncate text-xs text-(--color-ink)">{t(block.labelKey)}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
