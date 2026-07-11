import type { Lesson } from '@/content/schema';
import { getModelProfile } from '@/engine/modelProfiles';
import type { ContextState } from '@/engine/contextModel';

export function buildContextState(init: NonNullable<Lesson['initialState']>): ContextState {
  return {
    model: getModelProfile(init.modelId),
    blocks: [...init.blocks],
    reservedOutput: init.reservedOutput,
  };
}

interface ChoiceQuestionProps {
  prompt: string;
  options: readonly string[];
  selected: number | null;
  onSelect: (index: number) => void;
  /** When set, the answer is revealed and options lock. */
  verdict: { correctIndex: number } | null;
}

export function ChoiceQuestion({ prompt, options, selected, onSelect, verdict }: ChoiceQuestionProps) {
  return (
    <div role="radiogroup" aria-label={prompt} className="ta-panel p-4">
      <p className="mb-3 font-medium text-(--color-ink)">{prompt}</p>
      <div className="flex flex-col gap-2">
        {options.map((option, i) => {
          const isSelected = selected === i;
          const isCorrect = verdict && i === verdict.correctIndex;
          const isWrongPick = verdict && isSelected && i !== verdict.correctIndex;
          return (
            <label
              key={i}
              className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2 text-sm transition-colors ${
                isCorrect
                  ? 'border-(--color-phosphor) bg-(--color-raised) text-(--color-ink)'
                  : isWrongPick
                    ? 'border-(--color-alert) bg-(--color-raised) text-(--color-ink)'
                    : isSelected
                      ? 'border-(--color-ice) bg-(--color-raised) text-(--color-ink)'
                      : 'border-(--color-line) text-(--color-dim) hover:border-(--color-line-bright)'
              } ${verdict ? 'cursor-default' : ''}`}
            >
              <input
                type="radio"
                name={prompt}
                checked={isSelected}
                disabled={verdict !== null}
                onChange={() => onSelect(i)}
                className="mt-1 accent-(--color-phosphor)"
              />
              <span>
                {option}
                {isCorrect && <span aria-hidden="true" className="ml-2 text-(--color-phosphor)">✓</span>}
                {isWrongPick && <span aria-hidden="true" className="ml-2 text-(--color-alert)">✗</span>}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="self-start rounded bg-(--color-phosphor) px-4 py-2 font-mono text-sm font-semibold text-(--color-bg) transition-transform enabled:hover:scale-[1.02] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start rounded border border-(--color-line-bright) px-4 py-2 font-mono text-sm text-(--color-dim) transition-colors hover:text-(--color-ink)"
    >
      {children}
    </button>
  );
}
