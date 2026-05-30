import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

const DEFAULT_MARGINS = { left: 2.5, right: 2.5, top: 2.5, bottom: 2.5 };

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

function printCss(margins) {
  const m = { ...DEFAULT_MARGINS, ...(margins || {}) };
  return `
@page { size: A4; margin: ${m.top}cm ${m.right}cm ${m.bottom}cm ${m.left}cm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Apple SD Gothic Neo", "Noto Sans KR", system-ui, -apple-system, sans-serif;
  font-size: 11pt;
  line-height: 1.7;
  color: #1a1a1a;
  word-break: keep-all;
  overflow-wrap: anywhere;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.pdf-title { font-size: 18pt; font-weight: 700; margin: 0 0 18px; line-height: 1.3; }
h1, h2, h3, h4, h5, h6 { font-weight: 700; line-height: 1.3; margin: 1.4em 0 0.5em; page-break-after: avoid; }
h1 { font-size: 16pt; }
h2 { font-size: 14pt; }
h3 { font-size: 12.5pt; }
h4, h5, h6 { font-size: 11pt; }
p { margin: 0 0 0.8em; }
ul, ol { margin: 0 0 0.8em; padding-left: 1.6em; }
li { margin: 0.2em 0; }
blockquote { margin: 0 0 0.8em; padding: 0.2em 0 0.2em 1em; border-left: 3px solid #ccc; color: #555; }
pre { background: #f5f5f5; padding: 12px 14px; border-radius: 6px; overflow-x: auto; font-size: 9.5pt; line-height: 1.5; page-break-inside: avoid; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; font-size: 0.92em; }
pre code { background: none; padding: 0; }
:not(pre) > code { background: #f0f0f0; padding: 1px 4px; border-radius: 4px; }
table { border-collapse: collapse; width: 100%; margin: 0 0 0.8em; page-break-inside: avoid; }
th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: #f5f5f5; font-weight: 700; }
img { max-width: 100%; }
a { color: #1a1a1a; text-decoration: underline; }
hr { border: none; border-top: 1px solid #ddd; margin: 1.6em 0; }
`;
}

export function exportPdf({ title, content, margins }) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  doc.open();
  doc.write(
    `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">` +
    `<title>${esc(title || '문서')}</title>` +
    `<style>${printCss(margins)}</style></head>` +
    `<body><div id="pdf-root"></div></body></html>`
  );
  doc.close();

  const mount = doc.getElementById('pdf-root');
  const root = createRoot(mount);
  root.render(
    <>
      {title ? <div className="pdf-title">{title}</div> : null}
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
          {content || ''}
        </ReactMarkdown>
      </div>
    </>
  );

  const win = iframe.contentWindow;
  let cleaned = false;
  let fallbackTimer = null;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    if (fallbackTimer) clearTimeout(fallbackTimer);
    try { root.unmount(); } catch {}
    try { iframe.remove(); } catch {}
  }

  win.addEventListener('afterprint', cleanup);

  // React render is async; wait two frames so layout/fonts settle before print.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
      return;
    }
    // afterprint may not fire if the dialog is dismissed without printing.
    fallbackTimer = setTimeout(cleanup, 60000);
  }));
}
