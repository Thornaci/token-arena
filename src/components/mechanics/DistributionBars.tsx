import type { Distribution } from '@/engine/indecision';

/** Makes leading spaces and newlines in a token visible. */
export const visibleToken = (token: string) => token.replace(/ /g, '␣').replace(/\n/g, '↵');

interface Props {
  distribution: Distribution;
  label: string;
  aria: string;
  /** Hide the quoted prompt line (when the caller already shows the text). */
  hidePrompt?: boolean;
  /** Extra rows for watched tokens that may sit outside the top-k. */
  watch?: Record<string, number>;
  /** Overrides how a token is displayed (e.g. an end-of-reply marker). */
  formatToken?: (token: string) => string;
}

function Row({ token, probability, top, dashed }: { token: string; probability: number; top: boolean; dashed?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className="w-20 shrink-0 truncate text-right font-mono text-xs text-(--color-ink)">{token}</span>
      <span
        className={`h-4 flex-1 overflow-hidden rounded-sm bg-(--color-surface) ${dashed ? 'outline outline-1 outline-dashed outline-(--color-line-bright)' : ''}`}
      >
        <span
          className="block h-full motion-safe:transition-[width] motion-safe:duration-300"
          style={{
            width: `${Math.max(0.5, probability * 100)}%`,
            background: top ? 'var(--color-phosphor)' : 'var(--color-ice)',
          }}
        />
      </span>
      <span className="w-12 shrink-0 font-mono text-[10px] text-(--color-dim)">{(probability * 100).toFixed(1)}%</span>
    </li>
  );
}

/** One prompt's top-k next-token probabilities — live, recorded or replayed. */
export default function DistributionBars({ distribution, label, aria, hidePrompt = false, watch, formatToken = visibleToken }: Props) {
  const shown = new Set(distribution.candidates.map((c) => c.token));
  const extra = Object.entries(watch ?? {}).filter(([token]) => !shown.has(token));
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="font-mono text-xs uppercase tracking-widest text-(--color-faint)">{label}</p>
      {!hidePrompt && (
        <p className="font-mono text-sm text-(--color-dim)">
          “<span className="text-(--color-ink)">{distribution.prompt}</span>”
          <span aria-hidden="true" className="text-(--color-phosphor)">▌</span>
        </p>
      )}
      <ol className="flex flex-col gap-1.5" aria-label={aria}>
        {distribution.candidates.map((candidate, i) => (
          <Row
            key={`${candidate.token}-${i}`}
            token={formatToken(candidate.token)}
            probability={candidate.probability}
            top={i === 0}
          />
        ))}
        {extra.map(([token, probability]) => (
          <Row key={`watch-${token}`} token={formatToken(token)} probability={probability} top={false} dashed />
        ))}
      </ol>
    </div>
  );
}
