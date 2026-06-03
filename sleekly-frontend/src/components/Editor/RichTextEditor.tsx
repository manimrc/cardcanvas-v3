'use client';
import {
  useEditor,
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import TiptapImage from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { VoiceNote } from './VoiceNote';

// Singleton lowlight instance with all common languages (JS, TS, Python, SQL,
// YAML, JSON, Bash, Rust, Go, CSS, HTML, Markdown, and ~25 more)
const lowlight = createLowlight(common);
import { Card } from '@/types';
import { CARD_COLORS } from '@/lib/constants';
import { api, resolveMediaUrl } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import { getDesktopService } from '@/lib/desktop/desktopAdapter';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Code, AlignLeft, AlignCenter, AlignRight,
  Highlighter, X, Undo, Redo,
  BookOpen, Minimize2, Table as TableIcon, Mic,
  Pencil, Check, Tag, ZoomIn, ZoomOut, Maximize2
} from 'lucide-react';

/** Heuristic: does this clipboard text look like markdown? */
function looksLikeMarkdown(text: string): boolean {
  return (
    /^#{1,6}\s/m.test(text) ||           // headings
    /^\|.+\|/m.test(text) ||             // tables
    /^```/m.test(text) ||                // code fences
    /^>\s/m.test(text) ||               // blockquotes
    /^[-*+]\s/m.test(text) ||           // unordered lists
    /^\d+\.\s/m.test(text) ||          // ordered lists
    /\*\*.+\*\*/.test(text) ||          // bold
    /`.+`/.test(text) ||                 // inline code
    /^---+$/m.test(text)                 // horizontal rule
  );
}

/** Convert markdown text → HTML via marked (loaded lazily) */
async function markdownToHtml(md: string): Promise<string> {
  const { marked } = await import('marked');
  marked.setOptions({ gfm: true, breaks: false });
  return marked(md) as string;
}

interface Props {
  card: Card;
  mode?: 'preview' | 'edit';
  onSave: (card: Partial<Card>) => void;
  onClose: () => void;
}

function ResizableImageView({ node, selected, updateAttributes }: NodeViewProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const width = node.attrs.width ? Number(node.attrs.width) : undefined;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX;
    const startWidth = rect.width;

    const handleMove = (ev: MouseEvent) => {
      const nextWidth = Math.max(80, Math.round(startWidth + ev.clientX - startX));
      updateAttributes({ width: nextWidth });
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [updateAttributes]);

  return (
    <NodeViewWrapper
      as="span"
      style={{
        display: 'inline-block',
        position: 'relative',
        maxWidth: '100%',
        lineHeight: 0,
        outline: selected ? '2px solid var(--accent)' : 'none',
        borderRadius: 6,
      }}
    >
      <img
        ref={imageRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        title={node.attrs.title || undefined}
        style={{
          width: width ? `${width}px` : undefined,
          maxWidth: '100%',
          height: 'auto',
          display: 'block',
          borderRadius: 6,
        }}
        draggable={false}
      />
      <button
        type="button"
        aria-label="Resize image"
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          right: -6,
          bottom: -6,
          width: 14,
          height: 14,
          border: '1px solid var(--border)',
          borderRadius: 4,
          background: 'var(--bg-secondary)',
          cursor: 'nwse-resize',
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        }}
      />
    </NodeViewWrapper>
  );
}

const ResizableImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: element => element.getAttribute('width') || element.style.width.replace('px', '') || null,
        renderHTML: attributes => attributes.width ? { width: attributes.width } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

function cleanContent(content: string): string {
  if (!content) return '';
  let cleaned = content;
  
  // Resolve relative media paths in Tauri for the editor
  const isTauri = typeof window !== 'undefined' && 
    (window.location.protocol === 'tauri:' || (window as any).__TAURI_INTERNALS__ !== undefined);
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

export default function RichTextEditor({ card, mode = 'preview', onSave, onClose }: Props) {
  const { user } = useAuth();

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    if (!file || !user) return null;
    try {
      return await getDesktopService().uploadMedia(file, user.id);
    } catch (err) {
      console.error('Upload failed', err);
      return null;
    }
  }, [user]);

  const [title, setTitle] = useState(card.title);
  const [color, setColor] = useState(card.color);
  const [url, setUrl] = useState(card.url || '');
  const [tagsInput, setTagsInput] = useState((card.tags || []).join(', '));
  const [contentUpdated, setContentUpdated] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [isEditing, setIsEditing] = useState(true);
  const [headings, setHeadings] = useState<{ id: string; text: string; level: number; pos: number }[]>([]);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);


  const editor = useEditor({
    extensions: [
      // Disable StarterKit's plain CodeBlock — CodeBlockLowlight takes over
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Underline,
      ResizableImage,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder: 'Start typing...',
        emptyNodeClass: 'is-editor-empty',
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      VoiceNote,
    ],
    content: cleanContent(card.content || ''),
    immediatelyRender: false,
    onUpdate: () => {
      setContentUpdated(Date.now());
    },
    editorProps: {
      attributes: { class: 'tiptap' },
      handlePaste: (view, event) => {
        // Image file paste → upload to local store
        const file = Array.from(event.clipboardData?.files || []).find(f => f.type.startsWith('image/'));
        if (file && user) {
          event.preventDefault();
          void uploadFile(file).then(src => {
            if (!src) return;
            const { state, dispatch } = view;
            const node = state.schema.nodes.image?.create({ src });
            if (node) dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
          });
          return true;
        }
        // Markdown text paste is handled by the useEffect DOM listener below
        return false;
      },
      handleDrop: (view, event) => {
        const file = Array.from(event.dataTransfer?.files || []).find(f => f.type.startsWith('image/'));
        if (!file || !user) return false;
        event.preventDefault();
        void uploadFile(file).then(src => {
          if (!src) return;
          const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const node = view.state.schema.nodes.image?.create({ src });
          if (coordinates && node) {
            view.dispatch(view.state.tr.insert(coordinates.pos, node).scrollIntoView());
          }
        });
        return true;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;

    const updateHeadings = () => {
      const list: typeof headings = [];
      editor.state.doc.descendants((node: any, pos: number) => {
        if (node.type.name === 'heading') {
          list.push({
            id: `heading-${pos}`,
            text: node.textContent || 'Untitled Section',
            level: node.attrs.level,
            pos,
          });
        }
      });
      setHeadings(list);
    };

    updateHeadings();

    editor.on('update', updateHeadings);
    return () => {
      editor.off('update', updateHeadings);
    };
  }, [editor]);

  const scrollToHeading = useCallback((pos: number) => {
    if (!editor) return;
    editor.commands.setTextSelection(pos);
    editor.commands.focus();
    const domNode = editor.view.nodeDOM(pos);
    if (domNode instanceof HTMLElement) {
      domNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [editor]);

  const handleImageMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoomScale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  }, [zoomScale, panOffset]);

  const handleImageMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const nextX = e.clientX - dragStart.current.x;
    const nextY = e.clientY - dragStart.current.y;
    setPanOffset({ x: nextX, y: nextY });
  }, [isDragging]);

  const handleImageMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoomScale(prev => Math.min(prev + 0.25, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomScale(prev => {
      const next = Math.max(prev - 0.25, 1);
      if (next === 1) {
        setPanOffset({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handleImageDoubleClick = useCallback(() => {
    if (zoomScale > 1) {
      handleZoomReset();
    } else {
      setZoomScale(2);
    }
  }, [zoomScale, handleZoomReset]);

  // Dynamically update handlePaste and handleDrop to prevent stale closure bugs in useEditor
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        handlePaste: (view, event) => {
          const file = Array.from(event.clipboardData?.files || []).find(f => f.type.startsWith('image/'));
          if (file && user) {
            event.preventDefault();
            void uploadFile(file).then(src => {
              if (!src) return;
              const { state, dispatch } = view;
              const node = state.schema.nodes.image?.create({ src });
              if (node) dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
            });
            return true;
          }
          return false;
        },
        handleDrop: (view, event) => {
          const file = Array.from(event.dataTransfer?.files || []).find(f => f.type.startsWith('image/'));
          if (!file || !user) return false;
          event.preventDefault();
          void uploadFile(file).then(src => {
            if (!src) return;
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            const node = view.state.schema.nodes.image?.create({ src });
            if (coordinates && node) {
              view.dispatch(view.state.tr.insert(coordinates.pos, node).scrollIntoView());
            }
          });
          return true;
        },
      },
    });
  }, [editor, user, uploadFile]);

  // Markdown paste: attach native DOM listener on the editor element so we
  // have direct access to both the clipboard text AND the TipTap editor instance.
  useEffect(() => {
    if (!editor) return;
    const editorEl = editor.view.dom;
    const onPaste = (e: ClipboardEvent) => {
      // Skip if image file is present (handled by editorProps.handlePaste above)
      const hasImageFile = Array.from(e.clipboardData?.files || []).some(f => f.type.startsWith('image/'));
      if (hasImageFile) return;

      const text = e.clipboardData?.getData('text/plain') || '';
      if (!text || !looksLikeMarkdown(text)) return;

      e.preventDefault();
      e.stopPropagation();

      void markdownToHtml(text).then(html => {
        editor.chain().focus().insertContent(html).run();
      });
    };
    // Use capture so it fires before ProseMirror's own paste handler
    editorEl.addEventListener('paste', onPaste, true);
    return () => editorEl.removeEventListener('paste', onPaste, true);
  }, [editor]);

  // Toggle editor editability based on isEditing state
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(isEditing);
  }, [editor, isEditing]);


  const toggleFocusMode = useCallback(() => {
    if (!focusMode) {
      // Enter focus mode: make editor read-only + browser fullscreen
      editor?.setEditable(false);
      overlayRef.current?.requestFullscreen?.().catch(() => {});
      setFocusMode(true);
    } else {
      // Exit focus mode: restore editing + exit browser fullscreen
      editor?.setEditable(true);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      setFocusMode(false);
    }
  }, [focusMode, editor]);

  // Sync state when user exits fullscreen via Escape (browser native)
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && focusMode) {
        editor?.setEditable(true);
        setFocusMode(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [focusMode, editor]);

  const autoSave = useCallback(() => {
    const parsedTags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    let newContent = editor?.getHTML() || '';
    
    // Strip absolute base URL from media paths for database portability
    const apiBase = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080') : 'http://localhost:8080';
    const regex = new RegExp(`src="${apiBase.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}/api/media/files/`, 'g');
    newContent = newContent.replace(regex, 'src="/api/media/files/');
    
    const hasChanges = 
      title !== card.title ||
      color !== card.color ||
      url !== (card.url || '') ||
      tagsInput !== (card.tags || []).join(', ') ||
      newContent !== (card.content || '');

    if (hasChanges) {
      onSave({
        id: card.id,
        title,
        content: newContent,
        color,
        url,
        tags: parsedTags,
      });
    }
  }, [card, title, color, url, tagsInput, editor, onSave]);

  const toggleEditMode = useCallback(() => {
    if (isEditing) {
      // Leaving edit mode → auto-save
      autoSave();
    }
    setIsEditing(prev => !prev);
  }, [isEditing, autoSave]);

  const handleClose = useCallback(() => {
    autoSave();
    onClose();
  }, [autoSave, onClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      autoSave();
    }, 1000);
    return () => clearTimeout(timer);
  }, [title, color, url, tagsInput, contentUpdated, autoSave]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (focusMode) {
          // Fullscreen exit is handled by fullscreenchange listener
          return;
        }
        handleClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        autoSave();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [autoSave, handleClose, focusMode]);



  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const newUrl = await uploadFile(file);
    if (newUrl) {
      setUrl(newUrl);
    }
  };



  if (!editor) return null;



  // ---- Focus / Zen reading mode ----
  if (focusMode) {
    return (
      <div ref={overlayRef} className="focus-mode-overlay">
        <div className="focus-mode-container">
          <div className="focus-mode-header">
            <h1 className="focus-mode-title">{title || 'Untitled'}</h1>
            <button
              type="button"
              className="focus-mode-exit-btn"
              onClick={toggleFocusMode}
              title="Exit focus mode"
            >
              <Minimize2 size={18} />
            </button>
          </div>
          <div className="focus-mode-content">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'preview' && (card.type === 'image' || card.type === 'pdf') && url) {
    return (
      <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.9)', zIndex: 100000 }} onClick={handleClose}>
        <button 
          onClick={handleClose}
          style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 100001 }}
        >
          <X size={24} />
        </button>
        <div style={{ width: '90vw', height: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
          {card.type === 'pdf' ? (
            <iframe src={`${resolveMediaUrl(url)}#view=FitH&pagemode=thumbs`} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8, background: '#fff' }} title={title} />
          ) : (
            <div 
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                cursor: zoomScale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
              }}
              onMouseDown={handleImageMouseDown}
              onMouseMove={handleImageMouseMove}
              onMouseUp={handleImageMouseUp}
              onMouseLeave={handleImageMouseUp}
            >
              <img
                src={resolveMediaUrl(url)}
                alt={title}
                onDoubleClick={handleImageDoubleClick}
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                  transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  borderRadius: 8,
                  userSelect: 'none',
                  pointerEvents: 'none'
                }}
                draggable={false}
              />
              
              <div className="image-zoom-controls" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                <button
                  type="button"
                  className="zoom-control-btn"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                >
                  <ZoomOut size={16} />
                </button>
                
                <span className="zoom-percentage">
                  {Math.round(zoomScale * 100)}%
                </span>
                
                <button
                  type="button"
                  className="zoom-control-btn"
                  onClick={handleZoomIn}
                  title="Zoom In"
                >
                  <ZoomIn size={16} />
                </button>
                
                {zoomScale !== 1 && (
                  <>
                    <div className="zoom-control-divider" />
                    <button
                      type="button"
                      className="zoom-control-btn"
                      onClick={handleZoomReset}
                      title="Fit to Screen"
                    >
                      <Maximize2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'edit' && (card.type === 'image' || card.type === 'pdf')) {
    return (
      <div ref={overlayRef} className="modal-overlay" onClick={handleClose}>
        <div
          className="editor-modal"
          style={{ width: 'min(560px, calc(100vw - 32px))', maxHeight: 'none', borderRadius: 12 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="editor-modal-header">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Card title..."
            />
            <div className="editor-top-actions">
              <button className="editor-close-btn" onClick={handleClose}><X size={16} /></button>
            </div>
          </div>

          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            <div className="editor-top-color-picker" style={{ justifyContent: 'flex-start' }}>
              {CARD_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  className={`editor-top-color-dot${color === c.value ? ' active' : ''}`}
                  style={{ background: c.value }}
                  onClick={() => setColor(c.value)}
                  title={c.name}
                />
              ))}
            </div>

            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              {card.type === 'image' ? 'IMAGE URL' : 'PDF URL'}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="inline-input"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://... or upload a file"
                />
                <label className="editor-save-btn" style={{ cursor: 'pointer', padding: '8px 12px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}>
                  Upload
                  <input type="file" style={{ display: 'none' }} accept={card.type === 'image' ? 'image/*' : 'application/pdf'} onChange={handleFileUpload} />
                </label>
              </div>
            </label>

            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              TAGS
              <input
                className="inline-input"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="e.g. urgent, research, draft"
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  // Parse tags for display
  const parsedTagsForDisplay = tagsInput
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  return (
    <div ref={overlayRef} className="modal-overlay" onClick={handleClose}>
      <div className="editor-modal" onClick={e => e.stopPropagation()}>
        {/* ---- Compact Header Bar ---- */}
        <div className="editor-modal-header">
          <div className="editor-top-color-picker">
            {CARD_COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                className={`editor-top-color-dot${color === c.value ? ' active' : ''}`}
                style={{ background: c.value }}
                onClick={() => setColor(c.value)}
                title={c.name}
              />
            ))}
          </div>
          <div className="header-spacer" />

          <button
            className="editor-top-action-btn focus-mode-btn"
            onClick={toggleFocusMode}
            title="Focus mode — distraction-free reading"
          >
            <BookOpen size={14} />
          </button>
          <button className="editor-close-btn" onClick={handleClose}><X size={16} /></button>
        </div>

        {/* ---- Formatting Toolbar (Edit Mode Only) ---- */}
        {isEditing && (
          <div className="editor-toolbar">
            <button className={`editor-toolbar-btn${editor.isActive('bold') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></button>
            <button className={`editor-toolbar-btn${editor.isActive('italic') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></button>
            <button className={`editor-toolbar-btn${editor.isActive('underline') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></button>
            <button className={`editor-toolbar-btn${editor.isActive('strike') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></button>
            <button className={`editor-toolbar-btn${editor.isActive('highlight') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHighlight().run()}><Highlighter size={15} /></button>
            <div className="editor-toolbar-divider" />
            <button className={`editor-toolbar-btn${editor.isActive('heading', { level: 1 }) ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></button>
            <button className={`editor-toolbar-btn${editor.isActive('heading', { level: 2 }) ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></button>
            <button className={`editor-toolbar-btn${editor.isActive('heading', { level: 3 }) ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={15} /></button>
            <div className="editor-toolbar-divider" />
            <button className={`editor-toolbar-btn${editor.isActive('bulletList') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={15} /></button>
            <button className={`editor-toolbar-btn${editor.isActive('orderedList') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></button>
            <button className={`editor-toolbar-btn${editor.isActive('blockquote') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={15} /></button>
            <button className={`editor-toolbar-btn${editor.isActive('codeBlock') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code size={15} /></button>
            <div className="editor-toolbar-divider" />
            <button
              className="editor-toolbar-btn"
              onClick={() => {
                if (editor && user) {
                  editor.chain().focus().insertContent({
                    type: 'voiceNote',
                    attrs: { src: '', duration: '00:00', userId: user.id }
                  }).run();
                }
              }}
              title="Insert voice note reflection"
            >
              <Mic size={15} />
            </button>
            <button className="editor-toolbar-btn" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert table"><TableIcon size={15} /></button>
            <div className="editor-toolbar-divider" />
            <button className={`editor-toolbar-btn${editor.isActive({ textAlign: 'left' }) ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft size={15} /></button>
            <button className={`editor-toolbar-btn${editor.isActive({ textAlign: 'center' }) ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={15} /></button>
            <button className={`editor-toolbar-btn${editor.isActive({ textAlign: 'right' }) ? ' active' : ''}`} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight size={15} /></button>
            <div className="editor-toolbar-divider" />
            <button className="editor-toolbar-btn" onClick={() => editor.chain().focus().undo().run()}><Undo size={15} /></button>
            <button className="editor-toolbar-btn" onClick={() => editor.chain().focus().redo().run()}><Redo size={15} /></button>
          </div>
        )}

        {/* ---- Page Body ---- */}
        <div className="editor-modal-body">
          <div className="editor-content" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div className="editor-readable-column">
              {/* URL row for non-richtext cards */}
              {card.type !== 'richtext' && isEditing && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {card.type === 'image' ? 'Image URL' : card.type === 'pdf' ? 'PDF URL' : card.type === 'link' ? 'Link URL' : 'Source URL'}
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="inline-input"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      placeholder="https://... or upload a file"
                    />
                    {(card.type === 'image' || card.type === 'pdf') && (
                      <label className="editor-save-btn" style={{ cursor: 'pointer', padding: '6px 12px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}>
                        Upload
                        <input type="file" style={{ display: 'none' }} accept={card.type === 'image' ? 'image/*' : 'application/pdf'} onChange={handleFileUpload} />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Title */}
              {isEditing ? (
                <input
                  className="doc-title-input"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Untitled"
                />
              ) : (
                <h1 className="doc-title-display">{title || 'Untitled'}</h1>
              )}

              {/* Tags */}
              <div className="doc-tags-container">
                <Tag size={14} className="doc-tags-icon" />
                <input
                  className="doc-tags-input"
                  value={tagsInput}
                  onChange={e => setTagsInput(e.target.value)}
                  placeholder="Add tags separated by commas..."
                />
              </div>

              {/* Editor Content */}
              <EditorContent editor={editor} />
            </div>
          </div>

          {/* ---- Table of Contents Sidebar ---- */}
          <div className="editor-toc-sidebar">
            <div className="toc-title">Outline</div>
            {headings.length === 0 ? (
              <div className="toc-empty">No headings yet. Use H1, H2, or H3 to structure your note.</div>
            ) : (
              <div className="toc-list">
                {headings.map(h => (
                  <button
                    key={h.id}
                    className={`toc-item level-${h.level}`}
                    onClick={() => scrollToHeading(h.pos)}
                    title={h.text}
                  >
                    {h.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
