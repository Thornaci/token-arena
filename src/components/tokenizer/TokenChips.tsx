import type { TokenPiece } from '@/lib/tokenizer';

const CHIP_COLORS = [
  'var(--color-chip-1)',
  'var(--color-chip-2)',
  'var(--color-chip-3)',
  'var(--color-chip-4)',
  'var(--color-chip-5)',
] as const;

interface Props {
  pieces: TokenPiece[];
  showIds?: boolean;
  /** Cap rendered chips to keep huge pastes responsive. */
  maxChips?: number;
}

/** Renders whitespace so token boundaries stay visible. */
function visible(text: string): string {
  if (text === '') return '·';
  return text.replace(/\n/g, '↵').replace(/\t/g, '⇥').replace(/ /g, '␣');
}

export default function TokenChips({ pieces, showIds = false, maxChips = 600 }: Props) {
  const shown = pieces.slice(0, maxChips);
  const hidden = pieces.length - shown.length;

  return (
    <div className="flex flex-wrap gap-1 font-mono text-sm" aria-live="polite">
      {shown.map((piece, i) => (
        <span
          key={i}
          title={`#${i} · id ${piece.token}`}
          className="motion-safe:animate-[ta-pop-in_0.2s_ease-out] inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 text-(--color-ink)"
          style={{
            background: CHIP_COLORS[i % CHIP_COLORS.length],
            boxShadow: 'inset 0 0 0 1px rgb(217 231 222 / 0.08)',
          }}
        >
          <span className="whitespace-pre">{visible(piece.text)}</span>
          {showIds && <span className="text-[10px] text-(--color-dim)">{piece.token}</span>}
        </span>
      ))}
      {hidden > 0 && (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs text-(--color-faint)">
          +{hidden}
        </span>
      )}
    </div>
  );
}
