import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Icon from './Icon.jsx';
import { timeAgo } from './FileList.jsx';
import { exportPdf } from '../exportPdf.jsx';
import FilePicker from './FilePicker.jsx';

const PX_PER_CM = 37.795;
const PAGE_W_CM = 21;
const PAGE_H_CM = 29.7;
const AUTOSAVE_KEY = 'thebooks.autosave';

const DEFAULT_FMT = {
  fontFamily: 'system',
  fontSize: 16,
  letterSpacing: 0,
  lineHeight: 1.7,
};

const FONT_OPTIONS = [
  { value: 'system', label: '시스템 기본', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif' },
  { value: 'pretendard', label: 'Pretendard', stack: 'Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif' },
  { value: 'noto-sans-kr', label: 'Noto Sans KR', stack: '"Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif' },
  { value: 'noto-serif-kr', label: 'Noto Serif KR', stack: '"Noto Serif KR", "Apple SD Gothic Myungjo", "본명조", serif' },
  { value: 'nanum-gothic', label: '나눔고딕', stack: '"NanumGothic", "Nanum Gothic", "Apple SD Gothic Neo", sans-serif' },
  { value: 'nanum-myeongjo', label: '나눔명조', stack: '"NanumMyeongjo", "Nanum Myeongjo", serif' },
  { value: 'malgun-gothic', label: '맑은 고딕', stack: '"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif' },
];

function fontStackFor(value) {
  const f = FONT_OPTIONS.find(o => o.value === value);
  return f ? f.stack : FONT_OPTIONS[0].stack;
}

function readAutosavePref() {
  try { return localStorage.getItem(AUTOSAVE_KEY) === 'on'; }
  catch { return false; }
}
function writeAutosavePref(on) {
  try { localStorage.setItem(AUTOSAVE_KEY, on ? 'on' : 'off'); } catch {}
}

export default function Editor({
  file,
  breadcrumb,
  onChange,
  onExit,
  onSaveNow,
  onRenameFile,
  workspaceId,
  workspacePath,
  items,
  splitFileId,
  onOpenSplit,
  onCloseSplit,
  gitStatus,
  gitLoading,
  onRefreshGit,
  analysisOpen,
  onToggleAnalysis,
  onSyncFromDisk,
}) {
  const [title, setTitle] = useState(file.name || '');
  const [margins, setMargins] = useState(file.margins || { left: 2.5, right: 2.5, top: 2.5, bottom: 2.5 });
  const [savedAt, setSavedAt] = useState(file.updatedAt);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autosave, setAutosave] = useState(readAutosavePref);
  const [fmt, setFmt] = useState(DEFAULT_FMT);
  const fmtTouchedRef = useRef(false);
  const fmtTimerRef = useRef(null);

  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;
  const contentRef = useRef(file.content || '');
  const composingRef = useRef(false);
  const savingRef = useRef(false);
  const committingRef = useRef(false);
  const touchedRef = useRef(false);
  const [counts, setCounts] = useState(() => computeCounts(file.content || ''));
  const countsTimerRef = useRef(null);
  const scheduleCountsUpdate = useCallback(() => {
    if (countsTimerRef.current) clearTimeout(countsTimerRef.current);
    countsTimerRef.current = setTimeout(() => {
      setCounts(computeCounts(contentRef.current || ''));
    }, 150);
  }, []);
  useEffect(() => () => {
    if (countsTimerRef.current) clearTimeout(countsTimerRef.current);
  }, []);

  const rulerHRef = useRef(null);
  const rulerHInnerRef = useRef(null);
  const pageRef = useRef(null);
  const scrollRef = useRef(null);
  const editableRef = useRef(null);
  const mainRef = useRef(null);
  const rafIdRef = useRef(null);
  const saveTimer = useRef(null);

  // 문서 내 찾기(Ctrl+F)
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [activeMatch, setActiveMatch] = useState(0);
  const findInputRef = useRef(null);
  const findTimerRef = useRef(null);
  const matchRangesRef = useRef([]);

  // 디스크에서 다시 불러오기
  const [reloadConflict, setReloadConflict] = useState(false);
  const [reloadError, setReloadError] = useState('');

  // PDF 내보내기 결과 알림 ({ type: 'ok' | 'error', text })
  const [pdfMsg, setPdfMsg] = useState(null);
  const [exporting, setExporting] = useState(false);

  const recompute = useCallback(() => {
    if (!pageRef.current || !rulerHRef.current) return;
    if (!rulerHInnerRef.current) return;
    const pageR = pageRef.current.getBoundingClientRect();
    const hR = rulerHRef.current.getBoundingClientRect();
    const pageLeft = pageR.left - hR.left;
    rulerHInnerRef.current.style.transform = `translateX(${pageLeft}px)`;
  }, []);

  const scheduleRecompute = useCallback(() => {
    if (rafIdRef.current != null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      recompute();
    });
  }, [recompute]);

  useLayoutEffect(() => { recompute(); }, [recompute]);
  useEffect(() => {
    const ro = new ResizeObserver(scheduleRecompute);
    if (scrollRef.current) ro.observe(scrollRef.current);
    if (pageRef.current) ro.observe(pageRef.current);
    window.addEventListener('resize', scheduleRecompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', scheduleRecompute);
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    };
  }, [scheduleRecompute]);

  function scheduleAutosave() {
    if (!autosaveRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!savingRef.current) {
      savingRef.current = true;
      setSaving(true);
    }
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      if (committingRef.current) {
        savingRef.current = false;
        setSaving(false);
        return;
      }
      const latest = editableRef.current ? editableRef.current.innerText : contentRef.current;
      contentRef.current = latest;
      onChange({ name: title, content: latest, margins });
      setSavedAt(Date.now());
      savingRef.current = false;
      setSaving(false);
      setDirty(false);
    }, 600);
  }

  useEffect(() => {
    if (!touchedRef.current) {
      touchedRef.current = true;
      return;
    }
    if (!autosave) return;
    scheduleAutosave();
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, margins, autosave]);

  function markDirtyIfOff() {
    if (!autosaveRef.current) setDirty(true);
  }

  // --- 문서 내 찾기 ---------------------------------------------------------
  const supportsHighlight = typeof CSS !== 'undefined' && !!CSS.highlights;

  const clearFindHighlights = useCallback(() => {
    if (!supportsHighlight) return;
    CSS.highlights.delete('tb-find');
    CSS.highlights.delete('tb-find-active');
  }, [supportsHighlight]);

  const scrollRangeIntoView = useCallback((range) => {
    const scroller = scrollRef.current;
    if (!scroller || !range) return;
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return;
    const sRect = scroller.getBoundingClientRect();
    const pad = 80;
    if (rect.top < sRect.top + pad) {
      scroller.scrollTop -= (sRect.top + pad) - rect.top;
    } else if (rect.bottom > sRect.bottom - pad) {
      scroller.scrollTop += rect.bottom - (sRect.bottom - pad);
    }
  }, []);

  const paintActive = useCallback((idx) => {
    if (!supportsHighlight) return;
    const range = matchRangesRef.current[idx];
    if (range) {
      CSS.highlights.set('tb-find-active', new Highlight(range));
      scrollRangeIntoView(range);
    } else {
      CSS.highlights.delete('tb-find-active');
    }
  }, [supportsHighlight, scrollRangeIntoView]);

  const runFind = useCallback((query) => {
    const root = editableRef.current;
    const q = (query || '');
    if (!root || !q) {
      matchRangesRef.current = [];
      setMatchCount(0);
      setActiveMatch(0);
      clearFindHighlights();
      return;
    }
    const needle = q.toLowerCase();
    const ranges = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      if (!text) continue;
      const hay = text.toLowerCase();
      let from = 0;
      let at;
      while ((at = hay.indexOf(needle, from)) !== -1) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + needle.length);
        ranges.push(range);
        from = at + needle.length;
      }
    }
    matchRangesRef.current = ranges;
    setMatchCount(ranges.length);
    const nextActive = ranges.length ? 0 : 0;
    setActiveMatch(nextActive);
    if (supportsHighlight) {
      if (ranges.length) CSS.highlights.set('tb-find', new Highlight(...ranges));
      else CSS.highlights.delete('tb-find');
    }
    paintActive(nextActive);
  }, [clearFindHighlights, paintActive, supportsHighlight]);

  // 입력 디바운스
  useEffect(() => {
    if (!findOpen) return;
    if (findTimerRef.current) clearTimeout(findTimerRef.current);
    findTimerRef.current = setTimeout(() => {
      findTimerRef.current = null;
      runFind(findQuery);
    }, 120);
    return () => { if (findTimerRef.current) clearTimeout(findTimerRef.current); };
  }, [findQuery, findOpen, runFind]);

  function gotoMatch(delta) {
    const total = matchRangesRef.current.length;
    if (!total) return;
    setActiveMatch(prev => {
      const next = (prev + delta + total) % total;
      paintActive(next);
      return next;
    });
  }

  function openFind() {
    setFindOpen(true);
    requestAnimationFrame(() => {
      if (findInputRef.current) {
        findInputRef.current.focus();
        findInputRef.current.select();
      }
    });
  }

  function closeFind() {
    setFindOpen(false);
    clearFindHighlights();
    matchRangesRef.current = [];
    setMatchCount(0);
    setActiveMatch(0);
  }

  // Ctrl/Cmd+F — 에디터 영역 안에서만 동작 (터미널/사이드패널과 충돌 방지)
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        openFind();
      }
    }
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, []);

  // 파일이 바뀌면 찾기 닫기
  useEffect(() => {
    closeFind();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  useEffect(() => () => clearFindHighlights(), [clearFindHighlights]);

  // --- 디스크에서 다시 불러오기 ---------------------------------------------
  const applyDiskData = useCallback((data) => {
    const body = data.content || '';
    contentRef.current = body;
    if (editableRef.current) editableRef.current.innerText = body;
    // title/margins 변경이 autosave를 트리거하지 않도록 (file.id 전환과 동일 패턴)
    touchedRef.current = false;
    setTitle(data.title || file.name || '');
    if (data.margins) setMargins(data.margins);
    setSavedAt(data.updatedAt);
    setDirty(false);
    setCounts(computeCounts(body));
    if (onSyncFromDisk) {
      onSyncFromDisk({ content: body, margins: data.margins, updatedAt: data.updatedAt });
    }
  }, [file.name, onSyncFromDisk]);

  const reloadFromDisk = useCallback(async () => {
    setReloadError('');
    try {
      const data = await invoke('read_file', { relPath: file.id });
      applyDiskData(data);
    } catch (e) {
      setReloadError(e?.message || (typeof e === 'string' ? e : '다시 불러오기에 실패했습니다.'));
    }
  }, [file.id, applyDiskData]);

  function hasUnsavedChanges() {
    // autosave OFF: dirty 플래그, autosave ON: 아직 기록 안 된 보류 저장(saveTimer)
    return dirty || !!saveTimer.current;
  }

  function requestReload() {
    if (saving && autosaveRef.current) {
      // 진행 중인 저장이 있으면 보수적으로 확인 배너
      setReloadConflict(true);
      return;
    }
    if (hasUnsavedChanges()) {
      setReloadConflict(true);
    } else {
      reloadFromDisk();
    }
  }

  function confirmReload() {
    setReloadConflict(false);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      savingRef.current = false;
      setSaving(false);
    }
    reloadFromDisk();
  }

  // 파일이 바뀌면 배너/에러 정리
  useEffect(() => {
    setReloadConflict(false);
    setReloadError('');
    setPdfMsg(null);
  }, [file.id]);

  function applyContentFromDOM() {
    if (composingRef.current) return;
    if (!editableRef.current) return;
    contentRef.current = editableRef.current.innerText;
    scheduleCountsUpdate();
    if (autosaveRef.current) {
      scheduleAutosave();
    } else {
      setDirty(true);
    }
  }

  function handleCompositionStart() {
    composingRef.current = true;
  }
  function handleCompositionUpdate() {
    // IME 조합 중간 단계의 페인트가 다음 키까지 보류되는 환경(WebKitGTK/WSLg 등)에서
    // 한 글자가 한 템포 늦게 보이는 현상을 줄이는 안전 장치.
    // setState 없이 layout만 한 번 강제로 읽어 페인트 큐가 진행되도록 유도.
    if (!editableRef.current) return;
    void editableRef.current.offsetHeight;
  }
  function handleCompositionEnd() {
    composingRef.current = false;
    applyContentFromDOM();
  }

  useEffect(() => {
    if (editableRef.current) {
      editableRef.current.innerText = contentRef.current;
    }
    setDirty(false);
    touchedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  useEffect(() => {
    fmtTouchedRef.current = false;
    if (fmtTimerRef.current) { clearTimeout(fmtTimerRef.current); fmtTimerRef.current = null; }
    let cancelled = false;
    (async () => {
      try {
        const loaded = await invoke('get_format', { relPath: file.id });
        if (cancelled) return;
        fmtTouchedRef.current = false;
        setFmt({ ...DEFAULT_FMT, ...loaded });
      } catch {
        if (!cancelled) {
          fmtTouchedRef.current = false;
          setFmt(DEFAULT_FMT);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [file.id]);

  useEffect(() => {
    if (!fmtTouchedRef.current) {
      fmtTouchedRef.current = true;
      return;
    }
    if (fmtTimerRef.current) clearTimeout(fmtTimerRef.current);
    const snapshot = fmt;
    fmtTimerRef.current = setTimeout(() => {
      fmtTimerRef.current = null;
      invoke('set_format', { args: { relPath: file.id, meta: snapshot } }).catch(() => {});
    }, 400);
    return () => { if (fmtTimerRef.current) { clearTimeout(fmtTimerRef.current); fmtTimerRef.current = null; } };
  }, [fmt, file.id]);

  const editorVars = useMemo(() => ({
    '--editor-font-family': fontStackFor(fmt.fontFamily),
    '--editor-font-size': `${fmt.fontSize}px`,
    '--editor-letter-spacing': `${fmt.letterSpacing}px`,
    '--editor-line-height': String(fmt.lineHeight),
  }), [fmt]);

  function manualSave() {
    const latest = editableRef.current ? editableRef.current.innerText : contentRef.current;
    contentRef.current = latest;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const p = onSaveNow({ name: title, content: latest, margins });
    setSavedAt(Date.now());
    savingRef.current = false;
    setSaving(false);
    setDirty(false);
    return p;
  }

  async function commitTitle() {
    if (committingRef.current) return;
    const next = title.trim();
    if (!next) {
      setTitle(file.name || '');
      return;
    }
    if (next === (file.name || '')) return;
    committingRef.current = true;
    try {
      await manualSave();
      if (onRenameFile) await onRenameFile(file.id, next);
    } catch (e) {
      // rename/save surface their own errors; keep editor stable
    } finally {
      committingRef.current = false;
    }
  }

  async function handleExportPdf() {
    if (exporting) return;
    const content = editableRef.current ? editableRef.current.innerText : (contentRef.current || file.content || '');
    setPdfMsg(null);
    setExporting(true);
    try {
      const saved = await exportPdf({ title: (title || file.name || '제목 없음').trim(), content, margins });
      // saved === null 이면 사용자가 저장 대화상자를 취소한 것 — 알림 없음
      if (saved) setPdfMsg({ type: 'ok', text: `PDF로 저장했습니다: ${saved}` });
    } catch (e) {
      const detail = e?.message || (typeof e === 'string' ? e : JSON.stringify(e));
      setPdfMsg({ type: 'error', text: `PDF 저장 실패: ${detail}` });
    } finally {
      setExporting(false);
    }
  }

  function toggleAutosave() {
    const next = !autosave;
    if (next && editableRef.current) {
      contentRef.current = editableRef.current.innerText;
    }
    if (!next && saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      savingRef.current = false;
      setSaving(false);
    }
    setAutosave(next);
    writeAutosavePref(next);
    setDirty(false);
  }

  const hTicks = useMemo(() => {
    const out = [];
    for (let cm = 0; cm <= PAGE_W_CM; cm++) {
      const x = cm * PX_PER_CM;
      out.push(<div key={'M'+cm} className="tick major" style={{ left: x }} />);
      if (cm > 0) {
        out.push(<div key={'L'+cm} className="ruler-label" style={{ left: x }}>{cm}</div>);
      }
      if (cm < PAGE_W_CM) {
        for (let mm = 2; mm < 10; mm += 2) {
          const xm = (cm + mm / 10) * PX_PER_CM;
          out.push(<div key={'m'+cm+'-'+mm} className="tick minor" style={{ left: xm }} />);
        }
      }
    }
    return out;
  }, []);

  function startDrag(axis, side) {
    return (downEvent) => {
      downEvent.preventDefault();
      const startCM = margins[side];
      const start = axis === 'h' ? downEvent.clientX : downEvent.clientY;
      function onMove(e) {
        const now = axis === 'h' ? e.clientX : e.clientY;
        const deltaPx = now - start;
        const deltaCm = deltaPx / PX_PER_CM;
        let next = startCM + (side === 'right' || side === 'bottom' ? -deltaCm : deltaCm);
        const maxAxis = axis === 'h' ? PAGE_W_CM : PAGE_H_CM;
        const opposite = side === 'left' ? margins.right
                       : side === 'right' ? margins.left
                       : side === 'top' ? margins.bottom : margins.top;
        next = Math.max(0.5, Math.min(maxAxis - opposite - 2, next));
        setMargins(m => ({ ...m, [side]: Math.round(next * 10) / 10 }));
        markDirtyIfOff();
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
  }

  const hLeftX  = margins.left * PX_PER_CM;
  const hRightX = (PAGE_W_CM - margins.right) * PX_PER_CM;

  const showUnsaved = !autosave && dirty;

  return (
    <main className="main" ref={mainRef}>
      <div className="topbar">
        <div className="topbar-left">
          <button className="topbar-back" onClick={onExit}>
            <Icon name="arrowLeft" size={14}/> 목록
          </button>
          <div className="divider-v"></div>

          <div className="editor-path">
            {breadcrumb.map((b, i) => (
              <React.Fragment key={i}>
                <span className="editor-path-seg">{b}</span>
                {i < breadcrumb.length - 1 && <span className="editor-path-sep">/</span>}
              </React.Fragment>
            ))}
            {breadcrumb.length > 0 && <span className="editor-path-sep">/</span>}
          </div>

          <input
            className="topbar-title"
            value={title}
            placeholder="제목 없음"
            onChange={(e) => { setTitle(e.target.value); markDirtyIfOff(); }}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
              if (e.key === 'Escape') { setTitle(file.name || ''); e.currentTarget.blur(); }
            }}
          />
        </div>

        <div className="topbar-middle">
          <FormatControls fmt={fmt} onChange={setFmt} />

          <CharCountBadge counts={counts} />

          <button
            type="button"
            className={`btn ghost ${analysisOpen ? 'is-active' : ''}`}
            onClick={onToggleAnalysis}
            title={analysisOpen ? '분석 패널 닫기' : '본문 분석'}
          >
            <Icon name="sparkles" size={13}/>분석
          </button>

          <button
            type="button"
            className="btn ghost"
            onClick={handleExportPdf}
            disabled={exporting}
            title="PDF로 내보내기"
          >
            <Icon name="download" size={13}/>{exporting ? 'PDF 생성 중…' : 'PDF'}
          </button>

          <button
            type="button"
            className="btn ghost"
            onClick={requestReload}
            title="디스크에서 다시 불러오기 — 외부에서 변경된 파일 내용을 반영"
          >
            <Icon name="refresh" size={13}/>다시 불러오기
          </button>

          <button
            type="button"
            className={`autosave-toggle ${autosave ? 'on' : 'off'}`}
            onClick={toggleAutosave}
            title={autosave ? '자동저장 켜짐 — 변경 시 자동으로 저장됩니다' : '자동저장 꺼짐 — 저장 버튼으로만 저장됩니다'}
          >
            <span className="autosave-dot"></span>
            자동저장 {autosave ? 'ON' : 'OFF'}
          </button>

          <SaveStatus saving={saving} dirty={showUnsaved} savedAt={savedAt} />
        </div>

        <div className="topbar-right">
          <SplitButton
            items={items}
            workspaceId={workspaceId}
            currentFileId={file.id}
            splitFileId={splitFileId}
            onOpenSplit={onOpenSplit}
            onCloseSplit={onCloseSplit}
          />

          <button
            className={`btn primary ${showUnsaved ? 'urgent' : ''}`}
            onClick={() => { if (!committingRef.current) manualSave(); }}
          >
            <Icon name="save" size={14}/>저장
          </button>
        </div>
      </div>

      {reloadConflict && (
        <div className="reload-banner reload-banner--warn">
          <Icon name="refresh" size={13} />
          <span className="reload-banner-msg">
            저장하지 않은 변경이 있습니다. 디스크 내용으로 다시 불러오면 현재 변경 사항이 사라집니다.
          </span>
          <button className="btn ghost" onClick={() => setReloadConflict(false)}>취소</button>
          <button className="btn primary urgent" onClick={confirmReload}>디스크 내용으로 덮어쓰기</button>
        </div>
      )}
      {reloadError && (
        <div className="reload-banner reload-banner--error">
          <span className="reload-banner-msg">다시 불러오기 실패: {reloadError}</span>
          <button className="btn ghost" onClick={() => setReloadError('')}>닫기</button>
        </div>
      )}
      {pdfMsg && (
        <div className={`reload-banner ${pdfMsg.type === 'error' ? 'reload-banner--error' : 'reload-banner--ok'}`}>
          <span className="reload-banner-msg">{pdfMsg.text}</span>
          <button className="btn ghost" onClick={() => setPdfMsg(null)}>닫기</button>
        </div>
      )}

      {gitStatus && gitStatus.available && (
        <GitEditorBar
          status={gitStatus}
          loading={gitLoading}
          onRefresh={onRefreshGit}
          currentPath={file.id}
          workspacePath={workspacePath}
        />
      )}

      <div className="editor-wrap">
        {findOpen && (
          <FindBar
            inputRef={findInputRef}
            query={findQuery}
            onQueryChange={setFindQuery}
            matchCount={matchCount}
            activeMatch={activeMatch}
            supported={supportsHighlight}
            onPrev={() => gotoMatch(-1)}
            onNext={() => gotoMatch(1)}
            onClose={closeFind}
          />
        )}
        <div className="ruler-h" ref={rulerHRef}>
          <div className="ruler-inner" ref={rulerHInnerRef}>
            <div className="margin-zone" style={{ left: 0, width: margins.left * PX_PER_CM }}></div>
            <div className="margin-zone" style={{ left: hRightX, width: margins.right * PX_PER_CM }}></div>
            {hTicks}
            <div className="margin-handle" style={{ left: hLeftX }} onMouseDown={startDrag('h', 'left')} title={`왼쪽 여백 ${margins.left}cm`}></div>
            <div className="margin-handle" style={{ left: hRightX }} onMouseDown={startDrag('h', 'right')} title={`오른쪽 여백 ${margins.right}cm`}></div>
          </div>
        </div>

        <div className="editor-scroll" ref={scrollRef} onScroll={scheduleRecompute}>
          <div className="page-wrap">
            <PageStack
              margins={margins}
              editableRef={editableRef}
              pageRef={pageRef}
              onInput={applyContentFromDOM}
              onCompositionStart={handleCompositionStart}
              onCompositionUpdate={handleCompositionUpdate}
              onCompositionEnd={handleCompositionEnd}
              editorVars={editorVars}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

const GIT_BAR_EXPANDED_KEY = 'thebooks.git.bar.expanded';

function readGitBarExpanded() {
  try { return localStorage.getItem(GIT_BAR_EXPANDED_KEY) === '1'; }
  catch { return false; }
}
function writeGitBarExpanded(on) {
  try { localStorage.setItem(GIT_BAR_EXPANDED_KEY, on ? '1' : '0'); } catch {}
}

function FindBar({ inputRef, query, onQueryChange, matchCount, activeMatch, supported, onPrev, onNext, onClose }) {
  function handleKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev(); else onNext();
    }
  }
  const hasQuery = query.length > 0;
  return (
    <div className="find-bar" role="search">
      <Icon name="search" size={13} />
      <input
        ref={inputRef}
        className="find-bar-input"
        type="text"
        value={query}
        placeholder="문서에서 찾기"
        spellCheck={false}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKey}
      />
      <span className="find-bar-count caption">
        {!supported ? '미지원' : !hasQuery ? '' : matchCount === 0 ? '결과 없음' : `${activeMatch + 1}/${matchCount}`}
      </span>
      <button className="icon-btn" title="이전 (Shift+Enter)" onClick={onPrev} disabled={matchCount === 0}>
        <Icon name="chevronLeft" size={13} />
      </button>
      <button className="icon-btn" title="다음 (Enter)" onClick={onNext} disabled={matchCount === 0}>
        <Icon name="chevronRight" size={13} />
      </button>
      <button className="icon-btn" title="닫기 (Esc)" onClick={onClose}>
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

function GitEditorBar({ status, loading, onRefresh, currentPath, workspacePath }) {
  const [expanded, setExpanded] = useState(readGitBarExpanded);
  const [diff, setDiff] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);
  const currentFile = useMemo(
    () => status.files.find(f => f.path === currentPath) || null,
    [status.files, currentPath],
  );

  function toggle() {
    setExpanded(prev => {
      const next = !prev;
      writeGitBarExpanded(next);
      return next;
    });
  }

  useEffect(() => {
    if (!expanded || !currentFile || !workspacePath) {
      setDiff('');
      return;
    }
    let alive = true;
    setDiffLoading(true);
    invoke('git_file_diff', { workspacePath, relPath: currentPath })
      .then(text => { if (alive) setDiff(text || ''); })
      .catch(() => { if (alive) setDiff(''); })
      .finally(() => { if (alive) setDiffLoading(false); });
    return () => { alive = false; };
  }, [expanded, workspacePath, currentPath, currentFile, status.files]);

  if (!currentFile) {
    return null;
  }

  const isUntracked = (currentFile.status || '').startsWith('?');

  return (
    <div className={`git-bar ${expanded ? 'git-bar--open' : ''}`}>
      <button className="git-bar-head" onClick={toggle} title={expanded ? '접기' : '펼치기'}>
        <span className="git-bar-chev">{expanded ? '▾' : '▸'}</span>
        <Icon name="branch" size={12} />
        <strong>{status.branch || 'git'}</strong>
        <span className={`git-status-chip git-status-chip--${chipTone(currentFile.status)}`}>{currentFile.status}</span>
        <span className="git-bar-cur-name">이 파일 변경됨</span>
        {(currentFile.added > 0 || currentFile.removed > 0) && (
          <span className="git-bar-cur-numstat caption">
            {currentFile.added > 0 && <span className="git-num-add">+{currentFile.added}</span>}
            {currentFile.removed > 0 && <span className="git-num-rm"> −{currentFile.removed}</span>}
          </span>
        )}
        <span className="git-bar-spacer"></span>
        <button
          className="icon-btn"
          title="새로고침"
          onClick={(e) => { e.stopPropagation(); onRefresh(); }}
          disabled={loading || diffLoading}
        >
          <Icon name="save" size={12} />
        </button>
      </button>
      {expanded && (
        <div className="git-bar-diff">
          {diffLoading ? (
            <div className="caption" style={{ padding: '8px 12px' }}>diff 불러오는 중…</div>
          ) : isUntracked ? (
            <div className="caption" style={{ padding: '8px 12px' }}>아직 git에 추적되지 않은 파일입니다.</div>
          ) : diff.trim() === '' ? (
            <div className="caption" style={{ padding: '8px 12px' }}>diff 없음</div>
          ) : (
            <DiffView text={diff} />
          )}
        </div>
      )}
    </div>
  );
}

function DiffView({ text }) {
  const lines = useMemo(() => {
    const out = [];
    for (const raw of text.split('\n')) {
      if (raw.startsWith('diff --git') || raw.startsWith('index ')
          || raw.startsWith('--- ') || raw.startsWith('+++ ')
          || raw.startsWith('new file mode') || raw.startsWith('deleted file mode')
          || raw.startsWith('similarity index') || raw.startsWith('rename from')
          || raw.startsWith('rename to')) {
        continue;
      }
      let cls = 'diff-ctx';
      if (raw.startsWith('@@')) cls = 'diff-hunk';
      else if (raw.startsWith('+')) cls = 'diff-add';
      else if (raw.startsWith('-')) cls = 'diff-rm';
      out.push({ cls, text: raw });
    }
    return out;
  }, [text]);

  return (
    <pre className="diff-pre">
      {lines.map((ln, i) => (
        <div key={i} className={`diff-line ${ln.cls}`}>{ln.text || ' '}</div>
      ))}
    </pre>
  );
}

function chipTone(code) {
  const c = code || '';
  if (c.startsWith('?') || c.startsWith('A')) return 'added';
  if (c.startsWith('D')) return 'deleted';
  if (c.startsWith('M') || c.startsWith('R') || c.includes('M')) return 'modified';
  return 'other';
}

const CHAR_NF = new Intl.NumberFormat('ko-KR');

function computeCounts(text) {
  const t = text || '';
  const total = Array.from(t).length;
  const noSpace = Array.from(t.replace(/\s+/g, '')).length;
  return { total, noSpace };
}

function CharCountBadge({ counts }) {
  return (
    <div className="char-count-badge" title="공백 포함 / 공백 제외 글자수">
      <span className="char-count-total">{CHAR_NF.format(counts.total)}자</span>
      <span className="char-count-sep">·</span>
      <span className="char-count-nospace">공백 제외 {CHAR_NF.format(counts.noSpace)}자</span>
    </div>
  );
}

function SaveStatus({ saving, dirty, savedAt }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  let text = '';
  let cls = '';
  if (saving) { text = '저장 중…'; cls = 'saving'; }
  else if (dirty) { text = '미저장 변경 있음'; cls = 'dirty'; }
  else if (savedAt) { text = `${timeAgo(savedAt)} 저장됨`; cls = 'saved'; }
  else { text = '저장되지 않음'; }
  return (
    <div className={`save-status ${cls}`}>
      <span className="pulse"></span>
      {text}
    </div>
  );
}

function PageStack({ margins, editableRef, pageRef, onInput, onCompositionStart, onCompositionUpdate, onCompositionEnd, editorVars }) {
  return (
    <div className="page-stack" ref={pageRef}>
      <div className="page-sheet">
        <CornerCrops margins={margins} />
      </div>
      <div
        ref={editableRef}
        className="page-content"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-placeholder="여기에 글을 시작하세요."
        style={{
          padding: `${margins.top * PX_PER_CM}px ${margins.right * PX_PER_CM}px ${margins.bottom * PX_PER_CM}px ${margins.left * PX_PER_CM}px`,
          ...editorVars,
        }}
        onInput={onInput}
        onCompositionStart={onCompositionStart}
        onCompositionUpdate={onCompositionUpdate}
        onCompositionEnd={onCompositionEnd}
      />
    </div>
  );
}

function StepperInput({ value, min, max, step, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(String(value));
    }
  }, [value]);

  function handleChange(e) {
    const next = e.target.value;
    setDraft(next);
    const n = parseFloat(next);
    if (Number.isFinite(n) && n >= min && n <= max) {
      onCommit(n);
    }
  }

  function handleBlur() {
    const n = parseFloat(draft);
    if (!Number.isFinite(n) || n < min || n > max) {
      setDraft(String(value));
    }
  }

  return (
    <input
      ref={inputRef}
      type="number"
      min={min} max={max} step={step}
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}

function FormatControls({ fmt, onChange }) {
  function patch(p) { onChange(prev => ({ ...prev, ...p })); }
  return (
    <div className="format-controls" title="문서 서식">
      <select
        className="fmt-select"
        value={fmt.fontFamily}
        onChange={(e) => patch({ fontFamily: e.target.value })}
        title="글꼴"
      >
        {FONT_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <div className="fmt-stepper" title="글자 크기 (px)">
        <span className="fmt-icon" aria-hidden>가</span>
        <StepperInput
          value={fmt.fontSize}
          min={8} max={48} step={0.5}
          onCommit={(v) => patch({ fontSize: v })}
        />
      </div>
      <div className="fmt-stepper" title="자간 (px)">
        <span className="fmt-icon" aria-hidden>↔</span>
        <StepperInput
          value={fmt.letterSpacing}
          min={-2} max={5} step={0.1}
          onCommit={(v) => patch({ letterSpacing: v })}
        />
      </div>
      <div className="fmt-stepper" title="행간 (배수)">
        <span className="fmt-icon" aria-hidden>↕</span>
        <StepperInput
          value={fmt.lineHeight}
          min={1.0} max={3.0} step={0.05}
          onCommit={(v) => patch({ lineHeight: v })}
        />
      </div>
    </div>
  );
}

function CornerCrops({ margins }) {
  const t = margins.top * PX_PER_CM;
  const l = margins.left * PX_PER_CM;
  const r = margins.right * PX_PER_CM;
  const b = margins.bottom * PX_PER_CM;
  const S = 10;
  const base = {
    position: 'absolute',
    width: S,
    height: S,
    borderColor: 'var(--gray-300)',
    borderStyle: 'solid',
    pointerEvents: 'none',
  };
  return (
    <>
      <div style={{ ...base, left: l - S, top: t,     borderRightWidth: 1, borderTopWidth: 1, borderLeftWidth: 0, borderBottomWidth: 0 }}></div>
      <div style={{ ...base, right: r - S, top: t,    borderLeftWidth: 1,  borderTopWidth: 1, borderRightWidth: 0, borderBottomWidth: 0 }}></div>
      <div style={{ ...base, left: l - S, bottom: b,  borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 0, borderTopWidth: 0 }}></div>
      <div style={{ ...base, right: r - S, bottom: b, borderLeftWidth: 1,  borderBottomWidth: 1, borderRightWidth: 0, borderTopWidth: 0 }}></div>
    </>
  );
}

function SplitButton({ items, workspaceId, currentFileId, splitFileId, onOpenSplit, onCloseSplit }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  useEffect(() => {
    function handle(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  if (splitFileId) {
    return (
      <button className="btn ghost split-active" onClick={onCloseSplit} title="분할 닫기">
        <Icon name="split" size={13}/>분할 닫기
      </button>
    );
  }

  return (
    <div className="split-picker" ref={rootRef}>
      <button className="btn ghost" onClick={() => setOpen(o => !o)}>
        <Icon name="split" size={13}/>분할
      </button>
      {open && (
        <div className="split-picker-menu">
          <div className="ref-picker-title">참조할 파일 선택</div>
          <FilePicker
            items={items}
            workspaceId={workspaceId}
            currentFileId={currentFileId}
            onPick={(id) => { onOpenSplit(id); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}
