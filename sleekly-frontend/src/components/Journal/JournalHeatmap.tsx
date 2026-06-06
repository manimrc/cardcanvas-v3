'use client';
import { useMemo, useRef, useEffect } from 'react';
import {
  startOfYear,
  endOfYear,
  startOfWeek,
  addDays,
  format,
  getDay,
  differenceInWeeks,
} from 'date-fns';
import type { EmotionalHeatmapEntry } from '@/types';

interface Props {
  year: number;
  data: EmotionalHeatmapEntry[];
  visible: boolean;
}

/**
 * Map mood_score (1–10) to a soft heatmap color.
 * 
 * WHY EMOTIONAL COLOR PALETTE DESIGN CHOICE:
 * Traditional contribution grids (e.g., GitHub) use monochromatic green gradients to represent quantity
 * of work. For emotional tracking, monochromatic colors are poor indicators of qualitative feelings. We map
 * scores to a spectrum reflecting psychological associations:
 * - High (7.0 to 10.0) matches cool, soothing teals and greens representing content, joy, or peaceful states.
 * - Mid (4.0 to 6.9) matches lavender indicating neutral, quiet, or standard tired states.
 * - Low (1.0 to 3.9) matches warning shades like warm ambers and corals reflecting anxiety, sadness, or frustration.
 */
function scoreToColor(score: number): string {
  if (score >= 8.5) return '#66bb9a'; // deep teal — very positive
  if (score >= 7)   return '#81c784'; // green — good
  if (score >= 5.5) return '#a5d6a7'; // light green — content
  if (score >= 4)   return '#ce93d8'; // lavender — neutral/tired
  if (score >= 2.5) return '#ffb74d'; // amber — anxious
  return '#ef9a9a';                   // coral — sad/frustrated
}

export default function JournalHeatmap({ year, data, visible }: Props) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { grid, weekCount } = useMemo(() => {
    const yearStart = startOfYear(new Date(year, 0, 1));
    const yearEnd = endOfYear(yearStart);
    const gridStart = startOfWeek(yearStart, { weekStartsOn: 0 });

    // Build lookup
    const lookup = new Map<string, number>();
    for (const d of data) {
      lookup.set(d.entry_date, d.mood_score);
    }

    const totalWeeks = differenceInWeeks(yearEnd, gridStart) + 2;
    const cells: { date: Date; dateStr: string; score: number | null; weekCol: number; dayRow: number }[] = [];

    let day = gridStart;
    let idx = 0;
    while (day <= yearEnd || idx % 7 !== 0) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const weekCol = Math.floor(idx / 7);
      const dayRow = getDay(day); // 0=Sun
      const score = lookup.get(dateStr) ?? null;
      cells.push({ date: day, dateStr, score, weekCol, dayRow });
      day = addDays(day, 1);
      idx++;
    }

    return { grid: cells, weekCount: totalWeeks };
  }, [year, data]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !visible) return;

    const today = new Date();
    const currentYear = today.getFullYear();

    let targetWeekCol = 0;
    if (year === currentYear) {
      const yearStart = startOfYear(new Date(year, 0, 1));
      const gridStart = startOfWeek(yearStart, { weekStartsOn: 0 });
      const diffWeeks = differenceInWeeks(today, gridStart);
      targetWeekCol = Math.max(0, diffWeeks);
    } else if (year < currentYear) {
      targetWeekCol = weekCount;
    } else {
      targetWeekCol = 0;
    }

    const cellSize = 11;
    const gap = 2;
    const dayLabelWidth = 18;
    const targetX = dayLabelWidth + targetWeekCol * (cellSize + gap) - container.clientWidth / 2;

    const handleScroll = () => {
      container.scrollLeft = Math.max(0, targetX);
    };

    handleScroll();
    const timer = setTimeout(handleScroll, 100);
    return () => clearTimeout(timer);
  }, [year, visible, weekCount]);

  if (!visible) return null;

  const cellSize = 11;
  const gap = 2;
  const dayLabelWidth = 18;
  const svgWidth = dayLabelWidth + weekCount * (cellSize + gap);
  const svgHeight = 7 * (cellSize + gap) + 20;

  const dayLabels = ['', 'Mo', '', 'We', '', 'Fr', ''];

  return (
    <div className="journal-heatmap" id="journal-heatmap">
      <div className="journal-heatmap-title">Emotional Heatmap — {year}</div>
      <div className="journal-heatmap-scroll" ref={scrollContainerRef}>
        <svg width={svgWidth} height={svgHeight} className="journal-heatmap-svg">
          {/* Day labels */}
          {dayLabels.map((label, i) =>
            label ? (
              <text
                key={i}
                x={0}
                y={i * (cellSize + gap) + cellSize - 1}
                className="journal-heatmap-day-label"
              >
                {label}
              </text>
            ) : null,
          )}

          {/* Grid cells */}
          {grid.map(cell => {
            const x = dayLabelWidth + cell.weekCol * (cellSize + gap);
            const y = cell.dayRow * (cellSize + gap);
            const fill = cell.score !== null ? scoreToColor(cell.score) : 'var(--journal-heatmap-empty)';

            return (
              <rect
                key={cell.dateStr}
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                rx={2}
                fill={fill}
                className="journal-heatmap-cell"
              >
                <title>
                  {cell.dateStr}
                  {cell.score !== null ? ` — score: ${cell.score.toFixed(1)}` : ' — no entry'}
                </title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div className="journal-heatmap-legend">
        <span className="journal-heatmap-legend-label">Low</span>
        {['#ef9a9a', '#ffb74d', '#ce93d8', '#a5d6a7', '#81c784', '#66bb9a'].map(c => (
          <span
            key={c}
            className="journal-heatmap-legend-swatch"
            style={{ background: c }}
          />
        ))}
        <span className="journal-heatmap-legend-label">High</span>
      </div>
    </div>
  );
}
