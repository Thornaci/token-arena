import { useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import type { Lesson } from '@/content/schema';
import { HIGH_RES_LIMITS, PATCH_PX, imageCost } from '@/engine/imageTokens';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';
import RoundsQuiz from './RoundsQuiz';

type Preset = Extract<Lesson, { mechanic: 'image-tokens' }>['params']['presets'][number];
type T = (key: string, params?: Record<string, string | number>) => string;

const BOX = 520;

function ImageView({ presets, initial, hidden, locale, t }: { presets: readonly Preset[]; initial: string; hidden: boolean; locale: Locale; t: T }) {
  const [presetId, setPresetId] = useState(initial);
  const preset = presets.find((p) => p.id === presetId) ?? presets[0]!;
  const cost = imageCost(preset.width, preset.height, HIGH_RES_LIMITS);
  const n = (value: number) => value.toLocaleString(locale);
  // Draw the size the model sees, scaled to fit the box; one grid cell = one 28×28 patch.
  const scale = BOX / Math.max(cost.width, cost.height);
  const cell = PATCH_PX * scale;

  return (
    <div className="ta-panel flex flex-col gap-4 p-4">
      <div role="radiogroup" aria-label={t('image_pick')} className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <label
            key={p.id}
            className={`cursor-pointer rounded border px-3 py-1.5 font-mono text-xs transition-colors ${
              p.id === preset.id
                ? 'border-(--color-ice) text-(--color-ice)'
                : 'border-(--color-line) text-(--color-dim) hover:border-(--color-line-bright)'
            }`}
          >
            <input type="radio" name="image-preset" className="sr-only" checked={p.id === preset.id} onChange={() => setPresetId(p.id)} />
            {t(p.labelKey)}
          </label>
        ))}
      </div>
      <div className="flex justify-center">
        <div
          aria-hidden="true"
          className="rounded-sm border border-(--color-line-bright)"
          style={{
            width: `min(100%, ${Math.round(cost.cols * cell)}px)`,
            aspectRatio: `${cost.cols} / ${cost.rows}`,
            backgroundColor: 'var(--color-chip-2)',
            backgroundImage:
              cell >= 3
                ? `linear-gradient(to right, color-mix(in oklab, var(--color-ice) 45%, transparent) 1px, transparent 1px),
                   linear-gradient(to bottom, color-mix(in oklab, var(--color-ice) 45%, transparent) 1px, transparent 1px)`
                : undefined,
            backgroundSize: `${100 / cost.cols}% ${100 / cost.rows}%`,
          }}
        />
      </div>
      <div aria-live="polite" className="flex flex-col gap-1 font-mono text-xs text-(--color-dim)">
        <p>{t('image_original', { w: preset.width, h: preset.height })}</p>
        {hidden ? (
          <p className="text-(--color-faint)">{t('replay_hidden')}</p>
        ) : (
          <>
            <p>
              {cost.resized
                ? t('image_resized', { w: cost.width, h: cost.height })
                : t('image_not_resized')}
            </p>
            <p className="text-sm text-(--color-ink)">
              {t('image_grid', { cols: cost.cols, rows: cost.rows, tokens: n(cost.tokens) })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Images are tokens too: the 28×28-pixel patch grid behind a vision model's bill. */
export default function ImageTokens({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'image-tokens') throw new Error('wrong lesson');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const { introKey, presets, rounds } = lesson.params;
  const pass = lesson.pass;
  const t: T = (key, params) => lessonText(key, locale, params);

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-prose text-sm text-(--color-dim)">{t(introKey)}</p>
      <RoundsQuiz
        rounds={rounds}
        correctIndexes={pass.correctIndexes}
        minCorrect={pass.minCorrect}
        locale={locale}
        onPass={onPass}
        renderRound={(i, answered) => {
          const round = rounds[i]!;
          return (
            <ImageView
              key={`${i}-${answered}`}
              presets={presets}
              initial={round.preset ?? presets[0]!.id}
              hidden={round.preset !== undefined && round.options !== undefined && !answered}
              locale={locale}
              t={t}
            />
          );
        }}
      />
      <p className="max-w-prose font-mono text-xs text-(--color-faint)">
        {t('image_limits_note', { edge: HIGH_RES_LIMITS.maxEdge.toLocaleString(locale), tokens: HIGH_RES_LIMITS.maxTokens.toLocaleString(locale) })}
      </p>
    </div>
  );
}
