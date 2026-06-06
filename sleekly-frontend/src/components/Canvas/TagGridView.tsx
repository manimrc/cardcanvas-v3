/**
 * @file TagGridView.tsx
 * @description Renders a collection of cards matching the selected tag filters inside a uniform CSS grid.
 * Reuses the standard `CanvasCard` component by triggering its `uniformGrid` mode to bypass absolute positioning values.
 */

'use client';
import type { Card } from '@/types';
import CanvasCard from './CanvasCard';
import ContextMenu from '../ContextMenu';
import ConfirmDialog from '../ConfirmDialog';
import { useCallback, useState } from 'react';

interface Props {
  cards: Card[];
  boardNameMap: Record<string, string>;
  onDeleteCard: (id: string) => void;
  onEditCard: (card: Card, mode?: 'preview' | 'edit') => void;
}

export default function TagGridView({ cards, boardNameMap, onDeleteCard, onEditCard }: Props) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cardId?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ cardId: string; title: string } | null>(null);

  const handleCardContextMenu = useCallback((e: React.MouseEvent, cardId: string) => {
    setContextMenu({ x: e.clientX, y: e.clientY, cardId });
  }, []);

  const cardMenuItems = contextMenu?.cardId
    ? [
        {
          label: 'Edit Card',
          icon: '✏️',
          onClick: () => {
            const c = cards.find(x => x.id === contextMenu.cardId);
            if (c) onEditCard(c, 'edit');
          },
        },
        {
          label: 'Delete Card',
          icon: '🗑️',
          danger: true,
          onClick: () => {
            if (contextMenu.cardId) {
              const c = cards.find(x => x.id === contextMenu.cardId);
              setDeleteConfirm({ cardId: contextMenu.cardId, title: c?.title || 'Untitled' });
            }
          },
        },
      ]
    : [];

  const noop = () => {};

  return (
    <>
      <div
        className="tag-board-scroll"
        onClick={e => {
          if ((e.target as HTMLElement).closest('.card')) return;
          setSelectedCardId(null);
        }}
      >
        <div className="tag-board-grid">
          {cards.map(card => (
            <div key={card.id} className="tag-board-cell">
              <CanvasCard
                card={card}
                scale={1}
                selected={card.id === selectedCardId}
                onSelect={() => setSelectedCardId(card.id)}
                onDoubleClick={() => onEditCard(card, 'preview')}
                onMove={noop}
                onDrop={noop}
                onResize={noop}
                onContextMenu={e => handleCardContextMenu(e, card.id)}
                onColorChange={noop}
                readOnly
                uniformGrid
                boardLabel={boardNameMap[card.boardId]}
              />
            </div>
          ))}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={cardMenuItems} onClose={() => setContextMenu(null)} />
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
    </>
  );
}
