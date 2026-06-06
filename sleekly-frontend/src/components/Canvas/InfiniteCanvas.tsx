/**
 * @file InfiniteCanvas.tsx
 * @description The main workspace viewport component that handles absolute coordinate space card rendering.
 *
 * DESIGN CONSTRAINTS & CRITICAL LOGIC:
 * 1. **Scroll Persistence & Recovery**:
 *    The whiteboard coordinate space is theoretically infinite but backed by physical CSS boundary
 *    sizes (`innerW`/`innerH`). Since users pan across large layouts, we cache the viewport scroll positions
 *    (`scrollLeft` / `scrollTop`) inside `useLayoutEffect` on board transitions, restoring viewport focus
 *    exactly where they left off to provide a seamless application flow.
 * 2. **Screen-to-Canvas Vector Translation**:
 *    Since cards are placed on an absolute grid relative to the `.canvas-inner` container, screen-space click events
 *    (e.g., coordinates returned from browser double-click) must be translated to match canvas coordinates.
 *    This is solved in `screenToCanvas` by adding the container's active `scrollLeft`/`scrollTop` offsets.
 * 3. **Non-Overlapping Spatially-Aware Positioning**:
 *    To maintain clear layout visibility, we perform Axis-Aligned Bounding Box (AABB) overlap tests during
 *    card Drops and Resizes. If a card overlaps another, we query `findNonOverlappingPosition` to resolve
 *    positions without rendering overlaps.
 */

'use client';
import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Card } from '@/types';
import CanvasCard from './CanvasCard';
import ContextMenu from '../ContextMenu';
import ConfirmDialog from '../ConfirmDialog';
import { findNonOverlappingPosition, hasOverlap } from '@/lib/collision';
import { exportAsPng, exportAsHtml, exportAsMarkdown } from '@/lib/utils/cardExport';

export type InfiniteCanvasHandle = {
  getScrollContainer: () => HTMLDivElement | null;
  getViewportPosition: () => { x: number; y: number };
};

interface Props {
  cards: Card[];
  boardId: string;
  onUpdateCard: (card: Partial<Card>) => void;
  onCreateCard: (type: string, x: number, y: number) => void;
  onDeleteCard: (id: string) => void;
  onEditCard: (card: Card, mode?: 'preview' | 'edit') => void;
  readOnly?: boolean;
  canvasInnerWidth?: number;
  canvasInnerHeight?: number;
  boardNameMap?: Record<string, string>;
  getRestoredScroll?: (boardId: string) => { left: number; top: number } | undefined;
  onPersistScroll?: (boardId: string, left: number, top: number) => void;
  selectedCardId?: string | null;
  onSelectCard?: (id: string | null) => void;
  onCopyCard?: (card: Card) => void;
  onCutCard?: (card: Card) => void;
  onPasteCard?: (x: number, y: number) => void;
  onAddMediaClick?: (x: number, y: number) => void;
  hasClipboardItem?: boolean;
}

