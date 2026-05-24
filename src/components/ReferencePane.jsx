import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import Icon from './Icon.jsx';

export default function ReferencePane({ file, onClose, onSwap, onChangeFile, items, workspaceId, splitWidth }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const others = useMemo(() => {
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
    return items
      .filter(it => it.type === 'file' && it.id !== file.id && descendant(it.parent))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [items, workspaceId, file.id]);

  return (
    <aside className="ref-pane" style={{ width: splitWidth }}>
      <div className="ref-head">
        <button
          className="ref-file-btn"
          onClick={() => setPickerOpen(o => !o)}
          title="다른 파일로 바꾸기"
        >
          <Icon name="file" size={13}/>
          <span className="ref-file-name">{file.name || '제목 없음'}</span>
          <Icon name="caretDown" size={10}/>
        </button>
        <span className="ref-badge">참조</span>
        <div className="ref-actions">
          <button className="icon-btn" title="편집 패널과 바꾸기" onClick={onSwap}>
            <Icon name="swap" size={14}/>
          </button>
          <button className="icon-btn" title="참조 닫기" onClick={onClose}>
            <Icon name="x" size={14}/>
          </button>
        </div>

        {pickerOpen && (
          <>
            <div className="ref-picker-scrim" onClick={() => setPickerOpen(false)}></div>
            <div className="ref-picker">
              <div className="ref-picker-title">참조 파일 바꾸기</div>
              {others.length === 0 && (
                <div className="ref-picker-empty">작업 폴더에 다른 파일이 없습니다.</div>
              )}
              {others.map(f => (
                <button
                  key={f.id}
                  className="ref-picker-item"
                  onClick={() => { onChangeFile(f.id); setPickerOpen(false); }}
                >
                  <Icon name="file" size={13}/>
                  <span className="ref-picker-name">{f.name || '제목 없음'}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="ref-scroll">
        <div className="ref-page">
          <div className="ref-page-title">{file.name || '제목 없음'}</div>
          <div className="ref-page-content markdown-body">
            {file.content
              ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  components={{
                    a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                  }}
                >
                  {file.content}
                </ReactMarkdown>
              )
              : <span className="ref-empty">비어있는 글입니다.</span>}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function SplitDivider({ onDrag }) {
  function start(e) {
    e.preventDefault();
    const startX = e.clientX;
    function move(ev) { onDrag(ev.clientX - startX); }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
    }
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
  return <div className="split-divider" onMouseDown={start}><div className="split-divider-grip"></div></div>;
}
