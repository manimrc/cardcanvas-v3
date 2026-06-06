'use client';
import { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Folder, Board } from '@/types';
import type { EmotionalHeatmapEntry } from '@/types';
import FileTree from './FileTree';
import JournalCalendar from '../Journal/JournalCalendar';
import JournalHeatmap from '../Journal/JournalHeatmap';
import { api } from '@/lib/api';
import { PanelLeftClose, LogOut, BarChart3, Folder as FolderIcon, Tag as TagIcon, Presentation, BookOpen } from 'lucide-react';

export type SidebarView = 'workspaces' | 'tags' | 'whiteboard' | 'journal';

interface TagEntry {
  key: string;
  label: string;
}

interface UserInfo {
  id: string;
  username: string;
  displayName: string;
}

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  view: SidebarView;
  onViewChange: (view: SidebarView) => void;
  folders: Folder[];
  boards: Board[];
  activeBoardId: string | null;
  onSelectBoard: (boardId: string) => void;
  onCreateFolder: (parentId: string | null) => void;
  onCreateBoard: (folderId: string) => void;
  onDeleteFolder: (id: string) => void;
  onDeleteBoard: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onRenameBoard: (id: string, name: string) => void;
  globalTagEntries: TagEntry[];
  selectedTagKeys: string[];
  onToggleTagKey: (key: string) => void;
  onClearTagSelection: () => void;
  user?: UserInfo | null;
  onLogout?: () => void;
  // Journal props
  journalDate?: Date;
  onJournalDateChange?: (date: Date) => void;
}

