/**
 * @file desktopAdapter.ts
 * @description Adapter pattern implementation that decouples the React frontend
 * from the underlying runtime environment (Tauri native wrapper vs. standard Web browser).
 *
 * This design prevents platform-specific leakage into the React component hierarchy.
 * Next.js SSR builds do not fail when referencing native APIs because all native
 * dependencies (e.g., `@tauri-apps/api`) are dynamically loaded inside client-side runtime checks.
 */

import { api } from '@/lib/api';

/**
 * Interface defining the contract for platform-dependent desktop capabilities.
 * Allows core features (like file uploads) to execute natively or fallback to HTTP REST services.
 */
export interface DesktopService {
  /** Returns true if executing inside the Tauri native wrapper */
  isTauri(): boolean;
  /** Uploads a file, returning the static media asset URL on success */
  uploadMedia(file: File, userId: string): Promise<string | null>;
}

/**
 * Tauri-native implementation of DesktopService.
 * Uses Tauri IPC (inter-process communication) to upload media directly via the Rust backend.
 */
class TauriDesktopService implements DesktopService {
  isTauri() { return true; }
  
  async uploadMedia(file: File, userId: string): Promise<string | null> {
    try {
      // DYNAMIC IMPORT CONSTRAINT:
      // Tauri's JS APIs require document/window references which are absent during SSR.
      // Importing lazily on the client thread prevents "window is not defined" build failures.
      const { invoke } = await import('@tauri-apps/api/core');
      
      // Native Rust command 'upload_media' expects byte buffers.
      // Converting File payload to ArrayBuffer and then to a primitive array allows it to serialize cleanly across the IPC bridge.
      const arrayBuffer = await file.arrayBuffer();
      const data = Array.from(new Uint8Array(arrayBuffer));
      
      return await invoke<string>('upload_media', {
        userId,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        data,
      });
    } catch (err) {
      console.error('Tauri native upload failed:', err);
      return null;
    }
  }
}

/**
 * Standard web-browser implementation of DesktopService.
 * Falls back to standard HTTP multipart API requests when Tauri shell is absent.
 */
class WebDesktopService implements DesktopService {
  isTauri() { return false; }
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async uploadMedia(file: File, userId: string): Promise<string | null> {
    try {
      const res = await api.media.upload(file);
      return res.url;
    } catch (err) {
      console.error('Web upload failed:', err);
      return null;
    }
  }
}

/**
 * Platform Factory Method: Resolves the appropriate Service implementation.
 *
 * WebKit/Tauri exposes the protocol scheme `tauri://` and registers a global object
 * `__TAURI_INTERNALS__` in the window scope. We query these identifiers to securely
 * identify the native shell runtime at runtime.
 */
export const getDesktopService = (): DesktopService => {
  const isRunningInTauri = typeof window !== 'undefined' && 
    (window.location.protocol === 'tauri:' || (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined);
    
  return isRunningInTauri ? new TauriDesktopService() : new WebDesktopService();
};
