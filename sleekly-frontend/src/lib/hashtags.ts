/**
 * @file hashtags.ts
 * @description Whiteboard-wide hashtag scanning and text filtering helper functions.
 */

import type { Card } from '@/types';

/** 
 * Strips HTML elements to yield a unified space-separated plain text string for scanning.
 * 
 * WHY: TipTap contents are stored as HTML structures (like `<p>hello <strong>world</strong></p>`).
 * Scanning tags across raw HTML would match words embedded inside attributes (e.g. `<a href="#link">`)
 * resulting in false positive hashtags. Stripping guarantees we only match text visible to the end user.
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extracts and lowercases unique hashtag tokens from structural metadata tags, titles, and body content.
 * 
 * REGEX DESIGN CHOICE:
 * `/#([\w\u00C0-\u024F-]+)/gi`
 * Instead of standard word-boundary patterns (`\w+`) which fail on accented or international text,
 * this pattern covers basic alphanumerics (`\w`) combined with Latin accented blocks (`\u00C0-\u024F`)
 * to prevent hashtags in non-English languages from being truncated.
 */
export function extractHashtagKeys(card: Card): Set<string> {
  const keys = new Set<string>();
  for (const t of card.tags || []) {
    const raw = String(t).replace(/^#/, '').trim();
    if (raw) keys.add(raw.toLowerCase());
  }
  const text = `${card.title || ''} ${stripHtml(card.content || '')}`;
  const re = /#([\w\u00C0-\u024F-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) keys.add(m[1].toLowerCase());
  }
  return keys;
}

export function collectGlobalTagEntries(cards: Card[]): { key: string; label: string }[] {
  const order: string[] = [];
  const keyToLabel = new Map<string, string>();

  for (const card of cards) {
    const text = `${card.title || ''} ${stripHtml(card.content || '')}`;
    const re = /#([\w\u00C0-\u024F-]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[1];
      const key = raw.toLowerCase();
      if (!keyToLabel.has(key)) {
        keyToLabel.set(key, raw);
        order.push(key);
      }
    }
    for (const t of card.tags || []) {
      const raw = String(t).replace(/^#/, '').trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!keyToLabel.has(key)) {
        keyToLabel.set(key, raw);
        order.push(key);
      }
    }
  }
  return order.map(key => ({ key, label: keyToLabel.get(key)! }));
}

/** Card matches tag filter: no selection = all; with multiple tags, card must include every selected tag (AND). */
export function cardMatchesSelectedTags(card: Card, selectedKeys: string[]): boolean {
  if (selectedKeys.length === 0) return true;
  const keys = extractHashtagKeys(card);
  return selectedKeys.every(s => keys.has(s.toLowerCase()));
}
