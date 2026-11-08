import { useEffect, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { nearest, type MeaningMapFile } from '@/engine/embedMap';
import { lessonText } from '@/lib/lessonText';
import RoundsQuiz from './RoundsQuiz';

type T = (key: string, params?: Record<string, string | number>) => string;

const CONCEPT_COLORS = [
  'var(--color-role-system)',
  'var(--color-role-developer)',
  'var(--color-role-user)',
  'var(--color-role-assistant)',
  'var(--color-role-tool)',
  'var(--color-role-file)',
  'var(--color-alert)',
  'var(--color-dim)',
];

const W = 1000;
const H = 620;
const PAD = 48;
const NEIGHBOURS = 3;
const FONT = 20;
const LINE = 24;

/** Rough rendered width of a label: CJK glyphs are about twice as wide as Latin ones. */
const labelWidth = (text: string) =>
  [...text].reduce((sum, ch) => sum + (/[\u3000-\u9fff]/.test(ch) ? FONT : FONT * 0.6), 0);

/**
 * Translations sit almost on top of each other, so their labels would collide.
 * Dots stay at their true positions; only labels move: each one takes the
 * nearest free vertical slot beside its dot (greedy, deterministic).
 */
function placeLabels(points: { x: number; y: number }[], texts: string[]): { x: number; y: number }[] {
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const overlaps = (b: (typeof boxes)[number]) =>
    boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
  const order = points.map((_, i) => i).sort((a, b) => points[a]!.y - points[b]!.y || points[a]!.x - points[b]!.x);
  const placed: { x: number; y: number }[] = points.map((p) => ({ x: p.x + 12, y: p.y + 6 }));
  for (const i of order) {
    const { x, y } = points[i]!;
    const width = labelWidth(texts[i]!);
    const left = x + 12 + width > W - 4;
    const lx = left ? x - 12 - width : x + 12;
    for (const step of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
      const ly = y + 6 + step * LINE;
      const box = { x0: lx, y0: ly - FONT + 2, x1: lx + width, y1: ly + 4 };
      if (box.y0 < 0 || box.y1 > H || overlaps(box)) continue;
      boxes.push(box);
      placed[i] = { x: lx, y: ly };
      break;
    }
  }
  return placed;
}

function MapView({ file, initial, locked, t }: { file: MeaningMapFile; initial: number | null; locked: boolean; t: T }) {
  const [selected, setSelected] = useState<number | null>(initial);
  const concepts = [...new Set(file.words.map((w) => w.concept))];
  const colorOf = (concept: string) => CONCEPT_COLORS[concepts.indexOf(concept) % CONCEPT_COLORS.length]!;
  const point = (i: number) => {
    const [x, y] = file.xy[i]!;
    return { x: PAD + x * (W - 2 * PAD), y: PAD + (1 - y) * (H - 2 * PAD) };
  };
  const showLinks = selected !== null && !locked;
  const links = showLinks ? nearest(file.sim, selected, NEIGHBOURS) : [];
  const points = file.words.map((_, i) => point(i));
  const labels = placeLabels(
    points,
    file.words.map((w) => w.text),
  );

  return (
    <div className="ta-panel flex flex-col gap-3 p-3">
      {/* Narrow screens scroll the map sideways inside its panel instead of shrinking the labels away. */}
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[640px]" role="group" aria-label={t('meaning_map_aria')}>
        {links.map((j) => {
          const a = point(selected!);
          const b = point(j);
          return (
            <line key={`l-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-ink)" strokeOpacity={0.55} strokeWidth={2} />
          );
        })}
        {file.words.map((word, i) => {
          const { x, y } = points[i]!;
          const label = labels[i]!;
          const moved = Math.abs(label.y - (y + 6)) > 1 || label.x < x;
          const isSelected = i === selected;
          const isNeighbour = links.includes(i);
          return (
            <g
              key={word.text}
              role="button"
              tabIndex={locked ? -1 : 0}
              aria-label={word.text}
              aria-pressed={isSelected}
              className={locked ? 'cursor-default' : 'cursor-pointer'}
              onClick={() => !locked && setSelected(i)}
              onKeyDown={(e) => {
                if (!locked && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  setSelected(i);
                }
              }}
            >
              {moved && (
                <line
                  x1={x}
                  y1={y}
                  x2={label.x < x ? label.x + labelWidth(word.text) : label.x - 2}
                  y2={label.y - FONT / 3}
                  stroke={colorOf(word.concept)}
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
              )}
              <circle cx={x} cy={y} r={isSelected ? 9 : 6} fill={colorOf(word.concept)} stroke={isSelected ? 'var(--color-ink)' : 'none'} strokeWidth={2} />
              <text
                x={label.x}
                y={label.y}
                fontSize={FONT}
                fontWeight={isSelected ? 700 : 400}
                fill={isSelected || isNeighbour ? 'var(--color-ink)' : colorOf(word.concept)}
                fillOpacity={isSelected || isNeighbour ? 1 : 0.85}
                stroke="var(--color-bg)"
                strokeWidth={4}
                paintOrder="stroke"
              >
                {word.text}
              </text>
            </g>
          );
        })}
      </svg>
      </div>
      <div aria-live="polite" className="min-h-6 font-mono text-xs text-(--color-dim)">
        {locked ? (
          <p>{t('replay_hidden')}</p>
        ) : selected === null ? (
          <p>{t('meaning_pick')}</p>
        ) : (
          <p>
            {t('meaning_nearest', { word: file.words[selected]!.text })}{' '}
            {links.map((j, k) => (
              <span key={j} className="text-(--color-ink)">
                {k > 0 && ' · '}
                {file.words[j]!.text} {file.sim[selected]![j]!.toFixed(2)}
              </span>
            ))}
          </p>
        )}
      </div>
      <p className="font-mono text-[11px] text-(--color-faint)">{t('meaning_flat_note', { dims: file.dims })}</p>
    </div>
  );
}

/**
 * Words placed by a real embedding model. Positions are a 2-D squeeze of
 * 768-d vectors (PCA); the lines always show the true full-dimension
 * neighbours, which is why some of them reach across the map.
 */
export default function MeaningMap({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'meaning-map') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const { introKey, recordingPath, rounds, model } = lesson.params;
  const pass = lesson.pass;
  const t: T = (key, params) => lessonText(key, locale, params);

  const [file, setFile] = useState<MeaningMapFile | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    void fetch(`${base}/${recordingPath}`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((data: MeaningMapFile) => setFile(data))
      .catch(() => setLoadError(true));
  }, [recordingPath]);

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-prose text-sm text-(--color-dim)">{t(introKey)}</p>
      {loadError && <p className="font-mono text-xs text-(--color-alert)">{t('replay_load_error')}</p>}
      {!file && !loadError && <p className="font-mono text-xs text-(--color-faint)">{t('replay_loading')}</p>}
      {file && (
        <>
          <RoundsQuiz
            rounds={rounds}
            correctIndexes={pass.correctIndexes}
            minCorrect={pass.minCorrect}
            locale={locale}
            onPass={onPass}
            renderRound={(i, answered) => {
              const round = rounds[i]!;
              const target = round.target ? file.words.findIndex((w) => w.text === round.target) : -1;
              // "Which word is nearest?" rounds keep the answer lines hidden until predicted.
              const locked = round.target !== undefined && round.options !== undefined && !answered;
              return <MapView key={`${i}-${answered}`} file={file} initial={target >= 0 ? target : null} locked={locked} t={t} />;
            }}
          />
          <p className="font-mono text-xs text-(--color-faint)">
            {t('replay_recorded_note', { models: model.split('/').pop() ?? model, date: file.recordedAt.slice(0, 10) })}
          </p>
        </>
      )}
    </div>
  );
}
