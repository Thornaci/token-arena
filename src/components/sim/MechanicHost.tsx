import { Suspense } from 'react';
import { useStore } from '@nanostores/react';
import { resolveMechanic, type MechanicComponentProps } from './registry';
import { lessonText } from '@/lib/lessonText';
import { progress } from '@/stores/progress';

export default function MechanicHost({ lesson, locale, onPass }: MechanicComponentProps) {
  const { settings } = useStore(progress);
  const resolved = resolveMechanic(lesson, settings.renderer);

  if (!resolved) {
    return (
      <p className="rounded border border-(--color-amber) bg-(--color-surface) p-4 font-mono text-sm text-(--color-amber)">
        Unregistered mechanic: {lesson.mechanic}
      </p>
    );
  }

  const Mechanic = resolved.Component;

  return (
    <Suspense
      fallback={
        <p className="p-4 font-mono text-sm text-(--color-faint)" aria-busy="true">
          {lessonText('ui_loading', locale)}
        </p>
      }
    >
      {/* key by variant so toggling Classic mode swaps cleanly mid-lesson */}
      <Mechanic key={resolved.variant} lesson={lesson} locale={locale} onPass={onPass} />
    </Suspense>
  );
}
