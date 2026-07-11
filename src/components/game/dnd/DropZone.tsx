import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';

interface Props {
  id: string;
  /** Localized name used by screen-reader announcements. */
  label: string;
  disabled?: boolean;
  data?: Record<string, unknown>;
  className?: string;
  children?: ReactNode;
}

/** Shared drop target: ≥44px, exposes `data-over` as the styling hook. */
export default function DropZone({ id, label, disabled, data, className, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled, data: { ...data, label } });

  return (
    <div
      ref={setNodeRef}
      data-over={isOver && !disabled ? '' : undefined}
      className={['min-h-11 min-w-11', className ?? ''].join(' ')}
    >
      {children}
    </div>
  );
}
