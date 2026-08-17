import type { Locale } from '@/lib/locales';
import { lessonText } from '@/lib/lessonText';
import { ROLE_COLOR, ROLE_TAG } from './shared';
import type { WalkEntry } from './useSimWalkthrough';

/**
 * The transcript rows of a stepped walkthrough: narration, "request ships"
 * beats, and role-tagged blocks with their authored token cost. Removed
 * blocks stay visible, struck through — the inspector forgets, the transcript
 * remembers.
 */
export default function WalkTranscript({
  entries,
  locale,
  sendFallbackKey,
}: {
  entries: readonly WalkEntry[];
  locale: Locale;
  sendFallbackKey: string;
}) {
  const t = (key: string) => lessonText(key, locale);
  return (
    <>
      {entries.map((entry, i) => {
        if (entry.kind === 'narration') {
          return (
            <p key={i} className="max-w-prose text-sm text-(--color-dim)">
              {t(entry.textKey!)}
            </p>
          );
        }
        if (entry.kind === 'send') {
          return (
            <p key={i} className="font-mono text-xs text-(--color-phosphor)">
              ▸ {entry.textKey ? t(entry.textKey) : t(sendFallbackKey)}
            </p>
          );
        }
        const block = entry.block!;
        return (
          <p
            key={i}
            className={`flex items-center gap-2 border-l-2 pl-2 font-mono text-xs motion-safe:animate-[ta-pop-in_0.25s_ease-out] ${
              entry.removed ? 'opacity-45' : ''
            }`}
            style={{ borderLeftColor: ROLE_COLOR[block.role] }}
          >
            <span style={{ color: ROLE_COLOR[block.role] }}>{ROLE_TAG[block.role]}</span>
            <span className={`text-(--color-ink) ${entry.removed ? 'line-through' : ''}`}>
              {block.labelKey ? t(block.labelKey) : block.id}
            </span>
            {entry.removed && (
              <span className="rounded border border-(--color-alert) px-1.5 font-mono text-[10px] text-(--color-alert)">
                {t('compaction_dropped_tag')}
              </span>
            )}
            <span className="ml-auto text-(--color-dim)">
              {entry.removed ? '—' : `+${block.fixedTokens}`}
            </span>
          </p>
        );
      })}
    </>
  );
}
