/**
 * @file ConfirmDialog.tsx
 * @description A generic confirmation dialog modal.
 * 
 * ACCESSIBILITY & SAFETY CONTROLS:
 * 1. **Safety Focus Target**:
 *    Upon mount, the modal automatically targets focus to the 'Cancel' action button (`cancelBtn?.focus()`).
 *    This prevents destructive actions (like card deletions) from being executed if the user is typing
 *    quickly and accidentally presses the Space or Enter key as the dialog pops up.
 * 2. **Global Key Triggers**:
 *    Esc maps to `onCancel()` and Enter maps to `onConfirm()`.
 */

'use client';
import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onConfirm, onCancel]);

  // Auto-focus the cancel button for safety
  useEffect(() => {
    const cancelBtn = dialogRef.current?.querySelector<HTMLButtonElement>('.confirm-dialog-cancel');
    cancelBtn?.focus();
  }, []);

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        onClick={e => e.stopPropagation()}
      >
        <div className="confirm-dialog-header">
          {danger && (
            <div className="confirm-dialog-icon">
              <AlertTriangle size={22} />
            </div>
          )}
          <h3 className="confirm-dialog-title">{title}</h3>
          <button className="confirm-dialog-close" onClick={onCancel}>
            <X size={14} />
          </button>
        </div>
        <p className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`confirm-dialog-confirm${danger ? ' danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
