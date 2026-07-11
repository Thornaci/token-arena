import { useEffect, useState } from 'react';
import type { MechanicComponentProps } from '@/components/sim/registry';
import { showInspector } from '@/stores/inspector';
import { setTool, type ToolChoice } from '@/stores/progress';
import { getModelProfile } from '@/engine/modelProfiles';
import { lessonText } from '@/lib/lessonText';
import { GhostButton, PrimaryButton } from './shared';

const TOOLS: { id: ToolChoice; label: string }[] = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'curious', label: '?' },
];

/** A tiny demo payload so the tour has something real to point at. */
const DEMO_BLOCKS = [
  { id: 'demo-sys', role: 'system', kind: 'message', labelKey: 'm0_demo_system', fixedTokens: 12 },
  { id: 'demo-usr', role: 'user', kind: 'message', labelKey: 'm0_demo_user', fixedTokens: 9 },
  { id: 'demo-ast', role: 'assistant', kind: 'message', labelKey: 'm0_demo_assistant', fixedTokens: 21 },
] as const;

export default function IntroTour({ lesson, locale, onPass }: MechanicComponentProps) {
  if (lesson.mechanic !== 'intro-tour') throw new Error('IntroTour got wrong lesson');
  const { slides } = lesson.params;

  // step 0 = welcome slide, step 1 = tool picker, steps 2.. = remaining slides
  const [step, setStep] = useState(0);
  const [pickedTool, setPickedTool] = useState<ToolChoice | null>(null);
  const totalSteps = slides.length + 1;
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

  const slideIndex = step === 0 ? 0 : step - 1;
  const isToolStep = step === 1;
  const isLast = step === totalSteps - 1;

  return (
    <div className="ta-panel ta-notched flex flex-col gap-5 p-6">
      <p className="font-mono text-xs text-(--color-faint)" aria-label="progress">
        {Array.from({ length: totalSteps }, (_, i) => (i === step ? '■' : '·')).join(' ')}
      </p>

      {isToolStep ? (
        <div className="flex flex-col gap-4">
          <p className="max-w-prose text-(--color-ink)">{t('m0_tool_prompt')}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => {
                  setPickedTool(tool.id);
                  setTool(tool.id);
                }}
                aria-pressed={pickedTool === tool.id}
                className={`rounded border px-3 py-4 font-mono text-sm transition-colors ${
                  pickedTool === tool.id
                    ? 'border-(--color-phosphor) bg-(--color-raised) text-(--color-phosphor)'
                    : 'border-(--color-line) text-(--color-dim) hover:border-(--color-line-bright)'
                }`}
              >
                {tool.id === 'curious' ? t('m0_tool_curious') : tool.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-(--color-faint)">{t('m0_tool_note')}</p>
        </div>
      ) : (
        <p className="max-w-prose whitespace-pre-line text-(--color-ink)">
          {t(slides[slideIndex]!.textKey)}
        </p>
      )}

      <div className="flex items-center gap-3">
        {step > 0 && <GhostButton onClick={() => setStep((s) => s - 1)}>←</GhostButton>}
        {isLast ? (
          <PrimaryButton onClick={onPass}>{t('m0_finish_cta')}</PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={() => setStep((s) => s + 1)}
            disabled={isToolStep && pickedTool === null}
          >
            {t('m0_next_cta')} →
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}
