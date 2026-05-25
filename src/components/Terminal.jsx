import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export default function Terminal({ cwd, sessionId, onSession, onClosed }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const sessionRef = useRef(sessionId || null);

  useEffect(() => {
    sessionRef.current = sessionId || null;
  }, [sessionId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.2,
      theme: {
        background: '#1e1e1e',
        foreground: '#e6e6e6',
        cursor: '#e6e6e6',
      },
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fit;
    // Move the IME helper textarea on-screen so macOS Korean IME can track
    // composition state. xterm's default CSS puts it at left:-9999em which
    // makes macOS treat it as non-input. Use inline styles (no !important)
    // so xterm's updateCompositionElements can still reposition it at the
    // cursor when composition starts.
    const helperTa = containerRef.current.querySelector('.xterm-helper-textarea');
    if (helperTa) {
      helperTa.style.left = '0px';
      helperTa.style.top = '0px';
      helperTa.style.width = '1px';
      helperTa.style.height = '1px';
    }

    // --- macOS WKWebView Korean IME bypass ---------------------------------
    // macOS WKWebView's Korean IME does NOT fire compositionstart/end events.
    // It only fires `input` events:
    //   - inputType:"insertText"             = NEW syllable's first jamo
    //                                          (previous syllable is committed)
    //   - inputType:"insertReplacementText"  = current syllable's composing
    //                                          update (e.g., ㄱ → 가 → 간 → 가)
    // xterm.js only forwards insertText via onData and ignores replacementText,
    // so only each syllable's first jamo reaches the PTY (the user sees ㄱ나다라
    // instead of 가나다라). We buffer the latest replacement data, flush it on
    // the next insertText, and stop propagation so xterm doesn't double-send.
    // Capture-phase listeners are attached on the wrap div (an ancestor of
    // helperTa) so they fire before xterm's listeners on the textarea itself.
    let pendingIme = '';
    let pendingIdleTimer = null;
    function sendDirect(data) {
      const id = sessionRef.current;
      if (id && data) invoke('terminal_write', { sessionId: id, data }).catch(() => {});
    }
    function flushPending() {
      if (pendingIme) {
        sendDirect(pendingIme);
        pendingIme = '';
      }
      if (pendingIdleTimer) {
        clearTimeout(pendingIdleTimer);
        pendingIdleTimer = null;
      }
    }
    function schedulePendingIdleFlush() {
      if (pendingIdleTimer) clearTimeout(pendingIdleTimer);
      pendingIdleTimer = setTimeout(() => {
        flushPending();
        if (helperTa) helperTa.value = '';
      }, 600);
    }
    function isHangulChar(s) {
      if (!s) return false;
      const code = s.charCodeAt(0);
      // Hangul syllables, Hangul Jamo, Hangul Compatibility Jamo
      return (
        (code >= 0x1100 && code <= 0x11ff) ||
        (code >= 0x3130 && code <= 0x318f) ||
        (code >= 0xac00 && code <= 0xd7af)
      );
    }
    const onInputCapture = (e) => {
      // Only intercept input events on the helper textarea
      if (e.target !== helperTa) return;
      const t = e.inputType;
      const data = e.data || '';
      if (t === 'insertReplacementText') {
        pendingIme = data;
        if (helperTa) helperTa.value = '';
        schedulePendingIdleFlush();
        e.stopImmediatePropagation();
        return;
      }
      if (t === 'insertText') {
        if (isHangulChar(data)) {
          // New syllable starts; flush previous one
          flushPending();
          pendingIme = data;
          if (helperTa) helperTa.value = '';
          schedulePendingIdleFlush();
        } else {
          // Non-Hangul text (space, English, punctuation)
          flushPending();
          sendDirect(data);
          if (helperTa) helperTa.value = '';
        }
        e.stopImmediatePropagation();
        return;
      }
      if (t === 'deleteContentBackward') {
        if (pendingIme) {
          pendingIme = pendingIme.slice(0, -1);
          if (helperTa) helperTa.value = '';
          if (!pendingIme && pendingIdleTimer) {
            clearTimeout(pendingIdleTimer);
            pendingIdleTimer = null;
          }
        } else {
          sendDirect('\x7f');
        }
        e.stopImmediatePropagation();
        return;
      }
      // Any other inputType: flush and let xterm handle normally
      flushPending();
    };
    const onKeyDownCapture = (e) => {
      if (e.target !== helperTa) return;
      const isImeKey = e.isComposing || e.keyCode === 229 || e.key === 'Process';
      if (isImeKey) {
        // Suppress xterm's keydown for IME keys; input events drive the bypass.
        e.stopImmediatePropagation();
        return;
      }
      // Non-IME key (Enter, arrows, Ctrl+X, etc.) — flush any pending Korean
      // syllable so it goes out before the control key.
      flushPending();
    };
    const onBlur = () => { flushPending(); };
    const wrap = containerRef.current;
    if (wrap) {
      wrap.addEventListener('input', onInputCapture, true);
      wrap.addEventListener('keydown', onKeyDownCapture, true);
    }
    if (helperTa) {
      helperTa.addEventListener('blur', onBlur);
    }

    requestAnimationFrame(() => {
      try { fit.fit(); } catch {}
      try { term.focus(); } catch {}
    });

    let unlistenOutput = null;
    let unlistenExit = null;
    let alive = true;
    let opening = false;

    async function bindEvents(id) {
      unlistenOutput = await listen(`terminal://output/${id}`, (e) => {
        if (!alive) return;
        const payload = e.payload;
        if (typeof payload === 'string') term.write(payload);
      });
      unlistenExit = await listen(`terminal://exit/${id}`, () => {
        if (!alive) return;
        term.write('\r\n\x1b[2m[process exited]\x1b[0m\r\n');
        sessionRef.current = null;
        if (onClosed) onClosed();
      });
    }

    async function ensureSession() {
      if (sessionRef.current) {
        await bindEvents(sessionRef.current);
        return;
      }
      if (opening) return;
      opening = true;
      try {
        const dims = fit.proposeDimensions() || { cols: 80, rows: 24 };
        const id = await invoke('terminal_open', {
          cwd: cwd || '',
          cols: dims.cols || 80,
          rows: dims.rows || 24,
        });
        if (!alive) {
          invoke('terminal_close', { sessionId: id }).catch(() => {});
          return;
        }
        sessionRef.current = id;
        if (onSession) onSession(id);
        await bindEvents(id);
      } catch (e) {
        term.write(`\r\n\x1b[31m터미널 시작 실패: ${e?.message || JSON.stringify(e)}\x1b[0m\r\n`);
      } finally {
        opening = false;
      }
    }

    ensureSession();

    const onData = term.onData((data) => {
      const id = sessionRef.current;
      if (!id) return;
      invoke('terminal_write', { sessionId: id, data }).catch(() => {});
    });

    function handleResize() {
      try { fit.fit(); } catch { return; }
      const id = sessionRef.current;
      if (!id) return;
      const { cols, rows } = term;
      invoke('terminal_resize', { sessionId: id, cols, rows }).catch(() => {});
    }
    const ro = new ResizeObserver(handleResize);
    ro.observe(containerRef.current);
    window.addEventListener('resize', handleResize);

    return () => {
      alive = false;
      onData.dispose();
      ro.disconnect();
      window.removeEventListener('resize', handleResize);
      if (wrap) {
        wrap.removeEventListener('input', onInputCapture, true);
        wrap.removeEventListener('keydown', onKeyDownCapture, true);
      }
      if (helperTa) {
        helperTa.removeEventListener('blur', onBlur);
      }
      if (pendingIdleTimer) clearTimeout(pendingIdleTimer);
      if (unlistenOutput) unlistenOutput();
      if (unlistenExit) unlistenExit();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="terminal-wrap" />;
}
