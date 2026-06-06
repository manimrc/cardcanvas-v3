/**
 * @file api.ts
 * @description Centralized HTTP request client interfacing the Next.js React frontend
 * with the native Rust backend service.
 * 
 * DESIGN ARCHITECTURE & ROUTING RULES:
 * 1. **Tauri Protocol Network Routing Overrides**:
 *    In browser view environments, pages are loaded from the same hostname as the backend, allowing relative path
 *    requests (e.g. `/api/...`) to resolve successfully.
 *    In Tauri desktop environments, pages are loaded from a custom `tauri:` asset protocol. Under this protocol,
 *    relative path network calls would incorrectly target the local frontend assets server.
 *    To route network calls correctly, we detect if the client protocol matches `tauri:` or if Tauri internals are
 *    injected, and override the request target with the explicit backend server URI (`http://localhost:8080`).
 * 2. **Session Cookie Synchronization**:
 *    Instead of storing access tokens (JWTs) in insecure client storage (like LocalStorage) which is vulnerable to XSS,
 *    the Rust backend issues HttpOnly cookie-based session headers. We define `credentials: 'include'` on all fetches
 *    to instruct the browser/webview layout engines to attach these session credentials automatically with each call.
 */

const BASE_URL = typeof window !== 'undefined'
  ? ((window.location.protocol === 'tauri:' || (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined)
      ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080')
      : '')
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080');

/**
 * Shared fetch wrapper routing requests, injecting default JSON headers, and checking response codes.
 */
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include', // Mandated for HttpOnly session cookie verification
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  // 204 No Content handling prevents JSON parsing empty response strings
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---- Auth ----

export const api = {
  auth: {
    register: (username: string, password: string, displayName?: string) =>
      request<{ user: { id: string; username: string; displayName: string }; recoveryCode?: string }>(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({ username, password, display_name: displayName }),
        }
      ),

    login: (username: string, password: string) =>
      request<{ id: string; username: string; displayName: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        }
      ),

    logout: () =>
      request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),

    me: () =>
      request<{ id: string; username: string; displayName: string }>('/api/auth/me'),

    resetPassword: (username: string, recovery_code: string, new_password: string) =>
      request<{ success: boolean }>('/api/auth/reset', {
        method: 'POST',
        body: JSON.stringify({ username, recovery_code, new_password }),
      }),
  },

  // ---- Workspace ----

  workspace: {
    tree: () =>
      request<{ folders: import('@/types').Folder[]; boards: import('@/types').Board[] }>(
        '/api/workspace/tree'
      ),

    createFolder: (name: string) =>
      request<import('@/types').Folder>('/api/workspace/folders', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),

    renameFolder: (id: string, name: string) =>
      request<{ success: boolean }>(`/api/workspace/folders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),

    deleteFolder: (id: string) =>
      request<{ success: boolean }>(`/api/workspace/folders/${id}`, {
        method: 'DELETE',
      }),

    createBoard: (name: string, folderId?: string | null) =>
      request<import('@/types').Board>('/api/workspace/boards', {
        method: 'POST',
        body: JSON.stringify({ name, folder_id: folderId ?? null }),
      }),

    renameBoard: (id: string, name: string, folderId?: string | null) =>
      request<{ success: boolean }>(`/api/workspace/boards/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, folder_id: folderId ?? null }),
      }),

    deleteBoard: (id: string) =>
      request<{ success: boolean }>(`/api/workspace/boards/${id}`, {
        method: 'DELETE',
      }),
  },

  // ---- Cards ----

  cards: {
    list: (boardId?: string) =>
      request<import('@/types').Card[]>(
        `/api/cards${boardId ? `?boardId=${boardId}` : ''}`
      ),

    listAll: () => request<import('@/types').Card[]>('/api/cards/all'),

    create: (card: Partial<import('@/types').Card> & { board_id: string; type: string; x: number; y: number; is_locked?: boolean }) =>
      request<import('@/types').Card>('/api/cards', {
        method: 'POST',
        body: JSON.stringify(card),
      }),

    update: (id: string, data: Partial<import('@/types').Card> & { board_id?: string; is_locked?: boolean }) =>
      request<import('@/types').Card>(`/api/cards/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<{ success: boolean }>(`/api/cards/${id}`, { method: 'DELETE' }),
  },

  // ---- Whiteboard ----

  whiteboard: {
    get: (boardId: string) =>
      request<{ elements: unknown[]; appState: Record<string, unknown> }>(
        `/api/whiteboard/${boardId}`
      ),

    update: (boardId: string, elements: unknown, appState: unknown) =>
      request<{ success: boolean }>(`/api/whiteboard/${boardId}`, {
        method: 'PUT',
        body: JSON.stringify({ elements, app_state: appState }),
      }),
  },

  // ---- Media ----

  media: {
    upload: (
      file: File,
      onProgress?: (percent: number) => void
    ): Promise<{ url: string; mimeType: string }> => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BASE_URL}/api/media/upload`);
        xhr.withCredentials = true;

        if (onProgress) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              onProgress(percent);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              resolve(res);
            } catch {
              reject(new Error('Invalid response JSON'));
            }
          } else {
            let errorMsg = 'Upload failed';
            try {
              const err = JSON.parse(xhr.responseText);
              errorMsg = err.error || errorMsg;
            } catch {
              // Ignore parse error, use default errorMsg
            }
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = () => reject(new Error('Network error'));

        const formData = new FormData();
        formData.append('file', file);
        xhr.send(formData);
      });
    },
  },

  // ---- Journal ----

  journal: {
    getEntry: (date: string) =>
      request<import('@/types').JournalEntry | null>(`/api/journal/${date}`),

    saveEntry: (date: string, data: Partial<import('@/types').JournalEntry>) =>
      request<import('@/types').JournalEntry>(`/api/journal/${date}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    deleteEntry: (date: string) =>
      request<{ success: boolean }>(`/api/journal/${date}`, { method: 'DELETE' }),

    getRange: (start: string, end: string) =>
      request<import('@/types').JournalEntry[]>(
        `/api/journal/range?start=${start}&end=${end}`
      ),

    getHeatmap: (year: number) =>
      request<import('@/types').EmotionalHeatmapEntry[]>(
        `/api/journal/heatmap/${year}`
      ),
  },
};

export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const isTauri = typeof window !== 'undefined' && 
    (window.location.protocol === 'tauri:' || (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined);
  if (isTauri) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    return `${apiBase}${url}`;
  }
  return url;
}
