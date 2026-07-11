import type { ReactNode } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';

interface ListProps {
  ids: string[];
  children: ReactNode;
}

/** Vertical sortable region (assembly line, conveyor tray). */
export function SortableList({ ids, children }: ListProps) {
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {children}
    </SortableContext>
  );
}

interface RowProps {
  id: string;
  /** Localized name used by screen-reader announcements. */
  label: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function SortableRow({ id, label, disabled, className, children }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
    data: { label },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX ?? 1}) scaleY(${transform.scaleY ?? 1})`
          : undefined,
        transition,
        touchAction: 'none',
      }}
      className={[
        'min-h-11 select-none',
        disabled ? 'cursor-default' : 'cursor-grab',
        isDragging ? 'relative z-50 cursor-grabbing opacity-90' : '',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </div>
  );
}
