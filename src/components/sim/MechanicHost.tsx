import { Suspense } from 'react';
import { getMechanic, type MechanicComponentProps } from './registry';
import { lessonText } from '@/lib/lessonText';

export default function MechanicHost({ lesson, locale }: MechanicComponentProps) {
  const Mechanic = getMechanic(lesson.mechanic);

  if (!Mechanic) {
    return (
      <p className="rounded border border-amber-900 bg-amber-950/40 p-4 font-mono text-sm text-amber-300">
        Unregistered mechanic: {lesson.mechanic}
      </p>
    );
  }

  return (
    <Suspense
      fallback={
        <p className="p-4 font-mono text-sm text-zinc-500" aria-busy="true">
          {lessonText('ui_loading', locale)}
        </p>
      }
    >
      <Mechanic lesson={lesson} locale={locale} />
    </Suspense>
  );
}
