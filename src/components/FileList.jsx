import React, { useState, useMemo } from 'react';
import Icon from './Icon.jsx';

export function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 10) return '방금 전';
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  const date = new Date(ts);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function formatSize(n) {
  if (n == null) return '—';
  if (n < 1000) return `${n}자`;
  return `${(n / 1000).toFixed(1)}K자`;
}

function WorkspacePicker({ workspaceName, workspacePath, onOpenDialog }) {
  return (
    <button className="ws-picker-btn" onClick={onOpenDialog}>
      <Icon name="folder" size={14}/>
      <span className="ws-picker-label">
        {workspaceName || '작업 폴더 열기…'}
      </span>
      {workspacePath && (
        <span className="ws-picker-path" title={workspacePath}>{workspacePath}</span>
      )}
      <Icon name="caretDown" size={11}/>
    </button>
  );
}

function EmptyWorkspace({ onPickClick }) {
  return (
    <div className="empty-workspace">
      <div className="empty-illust">
        <svg width="72" height="56" viewBox="0 0 72 56" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
          <path d="M4 10a3 3 0 0 1 3-3h16l5 5h37a3 3 0 0 1 3 3v32a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V10z" fill="currentColor" fillOpacity="0.05"/>
          <path d="M4 10a3 3 0 0 1 3-3h16l5 5h37a3 3 0 0 1 3 3v32a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V10z"/>
        </svg>
      </div>
      <div className="empty-title">작업 폴더가 아직 선택되지 않았습니다</div>
      <div className="empty-sub">상단의 '작업 폴더 열기'에서 폴더를 골라 글쓰기를 시작하세요.</div>
      <button className="btn primary" onClick={onPickClick} style={{ marginTop: 16 }}>
        <Icon name="folder" size={14}/>작업 폴더 열기…
      </button>
    </div>
  );
}