const InfiniteCanvas = forwardRef<InfiniteCanvasHandle, Props>(function InfiniteCanvas(
  {
    cards,
    boardId,
    onUpdateCard,
    onCreateCard,
    onDeleteCard,
    onEditCard,
    readOnly = false,
    canvasInnerWidth,
    canvasInnerHeight,
    boardNameMap,
    getRestoredScroll,
    onPersistScroll,
    selectedCardId,
    onSelectCard,
    onCopyCard,
    onCutCard,
    onPasteCard,
    onAddMediaClick,
    hasClipboardItem = false,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [localSelectedCardId, setLocalSelectedCardId] = useState<string | null>(null);
  const currentSelectedCardId = selectedCardId !== undefined ? selectedCardId : localSelectedCardId;
  const setCurrentSelectedCardId = onSelectCard || setLocalSelectedCardId;

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cardId?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ cardId: string; title: string } | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const notificationTimer = useRef<NodeJS.Timeout | null>(null);

  const showNotification = useCallback((msg: string) => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification(msg);
    notificationTimer.current = setTimeout(() => setNotification(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (notificationTimer.current) clearTimeout(notificationTimer.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    getScrollContainer: () => containerRef.current,
    getViewportPosition: () => {
      const el = containerRef.current;
      if (!el) return { x: 40, y: 40 };
      return {
        x: el.scrollLeft + 40,
        y: el.scrollTop + 40,
      };
    },
  }));

  const innerW = canvasInnerWidth ?? 'max(1300px, 100%)';
  const innerH = canvasInnerHeight ?? '300vh';

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !boardId) return;
    const saved = getRestoredScroll?.(boardId);
    el.scrollLeft = saved?.left ?? 0;
    el.scrollTop = saved?.top ?? 0;
  }, [boardId, getRestoredScroll]);

  useEffect(() => {
    const id = boardId;
    const el = containerRef.current;
    return () => {
      if (el && id && onPersistScroll) {
        onPersistScroll(id, el.scrollLeft, el.scrollTop);
      }
    };
  }, [boardId, onPersistScroll]);

  const handleCanvasContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const target = e.target as HTMLElement;
      if (
        target === containerRef.current ||
        target.classList.contains('canvas-inner') ||
        target.classList.contains('canvas-grid')
      ) {
        setContextMenu({ x: e.clientX, y: e.clientY });
      } else {
        setContextMenu(null);
      }
    },
    []
  );

  const handleCardContextMenu = useCallback((e: React.MouseEvent, cardId: string) => {
    setContextMenu({ x: e.clientX, y: e.clientY, cardId });
  }, []);

  /**
   * Translates absolute screen-space mouse pixel coordinates (clientX/clientY)
   * into relative whiteboard coordinates.
   * 
   * WHY: Rect bounds offset the container starting point relative to screen (0,0).
   * Adding the container's `scrollLeft`/`scrollTop` offsets maps screen positions to the exact place
   * inside the scrolled inner canvas.
   */
  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: screenX - rect.left + (containerRef.current?.scrollLeft || 0),
      y: screenY - rect.top + (containerRef.current?.scrollTop || 0),
    };
  }, []);

  /**
   * Tracks temporary coordinates as the card is actively dragged.
   * 
   * WHY: Performance optimization. We update coordinate state directly during dragging without checking
   * for collisions. Checking AABB collisions every single frame of a mousemove handler would trigger heavy React
   * re-renders of the entire canvas cards array and cause visible input lag.
   */
  const handleMove = useCallback(
    (id: string, x: number, y: number) => {
      if (readOnly) return;
      onUpdateCard({ id, x, y });
    },
    [onUpdateCard, readOnly]
  );

  /**
   * Finalizes card positioning once a drag action concludes.
   * 
   * WHY:
   * 1. Clamps horizontal values `clampedX` to ensure the card stays within the bounds of the active workspace.
   * 2. Resolves collisions using `findNonOverlappingPosition` to find the nearest non-colliding location,
   *    ensuring visual structure is maintained.
   */
  const handleDrop = useCallback(
    (id: string, x: number, y: number) => {
      if (readOnly) return;
      const card = cards.find(c => c.id === id);
      if (!card) { onUpdateCard({ id, x, y }); return; }

      const container = containerRef.current;
      let clampedX = x;
      if (container) {
        const canvasInner = container.querySelector('.canvas-inner');
        const boundaryW = canvasInner ? canvasInner.clientWidth : container.clientWidth;
        const maxX = Math.max(0, boundaryW - card.width);
        clampedX = Math.max(0, Math.min(x, maxX));
      }

      const resolved = findNonOverlappingPosition(id, clampedX, y, card.width, card.height, cards);

      let finalX = resolved.x;
      if (container) {
        const canvasInner = container.querySelector('.canvas-inner');
        const boundaryW = canvasInner ? canvasInner.clientWidth : container.clientWidth;
        const maxX = Math.max(0, boundaryW - card.width);
        finalX = Math.max(0, Math.min(resolved.x, maxX));
      }

      onUpdateCard({ id, x: finalX, y: resolved.y });
    },
    [onUpdateCard, readOnly, cards]
  );

  const handleColorChange = useCallback(
    (id: string, color: string) => {
      onUpdateCard({ id, color });
    },
    [onUpdateCard]
  );

  /**
   * Resizes cards with collision checks.
   * 
   * WHY: If the target size overlaps with neighboring cards, we test horizontal and vertical axes
   * independently (`widthOk`, `heightOk`). This allows the card to grow as far as possible until it meets
   * a collision boundary, instead of completely blocking the resize action.
   */
  const handleResize = useCallback(
    (id: string, width: number, height: number) => {
      if (readOnly) return;
      const card = cards.find(c => c.id === id);
      if (!card) return;

      const proposedRect = { x: card.x, y: card.y, width, height };

      if (!hasOverlap(proposedRect, cards, id)) {
        onUpdateCard({ id, width, height });
      } else {
        const widthOk = !hasOverlap({ x: card.x, y: card.y, width, height: card.height }, cards, id);
        const heightOk = !hasOverlap({ x: card.x, y: card.y, width: card.width, height }, cards, id);

        const finalW = widthOk ? width : card.width;
        const finalH = heightOk ? height : card.height;

        if (finalW !== card.width || finalH !== card.height) {
          onUpdateCard({ id, width: finalW, height: finalH });
        }
      }
    },
    [onUpdateCard, readOnly, cards]
  );

  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return;
      const target = e.target as HTMLElement;
      if (
        target !== containerRef.current &&
        !target.classList.contains('canvas-inner') &&
        !target.classList.contains('canvas-grid')
      ) {
        return;
      }
      const pos = screenToCanvas(e.clientX, e.clientY);
      onCreateCard('richtext', pos.x, pos.y);
    },
    [onCreateCard, readOnly, screenToCanvas]
  );

  const cardMenuItems = (() => {
    if (!contextMenu) return [];
    if (contextMenu.cardId) {
      const card = cards.find(x => x.id === contextMenu.cardId);
      const items: {
        label: string;
        icon?: string;
        onClick: () => void;
        danger?: boolean;
        divider?: boolean;
        disabled?: boolean;
      }[] = [
        {
          label: 'Edit Card',
          icon: '✏️',
          onClick: () => {
            if (card) onEditCard(card, 'edit');
          },
        },
        {
          label: 'Copy Card',
          icon: '📋',
          onClick: () => {
            if (card && onCopyCard) onCopyCard(card);
          },
        },
        {
          label: 'Cut Card',
          icon: '✂️',
          onClick: () => {
            if (card && onCutCard) onCutCard(card);
          },
        },
        {
          label: 'Delete Card',
          icon: '🗑️',
          danger: true,
          onClick: () => {
            if (card) {
              setDeleteConfirm({ cardId: card.id, title: card.title || 'Untitled' });
            }
          },
        },
      ];

      // Rich text cards support document exporting features.
      // We dynamically append the export options (PNG, HTML, Markdown) to the card's context menu.
      if (card && card.type === 'richtext') {
        items.push(
          {
            label: '',
            divider: true,
            onClick: () => {},
          },
          {
            label: 'Export as PNG',
            icon: '🖼️',
            onClick: async () => {
              const success = await exportAsPng(card.title, card.content, { tags: card.tags });
              if (success) showNotification('Exported as PNG');
            },
          },
          {
            label: 'Export as HTML',
            icon: '🌐',
            onClick: async () => {
              const success = await exportAsHtml(card.title, card.content, { tags: card.tags });
              if (success) showNotification('Exported as HTML');
            },
          },
          {
            label: 'Export as Markdown',
            icon: '📝',
            onClick: async () => {
              const success = await exportAsMarkdown(card.title, card.content);
              if (success) showNotification('Exported as Markdown');
            },
          }
        );
      }
      return items;
    } else {
      return [
        {
          label: 'Paste Card',
          icon: '📋',
          disabled: !hasClipboardItem,
          onClick: () => {
            if (onPasteCard) {
              const pos = screenToCanvas(contextMenu.x, contextMenu.y);
              onPasteCard(pos.x, pos.y);
            }
          },
        },
        {
          label: 'Create Note',
          icon: '📝',
          onClick: () => {
            const pos = screenToCanvas(contextMenu.x, contextMenu.y);
            onCreateCard('richtext', pos.x, pos.y);
          },
        },
        {
          label: 'Add Media',
          icon: '🖼️',
          onClick: () => {
            if (onAddMediaClick) {
              const pos = screenToCanvas(contextMenu.x, contextMenu.y);
              onAddMediaClick(pos.x, pos.y);
            }
          },
        },
      ];
    }
  })();

  return (
    <>
      <div
        ref={containerRef}
        className="canvas-container"
        style={{ overflow: 'auto', position: 'relative', flex: 1, backgroundColor: 'var(--bg-primary)' }}
        onContextMenu={handleCanvasContextMenu}
        onDoubleClick={handleCanvasDoubleClick}
        onClick={e => {
          const target = e.target as HTMLElement;
          if (
            target === containerRef.current ||
            target.classList.contains('canvas-inner') ||
            target.classList.contains('canvas-grid')
          ) {
            setCurrentSelectedCardId(null);
          }
        }}
      >
        <div
          className="canvas-inner"
          style={{
            width: typeof innerW === 'number' ? `${innerW}px` : innerW,
            height: typeof innerH === 'number' ? `${innerH}px` : innerH,
            position: 'relative',
          }}
        >
          <div
            className="canvas-grid"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
              backgroundSize: '30px 30px',
              opacity: 0.5,
              pointerEvents: 'none',
            }}
          />
          {cards.map(card => (
            <CanvasCard
              key={card.id}
              card={card}
              scale={1}
              selected={card.id === currentSelectedCardId}
              onSelect={() => setCurrentSelectedCardId(card.id)}
              onDoubleClick={() => onEditCard(card, 'preview')}
              onMove={handleMove}
              onDrop={handleDrop}
              onResize={handleResize}
              onContextMenu={e => handleCardContextMenu(e, card.id)}
              onColorChange={handleColorChange}
              readOnly={readOnly}
              boardLabel={boardNameMap?.[card.boardId]}
              scrollContainerRef={containerRef}
            />
          ))}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={cardMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Card"
          message={`Are you sure you want to delete "${deleteConfirm.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            onDeleteCard(deleteConfirm.cardId);
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {notification && (
        <div className="export-toast">
          <span>✅</span> {notification}
        </div>
      )}
    </>
  );
});

export default InfiniteCanvas;
