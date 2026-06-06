/**
 * @file ContextMenu.tsx
 * @description A floating context menu dropdown positioning itself at mouse-click coordinates (X, Y).
 * Implements a click-outside observer hook to automatically close the menu when clicking elsewhere.
 */

'use client';
import { useEffect, useRef } from 'react';

interface MenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div ref={ref} className="context-menu" style={{ left: x, top: y }}>
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="context-menu-divider" />
        ) : (
          <button
            key={i}
            className={`context-menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
            onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
            disabled={item.disabled}
          >
            {item.icon && <span>{item.icon}</span>}
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
