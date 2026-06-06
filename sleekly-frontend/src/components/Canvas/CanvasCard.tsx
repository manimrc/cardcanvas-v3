/**
 * @file CanvasCard.tsx
 * @description Card item rendering component for the infinite whiteboard workspace.
 * Resolves different UI preview sub-components based on card type (RichText, Image, PDF, Link).
 * Handles mouse interactions for drag-and-drop movement and boundary resizing on the coordinate plane.
 */

'use client';
import { Card as CardType } from '@/types';
import { CARD_COLORS } from '@/lib/constants';
import { resolveMediaUrl } from '@/lib/api';
import { useRef, useState, useCallback, useEffect } from 'react';
import { Maximize2, MoreHorizontal } from 'lucide-react';

const TYPE_EMOJI: Record<string, string> = {
  richtext: '📝', link: '🔗', image: '🖼️', pdf: '📄', article: '📰',
};

interface Props {
  card: CardType;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onDrop: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onColorChange: (id: string, color: string) => void;
  readOnly?: boolean;
  boardLabel?: string;
  /** Fill a CSS grid cell (tags mode); ignores canvas x/y/width/height */
  uniformGrid?: boolean;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * Renders the first page of a PDF document as a static vector canvas thumbnail using PDF.js.
 * 
 * DESIGN DECISION:
 * To avoid locking Next.js SSR build threads and bloating bundle sizes, pdfjs-dist and its
 * heavy Web Worker (`pdf.worker.mjs`) are loaded dynamically as a dynamic import on mounting.
 * Canvas resolution is adjusted against the system's `devicePixelRatio` to prevent blurry text
 * on high-DPI screens (Retina displays).
 */
function PdfThumbnail({ url, title }: { url?: string; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(url ? 'loading' : 'error');

  useEffect(() => {
    let cancelled = false;

    if (!url || !canvasRef.current) {
      setStatus('error');
      return;
    }

    async function renderPdf() {
      setStatus('loading');
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.mjs',
          import.meta.url
        ).toString();

        const loadingTask = pdfjs.getDocument(url);
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await pdf.destroy();
          return;
        }

        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = 220;
        const viewport = page.getViewport({ scale: targetWidth / baseViewport.width });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;

        if (!canvas) {
          throw new Error('Canvas unavailable');
        }

        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Canvas context unavailable');
        }

        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.fillStyle = '#fff';
        context.fillRect(0, 0, viewport.width, viewport.height);

        await page.render({ canvas, canvasContext: context, viewport }).promise;
        await pdf.destroy();

        if (!cancelled) setStatus('ready');
      } catch (err) {
        console.warn('Failed to render PDF thumbnail:', err);
        if (!cancelled) setStatus('error');
      }
    }

    void renderPdf();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (status === 'error') {
    return (
      <div className="card-pdf-fallback">
        <div className="card-pdf-icon">📄</div>
      </div>
    );
  }

  return (
    <div className="card-pdf-thumb-frame" aria-label={`${title} preview`}>
      {status === 'loading' && <div className="card-pdf-thumb-loading">Loading preview...</div>}
      <canvas
        ref={canvasRef}
        className="card-pdf-thumb-canvas"
        style={{ opacity: status === 'ready' ? 1 : 0 }}
      />
    </div>
  );
}

