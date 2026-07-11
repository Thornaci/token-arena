import { useStore } from '@nanostores/react';
import { progress } from '@/stores/progress';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';

interface Props {
  locale: Locale;
  totalLessons: number;
}

export default function HudBadge({ locale, totalLessons }: Props) {
  const state = useStore(progress);
  const nf = new Intl.NumberFormat(locale);

  return (
    <p
      className="ta-panel flex items-center gap-3 px-3 py-1.5 font-mono text-xs"
      aria-label={lessonText('hud_aria', locale)}
    >
      <span className="text-(--color-phosphor) text-glow">
        ▲ {lessonText('hud_xp', locale, { xp: nf.format(state.xp) })}
      </span>
      <span className="text-(--color-dim)">
        {state.completedLevels.length}/{totalLessons}
      </span>
    </p>
  );
}
