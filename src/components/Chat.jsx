import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
  const [needsKey, setNeedsKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const streamRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stored = await invoke('get_api_key');
        if (alive && !stored) setNeedsKey(true);
      } catch (e) {
        if (alive) setNeedsKey(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [messages, busy]);

  async function saveKey() {
    const k = keyDraft.trim();
    if (!k || savingKey) return;
    setSavingKey(true);
    try {
      await invoke('set_api_key', { key: k });
      setKeyDraft('');
      setNeedsKey(false);
    } catch (e) {
      // Stay in banner state; surface error inline
      setMessages(prev => [...prev, {
        role: 'assistant',
        body: '키 저장에 실패했습니다. 다시 시도해 주세요.',
      }]);
    } finally {
      setSavingKey(false);
    }
  }

  async function send(text) {
    const content = (text ?? draft).trim();
    if (!content || busy) return;
    if (needsKey) return;
    setDraft('');
    setBusy(true);

    const next = [...messages, { role: 'user', body: content }];
    setMessages(next);

    try {
      const reply = await invoke('chat_complete', {
        messages: next.map(m => ({ role: m.role, content: m.body })),
      });
      setMessages([...next, { role: 'assistant', body: reply }]);
    } catch (e) {
      const kind = e && typeof e === 'object' ? e.kind : null;
      if (kind === 'NoApiKey' || kind === 'Unauthorized') {
        setNeedsKey(true);
        const note = kind === 'Unauthorized'
          ? 'API 키가 거부되었습니다. 새 키를 입력해 주세요.'
          : 'API 키가 필요합니다. 아래에 키를 입력해 주세요.';
        setMessages([...next, { role: 'assistant', body: note }]);
      } else {
        const detail = e && typeof e === 'object' && e.message ? `: ${e.message}` : '';
        setMessages([...next, {
          role: 'assistant',
          body: `응답을 받아오지 못했습니다${detail}.`,
        }]);
      }
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

      {needsKey && (
        <div className="api-key-banner">
          <div className="api-key-banner-title">Anthropic API 키 설정</div>
          <div className="api-key-banner-sub">
            채팅을 사용하려면 API 키가 필요합니다. console.anthropic.com 에서 발급한 키를 입력하세요. 키는 이 기기에만 저장됩니다.
          </div>
          <div className="api-key-banner-row">
            <input
              type="password"
              placeholder="sk-ant-..."
              value={keyDraft}
              disabled={savingKey}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  saveKey();
                }
              }}
            />
            <button
              className="btn primary"
              onClick={saveKey}
              disabled={savingKey || !keyDraft.trim()}
            >
              저장
            </button>
          </div>
        </div>
      )}

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

      {messages.length <= 1 && !busy && !needsKey && (
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
            placeholder={needsKey ? 'API 키를 먼저 설정하세요' : 'AI에게 무엇이든 물어보세요'}
            value={draft}
            disabled={busy || needsKey}
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
            <button className="send-btn" onClick={() => send()} disabled={busy || needsKey || !draft.trim()}>
              <Icon name="send" size={14} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
