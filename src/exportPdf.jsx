import { invoke } from '@tauri-apps/api/core';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// 에디터 본문(단순 텍스트)을 프런트에서 직접 A4 PDF로 생성한다.
// WKWebView에서 window.print()가 동작하지 않으므로 인쇄 대화상자 의존을 제거했다.
// 한글 폰트는 Rust(read_pdf_font)에서 시스템 TTF 바이트를 받아 pdf-lib가 "사용된 글자만
// 서브셋" 임베드한다(전체 폰트 임베드 시 수십 MB가 되는 문제 회피). 저장은 Rust(save_pdf)가
// 저장 대화상자를 띄워 처리한다.

const A4_W = 595.28; // pt (210mm)
const A4_H = 841.89; // pt (297mm)
const CM = 28.3464567; // 1cm in pt
const BODY_SIZE = 11;
const TITLE_SIZE = 18;
const LINE_GAP = 1.5;

let fontCache = null;
async function loadFontBytes() {
  if (fontCache) return fontCache;
  const buf = await invoke('read_pdf_font'); // ArrayBuffer (ipc::Response)
  fontCache = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf);
  return fontCache;
}

// 반환값: 저장된 경로(string) — 사용자가 취소하면 null. 실패 시 throw.
export async function exportPdf({ title, content, margins }) {
  const fontBytes = await loadFontBytes();

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const cleanTitle = (title || '').trim();
  if (cleanTitle) pdfDoc.setTitle(cleanTitle);

  const m = { left: 2.5, right: 2.5, top: 2.5, bottom: 2.5, ...(margins || {}) };
  const ml = m.left * CM;
  const mt = m.top * CM;
  const mb = m.bottom * CM;
  const maxWidth = A4_W - ml - m.right * CM;

  // 글자 폭 캐시 (한글은 단어 경계가 없어 글자 단위로 줄바꿈)
  const wcache = new Map();
  const charWidth = (ch, size) => {
    const key = size + ':' + ch;
    let w = wcache.get(key);
    if (w === undefined) {
      w = font.widthOfTextAtSize(ch, size);
      wcache.set(key, w);
    }
    return w;
  };

  // 한 논리 줄을 maxWidth에 맞춰 시각적 줄들로 분할
  function wrap(text, size) {
    if (text === '') return [''];
    const out = [];
    let cur = '';
    let curW = 0;
    for (const ch of text) {
      const w = charWidth(ch, size);
      if (curW + w > maxWidth && cur !== '') {
        out.push(cur);
        cur = ch;
        curW = w;
      } else {
        cur += ch;
        curW += w;
      }
    }
    out.push(cur);
    return out;
  }

  // 그릴 시각 줄 목록 구성
  const lines = [];
  if (cleanTitle) {
    for (const vl of wrap(cleanTitle, TITLE_SIZE)) lines.push({ text: vl, size: TITLE_SIZE });
    lines.push({ text: '', size: BODY_SIZE }); // 제목과 본문 사이 여백
  }
  const normalized = (content || '').replace(/\t/g, '    ').replace(/\r\n?/g, '\n');
  for (const logical of normalized.split('\n')) {
    if (logical === '') {
      lines.push({ text: '', size: BODY_SIZE });
      continue;
    }
    for (const vl of wrap(logical, BODY_SIZE)) lines.push({ text: vl, size: BODY_SIZE });
  }

  // 페이지네이션 + 그리기
  const color = rgb(0.1, 0.1, 0.1);
  let page = pdfDoc.addPage([A4_W, A4_H]);
  let y = A4_H - mt;
  for (const ln of lines) {
    const lh = ln.size * LINE_GAP;
    if (y - lh < mb) {
      page = pdfDoc.addPage([A4_W, A4_H]);
      y = A4_H - mt;
    }
    y -= lh;
    if (ln.text !== '') {
      page.drawText(ln.text, { x: ml, y, size: ln.size, font, color });
    }
  }

  const bytes = await pdfDoc.save(); // Uint8Array (서브셋 폰트 포함 — 작음)
  return await invoke('save_pdf', {
    args: { bytes: Array.from(bytes), defaultName: cleanTitle || '문서' },
  });
}
