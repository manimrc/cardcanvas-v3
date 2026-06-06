/**
 * @file collision.ts
 * @description Coordinate collision resolution library for whiteboard canvas cards.
 * 
 * ALGORITHMS & IMPLEMENTATION DETAILS:
 * 1. **Axis-Aligned Bounding Box (AABB)**:
 *    To detect overlap between two elements, we perform a standard 2D projection check. If the projection
 *    of both boxes on either axis (X or Y) does not overlap, the shapes cannot intersect.
 * 2. **Overlap Resolution Strategy**:
 *    When a card is dropped directly onto another element:
 *    - We first test simple horizontal/vertical directional shifts. Checking these single-axis offsets is
 *      computationally cheap (O(N) checks) and matches general human layout preferences (stacking cards row-by-row
 *      or column-by-column).
 *    - If all simple single-axis directions are occupied, we switch to a spiral-outward radial search to locate
 *      the nearest empty coordinate quadrant.
 */

import type { Card } from '@/types';

const GAP = 10; // Default spatial gap in pixels maintained between adjacent elements

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 
 * Returns true if two rectangles intersect, accounting for a spatial buffer gap.
 * Uses the AABB projection intersection algorithm.
 */
export function rectsOverlap(a: Rect, b: Rect, gap = GAP): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

/** 
 * Evaluates whether a rectangle overlaps with any card in the collection.
 * Often used to check validity of resize actions and placement drops.
 */
export function hasOverlap(
  rect: Rect,
  cards: Card[],
  excludeId?: string,
  gap = GAP
): boolean {
  return cards.some(
    c => c.id !== excludeId && rectsOverlap(rect, c, gap)
  );
}

/** 
 * Computes the closest coordinate point where the card can reside without overlapping neighbors.
 * Scans directional vectors (Right, Down, Left, Up) before executing a spiral grid sweep.
 */
export function findNonOverlappingPosition(
  cardId: string,
  proposedX: number,
  proposedY: number,
  width: number,
  height: number,
  allCards: Card[],
  gap = GAP
): { x: number; y: number } {
  const rect: Rect = { x: proposedX, y: proposedY, width, height };

  if (!hasOverlap(rect, allCards, cardId, gap)) {
    return { x: proposedX, y: proposedY };
  }

  const STEP = 10;
  const MAX_TRIES = 60; // Caps computational steps to prevent browser thread locking on crowded whiteboards

  // Try right
  for (let i = 1; i <= MAX_TRIES; i++) {
    const x = proposedX + i * STEP;
    if (!hasOverlap({ ...rect, x }, allCards, cardId, gap)) {
      return { x, y: proposedY };
    }
  }

  // Try down
  for (let i = 1; i <= MAX_TRIES; i++) {
    const y = proposedY + i * STEP;
    if (!hasOverlap({ ...rect, y }, allCards, cardId, gap)) {
      return { x: proposedX, y };
    }
  }

  // Try left
  for (let i = 1; i <= MAX_TRIES; i++) {
    const x = proposedX - i * STEP;
    if (x < 0) break;
    if (!hasOverlap({ ...rect, x }, allCards, cardId, gap)) {
      return { x, y: proposedY };
    }
  }

  // Try up
  for (let i = 1; i <= MAX_TRIES; i++) {
    const y = proposedY - i * STEP;
    if (y < 0) break;
    if (!hasOverlap({ ...rect, y }, allCards, cardId, gap)) {
      return { x: proposedX, y };
    }
  }

  // Spiral outward
  for (let radius = 1; radius <= MAX_TRIES; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = proposedX + dx * STEP;
        const y = proposedY + dy * STEP;
        if (x < 0 || y < 0) continue;
        if (!hasOverlap({ x, y, width, height }, allCards, cardId, gap)) {
          return { x, y };
        }
      }
    }
  }

  return { x: proposedX, y: proposedY };
}
