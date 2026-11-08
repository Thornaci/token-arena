import { useEffect, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { showInspector } from '@/stores/inspector';
import { getModelProfile } from '@/engine/modelProfiles';
import { lessonText } from '@/lib/lessonText';
import { GhostButton, PrimaryButton } from './shared';

/** A tiny demo payload so the tour has something real to point at. */
const DEMO_BLOCKS = [
  { id: 'demo-sys', role: 'system', kind: 'message', labelKey: 'm0_demo_system', fixedTokens: 12 },
  { id: 'demo-usr', role: 'user', kind: 'message', labelKey: 'm0_demo_user', fixedTokens: 9 },
  { id: 'demo-ast', role: 'assistant', kind: 'message', labelKey: 'm0_demo_assistant', fixedTokens: 21 },
] as const;

export default function IntroTour({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'intro-tour') throw new Error('IntroTour got wrong lesson');
  const { slides } = lesson.params;

  const [step, setStep] = useState(0);
  const totalSteps = slides.length;
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);

  useEffect(() => {
    showInspector(
      {
        model: getModelProfile('generic-8k'),
        blocks: DEMO_BLOCKS.map((b) => ({ ...b })),
        reservedOutput: 500,
      },
      { allowModelChange: false },
    );
  }, []);

  const isLast = step === totalSteps - 1;

  return (
    <div className="ta-panel ta-notched flex flex-col gap-5 p-6">
      <p className="font-mono text-xs text-(--color-faint)" aria-label="progress">
        {Array.from({ length: totalSteps }, (_, i) => (i === step ? '■' : '·')).join(' ')}
      </p>

      <p className="max-w-prose whitespace-pre-line text-(--color-ink)">
        {t(slides[step]!.textKey)}
      </p>

      <div className="flex items-center gap-3">
        {step > 0 && <GhostButton onClick={() => setStep((s) => s - 1)}>←</GhostButton>}
        {isLast ? (
          <PrimaryButton onClick={onPass}>{t('m0_finish_cta')}</PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => setStep((s) => s + 1)}>{t('m0_next_cta')} →</PrimaryButton>
        )}
      </div>
    </div>
  );
}
