/**
 * @file index.ts (types)
 * @description Core Domain Types for the Sleekly client and server interactions.
 * Defines elements, whiteboard boards, workspace folders, and the emotional tracking journal entry models.
 */

export type CardType = 'richtext' | 'link' | 'image' | 'pdf' | 'article';

export interface Card {
  id: string;
  boardId: string;
  type: CardType;
  title: string;
  content: string;       // Rich text HTML (contains embedded typography metadata)
  url?: string;
  tags?: string[];
  color: string;
  x: number;             // Absolute X position on the infinite whiteboard grid
  y: number;             // Absolute Y position on the infinite whiteboard grid
  width: number;         // Layout width in pixels
  height: number;        // Layout height in pixels
  zIndex?: number;       // Stacking hierarchy index
  isLocked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Board {
  id: string;
  folderId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Journal ----

export type Mood =
  | 'joyful'
  | 'peaceful'
  | 'grateful'
  | 'content'
  | 'neutral'
  | 'tired'
  | 'anxious'
  | 'sad'
  | 'frustrated';

export interface JournalEntry {
  id: string;
  entry_date: string;        // YYYY-MM-DD
  mood: Mood | null;
  mood_score: number;
  grateful_text: string | null;
  content: string | null;     // TipTap HTML
  long_term_vision: string | null;
  tiny_win: string | null;
  reflection_answers: boolean[];
  tags: string[];
  photo_urls: string[];
  created_at: string;
  updated_at: string;
}

export interface EmotionalHeatmapEntry {
  entry_date: string;
  mood_score: number;
}
