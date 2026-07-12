import { Suspense } from 'react';
import { getMechanic, type MechanicComponentProps } from './registry';
import { lessonText } from '@/lib/lessonText';

export default function MechanicHost({ lesson, locale, onPass }: MechanicComponentProps) {
  const Mechanic = getMechanic(lesson.mechanic);

  if (!Mechanic) {
    return (
      <p className="rounded border border-(--color-amber) bg-(--color-surface) p-4 font-mono text-sm text-(--color-amber)">
        Unregistered mechanic: {lesson.mechanic}
      </p>
    );
  }

  return (
    <Suspense
      fallback={
        <p className="p-4 font-mono text-sm text-(--color-faint)" aria-busy="true">
          {lessonText('ui_loading', locale)}
        </p>
      }
    >
      <Mechanic lesson={lesson} locale={locale} onPass={onPass} />
    </Suspense>
  );
}
