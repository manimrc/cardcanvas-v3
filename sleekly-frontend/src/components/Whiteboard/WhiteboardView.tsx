/**
 * @file WhiteboardView.tsx
 * @description Integrates the Excalidraw graphic whiteboard editor into Sleekly.
 * 
 * ARCHITECTURAL DESIGN BOUNDARIES:
 * 1. **Dynamic Client-Side Only Mounting (ssr: false)**:
 *    Excalidraw relies heavily on browser DOM capabilities (WebGL/Canvas drawing contexts, browser key
 *    event hooks, and layout dimensions). Attempting to pre-compile this library inside Next.js Node.js
 *    server-side renderer would result in server building failures (reference errors on `window` or `document`).
 *    We lazy-load the component via `next/dynamic` with `ssr: false` to guarantee execution strictly inside client viewports.
 * 2. **Reference-Based Event Callback Forwarding**:
 *    Because the dynamic import creates a decoupled rendering wrapper, passing raw state-dependent callbacks directly
 *    often triggers excessive unmount/remount cycles. We hook the change callback through a mutable reference
 *    (`onChangeRef`), allowing Excalidraw to dispatch modifications without resetting component layouts.
 */

'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthContext';
import type { AppState, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';

type WhiteboardScene = ExcalidrawInitialDataState;

const ExcalidrawWrapper = dynamic(
  () => import('@excalidraw/excalidraw').then((mod) => {
    const { Excalidraw } = mod;
    return function ExcalidrawComponent(props: {
      initialData: WhiteboardScene | null;
      onChangeRef: React.MutableRefObject<((elements: readonly ExcalidrawElement[], appState: AppState) => void) | null>;
      theme: string;
    }) {
      return (
        <Excalidraw
          initialData={props.initialData || undefined}
          onChange={(elements, appState) => { props.onChangeRef.current?.(elements, appState); }}
          theme={props.theme as 'light' | 'dark'}
          UIOptions={{ canvasActions: { loadScene: false } }}
        />
      );
    };
  }),
  { ssr: false, loading: () => <div className="whiteboard-loading">Loading whiteboard…</div> }
);

import '@excalidraw/excalidraw/index.css';

const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export default function WhiteboardView({ isLightMode, boardId = 'global' }: { isLightMode?: boolean; boardId?: string }) {
  const { user } = useAuth();
  const [initialData, setInitialData] = useState<WhiteboardScene | null>(null);
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef<((elements: readonly ExcalidrawElement[], appState: AppState) => void) | null>(null);

  const saveContent = useCallback(async (elements: readonly ExcalidrawElement[], appState: AppState) => {
    if (!user || !isUuid(boardId)) return;
    try {
      await api.whiteboard.update(boardId, elements, { viewBackgroundColor: appState.viewBackgroundColor });
    } catch (err) {
      console.error('Failed to save whiteboard:', err);
    }
  }, [user, boardId]);

  useEffect(() => {
    onChangeRef.current = (elements, appState) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => { void saveContent(elements, appState); }, 2000);
    };
  }, [saveContent]);

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (!user) return;
    let cancelled = false;
    setLoaded(false);
    setInitialData(null);

    if (!isUuid(boardId)) {
      setInitialData({ elements: [], appState: {} });
      setLoaded(true);
      return;
    }

    api.whiteboard.get(boardId)
      .then(data => {
        if (cancelled) return;
        try {
          const elements = (data.elements || []) as readonly ExcalidrawElement[];
          const appState = (data.appState || {}) as ExcalidrawInitialDataState['appState'];
          setInitialData({ elements, appState });
        } catch {
          setInitialData({ elements: [], appState: {} });
        }
        setLoaded(true);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to load whiteboard:', err);
        setInitialData({ elements: [], appState: {} });
        setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user, boardId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (!loaded) {
    return (
      <div className="whiteboard-view">
        <div className="whiteboard-loading">Loading whiteboard…</div>
      </div>
    );
  }

  return (
    <div className="whiteboard-view">
      <div className="excalidraw-container">
        <ExcalidrawWrapper
          initialData={initialData}
          onChangeRef={onChangeRef}
          theme={isLightMode ? 'light' : 'dark'}
        />
      </div>
    </div>
  );
}
