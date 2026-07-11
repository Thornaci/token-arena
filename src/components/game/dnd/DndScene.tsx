import type { ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { dndAnnouncements, dndInstructions } from './announcements';
import type { Locale } from '@/lib/locales';

interface Props {
  locale: Locale;
  onDragStart?: (event: DragStartEvent) => void;
  onDragMove?: (event: DragMoveEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragCancel?: (event: DragCancelEvent) => void;
  /** Sortable scenes pass `sortableKeyboardCoordinates` (via the barrel). */
  keyboardCoordinateGetter?: KeyboardCoordinateGetter;
  children: ReactNode;
}

/**
 * The one shared DndContext (spec §4 gate: no per-level dnd forks).
 * - Pointer: 4px activation distance so plain clicks still click.
 * - Touch: 120ms hold so scrolling the lesson page never starts a drag.
 * - Keyboard: Space/Enter pick up, arrows move, Escape cancels — announced
 *   through localized screen-reader strings.
 */
export default function DndScene({
  locale,
  onDragStart,
  onDragMove,
  onDragOver,
  onDragEnd,
  onDragCancel,
  keyboardCoordinateGetter,
  children,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinateGetter }),
  );

  return (
    <DndContext
      sensors={sensors}
      accessibility={{
        announcements: dndAnnouncements(locale),
        screenReaderInstructions: dndInstructions(locale),
      }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children}
    </DndContext>
  );
}
