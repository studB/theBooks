import { useEffect, useState } from 'react';
import Chat from './Chat.jsx';
import Terminal from './Terminal.jsx';
import Icon from './Icon.jsx';

function ResizeHandle({ onResize }) {
  function start(e) {
    e.preventDefault();
    let lastX = e.clientX;
    function move(ev) {
      const dx = ev.clientX - lastX;
      lastX = ev.clientX;
      onResize(dx);
    }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
    }
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
  return (
    <div
      className="side-panel-resizer"
      onMouseDown={start}
      title="패널 너비 조절"
      aria-label="패널 너비 조절"
    />
  );
}

export default function SidePanel({
  mode,
  onChangeMode,
  collapsed,
  onToggle,
  onResize,
  terminalEnabled,
  terminalCwd,
  terminalSessionId,
  onTerminalSession,
  onTerminalClosed,
  file,
  refFile,
}) {
  const effectiveMode = mode === 'terminal' && !terminalEnabled ? 'chat' : mode;
  const [terminalEverShown, setTerminalEverShown] = useState(
    effectiveMode === 'terminal' && terminalEnabled
  );
  useEffect(() => {
    if (effectiveMode === 'terminal' && terminalEnabled) {
      setTerminalEverShown(true);
    }
  }, [effectiveMode, terminalEnabled]);

  if (collapsed) {
    return (
      <aside className="chat chat--collapsed">
        <button
          className="chat-toggle chat-toggle--expand"
          title={mode === 'terminal' ? '터미널 펼치기' : '채팅 펼치기'}
          onClick={onToggle}
        >
          <Icon name="sparkles" size={14} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="chat side-panel">
      {onResize && <ResizeHandle onResize={onResize} />}
      <button
        className="chat-toggle chat-toggle--collapse"
        title="패널 접기"
        onClick={onToggle}
        aria-label="패널 접기"
      >
        ›
      </button>
      <div className="side-panel-tabs">
        <button
          type="button"
          className={`side-panel-tab ${effectiveMode === 'chat' ? 'is-active' : ''}`}
          onClick={() => onChangeMode('chat')}
        >
          AI 채팅
        </button>
        <button
          type="button"
          className={`side-panel-tab ${effectiveMode === 'terminal' ? 'is-active' : ''}`}
          onClick={() => terminalEnabled && onChangeMode('terminal')}
          disabled={!terminalEnabled}
          title={terminalEnabled ? '' : '로컬 워크스페이스에서만 사용할 수 있어요'}
        >
          터미널
        </button>
      </div>
      <div
        className="side-panel-pane"
        style={{ display: effectiveMode === 'chat' ? 'flex' : 'none' }}
      >
        <Chat file={file} refFile={refFile} embedded />
      </div>
      {terminalEnabled && terminalEverShown && (
        <div
          className="side-panel-pane"
          style={{ display: effectiveMode === 'terminal' ? 'flex' : 'none' }}
        >
          <Terminal
            cwd={terminalCwd}
            sessionId={terminalSessionId}
            onSession={onTerminalSession}
            onClosed={onTerminalClosed}
          />
        </div>
      )}
    </aside>
  );
}
