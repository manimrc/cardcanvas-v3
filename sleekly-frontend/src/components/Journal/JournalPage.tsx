'use client';
import { useCallback, useRef, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Camera, X } from 'lucide-react';
import { api, resolveMediaUrl } from '@/lib/api';
import MoodSelector from './MoodSelector';
import ReflectionQuestions from './ReflectionQuestions';
import JournalTodoList, { type TodoItem } from './JournalTodoList';
import type { JournalEntry, Mood } from '@/types';

const COZY_ILLUSTRATIONS = [
  'undraw_astronomy_ied1.svg',
  'undraw_biking_m4mb.svg',
  'undraw_blooming_g9e9.svg',
  'undraw_book-lover_m9n3.svg',
  'undraw_book-reading_i0eb.svg',
  'undraw_camping_q4ji.svg',
  'undraw_compose-music_9403.svg',
  'undraw_counting-stars_1fur.svg',
  'undraw_eco-conscious_oqny.svg',
  'undraw_friends_xscy.svg',
  'undraw_gardening_jck1.svg',
  'undraw_hang-out_rxuc.svg',
  'undraw_hiking_9zta.svg',
  'undraw_into-the-night_nd84.svg',
  'undraw_landscape-photographer_e84n.svg',
  'undraw_living_9un5.svg',
  'undraw_making-art_c05m.svg',
  'undraw_meditation_k4oa.svg',
  'undraw_nature_yf30.svg',
  'undraw_petting_xclp.svg',
  'undraw_quality-time_h2b9.svg',
  'undraw_refreshing-beverage_w8al.svg',
  'undraw_relaxed-reading_wfkr.svg',
  'undraw_relaxing-outdoors_s653.svg',
  'undraw_ride-a-bicycle_oozn.svg',
  'undraw_trip_rh66.svg',
  'undraw_vacation-selfie_q5bs.svg',
  'undraw_walking_2vhy.svg',
  'undraw_yoga_i399.svg'
];

const PASTEL_COLORS = [
  "#FDF6EC", // Warm Cream
  "#FFF5F0", // Peach Blush
  "#FFFDF0", // Creamy Yellow
  "#FAF6F0", // Warm White
  "#EDF4F9", // Misty Blue
  "#ECE9F7", // Soft Lavender
  "#E6EEF4", // Soft Blue-Gray
  "#FFF6EE", // Warm Almond
  "#EDF3F0", // Soft Sage Tint
  "#FFF6F8", // Blush Pink
  "#F6F3FC", // Soft Violet
  "#F1F7F2", // Soft Green Tint
  "#E8F5E9", // Light Mint
  "#FAF4FF", // Soft Lilac
  "#E0F2F1", // Pale Teal
  "#FFF3F3", // Soft Rose Tint
  "#FCF6FC"  // Soft Lavender-Pink
];


