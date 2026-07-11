import { useStore } from '@nanostores/react';
import { LazyMotion, MotionConfig, domAnimation } from '@/components/game/motion';
import Mascot from './Mascot';
import ConfusionMeter from './ConfusionMeter';
import { mascotView } from '@/stores/mascot';
import { useMotionPref } from '@/lib/motionPref';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';

interface Props {
  locale: Locale;
  /** 'panel' sits on top of the Context Inspector; 'compact' lives in headers. */
  variant: 'panel' | 'compact';
}

export default function MascotDock({ locale, variant }: Props) {
  const view = useStore(mascotView);
  const pref = useMotionPref();
  const stateLabel = lessonText(`mascot_state_${view.state}`, locale);

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={pref === 'reduced' ? 'always' : 'never'}>
        {variant === 'panel' ? (
          <section
            aria-label={lessonText('mascot_title', locale)}
            className="ta-panel flex items-center gap-3 px-4 py-3"
          >
            <Mascot state={view.state} size={72} ariaLabel={stateLabel} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-(--color-faint)">
                {lessonText('mascot_title', locale)} · <span className="text-(--color-dim)">{stateLabel}</span>
              </p>
              <ConfusionMeter locale={locale} value={view.confusion} contributors={view.contributors} />
            </div>
          </section>
        ) : (
          <div
            aria-label={lessonText('mascot_title', locale)}
            title={stateLabel}
            className="ta-panel flex items-center gap-1.5 px-2 py-1"
          >
            <Mascot state={view.state} size={30} ariaLabel={stateLabel} />
            <ConfusionMeter
              locale={locale}
              value={view.confusion}
              contributors={view.contributors}
              compact
            />
          </div>
        )}
      </MotionConfig>
    </LazyMotion>
  );
}
