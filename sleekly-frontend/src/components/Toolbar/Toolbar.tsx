/**
 * @file Toolbar.tsx
 * @description Whiteboard action control header.
 * Consolidates card creation triggers, workspace renaming inputs, global card text searches,
 * and application color theme (light/dark mode) toggles.
 */

'use client';
import {
  Type, FileText, Search,
  PanelLeft, Moon, Sun
} from 'lucide-react';

export type ToolbarMode = 'workspace' | 'tags';

interface Props {
  mode?: ToolbarMode;
  boardName: string;
  onBoardNameChange: (name: string) => void;
  onToggleSidebar: () => void;
  onAddCard?: (type: 'richtext' | 'media') => void;
  isLightMode?: boolean;
  onToggleTheme?: () => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export default function Toolbar({
  mode = 'workspace',
  boardName, onBoardNameChange, onToggleSidebar,
  onAddCard, isLightMode, onToggleTheme,
  searchQuery, onSearchChange
}: Props) {
  const tagsMode = mode === 'tags';
  return (
    <div className="toolbar">
      <button type="button" className="toolbar-btn" onClick={onToggleSidebar} title="Toggle Sidebar">
        <PanelLeft size={15} />
      </button>
      <div className="toolbar-divider" />
      {tagsMode ? (
        <div className="toolbar-tags-title" title="All boards">
          Tags · all boards
        </div>
      ) : (
        <input
          className="board-name"
          value={boardName}
          onChange={e => onBoardNameChange(e.target.value)}
          placeholder="Board name..."
        />
      )}
      {!tagsMode && (
        <>
          <div className="toolbar-divider" />
          <button type="button" className="toolbar-btn" onClick={() => onAddCard?.('richtext')} title="Add Rich Text Card">
            <Type size={14} /> Text
          </button>
          <button type="button" className="toolbar-btn" onClick={() => onAddCard?.('media')} title="Add Link, Image, or PDF">
            <FileText size={14} /> Add Media
          </button>
        </>
      )}
      <div className="toolbar-divider" />
      <div className="toolbar-search-wrap">
        <Search size={14} color="var(--text-muted)" style={{ marginRight: 6, flexShrink: 0 }} />
        <input
          className="toolbar-search-input"
          placeholder="Search cards..."
          value={searchQuery || ''}
          onChange={e => onSearchChange?.(e.target.value)}
        />
      </div>
      <div className="toolbar-spacer" />
      <button type="button" className="toolbar-btn" onClick={onToggleTheme} title="Toggle Theme">
        {isLightMode ? <Moon size={14} /> : <Sun size={14} />}
      </button>

    </div>
  );
}
