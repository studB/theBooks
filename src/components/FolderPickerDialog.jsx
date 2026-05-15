import React, { useState, useEffect } from 'react';
import Icon from './Icon.jsx';

export const FS_PREFIX = ['Users', 'jay', 'Documents', 'theBooks'];

const SIDEBAR = [
  { group: '즐겨찾기', items: [
    { id: 'recents', name: '최근 항목', icon: 'clock' },
    { id: 'documents', name: '서류', icon: 'docs' },
    { id: 'desktop', name: '데스크탑', icon: 'desktop' },
    { id: 'icloud', name: 'iCloud Drive', icon: 'cloud' },
  ]},
  { group: '위치', items: [
    { id: 'mac', name: 'Macintosh HD', icon: 'hd' },
  ]},
];

export function pathFor(items, folderId) {
  const trail = [];
  let id = folderId;
  while (id) {
    const f = items.find(x => x.id === id);
    if (!f) break;
    trail.unshift(f.name);
    id = f.parent;
  }
  return [...FS_PREFIX, ...trail];
}

function SidebarIcon({ name }) {
  const map = {
    clock: <><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></>,
    docs: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></>,
    desktop: <><rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/></>,
    cloud: <><path d="M17 16.5A4.5 4.5 0 0 0 14 8 6 6 0 0 0 2 9a4 4 0 0 0 1 7.9h14z"/></>,
    hd: <><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M5 14l2-7h10l2 7"/><circle cx="17" cy="17" r="0.8" fill="currentColor"/></>,
  };
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {map[name] || null}
    </svg>
  );
}

export default function FolderPickerDialog({ open, items, initialFolderId, onCancel, onSelect, onCreateAtRoot }) {
  const [browseId, setBrowseId] = useState(null);
  const [selectedId, setSelectedId] = useState(initialFolderId || null);
  const [sidebarSelected, setSidebarSelected] = useState('documents');

  useEffect(() => {
    if (open) {
      setBrowseId(null);
      setSelectedId(initialFolderId || null);
    }
  }, [open, initialFolderId]);

  if (!open) return null;

  const path = browseId === null ? [...FS_PREFIX] : pathFor(items, browseId);
  const visibleItems = items
    .filter(it => it.type === 'folder' && it.parent === browseId)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));

  function selectedPathDisplay() {
    if (selectedId) return pathFor(items, selectedId).join(' / ');
    if (browseId === null) return FS_PREFIX.join(' / ');
    return pathFor(items, browseId).join(' / ');
  }

  function commit() {
    onSelect(selectedId || browseId);
  }

  return (
    <div className="fp-backdrop" onMouseDown={(e) => { if (e.target.classList.contains('fp-backdrop')) onCancel(); }}>
      <div className="fp-dialog" role="dialog" aria-label="작업 폴더 선택">
        <div className="fp-titlebar">
          <div className="fp-traffic">
            <span className="tl tl-close" onClick={onCancel}></span>
            <span className="tl tl-min"></span>
            <span className="tl tl-max"></span>
          </div>
          <div className="fp-title">폴더 열기</div>
          <div className="fp-trail-nav">
            <button
              className="fp-nav-btn"
              disabled={browseId === null}
              onClick={() => {
                if (browseId === null) return;
                const cur = items.find(x => x.id === browseId);
                setBrowseId(cur ? cur.parent : null);
              }}
              title="뒤로"
            ><Icon name="chevronLeft" size={14}/></button>
            <button className="fp-nav-btn" disabled title="앞으로"><Icon name="chevronRight" size={14}/></button>
          </div>
        </div>

        <div className="fp-body">
          <aside className="fp-sidebar">
            {SIDEBAR.map(group => (
              <div key={group.group} className="fp-sb-group">
                <div className="fp-sb-title">{group.group}</div>
                {group.items.map(it => (
                  <button
                    key={it.id}
                    className={`fp-sb-item ${sidebarSelected === it.id ? 'on' : ''}`}
                    onClick={() => { setSidebarSelected(it.id); setBrowseId(null); }}
                  >
                    <SidebarIcon name={it.icon}/>
                    <span>{it.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </aside>

          <section className="fp-main">
            <div className="fp-path">
              {path.map((seg, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="fp-path-sep">▸</span>}
                  <span className={`fp-path-seg ${i === path.length - 1 ? 'current' : ''}`}>
                    {i === 0 ? <Icon name="hd" size={11}/> : null}
                    {seg}
                  </span>
                </React.Fragment>
              ))}
            </div>

            <div className="fp-grid">
              {visibleItems.length === 0 && (
                <div className="fp-grid-empty">이 위치에는 폴더가 없습니다.</div>
              )}
              {visibleItems.map(f => (
                <button
                  key={f.id}
                  className={`fp-tile ${selectedId === f.id ? 'sel' : ''}`}
                  onClick={() => setSelectedId(f.id)}
                  onDoubleClick={() => { setBrowseId(f.id); setSelectedId(f.id); }}
                >
                  <div className="fp-tile-icon">
                    <svg width="44" height="36" viewBox="0 0 44 36" fill="none">
                      <path d="M2 6a3 3 0 0 1 3-3h10l3 3h21a3 3 0 0 1 3 3v21a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6z" fill="#7fb3e8"/>
                      <path d="M2 9a3 3 0 0 1 3-3h11l3 3h22a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V9z" fill="#5394d6"/>
                      <path d="M2 9a3 3 0 0 1 3-3h11l3 3h22a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V9z" fill="url(#shine)" opacity="0.35"/>
                      <defs>
                        <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="white" stopOpacity="0.5"/>
                          <stop offset="1" stopColor="white" stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <div className="fp-tile-name">{f.name}</div>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="fp-footer">
          <button className="fp-text-btn" onClick={onCreateAtRoot}>
            <Icon name="folderPlus" size={13}/>
            새 폴더
          </button>
          <div className="fp-selected-path">
            {selectedId
              ? <><span className="fp-selected-label">선택됨:</span> {selectedPathDisplay()}</>
              : <span style={{ color: 'var(--fg-muted)' }}>폴더를 선택하세요.</span>}
          </div>
          <div style={{ flex: 1 }}></div>
          <button className="btn ghost" onClick={onCancel}>취소</button>
          <button className="btn primary" disabled={!selectedId && browseId === null} onClick={commit}>
            열기
          </button>
        </div>
      </div>
    </div>
  );
}
