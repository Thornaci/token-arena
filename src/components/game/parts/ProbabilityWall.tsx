import { m, AnimatePresence } from '../motion';

/**
 * The next-token distribution as a wall of candidate columns — height IS
 * probability. Consumes both L6.1's WeightedCandidate[] (inNucleus) and
 * L6.2's honest top-k Distribution.candidates (no inNucleus = all in).
 */
export interface WallCandidate {
  token: string;
  probability: number;
  inNucleus?: boolean;
}

const visible = (token: string) => token.replace(/ /g, '␣').replace(/\n/g, '↵');

interface Props {
  candidates: readonly WallCandidate[];
  ariaLabel: string;
  /** Column the marble most recently landed in. */
  marbleToken?: string | null;
  /** Bump when a new marble drops so the fall re-animates. */
  marbleId?: number;
  /** Per-token tally of previous drops (scatter made visible). */
  tally?: Record<string, number>;
  heightPx?: number;
}

export default function ProbabilityWall({
  candidates,
  ariaLabel,
  marbleToken,
  marbleId,
  tally,
  heightPx = 140,
}: Props) {
  const max = Math.max(...candidates.map((c) => c.probability), 0.0001);

  return (
    <div role="group" aria-label={ariaLabel} className="flex items-end gap-1.5">
      {candidates.map((candidate) => {
        const inNucleus = candidate.inNucleus !== false;
        const columnHeight = Math.max(6, (candidate.probability / max) * heightPx);
        const hit = marbleToken === candidate.token;
        const drops = tally?.[candidate.token] ?? 0;
        return (
          <div key={candidate.token} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span
              className={`font-mono text-[10px] ${inNucleus ? 'text-(--color-dim)' : 'text-(--color-faint)'}`}
            >
              {(candidate.probability * 100).toFixed(1)}%{!inNucleus && ' ✂'}
            </span>
            <div className="relative flex w-full justify-center" style={{ height: heightPx }}>
              <AnimatePresence>
                {hit && (
                  <m.span
                    key={`marble-${marbleId}`}
                    aria-hidden="true"
                    initial={{ y: -heightPx, opacity: 0 }}
                    animate={{ y: heightPx - columnHeight - 14, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 17 }}
                    className="absolute top-0 z-10 size-3 rounded-full bg-(--color-amber)"
                    style={{ boxShadow: '0 0 10px -2px var(--color-amber)' }}
                  />
                )}
              </AnimatePresence>
              <m.div
                layout
                initial={false}
                animate={{ height: columnHeight }}
                transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                className={`w-full self-end overflow-hidden rounded-t-sm border border-(--color-bg)/60 ${
                  inNucleus ? '' : 'opacity-30'
                }`}
                style={{
                  background: hit
                    ? 'var(--color-amber)'
                    : inNucleus
                      ? 'var(--color-phosphor)'
                      : 'var(--color-ice)',
                  opacity: inNucleus ? (hit ? 1 : 0.75) : 0.3,
                }}
              />
            </div>
            <span
              className={`max-w-full truncate font-mono text-xs ${
                inNucleus ? 'text-(--color-ink)' : 'text-(--color-faint) line-through'
              }`}
              title={candidate.token}
            >
              {visible(candidate.token)}
            </span>
            {tally && (
              <span className="flex min-h-3 flex-wrap justify-center gap-0.5">
                {Array.from({ length: Math.min(drops, 12) }, (_, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-(--color-amber)/80"
                  />
                ))}
                {drops > 12 && (
                  <span className="font-mono text-[9px] text-(--color-amber)">+{drops - 12}</span>
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
