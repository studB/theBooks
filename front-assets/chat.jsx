// ============================================================
// theBooks — AI Chat panel (Claude-Code style)
// ============================================================

const { useState, useRef, useEffect } = React;

function Icon({ name, size = 16, stroke = 1.6 }) {
  const paths = {
    sparkles: <><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"/><path d="M19 14l.7 1.9L21.6 17l-1.9.7L19 19.6l-.7-1.9L16.4 17l1.9-.7L19 14z"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    send: <><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></>,
    arrowLeft: <><path d="M19 12H5M12 19l-7-7 7-7"/></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></>,
    cursor: <><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></>,
    typewriter: <><rect x="3" y="9" width="18" height="9" rx="1"/><path d="M5 9V5h14v4"/><path d="M7 14h.01M11 14h.01M15 14h.01M7 18v3M17 18v3M9 21h6"/></>,
    trash: <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    moon: <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>,
    panel: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></>,
    more: <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
    wrench: <><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.8-2.8 2.3-2.7z"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    sortIcon: <><path d="M3 6h13M3 12h9M3 18h5"/></>,
    folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></>,
    folderPlus: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M12 11v6M9 14h6"/></>,
    root: <><path d="M3 12l9-8 9 8"/><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"/></>,
    caretDown: <><path d="M6 9l6 6 6-6"/></>,
    check: <><path d="M20 6 9 17l-5-5"/></>,
    chevronLeft: <><path d="M15 18l-6-6 6-6"/></>,
    chevronRight: <><path d="M9 6l6 6-6 6"/></>,
    hd: <><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M5 14l2-7h10l2 7"/></>,
    split: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/></>,
    swap: <><path d="M7 16V4M7 4l-3 3M7 4l3 3M17 8v12M17 20l-3-3M17 20l3-3"/></>,
    x: <><path d="M18 6 6 18M6 6l12 12"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={stroke}
         strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function Chat({ file, refFile }) {
  const fileName = (file && file.name) || '제목 없는 글';
  const refName = refFile && (refFile.name || '제목 없는 글');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      body: `'${fileName}'을(를) 같이 다듬어 볼까요? 문장 톤·이어 쓸 내용·맞춤법 점검을 도와드릴 수 있어요.`,
    },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const streamRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [messages, busy]);

  async function send(text) {
    const content = (text ?? draft).trim();
    if (!content || busy) return;
    setDraft('');
    setBusy(true);

    const next = [...messages, { role: 'user', body: content }];
    setMessages(next);

    try {
      const reply = await window.claude.complete({
        messages: next.map(m => ({ role: m.role, content: m.body })),
      });
      setMessages([...next, { role: 'assistant', body: reply }]);
    } catch (e) {
      setMessages([...next, {
        role: 'assistant',
        body: '응답을 받아오지 못했습니다. 잠시 후 다시 시도해 주세요.',
      }]);
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [
    { t: '문장 다듬기', s: '선택한 부분을 더 자연스럽게' },
    { t: '이어 쓸 내용', s: '다음 단락 아이디어를 줘' },
    { t: '맞춤법 점검', s: '오탈자를 짚어줘' },
    { t: '요약', s: '지금까지 쓴 내용을 3줄로' },
  ];

  return (
    <aside className="chat">
      <div className="chat-head">
        <div className="chat-head-title" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="dot"></span>
            AI 작가 비서
          </span>
          <span style={{ font: 'var(--caption)', color: 'var(--fg-muted)', fontWeight: 400, paddingLeft: 16 }}>
            {fileName}
            {refName && <> · <span style={{ color: 'var(--info-500)' }}>참조: {refName}</span></>}
          </span>
        </div>
        <div className="chat-head-actions">
          <button className="icon-btn" title="새 대화"><Icon name="plus" /></button>
          <button className="icon-btn" title="더 보기"><Icon name="more" /></button>
        </div>
      </div>

      <div className="chat-stream" ref={streamRef}>
        {messages.map((m, i) => (
          <div className={`msg ${m.role}`} key={i}>
            <div className="msg-role">{m.role === 'user' ? '나' : 'AI'}</div>
            <div className="msg-body">{m.body}</div>
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <div className="msg-role">AI</div>
            <div className="msg-tool">
              <span className="tool-glyph"><Icon name="sparkles" size={14} /></span>
              생각 중…
            </div>
          </div>
        )}
      </div>

      {messages.length <= 1 && !busy && (
        <div className="suggestions">
          {suggestions.map((s, i) => (
            <button key={i} className="suggest" onClick={() => send(s.t + ': ' + s.s)}>
              <strong>{s.t}</strong>
              {s.s}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input">
        <div className="chat-input-box">
          <textarea
            ref={taRef}
            placeholder="AI에게 무엇이든 물어보세요"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="chat-input-row">
            <span className="hint">Enter 보내기 · Shift+Enter 줄바꿈</span>
            <button className="send-btn" onClick={() => send()} disabled={busy || !draft.trim()}>
              <Icon name="send" size={14} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

window.Chat = Chat;
window.Icon = Icon;
