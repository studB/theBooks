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
  const openingRef = useRef(false);

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
    requestAnimationFrame(() => {
      try { fit.fit(); } catch {}
      try { term.focus(); } catch {}
    });

    let unlistenOutput = null;
    let unlistenExit = null;
    let alive = true;

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
      if (openingRef.current) return;
      openingRef.current = true;
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
        term.write(`\r\n\x1b[31m터미널 시작 실패: ${e?.message || e}\x1b[0m\r\n`);
      } finally {
        openingRef.current = false;
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
      if (unlistenOutput) unlistenOutput();
      if (unlistenExit) unlistenExit();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="terminal-wrap" />;
}