function cleanContent(content: string): string {
  if (!content) return '';
  let cleaned = content;

  // Resolve relative media paths in Tauri for previews
  const isTauri = typeof window !== 'undefined' &&
    (window.location.protocol === 'tauri:' || (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined);
  if (isTauri) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    cleaned = cleaned.replace(/src="\/api\/media\/files\//g, `src="${apiBase}/api/media/files/`);
  }

  const trimmed = cleaned.trim();
  if (
    trimmed === 'Start typing...' ||
    trimmed === '<p>Start typing...</p>' ||
    trimmed === '<p>Start typing...</p><p></p>' ||
    trimmed === '<p>Start typing...</p><p><br></p>'
  ) {
    return '';
  }
  return cleaned;
}

export default function CanvasCard({
  card,
  scale,
  selected,
  onSelect,
  onDoubleClick,
  onMove,
  onDrop,
  onResize,
  onContextMenu,
  onColorChange,
  readOnly = false,
  boardLabel,
  uniformGrid = false,
  scrollContainerRef,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (readOnly) {
      e.stopPropagation();
      onSelect();
      return;
    }
    // Prevent dragging if interacting with specific UI buttons/controls
    if (
      (e.target as HTMLElement).closest('.card-menu-btn') ||
      (e.target as HTMLElement).closest('.card-resize-handle') ||
      (e.target as HTMLElement).closest('.card-color-strip')
    ) return;
    e.stopPropagation();
    onSelect();

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = card.x;
    const origY = card.y;
    const container = scrollContainerRef?.current;
    const origScrollLeft = container?.scrollLeft || 0;
    const origScrollTop = container?.scrollTop || 0;
    let lastClientX = e.clientX;
    let lastClientY = e.clientY;
    let animFrameId: number | null = null;
    let hasMoved = false;

    setDragging(true);

    // Auto-scroll zones: boundaries near viewport edge to trigger scrolling when dragging.
    const EDGE_ZONE = 60; // Distance in pixels from container edges to trigger scrolling
    const SPEED_FAST = 12; // Auto-scroll speed when user is pushed deeply into the edge
    const SPEED_SLOW = 4;  // Auto-scroll speed when user is slightly past the edge border

    /**
     * Calculates the card's relative coordinate position on the infinite canvas.
     * 
     * WHY coordinate math accounts for scale and scroll offsets:
     * 1. `(lastClientX - startX) / scale`: Screen pixel changes (clientX/Y) must be normalized by
     *    the zoom `scale` level. Zooming in/out changes the physical size of canvas coordinates
     *    relative to screen-space coordinates. Without this division, movement speeds would drift.
     * 2. `scrollDx/Dy`: Programmable or manual scrolling shifts the coordinate system relative to
     *    the viewport. We calculate the scroll delta from the start of the drag and add it to the position
     *    to keep the card anchored to the mouse pointer.
     * 3. `boundaryW`: Clamps card horizontal coordinates to prevent dragging cards completely out-of-bounds.
     */
    const getCardPos = () => {
      const dx = (lastClientX - startX) / scale;
      const dy = (lastClientY - startY) / scale;
      const scrollDx = (container?.scrollLeft || 0) - origScrollLeft;
      const scrollDy = (container?.scrollTop || 0) - origScrollTop;
      let x = Math.round(origX + dx + scrollDx);
      const y = Math.round(origY + dy + scrollDy);
      if (container) {
        const canvasInner = container.querySelector('.canvas-inner');
        const boundaryW = canvasInner ? canvasInner.clientWidth : container.clientWidth;
        const maxX = Math.max(0, boundaryW - card.width);
        x = Math.max(0, Math.min(x, maxX));
      }
      return { x, y };
    };

    /**
     * Seamless edge-zone auto-scroll loop.
     * 
     * WHY we run autoScrollTick inside requestAnimationFrame:
     * When a user drags a card to the edge of the screen and stops moving the mouse, mousemove events
     * cease firing. An animation frame tick allows the canvas to continue scrolling programmatically
     * and updates the card position smoothly every frame.
     */
    const autoScrollTick = () => {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      let velX = 0, velY = 0;

      // Vertical & horizontal edge zone analysis
      if (lastClientX > rect.right - EDGE_ZONE) {
        velX = lastClientX > rect.right - 30 ? SPEED_FAST : SPEED_SLOW;
      } else if (lastClientX < rect.left + EDGE_ZONE) {
        velX = lastClientX < rect.left + 30 ? -SPEED_FAST : -SPEED_SLOW;
      }
      if (lastClientY > rect.bottom - EDGE_ZONE) {
        velY = lastClientY > rect.bottom - 30 ? SPEED_FAST : SPEED_SLOW;
      } else if (lastClientY < rect.top + EDGE_ZONE) {
        velY = lastClientY < rect.top + 30 ? -SPEED_FAST : -SPEED_SLOW;
      }

      if (velX !== 0 || velY !== 0) {
        container.scrollLeft += velX;
        container.scrollTop += velY;
        const pos = getCardPos();
        onMove(card.id, pos.x, pos.y);
      }
      animFrameId = requestAnimationFrame(autoScrollTick);
    };

    animFrameId = requestAnimationFrame(autoScrollTick);

    const handleMove = (ev: MouseEvent) => {
      hasMoved = true;
      lastClientX = ev.clientX;
      lastClientY = ev.clientY;
      const pos = getCardPos();
      onMove(card.id, pos.x, pos.y);
    };

    const handleUp = () => {
      setDragging(false);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (hasMoved) {
        const pos = getCardPos();
        onDrop(card.id, pos.x, pos.y);
      }
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [card.id, card.x, card.y, card.width, scale, onMove, onDrop, onSelect, readOnly, scrollContainerRef]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = card.width;
    const origH = card.height;

    const handleMove = (ev: MouseEvent) => {
      const dw = (ev.clientX - startX) / scale;
      const dh = (ev.clientY - startY) / scale;
      onResize(card.id, Math.max(180, Math.round(origW + dw)), Math.max(120, Math.round(origH + dh)));
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [card.id, card.width, card.height, scale, onResize]);

  const renderBody = () => {
    if (card.id.startsWith('temp-')) {
      const progressPercent = parseInt(card.content) || 0;
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 16,
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(5px)',
          borderRadius: 8,
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 16,
              height: 16,
              border: '2px solid rgba(0,0,0,0.1)',
              borderTop: '2px solid var(--accent, #6366f1)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Uploading media...</span>
          </div>
          <div style={{
            width: '100%',
            height: 8,
            background: 'rgba(0,0,0,0.1)',
            borderRadius: 4,
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #6366f1, #a855f7)',
              transition: 'width 0.2s ease-out'
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{progressPercent}%</span>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      );
    }

    switch (card.type) {
      case 'link':
        return (
          <div className="card-link-preview">
            <div className="card-body" dangerouslySetInnerHTML={{ __html: card.content || '<p>Link card</p>' }} />
            {card.url && <div className="card-link-url">🔗 {card.url}</div>}
          </div>
        );
      case 'image':
        return (
          <div className="card-image-container" style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
            {card.url ? <img src={resolveMediaUrl(card.url)} alt={card.title} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', display: 'block' }} /> : <div className="card-body" dangerouslySetInnerHTML={{ __html: card.content }} />}
          </div>
        );
      case 'pdf':
        return (
          <div className="card-pdf-container">
            <PdfThumbnail url={resolveMediaUrl(card.url)} title={card.title || 'PDF Document'} />
            <div className="card-pdf-title">{card.title || 'PDF Document'}</div>
            <div className="card-pdf-hint">Double-click to view</div>
          </div>
        );

      case 'article':
        return <div className="card-body" dangerouslySetInnerHTML={{ __html: card.content }} />;
      default: {
        const cleaned = cleanContent(card.content || '');
        const isEmpty = !cleaned || cleaned === '<p></p>' || cleaned === '<p><br></p>';
        return (
          <div
            className={`card-body ${isEmpty ? 'card-body-empty' : ''}`}
            dangerouslySetInnerHTML={{
              __html: !isEmpty ? cleaned : '<p class="card-placeholder-text">Double-click to write...</p>'
            }}
          />
        );
      }
    }
  };

  const posStyle = uniformGrid
    ? {
      position: 'relative' as const,
      left: 'auto',
      top: 'auto',
      width: '100%',
      height: '100%',
      zIndex: card.zIndex ?? 1,
      minHeight: 0,
      backgroundColor: card.color,
    }
    : {
      left: card.x,
      top: card.y,
      width: card.width,
      height: card.height,
      minWidth: 0,
      minHeight: 0,
      zIndex: card.zIndex ?? 1,
      backgroundColor: card.color,
    };

  return (
    <div
      ref={cardRef}
      className={`card${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}${readOnly ? ' card-readonly' : ''}${uniformGrid ? ' card-uniform-grid' : ''}`}
      data-type={card.type}
      style={posStyle}
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e); }}
    >
      <div className="card-header">
        <span className="card-type-icon">{TYPE_EMOJI[card.type] || '📝'}</span>
        <span className="card-title">{card.title || 'Untitled'}</span>
        <button className="card-menu-btn" onClick={(e) => { e.stopPropagation(); onDoubleClick(); }} title="Expand/Edit">
          <Maximize2 size={14} />
        </button>
        <button className="card-menu-btn" onClick={(e) => { e.stopPropagation(); onContextMenu(e); }}>
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Quick color palette — visible on card hover */}
      {!readOnly && (
        <div className="card-color-strip">
          {CARD_COLORS.map(c => (
            <button
              key={c.value}
              className={`card-color-dot${card.color === c.value ? ' active' : ''}`}
              style={{ background: c.value }}
              onClick={(e) => { e.stopPropagation(); onColorChange(card.id, c.value); }}
              title={c.name}
            />
          ))}
        </div>
      )}

      {renderBody()}
      {boardLabel ? <div className="card-board-foot">{boardLabel}</div> : null}
      {!readOnly ? (
        <div className="card-resize-handle" onMouseDown={handleResizeMouseDown}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path d="M14 14L8 14L14 8Z" fill="rgba(0,0,0,0.2)" />
          </svg>
        </div>
      ) : null}
    </div>
  );
}
