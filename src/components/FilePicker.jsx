import { useState, useMemo } from 'react';
import Icon from './Icon.jsx';

// Folder drill-down file picker. Renders inner content only; the caller wraps
// it in a positioned dropdown container (.split-picker-menu / .ref-picker).
export default function FilePicker({ items, workspaceId, currentFileId, onPick }) {
  const [folderId, setFolderId] = useState(workspaceId);

  // Guard against a stale folderId (folder renamed/deleted while open).
  const folderId2 = items.some(x => x.id === folderId) ? folderId : workspaceId;
  const current = items.find(x => x.id === folderId2) || null;
  const atRoot = folderId2 === workspaceId;

  const { folders, files } = useMemo(() => {
    const children = items.filter(it => it.parent === folderId2);
    const folders = children
      .filter(it => it.type === 'folder')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
    const files = children
      .filter(it => it.type === 'file' && it.id !== currentFileId)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { folders, files };
  }, [items, folderId2, currentFileId]);

  return (
    <>
      <div className="file-picker-head">
        {!atRoot && (
          <button
            type="button"
            className="file-picker-up"
            onClick={() => setFolderId(current?.parent || workspaceId)}
            title="상위 폴더로"
            aria-label="상위 폴더로"
          >
            <Icon name="chevronLeft" size={14} />
          </button>
        )}
        <span className="file-picker-cur" title={current?.name || '워크스페이스'}>
          <Icon name="folder" size={13} />
          <span className="ref-picker-name">{current?.name || '워크스페이스'}</span>
        </span>
      </div>

      {folders.length === 0 && files.length === 0 ? (
        <div className="ref-picker-empty">이 폴더에 항목이 없습니다.</div>
      ) : (
        <>
          {folders.map(f => (
            <button
              key={f.id}
              type="button"
              className="ref-picker-item"
              onClick={() => setFolderId(f.id)}
            >
              <Icon name="folder" size={13} />
              <span className="ref-picker-name">{f.name || '제목 없음'}</span>
              <Icon name="chevronRight" size={12} />
            </button>
          ))}
          {files.map(f => (
            <button
              key={f.id}
              type="button"
              className="ref-picker-item"
              onClick={() => onPick(f.id)}
            >
              <Icon name="file" size={13} />
              <span className="ref-picker-name">{f.name || '제목 없음'}</span>
            </button>
          ))}
        </>
      )}
    </>
  );
}
