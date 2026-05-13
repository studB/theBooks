// ============================================================
// theBooks — Editor screen (A4 paper + rulers + multi-page)
// ============================================================

const { useState: useStateE, useEffect: useEffectE, useRef: useRefE, useLayoutEffect, useCallback } = React;

// Px per cm at 96 dpi
const PX_PER_CM = 37.795;
const PAGE_W_CM = 21;
const PAGE_H_CM = 29.7;
const PAGE_W_PX = PAGE_W_CM * PX_PER_CM;
const PAGE_H_PX = PAGE_H_CM * PX_PER_CM;
const PAGE_GAP = 28; // visual gap between pages

function Editor({ file, breadcrumb, onChange, onExit, onSaveNow, workspaceId, items, splitFileId, onOpenSplit, onCloseSplit }) {
  const [title, setTitle] = useStateE(file.name || '');
  const [margins, setMargins] = useStateE(file.margins || { left: 2.5, right: 2.5, top: 2.5, bottom: 2.5 });
  const [content, setContent] = useStateE(file.content || '');
  const [savedAt, setSavedAt] = useStateE(file.updatedAt);
  const [saving, setSaving] = useStateE(false);
  const [pageCount, setPageCount] = useStateE(1);
  const [currentPage, setCurrentPage] = useStateE(1);
  const [, force] = useStateE(0);

  const rulerHRef = useRefE(null);
  const rulerVRef = useRefE(null);
  const pageRef = useRefE(null);
  const scrollRef = useRefE(null);
  const editableRef = useRefE(null);

  const [geom, setGeom] = useStateE({ pageLeft: 0, pageTop: 0, scrollTop: 0 });

  // Measure intrinsic content height (without our forced stack height)
  function measurePages() {
    if (!editableRef.current) return;
    const el = editableRef.current;
    const prev = el.style.height;
    el.style.height = 'auto';
    const h = el.scrollHeight;
    el.style.height = prev;
    const n = Math.max(1, Math.ceil(h / PAGE_H_PX));
    setPageCount(n);
  }

  const recompute = useCallback(() => {
    if (!pageRef.current || !rulerHRef.current || !rulerVRef.current) return;
    const pageR = pageRef.current.getBoundingClientRect();
    const hR = rulerHRef.current.getBoundingClientRect();
    const vR = rulerVRef.current.getBoundingClientRect();
    const scrollTop = scrollRef.current ? scrollRef.current.scrollTop : 0;
    setGeom({
      pageLeft: pageR.left - hR.left,
      pageTop: pageR.top - vR.top,
      scrollTop,
    });
    // figure out current page based on scroll
    if (pageRef.current && scrollRef.current) {
      const stackTop = pageRef.current.offsetTop;
      const focus = scrollTop + scrollRef.current.clientHeight / 3;
      const offset = focus - stackTop;
      const stride = PAGE_H_PX + PAGE_GAP;
      const idx = Math.max(1, Math.min(pageCount, Math.floor(offset / stride) + 1));
      setCurrentPage(idx);
    }
  }, [pageCount]);

  useLayoutEffect(() => { recompute(); }, [recompute]);
  useEffectE(() => {
    const ro = new ResizeObserver(recompute);
    if (scrollRef.current) ro.observe(scrollRef.current);
    if (pageRef.current) ro.observe(pageRef.current);
    window.addEventListener('resize', recompute);
    return () => { ro.disconnect(); window.removeEventListener('resize', recompute); };
  }, [recompute]);

  // Auto-save (debounced)
  const saveTimer = useRefE(null);
  useEffectE(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(() => {
      onChange({ name: title, content, margins });
      setSavedAt(Date.now());
      setSaving(false);
    }, 600);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line
  }, [title, content, margins]);

  useEffectE(() => {
    const t = setInterval(() => force(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  function applyContentFromDOM() {
    if (!editableRef.current) return;
    setContent(editableRef.current.innerText);
    requestAnimationFrame(measurePages);
  }

  // Reset content when file changes
  useEffectE(() => {
    if (editableRef.current && editableRef.current.innerText !== content) {
      editableRef.current.innerText = content;
    }
    requestAnimationFrame(measurePages);
    // eslint-disable-next-line
  }, [file.id]);

  // Recompute pages when margins change (text reflow)
  useEffectE(() => {
    requestAnimationFrame(measurePages);
  }, [margins]);

  let statusText = '';
  let statusClass = '';
  if (saving) { statusText = '저장 중…'; statusClass = 'saving'; }
  else if (savedAt) { statusText = `${timeAgo(savedAt)} 저장됨`; statusClass = 'saved'; }
  else { statusText = '저장되지 않음'; }

  // Ruler ticks
  const hTicks = [];
  for (let cm = 0; cm <= PAGE_W_CM; cm++) {
    const x = geom.pageLeft + cm * PX_PER_CM;
    hTicks.push(<div key={'M'+cm} className="tick major" style={{ left: x }}></div>);
    if (cm > 0) {
      hTicks.push(<div key={'L'+cm} className="ruler-label" style={{ left: x }}>{cm}</div>);
    }
    if (cm < PAGE_W_CM) {
      for (let mm = 2; mm < 10; mm += 2) {
        const xm = geom.pageLeft + (cm + mm/10) * PX_PER_CM;
        hTicks.push(<div key={'m'+cm+'-'+mm} className="tick minor" style={{ left: xm }}></div>);
      }
    }
  }
  const vTicks = [];
  // Vertical ruler: only show ticks for the first page (0..29.7cm) — beyond that, page boundaries handle it.
  for (let cm = 0; cm <= PAGE_H_CM; cm++) {
    const y = geom.pageTop - geom.scrollTop + cm * PX_PER_CM;
    vTicks.push(<div key={'M'+cm} className="tick major" style={{ top: y }}></div>);
    if (cm > 0) {
      vTicks.push(<div key={'L'+cm} className="ruler-label" style={{ top: y }}>{cm}</div>);
    }
    if (cm < PAGE_H_CM) {
      for (let mm = 2; mm < 10; mm += 2) {
        const ym = geom.pageTop - geom.scrollTop + (cm + mm/10) * PX_PER_CM;
        vTicks.push(<div key={'m'+cm+'-'+mm} className="tick minor" style={{ top: ym }}></div>);
      }
    }
  }

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
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
  }

  const hLeftX  = geom.pageLeft + margins.left * PX_PER_CM;
  const hRightX = geom.pageLeft + (PAGE_W_CM - margins.right) * PX_PER_CM;
  const vTopY   = geom.pageTop - geom.scrollTop + margins.top * PX_PER_CM;
  const vBotY   = geom.pageTop - geom.scrollTop + (PAGE_H_CM - margins.bottom) * PX_PER_CM;

  return (
    <main className="main">
      <div className="topbar">
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
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="topbar-spacer"></div>

        <div className="page-counter" title="현재 페이지 / 전체 페이지">
          <span className="page-counter-cur">{currentPage}</span>
          <span className="page-counter-sep">/</span>
          <span className="page-counter-total">{pageCount}</span>
        </div>

        <div className={`save-status ${statusClass}`}>
          <span className="pulse"></span>
          {statusText}
        </div>

        <SplitButton
          items={items}
          workspaceId={workspaceId}
          currentFileId={file.id}
          splitFileId={splitFileId}
          onOpenSplit={onOpenSplit}
          onCloseSplit={onCloseSplit}
        />

        <button className="btn primary" onClick={() => { onSaveNow({ name: title, content, margins }); setSavedAt(Date.now()); }}>
          <Icon name="save" size={14}/>저장
        </button>
      </div>

      <div className="editor-wrap">
        <div className="ruler-corner">cm</div>

        <div className="ruler-h" ref={rulerHRef}>
          <div className="margin-zone" style={{ left: geom.pageLeft, width: margins.left * PX_PER_CM }}></div>
          <div className="margin-zone" style={{ left: hRightX, width: margins.right * PX_PER_CM }}></div>
          {hTicks}
          <div className="margin-handle" style={{ left: hLeftX }} onMouseDown={startDrag('h', 'left')} title={`왼쪽 여백 ${margins.left}cm`}></div>
          <div className="margin-handle" style={{ left: hRightX }} onMouseDown={startDrag('h', 'right')} title={`오른쪽 여백 ${margins.right}cm`}></div>
        </div>

        <div className="ruler-v" ref={rulerVRef}>
          <div className="margin-zone" style={{ top: geom.pageTop - geom.scrollTop, height: margins.top * PX_PER_CM }}></div>
          <div className="margin-zone" style={{ top: vBotY, height: margins.bottom * PX_PER_CM }}></div>
          {vTicks}
          <div className="margin-handle" style={{ top: vTopY }} onMouseDown={startDrag('v', 'top')} title={`위 여백 ${margins.top}cm`}></div>
          <div className="margin-handle" style={{ top: vBotY }} onMouseDown={startDrag('v', 'bottom')} title={`아래 여백 ${margins.bottom}cm`}></div>
        </div>

        <div className="editor-scroll" ref={scrollRef} onScroll={recompute}>
          <div className="page-wrap">
            <PageStack
              pageCount={pageCount}
              margins={margins}
              editableRef={editableRef}
              pageRef={pageRef}
              onInput={applyContentFromDOM}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function PageStack({ pageCount, margins, editableRef, pageRef, onInput }) {
  const stride = PAGE_H_PX + PAGE_GAP;
  const stackHeight = pageCount * PAGE_H_PX + Math.max(0, pageCount - 1) * PAGE_GAP;

  // Build a CSS mask so text in gap zones (between pages) is invisible
  // This gives a clean "page break" appearance
  let maskImage = 'none';
  if (pageCount > 1) {
    const stops = ['black 0'];
    for (let i = 1; i < pageCount; i++) {
      const y = i * PAGE_H_PX + (i - 1) * PAGE_GAP;
      stops.push(`black ${y}px`);
      stops.push(`transparent ${y}px`);
      stops.push(`transparent ${y + PAGE_GAP}px`);
      stops.push(`black ${y + PAGE_GAP}px`);
    }
    stops.push(`black ${stackHeight}px`);
    maskImage = `linear-gradient(to bottom, ${stops.join(', ')})`;
  }

  return (
    <div className="page-stack" ref={pageRef} style={{ height: stackHeight }}>
      {/* Visual A4 sheets stacked behind the editable */}
      {Array.from({ length: pageCount }).map((_, i) => (
        <div
          key={i}
          className="page-sheet"
          style={{ top: i * stride, height: PAGE_H_PX }}
        >
          <CornerCrops margins={margins} />
          <div className="page-sheet-number">— {i + 1} —</div>
        </div>
      ))}

      {/* The editable spans the full stack, masked over gap regions */}
      <div
        ref={editableRef}
        className="page-content"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-placeholder="여기에 글을 시작하세요."
        style={{
          padding: `${margins.top * PX_PER_CM}px ${margins.right * PX_PER_CM}px ${margins.bottom * PX_PER_CM}px ${margins.left * PX_PER_CM}px`,
          height: stackHeight,
          WebkitMaskImage: maskImage,
          maskImage: maskImage,
        }}
        onInput={onInput}
      />
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
      <div style={{ ...base, left: l - S, top: t,        borderRightWidth: 1, borderTopWidth: 1, borderLeftWidth: 0, borderBottomWidth: 0 }}></div>
      <div style={{ ...base, right: r - S, top: t,       borderLeftWidth: 1,  borderTopWidth: 1, borderRightWidth: 0, borderBottomWidth: 0 }}></div>
      <div style={{ ...base, left: l - S, bottom: b,     borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 0, borderTopWidth: 0 }}></div>
      <div style={{ ...base, right: r - S, bottom: b,    borderLeftWidth: 1,  borderBottomWidth: 1, borderRightWidth: 0, borderTopWidth: 0 }}></div>
    </>
  );
}

function SplitButton({ items, workspaceId, currentFileId, splitFileId, onOpenSplit, onCloseSplit }) {
  const [open, setOpen] = useStateE(false);
  const rootRef = useRefE(null);
  useEffectE(() => {
    function handle(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function descendant(id) {
    if (!workspaceId) return true;
    let cur = id;
    while (cur) {
      if (cur === workspaceId) return true;
      const f = items.find(x => x.id === cur);
      if (!f) return false;
      cur = f.parent;
    }
    return false;
  }
  const others = items
    .filter(it => it.type === 'file' && it.id !== currentFileId && descendant(it.parent))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

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
          {others.length === 0 && (
            <div className="ref-picker-empty">작업 폴더에 다른 파일이 없습니다.</div>
          )}
          {others.map(f => (
            <button
              key={f.id}
              className="ref-picker-item"
              onClick={() => { onOpenSplit(f.id); setOpen(false); }}
            >
              <Icon name="file" size={13}/>
              <span className="ref-picker-name">{f.name || '제목 없음'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

window.Editor = Editor;
