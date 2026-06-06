/**
 * @file cardExport.ts
 * @description Sleekly's absolute export pipeline that transforms editor text records into
 * standardized PNG, HTML, and Markdown representations.
 * 
 * DESIGN CONSTRAINTS & WORKAROUNDS:
 * 1. **Lazy Loading of External Libraries**:
 *    To ensure fast app bundle boots, heavy third-party parsing dependencies (like `html-to-image` and `turndown`)
 *    are loaded on-demand via dynamic imports (`await import(...)`) only when the user triggers an export,
 *    reducing initial JavaScript footprint.
 * 2. **Print/PDF Sandbox Restrictions**:
 *    Tauri's secure system webview sandboxes (WKWebView/WebView2) restrict cross-frame document injection
 *    and programmatic iframe printing. To provide high-fidelity vector representations, Sleekly supports clean PNG
 *    snapshots and raw HTML packages instead of relying on unreliable webview system printing dialogs.
 */

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Normalizes input text into a filesystem-safe alphanumeric string, replacing spaces
 * and special characters with underscores to prevent OS download path errors.
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'document';
}

/**
 * Triggers a browser file download by building a temporary Object URL blob envelope
 * and programmatically clicking an anchor element. Revokes the URL after 1 second to avoid memory leaks.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Style Metadata Parser ─────────────────────────────────────────

interface StyleMeta {
  font: 'sans' | 'serif' | 'mono';
  size: 'small' | 'normal' | 'large';
  spacing: 'tight' | 'normal' | 'relaxed';
}

/**
 * Extracts typography metadata stored as an invisible HTML comment within the database record.
 * 
 * WHY: This isolates design styles from actual content, allowing editors to read/write custom typography
 * choices (sans/serif/mono) without database schema modifications.
 */
function parseStyleMeta(content: string) {
  const match = content.match(/<!-- sleekly-style: (\{.*?\}) -->/);
  let font: StyleMeta['font'] = 'sans';
  let size: StyleMeta['size'] = 'normal';
  let spacing: StyleMeta['spacing'] = 'normal';
  let cleanHtml = content;

  if (match) {
    try {
      const meta: Partial<StyleMeta> = JSON.parse(match[1]);
      if (meta.font === 'sans' || meta.font === 'serif' || meta.font === 'mono') font = meta.font;
      if (meta.size === 'small' || meta.size === 'normal' || meta.size === 'large') size = meta.size;
      if (meta.spacing === 'tight' || meta.spacing === 'normal' || meta.spacing === 'relaxed') spacing = meta.spacing;
      cleanHtml = content.replace(match[0], '');
    } catch { /* ignore parse errors */ }
  }

  return { font, size, spacing, cleanHtml };
}

// ─── Export Theme CSS ───────────────────────────────────────────────
// Self-contained light theme that mirrors the editor's styling exactly.

