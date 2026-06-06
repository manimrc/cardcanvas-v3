'use client';
import { useState, useMemo, useCallback } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  /** Set of YYYY-MM-DD strings that have journal entries */
  entryDates: Set<string>;
  /** Map of YYYY-MM-DD → mood string for dot coloring */
  entryMoods?: Record<string, string>;
}

const MOOD_DOT_COLORS: Record<string, string> = {
  joyful: '#f6c343',
  peaceful: '#7ec8b8',
  grateful: '#81c784',
  content: '#b39ddb',
  neutral: '#bdbdbd',
  tired: '#90a4ae',
  anxious: '#ffb74d',
  sad: '#64b5f6',
  frustrated: '#ef9a9a',
};

export default function JournalCalendar({
  selectedDate,
  onSelectDate,
  entryDates,
  entryMoods = {},
}: Props) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(selectedDate));

  /**
   * Calendar Grid Builder:
   * 
   * WHY: Standard calendar views require full 7-day rows. If a month starts on a Wednesday, the preceding
   * Sunday through Tuesday must be drawn as offsets from the previous month to fill the first row.
   * `startOfWeek` and `endOfWeek` calculate the exact calendar padding offsets, yielding a complete 35-to-42 day
   * array that forms a continuous layout grid.
   */
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const start = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
    const end = endOfWeek(monthEnd, { weekStartsOn: 0 });       // Saturday end

    const result: Date[] = [];
    let day = start;
    while (day <= end) {
      result.push(day);
      day = addDays(day, 1);
    }
    return result;
  }, [currentMonth]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentMonth(startOfMonth(today));
    onSelectDate(today);
  }, [onSelectDate]);

  return (
    <div className="journal-calendar" id="journal-calendar">
      <div className="journal-cal-header">
        <button
          type="button"
          className="journal-cal-nav"
          onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
          title="Previous month"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="journal-cal-month">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <button
          type="button"
          className="journal-cal-nav"
          onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
          title="Next month"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="journal-cal-weekdays">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="journal-cal-weekday">{d}</div>
        ))}
      </div>

      <div className="journal-cal-grid">
        {days.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const inMonth = isSameMonth(day, currentMonth);
          const isSelected = isSameDay(day, selectedDate);
          const hasEntry = entryDates.has(dateStr);
          const mood = entryMoods[dateStr];
          const dotColor = mood ? MOOD_DOT_COLORS[mood] || '#bdbdbd' : '#bdbdbd';

          return (
            <button
              key={i}
              type="button"
              className={[
                'journal-cal-day',
                !inMonth && 'outside',
                isSelected && 'selected',
                isToday(day) && 'today',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                onSelectDate(day);
                if (!isSameMonth(day, currentMonth)) {
                  setCurrentMonth(startOfMonth(day));
                }
              }}
            >
              <span className="journal-cal-day-num">{format(day, 'd')}</span>
              {hasEntry && (
                <span
                  className="journal-cal-dot"
                  style={{ background: dotColor }}
                />
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="journal-cal-today-btn"
        onClick={goToToday}
      >
        Today
      </button>
    </div>
  );
}
