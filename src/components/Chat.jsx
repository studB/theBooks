import { useState, useRef, useEffect } from 'react';
import Icon from './Icon.jsx';

export default function Chat({ file, refFile }) {
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
