import { useState, type DragEvent } from 'react';
import type { BlockDropPosition } from './draftHelpers';

/** The drag data type of an editor block; text editors ignore it, so a block is never dropped into a text. */
const BLOCK_DRAG_TYPE = 'application/x-mktba-block';

export type BlockDropTarget = { blockId: string; position: BlockDropPosition };

type DragHandleProps = {
  draggable: true;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

type DropZoneProps = {
  onDragOverCapture: (event: DragEvent<HTMLElement>) => void;
  onDropCapture: (event: DragEvent<HTMLElement>) => void;
};

/** The upper half of a block puts the dragged block before it, the lower half after it. */
const dropPosition = (event: DragEvent<HTMLElement>): BlockDropPosition => {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
};

/**
 * Drag and drop of the editor's blocks by their handle (native HTML drag and drop, no library).
 * A block is dragged by its handle and dropped on another block, before or after it by which half
 * the pointer is in. While a block is dragged, the blocks take the drag events in the capture
 * phase, so the rich-text editors under the pointer neither show their drop caret nor take the drop.
 * The keyboard way to move a block is the handle's arrow keys and the move buttons.
 */
export const useBlockDragAndDrop = ({
  getBlockElement,
  onMove,
}: {
  getBlockElement: (blockId: string) => HTMLElement | null;
  onMove: (blockId: string, target: BlockDropTarget) => void;
}) => {
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<BlockDropTarget | null>(null);

  const reset = () => {
    setDraggedBlockId(null);
    setDropTarget(null);
  };

  const handleProps = (blockId: string): DragHandleProps => ({
    draggable: true,
    onDragStart: (event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(BLOCK_DRAG_TYPE, blockId);
      const element = getBlockElement(blockId);
      if (element) {
        event.dataTransfer.setDragImage(element, 16, 16);
      }
      setDraggedBlockId(blockId);
    },
    onDragEnd: reset,
  });

  const dropZoneProps = (blockId: string): DropZoneProps => ({
    onDragOverCapture: (event) => {
      if (!draggedBlockId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      const position = dropPosition(event);
      if (dropTarget?.blockId !== blockId || dropTarget.position !== position) {
        setDropTarget({ blockId, position });
      }
    },
    onDropCapture: (event) => {
      if (!draggedBlockId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onMove(draggedBlockId, { blockId, position: dropPosition(event) });
      reset();
    },
  });

  return { draggedBlockId, dropTarget, handleProps, dropZoneProps };
};