const EXPORT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.85;
    color: #1d1d1f;
    background: #ffffff;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-feature-settings: 'kern' 1, 'liga' 1;
    text-rendering: optimizeLegibility;
  }

  .export-root {
    max-width: 740px;
    margin: 0 auto;
    padding: 48px 40px 72px;
  }

  /* ── Title ── */
  .export-title {
    font-size: 32px;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.25;
    color: #0f0f1a;
    margin-bottom: 8px;
  }

  .export-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .export-tag {
    display: inline-block; font-size: 11px; font-weight: 500;
    color: #6366f1; background: #eef2ff; padding: 2px 10px;
    border-radius: 12px; letter-spacing: 0.02em;
  }

  .export-divider {
    border: none; border-top: 1.5px solid #e5e7eb; margin: 20px 0 28px;
  }

  /* ── Typography — matches .editor-content .tiptap exactly ── */
  h1 { font-size: 28px; font-weight: 800; margin: 1.4em 0 0.5em; letter-spacing: -0.025em; line-height: 1.3; color: #1d1d1f; }
  h2 { font-size: 22px; font-weight: 700; margin: 1.2em 0 0.4em; letter-spacing: -0.015em; line-height: 1.35; }
  h3 { font-size: 18px; font-weight: 600; margin: 1em 0 0.35em; letter-spacing: -0.01em; line-height: 1.4; }
  p { margin-bottom: 0.85em; }
  a { color: #6366f1; text-decoration: underline; text-underline-offset: 2px; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  u { text-decoration: underline; text-underline-offset: 2px; }
  s, del { text-decoration: line-through; color: #9ca3af; }

  /* ── Lists ── */
  ul, ol { padding-left: 1.6em; margin-bottom: 0.85em; }
  li { margin-bottom: 4px; line-height: 1.75; }

  /* ── Task Lists ── */
  ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px; }
  ul[data-type="taskList"] li>label { flex-shrink: 0; margin-top: 3px; }
  ul[data-type="taskList"] li>label input[type="checkbox"] { width: 15px; height: 15px; accent-color: #6366f1; }
  ul[data-type="taskList"] li>div { flex: 1; }
  ul[data-type="taskList"] li[data-checked="true"]>div { text-decoration: line-through; color: #9ca3af; }

  /* ── Blockquote ── */
  blockquote {
    border-left: 4px solid #6366f1; padding: 10px 16px; margin: 14px 0;
    color: #4b5563; background: #f8f9ff; border-radius: 0 6px 6px 0; font-style: italic;
  }
  blockquote p { margin-bottom: 0.4em; }

  /* ── Horizontal Rule ── */
  hr { border: none; border-top: 2px solid #e5e7eb; margin: 20px 0; }

  /* ── Inline Code ── */
  code {
    background: #f3f4f6; color: #374151; padding: 2px 6px; border-radius: 4px;
    font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.88em; border: 1px solid #e5e7eb;
  }

  /* ── Code Block ── */
  pre {
    background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 8px;
    margin: 14px 0; overflow-x: auto; position: relative;
  }
  pre[data-language]::before {
    content: attr(data-language); display: block; padding: 6px 14px 4px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px; font-weight: 600; color: #9ca3af;
    border-bottom: 1px solid #e5e7eb; letter-spacing: 0.05em; text-transform: uppercase;
  }
  pre code {
    display: block; background: none; color: #1f2937; padding: 14px 16px;
    font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
    font-size: 13px; line-height: 1.65; border: none; white-space: pre-wrap; word-break: break-word;
  }

  /* ── Mark/Highlight ── */
  mark { background: #fef08a; padding: 1px 3px; border-radius: 3px; color: inherit; }

  /* ── Tables ── */
  .tableWrapper { overflow-x: auto; margin: 14px 0; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 14px; }
  th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 700; font-size: 13px; color: #1f2937; }

  /* ── Images ── */
  img { max-width: 100%; height: auto; border-radius: 6px; margin: 12px 0; }

  /* ── Voice Note Placeholder ── */
  voice-note {
    display: flex; align-items: center; gap: 10px;
    background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px;
    padding: 12px 16px; margin: 14px 0; font-size: 13px; color: #6b7280;
  }
  voice-note::before { content: '🎙️'; font-size: 18px; flex-shrink: 0; }
  voice-note::after { content: 'Voice Note · ' attr(duration); font-weight: 500; }

  /* ── Card-level Typography Overrides ── */
  .font-serif { font-family: Georgia, Merriweather, serif !important; }
  .font-mono { font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace !important; }
  .size-small { font-size: 13.5px !important; }
  .size-large { font-size: 19px !important; }
  .spacing-tight { line-height: 1.45 !important; }
  .spacing-relaxed { line-height: 2.2 !important; }

  /* ── Print-specific ── */
  @media print {
    body { background: white; }
    .export-root { max-width: none; padding: 0; margin: 0; }
    img { break-inside: avoid; }
    pre, blockquote, table { break-inside: avoid; }
    h1, h2, h3 { break-after: avoid; }
    @page { size: A4; margin: 20mm 18mm; }
  }
`;

// ─── Build Export HTML ──────────────────────────────────────────────

interface ExportOptions {
  tags?: string[];
  fontFamily?: 'sans' | 'serif' | 'mono';
  fontSize?: 'small' | 'normal' | 'large';
  lineSpacing?: 'tight' | 'normal' | 'relaxed';
}

function buildExportHtml(title: string, htmlContent: string, options?: ExportOptions): string {
  // Parse embedded style metadata from the content if options weren't passed
  const { font, size, spacing, cleanHtml } = parseStyleMeta(htmlContent);
  const activeFont = options?.fontFamily || font;
  const activeSize = options?.fontSize || size;
  const activeSpacing = options?.lineSpacing || spacing;

  const safeTitle = title || 'Untitled';
  const tagsHtml = options?.tags?.length
    ? `<div class="export-tags">${options.tags.map(t => `<span class="export-tag">${t}</span>`).join('')}</div>`
    : '';

  // Build class list for typography overrides
  const classes = ['export-root'];
  if (activeFont !== 'sans') classes.push(`font-${activeFont}`);
  if (activeSize !== 'normal') classes.push(`size-${activeSize}`);
  if (activeSpacing !== 'normal') classes.push(`spacing-${activeSpacing}`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>${EXPORT_CSS}</style>
</head>
<body>
  <div class="${classes.join(' ')}">
    <div class="export-title">${safeTitle}</div>
    ${tagsHtml}
    <hr class="export-divider">
    <div class="export-content">${cleanHtml || '<p style="color:#9ca3af;">No content</p>'}</div>
  </div>
</body>
</html>`;
}

// ─── Export Functions ───────────────────────────────────────────────

/**
 * Captures a clean PNG image of the document layout.
 * 
 * WHY DOM CLONING & VISIBILITY WORKAROUNDS ARE NEEDED:
 * 1. **Off-Screen Mounting**:
 *    `html-to-image` works by converting the target DOM subtree into an SVG data URL and painting it
 *    to a canvas. To get an accurate layout with styling overrides applied, we must append a clone of the
 *    document to the live DOM (`document.body`). To prevent the user from seeing this during export, we hide
 *    it off-screen using `position: fixed; opacity: 0; z-index: -9999;`. We CANNOT use `display: none` or
 *    `visibility: hidden` because the browser's style engine will refuse to calculate layouts (width/height)
 *    for hidden elements, resulting in blank or collapsed images.
 * 2. **Preloading Images**:
 *    If the document contains embedded image assets, `html-to-image` may rasterize them before they are fully
 *    loaded by the browser, leading to blank squares in the output. The `Promise.allSettled` map tests and
 *    awaits the `.complete` state of all images inside the temporary subtree to prevent this layout race condition.
 */
export async function exportAsPng(
  title: string,
  htmlContent: string,
  options?: ExportOptions
): Promise<boolean> {
  try {
    const { toPng } = await import('html-to-image');

    const { font, size, spacing, cleanHtml } = parseStyleMeta(htmlContent);
    const activeFont = options?.fontFamily || font;
    const activeSize = options?.fontSize || size;
    const activeSpacing = options?.lineSpacing || spacing;

    const safeTitle = title || 'Untitled';
    const tagsHtml = options?.tags?.length
      ? `<div class="export-tags">${options.tags.map(t => `<span class="export-tag">${t}</span>`).join('')}</div>`
      : '';

    const classes = ['export-root'];
    if (activeFont !== 'sans') classes.push(`font-${activeFont}`);
    if (activeSize !== 'normal') classes.push(`size-${activeSize}`);
    if (activeSpacing !== 'normal') classes.push(`spacing-${activeSpacing}`);

    // Render in a temp container on the main body (not an iframe)
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:0;top:0;width:780px;z-index:-9999;opacity:0;pointer-events:none;';
    container.innerHTML = `
      <style>${EXPORT_CSS}</style>
      <div class="${classes.join(' ')}">
        <div class="export-title">${safeTitle}</div>
        ${tagsHtml}
        <hr class="export-divider">
        <div class="export-content">${cleanHtml || '<p style="color:#9ca3af;">No content</p>'}</div>
      </div>
    `;

    document.body.appendChild(container);

    // Wait for all images inside the clone to load completely before capturing
    const images = Array.from(container.querySelectorAll('img'));
    if (images.length > 0) {
      await Promise.allSettled(
        images.map(img =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>(resolve => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              })
        )
      );
    }
    // Yield execution back to the browser thread for layout recalculation
    await new Promise(r => setTimeout(r, 200));

    const target = container.querySelector('.export-root') as HTMLElement;
    if (!target) {
      document.body.removeChild(container);
      return false;
    }

    const dataUrl = await toPng(target, {
      backgroundColor: '#ffffff',
      pixelRatio: 2, // Retains high-DPI crispness on Retina screens
      style: { transform: 'none' }, // Clear rotation transforms that mess up rasterization
    });

    document.body.removeChild(container);

    const link = document.createElement('a');
    link.download = `${sanitizeFilename(title)}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return true;
  } catch (error) {
    console.error('PNG export failed:', error);
    return false;
  }
}

/**
 * Downloads a self-contained HTML file with the export theme.
 * Embedded styles ensure formatting remains identical on any external reader machine.
 */
export async function exportAsHtml(
  title: string,
  htmlContent: string,
  options?: ExportOptions
): Promise<boolean> {
  try {
    const html = buildExportHtml(title, htmlContent, options);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    triggerDownload(blob, `${sanitizeFilename(title)}.html`);
    return true;
  } catch (error) {
    console.error('HTML export failed:', error);
    return false;
  }
}

/**
 * Converts card HTML to Markdown via turndown and downloads as .md.
 * 
 * WHY CUSTOM RULES ARE REGISTERED:
 * Standard Markdown converters do not know about modern editor components like checkboxes, highlighting,
 * or voice notes. We define custom regex filters and element matchers to reconstruct these blocks into clean Markdown:
 * 1. `taskListItem`: Translates list items wrapped in task list tags into `- [x]` or `- [ ]` syntax.
 * 2. `voiceNote`: Reconstructs custom `<voice-note>` tags into quotes containing a microphone emoji and the duration.
 * 3. `highlight`: Converts mark tag highlighting overrides into `==text==` highlighting wrappers.
 */
export async function exportAsMarkdown(
  title: string,
  htmlContent: string,
): Promise<boolean> {
  try {
    const { cleanHtml } = parseStyleMeta(htmlContent);

    const TurndownService = (await import('turndown')).default;
    const td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      hr: '---',
    });

    td.addRule('taskListItem', {
      filter: (node) =>
        node.nodeName === 'LI' &&
        node.parentElement?.getAttribute('data-type') === 'taskList',
      replacement: (_content, node) => {
        const el = node as HTMLElement;
        const checked = el.getAttribute('data-checked') === 'true';
        const text = el.querySelector('div')?.textContent?.trim() || el.textContent?.trim() || '';
        return `- [${checked ? 'x' : ' '}] ${text}\n`;
      },
    });

    td.addRule('voiceNote', {
      filter: (node) => node.nodeName.toLowerCase() === 'voice-note',
      replacement: (_content, node) => {
        const el = node as HTMLElement;
        const duration = el.getAttribute('duration') || '00:00';
        return `\n> 🎙️ Voice Note (${duration})\n\n`;
      },
    });

    td.addRule('highlight', {
      filter: (node) => node.nodeName.toLowerCase() === 'mark',
      replacement: (content) => `==${content}==`,
    });

    const markdown = `# ${title || 'Untitled'}\n\n${td.turndown(cleanHtml || '')}`;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    triggerDownload(blob, `${sanitizeFilename(title)}.md`);
    return true;
  } catch (error) {
    console.error('Markdown export failed:', error);
    return false;
  }
}