export default function FileList({
  items, workspaceId, workspaceName, workspacePath, currentFolderId, breadcrumb,
  onEnter, onOpenFile, onUp, onJumpToWorkspace, onJumpTo,
  onOpenWorkspaceDialog,
  onNewFile, onNewFolder, onDelete, onRename,
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('updated');
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');

  const noWorkspace = !workspaceId;

  const childrenAll = items.filter(it => it.parent === currentFolderId);

  const filtered = useMemo(() => {
    let r = childrenAll.filter(it =>
      (it.name || '').toLowerCase().includes(query.toLowerCase())
    );
    const folders = r.filter(it => it.type === 'folder');
    const files = r.filter(it => it.type === 'file');
    function srt(list) {
      if (sort === 'updated') list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      else if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      return list;
    }
    return [...srt(folders), ...srt(files)];
  }, [childrenAll, query, sort]);

  function startRename(it) {
    setRenamingId(it.id);
    setRenameVal(it.name || '');
  }
  function commitRename() {
    if (renamingId && renameVal.trim()) onRename(renamingId, renameVal.trim());
    setRenamingId(null);
    setRenameVal('');
  }

  return (
    <main className="main">
      <div className="topbar">
        <div className="chat-head-title" style={{ gap: 10 }}>
          <span style={{
            width: 22, height: 22, borderRadius: 6,
            background: 'var(--gray-700)', color: 'white',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 11, letterSpacing: -0.5,
          }}>tB</span>
          <span style={{ fontSize: 14 }}>theBooks</span>
        </div>
        <div className="divider-v"></div>

        <WorkspacePicker
          workspaceName={workspaceName}
          workspacePath={workspacePath}
          onOpenDialog={onOpenWorkspaceDialog}
        />

        {!noWorkspace && breadcrumb.length > 0 && (
          <div className="bucket-path">
            <span className="bucket-sep">/</span>
            <button
              className={`bucket-seg ${currentFolderId === workspaceId ? 'current' : ''}`}
              onClick={() => onJumpToWorkspace()}
            >{workspaceName}</button>
            {breadcrumb.slice(1).map((b, i) => (
              <React.Fragment key={b.id}>
                <span className="bucket-sep">/</span>
                <button
                  className={`bucket-seg ${i === breadcrumb.length - 2 ? 'current' : ''}`}
                  onClick={() => onJumpTo(b.id)}
                >{b.name}</button>
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="topbar-spacer"></div>
        {!noWorkspace && (
          <>
            <button className="btn ghost" onClick={onNewFolder}>
              <Icon name="folderPlus" size={14}/>새 폴더
            </button>
            <button className="btn primary" onClick={onNewFile}>
              <Icon name="plus" size={14}/>새 글
            </button>
          </>
        )}
      </div>

      {noWorkspace ? (
        <EmptyWorkspace onPickClick={onOpenWorkspaceDialog} />
      ) : (
        <>
          <div className="bucket-toolbar">
            <button
              className="bucket-up"
              onClick={onUp}
              title="상위로"
              disabled={currentFolderId === workspaceId}
            >
              <Icon name="arrowLeft" size={14}/>
            </button>
            <div className="search-box">
              <Icon name="search" size={14}/>
              <input
                placeholder="이 폴더에서 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}></div>
            <span className="caption" style={{ marginRight: 8 }}>총 {filtered.length}개</span>
          </div>

          <div className="bucket-table">
            <div className="bucket-row bucket-header">
              <div className="col col-icon"></div>
              <div className="col col-name">
                <button className={`col-sort ${sort === 'name' ? 'on' : ''}`} onClick={() => setSort('name')}>
                  이름 <Icon name="caretDown" size={10}/>
                </button>
              </div>
              <div className="col col-type">종류</div>
              <div className="col col-size">크기</div>
              <div className="col col-time">
                <button className={`col-sort ${sort === 'updated' ? 'on' : ''}`} onClick={() => setSort('updated')}>
                  최종 수정 <Icon name="caretDown" size={10}/>
                </button>
              </div>
              <div className="col col-actions"></div>
            </div>

            {filtered.length === 0 && (
              <div className="bucket-empty">
                {query ? '검색 결과가 없습니다.' : '비어있는 폴더입니다. 위에서 새 글이나 새 폴더를 만들어 보세요.'}
              </div>
            )}

            {filtered.map(it => {
              const isFolder = it.type === 'folder';
              const childCount = isFolder ? items.filter(x => x.parent === it.id).length : null;
              const renaming = renamingId === it.id;
              return (
                <div
                  key={it.id}
                  className="bucket-row"
                  onDoubleClick={() => isFolder ? onEnter(it.id) : onOpenFile(it.id)}
                >
                  <div className="col col-icon">
                    {isFolder
                      ? <span style={{ color: 'var(--info-500)' }}><Icon name="folder" size={16}/></span>
                      : <Icon name="file" size={16}/>}
                  </div>
                  <div className="col col-name">
                    {renaming ? (
                      <input
                        autoFocus
                        className="rename-input"
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') { setRenamingId(null); setRenameVal(''); }
                        }}
                      />
                    ) : (
                      <button
                        className="row-name-btn"
                        onClick={() => isFolder ? onEnter(it.id) : onOpenFile(it.id)}
                      >{it.name || (isFolder ? '제목 없는 폴더' : '제목 없음')}</button>
                    )}
                  </div>
                  <div className="col col-type">{isFolder ? '폴더' : '문서'}</div>
                  <div className="col col-size">
                    {isFolder
                      ? `${childCount}개 항목`
                      : (typeof it.content === 'string' ? formatSize(it.content.length) : '—')}
                  </div>
                  <div className="col col-time">{timeAgo(it.updatedAt)}</div>
                  <div className="col col-actions">
                    <button className="icon-btn" title="이름 변경" onClick={(e) => { e.stopPropagation(); startRename(it); }}>
                      <Icon name="edit" size={13}/>
                    </button>
                    <button className="icon-btn danger" title="삭제" onClick={(e) => {
                      e.stopPropagation();
                      const msg = isFolder
                        ? `'${it.name}' 폴더와 내부의 모든 항목을 삭제하시겠습니까?`
                        : `'${it.name}'을(를) 삭제하시겠습니까?`;
                      if (confirm(msg)) onDelete(it.id);
                    }}>
                      <Icon name="trash" size={13}/>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
