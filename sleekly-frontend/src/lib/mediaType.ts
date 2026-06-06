/**
 * @file mediaType.ts
 * @description Infers media types (image, PDF, web link) from filename extensions or MIME headers.
 */

export type MediaKind = 'image' | 'pdf' | 'link';

/**
 * Resolves a URL/Path string to determine the target asset type.
 * 
 * WHY:
 * Files uploaded to Tauri or external web servers may lack explicit metadata. By checking both MIME hints
 * (from network upload responses) and filename patterns, we determine whether to mount standard images,
 * render PDF vector page thumbnails via PDF.js, or fallback to an standard clickable web link preview.
 */
export function inferMediaType(url: string, mimeHint?: string): MediaKind {
  if (mimeHint) {
    if (mimeHint.startsWith('image/')) return 'image';
    if (mimeHint === 'application/pdf') return 'pdf';
  }
  const path = url.split('?')[0].toLowerCase();
  if (/\.(jpe?g|gif|png|webp|svg|bmp|ico)$/.test(path)) return 'image';
  if (/\.pdf$/i.test(path)) return 'pdf';
  const t = url.trim();
  if (/^https?:\/\//i.test(t)) return 'link';
  if (t.startsWith('media://') || t.startsWith('asset://')) {
    if (mimeHint?.includes('pdf')) return 'pdf';
    if (mimeHint?.startsWith('image/')) return 'image';
    return 'image';
  }
  return 'link';
}