export default function Sidebar(props: Props) {
  const [heatmapVisible, setHeatmapVisible] = useState(false);
  const [heatmapData, setHeatmapData] = useState<EmotionalHeatmapEntry[]>([]);
  const [entryDates, setEntryDates] = useState<Set<string>>(new Set());
  const [entryMoods, setEntryMoods] = useState<Record<string, string>>({});
  const currentYear = new Date().getFullYear();

  /**
   * Calendar Range Hydration:
   * 
   * WHY: Instead of querying all database entries across history which degrades API response times
   * as the user's journal grows, we parse the active calendar date viewport and queries a range limited to the
   * current month (`monthStart` to `monthEnd`). This lets us draw mood color dots on the calendar grid efficiently.
   */
  useEffect(() => {
    if (props.view !== 'journal' || !props.user) return;
    const journalDate = props.journalDate ?? new Date();
    const monthStart = format(startOfMonth(journalDate), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(journalDate), 'yyyy-MM-dd');

    // Fetch entries for the visible month (for calendar dots)
    api.journal.getRange(monthStart, monthEnd)
      .then(entries => {
        const dates = new Set<string>();
        const moods: Record<string, string> = {};
        for (const e of entries) {
          dates.add(e.entry_date);
          if (e.mood) moods[e.entry_date] = e.mood;
        }
        setEntryDates(dates);
        setEntryMoods(moods);
      })
      .catch(err => console.error('Failed to load journal dates:', err));
  }, [props.view, props.user, props.journalDate]);

  /**
   * Heatmap Data Hydration:
   * 
   * WHY: Emotional heatmaps map a user's moods across a 365-day layout. Querying this complete dataset is
   * resource-heavy. We restrict fetching to only run when the user explicitly expands the heatmap view container
   * (`heatmapVisible === true`), implementing an on-demand loading strategy.
   */
  useEffect(() => {
    if (!heatmapVisible || props.view !== 'journal' || !props.user) return;
    api.journal.getHeatmap(currentYear)
      .then(setHeatmapData)
      .catch(err => console.error('Failed to load heatmap:', err));
  }, [heatmapVisible, props.view, props.user, currentYear]);

  return (
    <aside className={`sidebar${props.collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-icon">📋</div>
        <span className="logo">Sleekly</span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="tree-action-btn"
          onClick={props.onToggle}
          title="Collapse sidebar"
          style={{ color: 'var(--text-muted)' }}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="sidebar-mode-tabs">
        <button
          type="button"
          className={`sidebar-mode-tab${props.view === 'workspaces' ? ' active' : ''}`}
          onClick={() => props.onViewChange('workspaces')}
          title="Workspaces"
        >
          <FolderIcon size={14} />
          <span className="sidebar-tab-label">Workspaces</span>
        </button>
        <button
          type="button"
          className={`sidebar-mode-tab${props.view === 'tags' ? ' active' : ''}`}
          onClick={() => props.onViewChange('tags')}
          title="Tags"
        >
          <TagIcon size={14} />
          <span className="sidebar-tab-label">Tags</span>
        </button>
        <button
          type="button"
          className={`sidebar-mode-tab${props.view === 'whiteboard' ? ' active' : ''}`}
          onClick={() => props.onViewChange('whiteboard')}
          title="Whiteboard"
        >
          <Presentation size={14} />
          <span className="sidebar-tab-label">Whiteboard</span>
        </button>
        <button
          type="button"
          className={`sidebar-mode-tab${props.view === 'journal' ? ' active' : ''} sidebar-mode-tab-journal`}
          onClick={() => props.onViewChange('journal')}
          title="Journal"
        >
          <BookOpen size={14} />
          <span className="sidebar-tab-label">Journal</span>
        </button>
      </div>

      {props.view === 'tags' ? (
        <div className="sidebar-content sidebar-tags-panel">
          <div className="sidebar-section-title">Global tags</div>
          {props.globalTagEntries.length === 0 ? (
            <p className="sidebar-tags-empty">No hashtags yet. Add <code>#tags</code> in card text or use tag fields in the editor.</p>
          ) : (
            <>
              <div className="sidebar-tags-cloud">
                {props.globalTagEntries.map(({ key, label }) => {
                  const on = props.selectedTagKeys.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`sidebar-tag-pill${on ? ' selected' : ''}`}
                      onClick={() => props.onToggleTagKey(key)}
                    >
                      #{label}
                    </button>
                  );
                })}
              </div>
              {props.selectedTagKeys.length > 0 && (
                <button type="button" className="sidebar-tags-clear" onClick={props.onClearTagSelection}>
                  Clear selection
                </button>
              )}
            </>
          )}
        </div>
      ) : props.view === 'journal' ? (
        <div className="sidebar-content sidebar-journal-panel">
          <JournalCalendar
            selectedDate={props.journalDate ?? new Date()}
            onSelectDate={d => props.onJournalDateChange?.(d)}
            entryDates={entryDates}
            entryMoods={entryMoods}
          />
          <button
            type="button"
            className="journal-heatmap-toggle"
            onClick={() => setHeatmapVisible(!heatmapVisible)}
          >
            <BarChart3 size={13} />
            {heatmapVisible ? 'Hide' : 'Show'} Emotional Heatmap
          </button>
          <JournalHeatmap
            year={currentYear}
            data={heatmapData}
            visible={heatmapVisible}
          />
        </div>
      ) : props.view === 'whiteboard' ? (
        null
      ) : (
        <div className="sidebar-content">
          <div className="sidebar-section-title">Workspaces</div>
          <FileTree
            folders={props.folders}
            boards={props.boards}
            activeBoardId={props.activeBoardId}
            onSelectBoard={props.onSelectBoard}
            onCreateFolder={props.onCreateFolder}
            onCreateBoard={props.onCreateBoard}
            onDeleteFolder={props.onDeleteFolder}
            onDeleteBoard={props.onDeleteBoard}
            onRenameFolder={props.onRenameFolder}
            onRenameBoard={props.onRenameBoard}
          />
        </div>
      )}

      {/* User section at bottom */}
      {props.user && (
        <div className="sidebar-user-section">
          <div className="sidebar-user-avatar">
            {(props.user.displayName || props.user.username).charAt(0)}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{props.user.displayName}</div>
            <div className="sidebar-user-handle">@{props.user.username}</div>
          </div>
          <button
            type="button"
            className="sidebar-logout-btn"
            title="Sign out"
            onClick={props.onLogout}
          >
            <LogOut size={14} />
          </button>
        </div>
      )}
    </aside>
  );
}

