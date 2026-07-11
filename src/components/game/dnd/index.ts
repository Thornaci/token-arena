/**
 * The shared drag & drop layer (spec §4 gate). Scenes import ONLY from this
 * barrel — never from @dnd-kit/* directly (enforced by review grep).
 */
export { default as DndScene } from './DndScene';
export { default as DraggableBlock } from './DraggableBlock';
export { default as DropZone } from './DropZone';
export { SortableList, SortableRow } from './SortableRow';
export { dndAnnouncements, dndInstructions } from './announcements';
export type {
  DragCancelEvent,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
export { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
