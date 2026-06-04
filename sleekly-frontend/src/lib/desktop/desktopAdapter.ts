import { api } from '@/lib/api';

export interface DesktopService {
  isTauri(): boolean;
  uploadMedia(file: File, userId: string): Promise<string | null>;
}

class TauriDesktopService implements DesktopService {
  isTauri() { return true; }
  
  async uploadMedia(file: File, userId: string): Promise<string | null> {
    try {
      // Dynamic import prevents server-side resolution failures during 'next build'
      const { invoke } = await import('@tauri-apps/api/core');
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
 * Returns the active platform service instance.
 * Uses official Tauri window properties to accurately identify Tauri shell contexts.
 */
export const getDesktopService = (): DesktopService => {
  const isRunningInTauri = typeof window !== 'undefined' && 
    (window.location.protocol === 'tauri:' || (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined);
    
  return isRunningInTauri ? new TauriDesktopService() : new WebDesktopService();
};
