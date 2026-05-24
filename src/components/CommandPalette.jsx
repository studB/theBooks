import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Icon from './Icon.jsx';

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  paddingTop: '12vh',
  zIndex: 1000,
};

const dialogStyle = {
  background: 'white', borderRadius: 12, width: 560, maxWidth: '92vw',
  boxShadow: '0 12px 48px rgba(0,0,0,0.22)',
  display: 'flex', flexDirection: 'column',
  overflow: 'hidden',
};

const inputRowStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '12px 14px', borderBottom: '1px solid var(--gray-100, #f3f4f6)',
};

const inputStyle = {
  flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent',
};

const listStyle = {
  maxHeight: '48vh', overflowY: 'auto', padding: 4,
};

function rowStyle(active) {
  return {
    padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
    display: 'flex', flexDirection: 'column', gap: 2,
    background: active ? 'var(--gray-100, #f3f4f6)' : 'transparent',
  };
}

const titleStyle = {
  fontSize: 13, color: 'var(--fg-primary, #111827)', fontWeight: 600,
  display: 'flex', alignItems: 'center', gap: 6,
};

const pathStyle = {
  fontSize: 11, color: 'var(--gray-500, #6b7280)',
};

const snippetStyle = {
  fontSize: 12, color: 'var(--gray-600, #4b5563)', marginTop: 2,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

const emptyStyle = {
  padding: '18px 16px', color: 'var(--gray-500, #6b7280)', fontSize: 13,
  textAlign: 'center',
};

const badgeStyle = (kind) => ({
  fontSize: 10, padding: '1px 6px', borderRadius: 4,
  background: kind === 'body' ? 'var(--gray-100, #f3f4f6)' : 'var(--blue-50, #eff6ff)',
  color: kind === 'body' ? 'var(--gray-600, #4b5563)' : 'var(--blue-700, #1d4ed8)',
  fontWeight: 600,
});

const matchLabel = { name: '파일명', title: '제목', body: '본문' };

export default function CommandPalette({ open, onClose, onPickFile }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setHighlight(0);
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await invoke('search_workspace', { query: q });
        setResults(Array.isArray(res) ? res : []);
        setHighlight(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    const el = listRef.current?.children?.[highlight];
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [highlight, results]);

  if (!open) return null;

  function handleKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(results.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results[highlight];
      if (hit) {
        onPickFile(hit.relPath);
      }
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <div style={inputRowStyle}>
          <Icon name="search" size={14}/>
          <input
            ref={inputRef}
            style={inputStyle}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="파일명·제목·본문에서 검색…"
          />
          <span style={{ fontSize: 11, color: 'var(--gray-500, #6b7280)' }}>
            {loading ? '검색 중…' : (results.length > 0 ? `${results.length}건` : '')}
          </span>
        </div>
        <div ref={listRef} style={listStyle}>
          {!query.trim() && (
            <div style={emptyStyle}>
              검색어를 입력하세요. ↑↓로 이동, Enter로 열기, Esc로 닫기.
            </div>
          )}
          {query.trim() && !loading && results.length === 0 && (
            <div style={emptyStyle}>일치하는 파일이 없습니다.</div>
          )}
          {results.map((hit, i) => (
            <div
              key={`${hit.relPath}-${i}`}
              style={rowStyle(i === highlight)}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => onPickFile(hit.relPath)}
            >
              <div style={titleStyle}>
                <Icon name="file" size={12}/>
                <span>{hit.title || hit.relPath}</span>
                <span style={badgeStyle(hit.matchType)}>{matchLabel[hit.matchType] || hit.matchType}</span>
              </div>
              <div style={pathStyle}>{hit.relPath}</div>
              {hit.matchType === 'body' && hit.snippet && (
                <div style={snippetStyle}>{hit.snippet}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