// Curated list of famous motivational quotes
const MOTIVATIONAL_QUOTES = [
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Act as if what you do makes a difference. It does.", author: "William James" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "The best way to predict the future is to create it.", author: "Abraham Lincoln" },
  { text: "You must be the change you wish to see in the world.", author: "Mahatma Gandhi" },
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "Keep your face always toward the sunshine—and shadows will fall behind you.", author: "Walt Whitman" },
  { text: "Happiness depends upon ourselves.", author: "Aristotle" },
  { text: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs" },
  { text: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
  { text: "Nothing is impossible, the word itself says 'I'm possible'!", author: "Audrey Hepburn" },
  { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
  { text: "Change your thoughts and you change your world.", author: "Norman Vincent Peale" },
  { text: "Be present in all things and thankful for all things.", author: "Maya Angelou" },
  { text: "Let the beauty of what you love be what you do.", author: "Rumi" },
  { text: "Yesterday is history, tomorrow is a mystery, today is a gift of God, which is why we call it the present.", author: "Bil Keane" },
  { text: "The only true wisdom is in knowing you know nothing.", author: "Socrates" },
  { text: "The power of imagination makes us infinite.", author: "John Muir" },
  { text: "The journey of a thousand miles begins with one step.", author: "Lao Tzu" },
  { text: "To love and be loved is to feel the sun from both sides.", author: "David Viscott" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
  { text: "I attribute my success to this: I never gave or took any excuse.", author: "Florence Nightingale" },
  { text: "Every strike brings me closer to the next home run.", author: "Babe Ruth" },
  { text: "Life is what happens to you while you're busy making other plans.", author: "John Lennon" },
  { text: "We become what we think about.", author: "Earl Nightingale" },
  { text: "An unexamined life is not worth living.", author: "Socrates" }
];

const getQuoteForDate = (d: Date) => {
  // Compute day of year to deterministically select a quote
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime() + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60000;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const index = Math.abs(dayOfYear) % MOTIVATIONAL_QUOTES.length;
  return MOTIVATIONAL_QUOTES[index];
};

interface Props {
  date: Date;
  entry: JournalEntry | null;
  onSave: (data: Partial<JournalEntry>) => void;
}

export default function JournalPage({ date, entry, onSave }: Props) {
  const [mood, setMood] = useState<Mood | null>(entry?.mood ?? null);
  const [gratefulText, setGratefulText] = useState(entry?.grateful_text ?? '');
  const [longTermVision, setLongTermVision] = useState(entry?.long_term_vision ?? '');
  const [tinyWin, setTinyWin] = useState(entry?.tiny_win ?? '');
  const [reflections, setReflections] = useState<boolean[]>(entry?.reflection_answers ?? [false, false, false, false, false, false]);
  const [photos, setPhotos] = useState<string[]>(entry?.photo_urls ?? []);
  const [todos, setTodos] = useState<TodoItem[]>(() => {
    if (!entry?.content) return [];
    try {
      const parsed = JSON.parse(entry.content);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fallback if legacy content is non-JSON
    }
    return [];
  });

  // Comfort Photo (Left Slot) persistent state
  const [comfortPhoto, setComfortPhoto] = useState<string>('');
  const [uploadingComfort, setUploadingComfort] = useState<boolean>(false);
  const comfortFileInput = useRef<HTMLInputElement>(null);

  // Load persistent states on client mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPhoto = localStorage.getItem('sleekly_comfort_photo');
      if (savedPhoto) setComfortPhoto(savedPhoto);
    }
  }, []);

  // 4-hour intervals (6 times a day) to automatically rotate illustrations
  const [currentInterval, setCurrentInterval] = useState(0);

  useEffect(() => {
    // Set initial interval on mount
    setCurrentInterval(Math.floor(new Date().getHours() / 4));

    const timer = setInterval(() => {
      const interval = Math.floor(new Date().getHours() / 4);
      setCurrentInterval(prev => {
        if (interval !== prev) {
          return interval;
        }
        return prev;
      });
    }, 60000); // Check once a minute
    return () => clearInterval(timer);
  }, []);

  const handleComfortPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingComfort(true);
    try {
      const result = await api.media.upload(file);
      setComfortPhoto(result.url);
      if (typeof window !== 'undefined') {
        localStorage.setItem('sleekly_comfort_photo', result.url);
      }
    } catch (err) {
      console.error('Comfort photo upload failed:', err);
    } finally {
      setUploadingComfort(false);
    }
  };

  const removeComfortPhoto = () => {
    setComfortPhoto('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sleekly_comfort_photo');
    }
  };

  // Sync state if entry prop changes (e.g. user loaded a different day)
  useEffect(() => {
    setMood(entry?.mood ?? null);
    setGratefulText(entry?.grateful_text ?? '');
    setLongTermVision(entry?.long_term_vision ?? '');
    setTinyWin(entry?.tiny_win ?? '');
    setReflections(entry?.reflection_answers ?? [false, false, false, false, false, false]);
    setPhotos(entry?.photo_urls ?? []);

    let parsedTodos: TodoItem[] = [];
    if (entry?.content) {
      try {
        const parsed = JSON.parse(entry.content);
        if (Array.isArray(parsed)) {
          parsedTodos = parsed;
        }
      } catch {
        // Fallback
      }
    }
    setTodos(parsedTodos);
  }, [entry]);

  /**
   * Ref-based State Mirroring:
   * 
   * WHY: Since state updates trigger frequently as the user types, we save updates in a 1.5s debounced loop.
   * If the asynchronous save callback accessed React state variables directly, JavaScript closures would capture
   * stale values from when the timeout was created. By keeping a mutable React reference object (`stateRef.current`)
   * updated on every render, the save function always reads the most current user inputs when the timeout fires.
   */
  const stateRef = useRef({ mood, gratefulText, todos, longTermVision, tinyWin, reflections, photos });
  stateRef.current = { mood, gratefulText, todos, longTermVision, tinyWin, reflections, photos };

  const hasUnsavedChanges = useRef(false);

  // Debounced save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerSave = useCallback(() => {
    hasUnsavedChanges.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      hasUnsavedChanges.current = false;
      const current = stateRef.current;
      onSave({
        mood: current.mood,
        grateful_text: current.gratefulText,
        content: JSON.stringify(current.todos),
        long_term_vision: current.longTermVision,
        tiny_win: current.tinyWin,
        reflection_answers: current.reflections,
        photo_urls: current.photos,
      });
    }, 1500); // 1.5 seconds debounce threshold to prevent server write bottlenecks
  }, [onSave]);

  /**
   * Safe Component Unmount Flush:
   * 
   * WHY: If the component unmounts (e.g. user navigates away or logs out) while the debounce timer
   * is active, changes would normally be lost. This hook detects if unsaved modifications exist,
   * cancels the active timer, and immediately writes the changes to the database.
   */
  useEffect(() => {
    return () => {
      if (hasUnsavedChanges.current) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const current = stateRef.current;
        onSave({
          mood: current.mood,
          grateful_text: current.gratefulText,
          content: JSON.stringify(current.todos),
          long_term_vision: current.longTermVision,
          tiny_win: current.tinyWin,
          reflection_answers: current.reflections,
          photo_urls: current.photos,
        });
      }
    };
  }, [onSave]);

  // Specific state update helpers
  const updateMood = (m: Mood) => {
    setMood(m);
    // Execute save quickly for immediate mood score calculation on backend
    setTimeout(() => triggerSave(), 50);
  };
  const updateGrateful = (v: string) => {
    setGratefulText(v);
    triggerSave();
  };
  const updateVision = (v: string) => {
    setLongTermVision(v);
    triggerSave();
  };
  const updateWin = (v: string) => {
    setTinyWin(v);
    triggerSave();
  };
  const updateReflections = (a: boolean[]) => {
    setReflections(a);
    setTimeout(() => triggerSave(), 50);
  };
  const updateTodos = (updated: TodoItem[]) => {
    setTodos(updated);
    triggerSave();
  };



  const dayName = format(date, 'EEEE');
  const dateDisplay = format(date, 'MMMM d, yyyy').replace(', ', ',');
  const quote = getQuoteForDate(date);

  const getIllustrationHashForDate = (d: Date, interval: number) => {
    return Math.abs(d.getDate() + d.getMonth() * 31 + d.getFullYear() + interval * 73);
  };

  const illustrationHash = getIllustrationHashForDate(date, currentInterval);
  const illustrationName = COZY_ILLUSTRATIONS[illustrationHash % COZY_ILLUSTRATIONS.length];
  const illustrationBgColor = PASTEL_COLORS[illustrationHash % PASTEL_COLORS.length];

  return (
    <div className="journal-page" id="journal-page">
      <div className="journal-page-scroll">
        <div className="journal-page-inner">

          {/* Topmost header: Date & Quotes */}
          <div className="journal-card journal-card-neutral journal-header-quote">
            <div className="journal-page-date">
              <div className="journal-page-day">{dayName},</div>
              <div className="journal-page-datestr">{dateDisplay}</div>
            </div>
            <div className="journal-quote-center">
              <span className="journal-quote-text">&ldquo;{quote.text}&rdquo;</span>
              <span className="journal-quote-author"> &mdash; {quote.author}</span>
            </div>
          </div>

          {/* Top row: Grateful + Photos */}
          <div className="journal-top-row">
            {/* Grateful section (2/3 width) */}
            <div className="journal-card journal-card-green">
              <div className="journal-card-title">Im grateful for ... 🌸</div>
              <textarea
                className="journal-textarea"
                placeholder="What made you smile today…"
                value={gratefulText}
                onChange={e => updateGrateful(e.target.value)}
                rows={3}
                id="journal-grateful"
              />
            </div>

            {/* Comfort Photo + Cozy Illustration Slots */}
            <div className="journal-photos" id="journal-photos">
              {/* Left Slot: Comfort Photo (Persistent across all journal pages) */}
              <div className="journal-photo-slot">
                {comfortPhoto ? (
                  <div className="journal-photo-filled">
                    <img src={resolveMediaUrl(comfortPhoto)} alt="Comfort Memory" className="journal-photo-img" />
                    <button
                      type="button"
                      className="journal-photo-remove"
                      onClick={removeComfortPhoto}
                      title="Remove comfort photo"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="journal-photo-empty"
                    onClick={() => comfortFileInput.current?.click()}
                    disabled={uploadingComfort}
                  >
                    {uploadingComfort ? (
                      <span className="journal-photo-uploading">uploading…</span>
                    ) : (
                      <>
                        <Camera size={18} />
                        <span className="comfort-photo-placeholder-text">
                          your comfort memory... 💖<br/>(pet, family, peaceful place)
                        </span>
                      </>
                    )}
                  </button>
                )}
                <input
                  ref={comfortFileInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleComfortPhotoUpload}
                />
              </div>

              {/* Right Slot: Cozy Illustration (Deterministic by Selected Date) */}
              <div className="journal-photo-slot">
                <div className="cozy-illustration-container" style={{ backgroundColor: illustrationBgColor }}>
                  <img
                    src={`/illustrations/${illustrationName}`}
                    alt="Cozy life moment"
                    className="cozy-illustration-img"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      padding: '16px',
                      userSelect: 'none',
                      pointerEvents: 'none'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>


          {/* Middle Layout: Todo checklist (left) + Column container (right) */}
          <div className="journal-middle-layout">
            
            {/* Left Column: To-Do Section (Blue Card) */}
            <div className="journal-card journal-card-blue journal-todo-card-wrap">
              <div className="journal-card-title">To-do 📝</div>
              <JournalTodoList todos={todos} onChange={updateTodos} />
            </div>

            {/* Right Column: Long-Term Vision + Daily Reflections + Mood Selector */}
            <div className="journal-right-column">
              
              {/* My Long-Term Vision (Pink Card) */}
              <div className="journal-card journal-card-pink journal-flex-card">
                <div className="journal-card-title">My future goals : 🌟</div>
                <textarea
                  className="journal-textarea journal-flex-textarea"
                  placeholder="Where do you see yourself…"
                  value={longTermVision}
                  onChange={e => updateVision(e.target.value)}
                  id="journal-vision"
                />
              </div>

              {/* Daily Reflection Section (Neutral Card) */}
              <div className="journal-card journal-card-neutral journal-flex-card">
                <div className="journal-card-title">Daily Reflection 🪞</div>
                <ReflectionQuestions answers={reflections} onChange={updateReflections} />
              </div>

              {/* Mood Selector (Yellow Card inside component) */}
              <MoodSelector selected={mood} onChange={updateMood} />

            </div>
          </div>

          {/* Bottom row: Tiny Win (Purple Card) */}
          <div className="journal-card journal-card-pinkbar">
            <input
              className="journal-tinywin-input"
              placeholder="My tiny win of the day ✨ …"
              value={tinyWin}
              onChange={e => updateWin(e.target.value)}
              id="journal-tiny-win"
            />
          </div>

        </div>
      </div>
    </div>
  );
}
