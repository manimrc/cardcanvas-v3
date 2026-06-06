/**
 * @file AddMediaModal.tsx
 * @description Dialog modal handling media addition (images, PDFs, web links) to the canvas.
 * Implements a dual-upload model supporting local computer uploads, web link references,
 * as well as direct drag-and-drop drops and clipboard copy-paste event intercepts.
 */

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Clipboard, Link2 } from 'lucide-react';
import { api, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import { inferMediaType } from '@/lib/mediaType';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (url: string, uploadMime?: string) => void;
}

export default function AddMediaModal({ open, onClose, onConfirm }: Props) {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadMime, setUploadMime] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setUrl('');
    setPreview(null);
    setUploadMime(undefined);
    setProgress(0);
  }, []);

  // Set keyboard focus inside modal boundary on load to trap tab navigation
  useEffect(() => {
    if (!open) { reset(); return; }
    const t = setTimeout(() => panelRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, reset]);

  /**
   * Verifies mime-type matches board capability (images and PDFs) and sends a multipart request to the Rust media store.
   */
  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file || !user) return;

    const kind = inferMediaType(file.name, file.type);
    if (kind !== 'image' && kind !== 'pdf') {
      alert('Unsupported file type. Only images and PDFs are supported.');
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const result = await api.media.upload(file, (p) => setProgress(p));
      setUrl(result.url);
      setUploadMime(result.mimeType);
      setPreview(result.url);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  }, [user]);

  /**
   * Clipboard paste interceptor:
   * Parses clipboard payload items. If a file payload exists (e.g. copied screen snapshot),
   * it initiates local asset upload. If an HTTP address is pasted, it populates the URL text field.
   */
  const handleClipboardData = useCallback(
    async (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain')?.trim();
      const file = e.clipboardData?.files?.[0];
      if (file) { e.preventDefault(); await handleFile(file); return; }
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (it.kind === 'file') {
            const f = it.getAsFile();
            if (f) { e.preventDefault(); await handleFile(f); return; }
          }
        }
      }
      if (text && /^https?:\/\//i.test(text)) {
        e.preventDefault();
        setUrl(text);
        setUploadMime(undefined);
        setPreview(inferMediaType(text) === 'image' ? text : null);
      }
    },
    [handleFile]
  );

  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => { void handleClipboardData(e); };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, handleClipboardData]);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await handleFile(e.dataTransfer.files?.[0]);
  }, [handleFile]);

  const submit = () => {
    const u = url.trim();
    if (!u) return;
    onConfirm(u, uploadMime);
    reset();
    onClose();
  };

  const kind = preview || url.trim() ? inferMediaType(url.trim() || preview || '', uploadMime) : null;

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-media-title"
        tabIndex={-1}
        className="editor-modal add-media-modal"
        onClick={e => e.stopPropagation()}
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
      >
        <h3 id="add-media-title" className="add-media-title">Add MEDIA</h3>

        <div className="add-media-preview">
          {uploading ? (
            <div className="add-media-preview-empty" style={{ gap: 12 }}>
              <span className="auth-spinner" />
              <span>Uploading {progress}%…</span>
              <div style={{ width: 140, height: 6, background: 'rgba(0,0,0,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent, #6366f1)', transition: 'width 0.1s ease-out' }} />
              </div>
            </div>
          ) : preview && kind === 'image' ? (
            <img src={resolveMediaUrl(preview)} alt="" className="add-media-preview-img" />
          ) : preview && kind === 'pdf' ? (
            <div className="add-media-preview-pdf">
              <span className="add-media-preview-pdf-icon">📄</span>
              <span>PDF ready to add</span>
            </div>

          ) : url.trim() && kind === 'link' ? (
            <div className="add-media-preview-link">
              <Link2 size={22} />
              <span className="add-media-preview-link-url">
                {url.trim().slice(0, 80)}{url.trim().length > 80 ? '…' : ''}
              </span>
            </div>
          ) : (
            <div className="add-media-preview-empty">
              <Clipboard size={20} />
              <span>Paste image, PDF, or a link — or upload a file</span>
            </div>
          )}
        </div>

        <input
          className="inline-input add-media-url-input"
          placeholder="Paste URL here…"
          value={url}
          onChange={e => {
            const v = e.target.value;
            setUrl(v);
            setUploadMime(undefined);
            const t = v.trim();
            if (t && inferMediaType(t) === 'image') setPreview(t);
            else if (!t) setPreview(null);
          }}
        />

        <div className="add-media-or">OR</div>

        <button type="button" className="editor-save-btn add-media-upload-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload size={16} /> Upload file from computer
        </button>
        <input ref={fileInputRef} type="file" hidden accept="image/*,application/pdf,.pdf" onChange={e => void handleFile(e.target.files?.[0])} />

        <div className="add-media-actions">
          <button type="button" className="editor-save-btn add-media-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="editor-save-btn" onClick={submit} disabled={!url.trim() || uploading}>Add to Board</button>
        </div>
      </div>
    </div>
  );
}
