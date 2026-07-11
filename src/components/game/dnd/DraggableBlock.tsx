import type { CSSProperties, ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';

interface Props {
  id: string;
  /** Localized name used by screen-reader announcements. */
  label: string;
  disabled?: boolean;
  data?: Record<string, unknown>;
  className?: string;
  style?: CSSProperties;
  /**
   * false = the element stays put while dragging (for handles whose effect —
   * e.g. a zone resizing — is applied live from onDragMove instead).
   */
  applyTransform?: boolean;
  children: ReactNode;
}

/**
 * Shared draggable wrapper: ≥44px hit target, touch-action none (the touch
 * sensor owns the gesture), grab cursor, transform applied inline (never mix
 * Tailwind transition utilities onto this element).
 */
export default function DraggableBlock({
  id,
  label,
  disabled,
  data,
  className,
  style,
  applyTransform = true,
  children,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
    data: { ...data, label },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        ...style,
        transform:
          applyTransform && transform
            ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
            : style?.transform,
        touchAction: 'none',
      }}
      className={[
        'min-h-11 min-w-11 select-none',
        disabled ? 'cursor-default' : 'cursor-grab',
        isDragging ? 'relative z-50 cursor-grabbing opacity-90' : '',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </div>
  );
}
