import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from './motion';
import { INPUT_BLOCK_LIMIT_MS } from '@/engine/animationQueue';
import type { SceneAnimation } from './useAnimationQueue';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';

interface Props {
  locale: Locale;
  animation: SceneAnimation;
  /**
   * Textual equivalent of whatever the motion currently says — everything
   * pedagogically required must also exist here (spec §8: nothing lives
   * only inside motion).
   */
  status?: string;
  onReset?: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Shared chrome every game scene wraps itself in: the LazyMotion/MotionConfig
 * pair (single Framer entry, reduced-motion aware), a Skip affordance while a
 * long animation chain runs, an optional Reset, and an aria-live status line.
 */
export default function SceneFrame({
  locale,
  animation,
  status,
  onReset,
  children,
  className,
}: Props) {
  const showSkip = animation.isAnimating && animation.pendingMs() > INPUT_BLOCK_LIMIT_MS;

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={animation.pref === 'reduced' ? 'always' : 'never'}>
        <div className={className}>
          {children}
          <div className="mt-3 flex min-h-8 items-center justify-between gap-3">
            <p aria-live="polite" className="font-mono text-xs text-(--color-dim)">
              {status}
            </p>
            <div className="flex items-center gap-2">
              {showSkip && (
                <button
                  type="button"
                  onClick={animation.skip}
                  className="rounded border border-(--color-line-bright) px-3 py-1.5 font-mono text-xs text-(--color-dim) hover:text-(--color-ink)"
                >
                  {lessonText('game_skip', locale)} ▸▸
                </button>
              )}
              {onReset && (
                <button
                  type="button"
                  onClick={onReset}
                  className="rounded border border-(--color-line) px-3 py-1.5 font-mono text-xs text-(--color-faint) hover:text-(--color-ink)"
                >
                  ↺ {lessonText('game_reset', locale)}
                </button>
              )}
            </div>
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
