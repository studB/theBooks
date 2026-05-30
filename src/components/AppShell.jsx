import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import FileList from './FileList.jsx';
import Editor from './Editor.jsx';
import SidePanel from './SidePanel.jsx';
import ReferencePane, { SplitDivider } from './ReferencePane.jsx';
import WorkspacePickerModal from './WorkspacePickerModal.jsx';
import CommandPalette from './CommandPalette.jsx';
import AnalysisPanel from './AnalysisPanel.jsx';
import useGitStatus from '../hooks/useGitStatus.js';

const LEGACY_STORAGE_KEY = 'thebooks.v4.items';
const LEGACY_WORKSPACE_KEY = 'thebooks.v4.workspace';
const CHAT_COLLAPSED_KEY = 'thebooks.chat.collapsed';
const SIDE_PANEL_MODE_KEY = 'thebooks.sidePanel.mode';
const SIDE_PANEL_WIDTH_KEY = 'thebooks.sidePanel.width';
const SIDE_PANEL_MIN_WIDTH = 240;
const SIDE_PANEL_MAX_WIDTH = 900;
const SIDE_PANEL_DEFAULT_WIDTH = 320;
const ROOT_ID = '__root__';

function readSidePanelWidth() {
  try {
    const v = parseInt(localStorage.getItem(SIDE_PANEL_WIDTH_KEY) || '', 10);
    if (Number.isFinite(v) && v >= SIDE_PANEL_MIN_WIDTH) return v;
  } catch {}
  return SIDE_PANEL_DEFAULT_WIDTH;
}
function writeSidePanelWidth(w) {
  try { localStorage.setItem(SIDE_PANEL_WIDTH_KEY, String(w)); } catch {}
}

function readSidePanelMode() {
  try {
    const v = localStorage.getItem(SIDE_PANEL_MODE_KEY);
    return v === 'terminal' ? 'terminal' : 'chat';
  } catch { return 'chat'; }
}
function writeSidePanelMode(mode) {
  try { localStorage.setItem(SIDE_PANEL_MODE_KEY, mode); } catch {}
}

function readChatCollapsedPref() {
  try { return localStorage.getItem(CHAT_COLLAPSED_KEY) === '1'; }
  catch { return false; }
}
function writeChatCollapsedPref(on) {
  try { localStorage.setItem(CHAT_COLLAPSED_KEY, on ? '1' : '0'); } catch {}
}

function basename(path) {
  if (!path) return '';
  const cleaned = path.replace(/[\\/]+$/, '');
  const m = cleaned.match(/[^\\/]+$/);
  return m ? m[0] : cleaned;
}

function parentOf(id) {
  if (!id || id === ROOT_ID) return null;
  const idx = id.lastIndexOf('/');
  return idx === -1 ? ROOT_ID : id.slice(0, idx);
}

function pathSegments(id) {
  if (!id || id === ROOT_ID) return [];
  return id.split('/').filter(Boolean);
}

function buildItems(raw, workspaceName) {
  const root = {
    id: ROOT_ID,
    type: 'folder',
    name: workspaceName || '워크스페이스',
    parent: null,
    createdAt: 0,
    updatedAt: 0,
  };
  const remapped = raw.map(it => ({
    ...it,
    parent: it.parent ? it.parent : ROOT_ID,
  }));
  return [root, ...remapped];
}

export default function AppShell() {
  const [workspacePath, setWorkspacePath] = useState(null);
  const [items, setItems] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [openFileId, setOpenFileId] = useState(null);
  const [splitFileId, setSplitFileId] = useState(null);
  const [splitWidth, setSplitWidth] = useState(420);
  const [chatCollapsed, setChatCollapsed] = useState(readChatCollapsedPref);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [sidePanelMode, setSidePanelModeState] = useState(readSidePanelMode);
  const [sidePanelWidth, setSidePanelWidth] = useState(readSidePanelWidth);
  const [terminalSessionId, setTerminalSessionId] = useState(null);

  const handleSidePanelResize = useCallback((deltaX) => {
    setSidePanelWidth(prev => {
      const max = Math.min(SIDE_PANEL_MAX_WIDTH, Math.floor(window.innerWidth * 0.7));
      const next = Math.max(SIDE_PANEL_MIN_WIDTH, Math.min(max, prev - deltaX));
      writeSidePanelWidth(next);
      return next;
    });
  }, []);

  const setSidePanelMode = useCallback((mode) => {
    setSidePanelModeState(mode);
    writeSidePanelMode(mode);
  }, []);

  const toggleChat = useCallback(() => {
    setChatCollapsed(prev => {
      const next = !prev;
      writeChatCollapsedPref(next);
      return next;
    });
  }, []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const autoSyncedRef = useRef(false);

  const workspaceKind = workspacePath
    ? (workspacePath.startsWith('s3://') ? 's3' : 'local')
    : null;
  const { gitStatus, gitLoading, refreshGit } = useGitStatus(workspacePath, workspaceKind);
  const workspaceName = useMemo(() => {
    if (!workspacePath) return '';
    if (workspaceKind === 's3') {
      const rest = workspacePath.slice('s3://'.length);
      return basename(rest) || rest;
    }
    return basename(workspacePath);
  }, [workspacePath, workspaceKind]);
  const workspaceId = workspacePath ? ROOT_ID : null;

  const refresh = useCallback(async (path) => {
    const effectivePath = path !== undefined ? path : workspacePath;
    if (!effectivePath) {
      setItems([]);
      return [];
    }
    try {
      const raw = await invoke('list_workspace');
      const next = buildItems(raw, basename(effectivePath));
      setItems(prev => {
        const contentById = new Map();
        prev.forEach(it => {
          if (it.type === 'file' && typeof it.content === 'string') {
            contentById.set(it.id, it.content);
          }
        });
        return next.map(it => {
          if (it.type === 'file' && contentById.has(it.id)) {
            return { ...it, content: contentById.get(it.id) };
          }
          return it;
        });
      });
      setLoadError(null);
      return raw;
    } catch (e) {
      setLoadError(typeof e === 'string' ? e : (e?.message || JSON.stringify(e)));
      return [];
    }
  }, [workspacePath]);

  useEffect(() => {
    (async () => {
      try {
        const ws = await invoke('get_workspace');
        if (ws) {
          setWorkspacePath(ws);
          setCurrentFolderId(ROOT_ID);
        }
      } catch (e) {
        setLoadError(e?.message || String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!workspacePath) return;
    let alive = true;
    (async () => {
      await refresh(workspacePath);
      if (alive) refreshGit();
    })();
    return () => { alive = false; };
  }, [workspacePath, refresh, refreshGit]);

  useEffect(() => {
    if (workspaceKind === 's3' && !autoSyncedRef.current) {
      autoSyncedRef.current = true;
      runSync({ silent: false });
    }
  }, [workspaceKind]);

  useEffect(() => {
    if (!openFileId && terminalSessionId) {
      const id = terminalSessionId;
      setTerminalSessionId(null);
      invoke('terminal_close', { sessionId: id }).catch(() => {});
    }
  }, [openFileId, terminalSessionId]);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function maybeMigrate() {
    let migrated;
    try {
      migrated = await invoke('is_migrated_v4_local');
    } catch { migrated = false; }
    if (migrated) return;
    let raw;
    try { raw = localStorage.getItem(LEGACY_STORAGE_KEY); } catch { return; }
    if (!raw) return;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    let legacyWorkspaceId = null;
    try { legacyWorkspaceId = localStorage.getItem(LEGACY_WORKSPACE_KEY); } catch {}
    try {
      await invoke('migrate_from_local', {
        args: { items: parsed, workspaceId: legacyWorkspaceId },
      });
      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        localStorage.removeItem(LEGACY_WORKSPACE_KEY);
      } catch {}
    } catch (e) {
      setLoadError('마이그레이션 실패: ' + (e?.message || String(e)));
    }
  }

  function pickWorkspace() {
    setPickerOpen(true);
  }

  async function pickLocalFromModal() {
    setPickerBusy(true);
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (!selected || typeof selected !== 'string') return;
      await invoke('set_workspace', { path: selected });
      autoSyncedRef.current = false;
      setWorkspacePath(selected);
      setCurrentFolderId(ROOT_ID);
      setOpenFileId(null);
      setSplitFileId(null);
      await maybeMigrate();
      await refresh(selected);
      setPickerOpen(false);
    } finally {
      setPickerBusy(false);
    }
  }

  async function pickS3FromModal({ bucket, prefix, region, accessKey, secretKey }) {
    setPickerBusy(true);
    try {
      await invoke('set_s3_workspace', {
        args: { bucket, prefix, region, accessKey, secretKey },
      });
      const newWsPath = `s3://${bucket}/${prefix || ''}`;
      autoSyncedRef.current = true;
      setWorkspacePath(newWsPath);
      setCurrentFolderId(ROOT_ID);
      setOpenFileId(null);
      setSplitFileId(null);
      setPickerOpen(false);
      await runSync({ silent: false });
      await refresh(newWsPath);
    } finally {
      setPickerBusy(false);
    }
  }

  async function runSync({ silent } = { silent: false }) {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage(silent ? null : '동기화 중…');
    try {
      const res = await invoke('sync_workspace');
      const parts = [];
      if (res.pulled) parts.push(`내려받음 ${res.pulled}`);
      if (res.pushed) parts.push(`올림 ${res.pushed}`);
      if (res.skipped) parts.push(`그대로 ${res.skipped}`);
      if (res.failed) parts.push(`실패 ${res.failed}`);
      const summary = parts.length ? parts.join(', ') : '변경 없음';
      setSyncMessage(`동기화 완료: ${summary}`);
      if (res.failed && res.errors?.length) {
        setLoadError('일부 파일 동기화 실패: ' + res.errors.slice(0, 3).join(' / '));
      }
      await refresh();
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (e) {
      const msg = e?.message || (typeof e === 'string' ? e : JSON.stringify(e));
      setSyncMessage(null);
      setLoadError('동기화 실패: ' + msg);
    } finally {
      setSyncing(false);
    }
  }

  const breadcrumbForList = useMemo(() => {
    if (!workspaceId) return [];
    const trail = [{ id: ROOT_ID, name: workspaceName || '워크스페이스' }];
    if (currentFolderId && currentFolderId !== ROOT_ID) {
      const segs = pathSegments(currentFolderId);
      let acc = '';
      segs.forEach(seg => {
        acc = acc ? `${acc}/${seg}` : seg;
        trail.push({ id: acc, name: seg });
      });
    }
    return trail;
  }, [workspaceId, workspaceName, currentFolderId]);

  const openFile = openFileId ? items.find(x => x.id === openFileId) : null;
  const splitFile = splitFileId ? items.find(x => x.id === splitFileId) : null;
  useEffect(() => {
    if (splitFileId && !splitFile) setSplitFileId(null);
  }, [splitFileId, splitFile]);

  const editorBreadcrumb = useMemo(() => {
    if (!openFile) return [];
    if (!openFile.parent || openFile.parent === ROOT_ID) {
      return [workspaceName || '워크스페이스'];
    }
    return [workspaceName || '워크스페이스', ...pathSegments(openFile.parent)];
  }, [openFile, workspaceName]);

  async function ensureContent(id) {
    const it = items.find(x => x.id === id);
    if (!it || it.type !== 'file') return;
    if (typeof it.content === 'string') return;
    const data = await invoke('read_file', { relPath: id });
    setItems(arr => arr.map(x => x.id === id
      ? { ...x, content: data.content, margins: data.margins, updatedAt: data.updatedAt }
      : x));
  }

  function describeOpenError(e) {
    if (e && typeof e === 'object' && e.kind === 'Binary') {
      return e.message || '이 파일은 앱에서 열 수 없습니다.';
    }
    return e?.message || (typeof e === 'string' ? e : JSON.stringify(e));
  }

  async function openFileById(id) {
    try {
      await ensureContent(id);
      setOpenFileId(id);
    } catch (e) {
      setLoadError(describeOpenError(e));
    }
  }
  async function openSplitById(id) {
    try {
      await ensureContent(id);
      setSplitFileId(id);
    } catch (e) {
      setLoadError(describeOpenError(e));
    }
  }

  async function writeNow(id, patch) {
    const it = items.find(x => x.id === id);
    if (!it) return;
    const title = patch.name !== undefined ? patch.name : it.name;
    const content = patch.content !== undefined ? patch.content : (it.content || '');
    const margins = patch.margins !== undefined ? patch.margins : (it.margins || { left: 2.5, right: 2.5, top: 2.5, bottom: 2.5 });
    const createdAt = it.createdAt || Date.now();
    try {
      await invoke('write_file', {
        args: { relPath: id, content, margins, title, createdAt },
      });
      refreshGit();
    } catch (e) {
      setLoadError('저장 실패: ' + (e?.message || String(e)));
    }
  }

  function updateFile(id, patch) {
    setItems(its => its.map(it => it.id === id
      ? { ...it, ...patch, updatedAt: Date.now() }
      : it));
    return writeNow(id, patch);
  }

  async function rename(id, name) {
    try {
      const res = await invoke('rename_item', { args: { relPath: id, newName: name } });
      const newId = res.id;
      const wasOpen = openFileId === id;
      const wasSplit = splitFileId === id;
      if (newId !== id) {
        // Carry over the in-memory content/margins from the old id to the new id
        // BEFORE flipping openFileId. Otherwise the Editor remounts (key=file.id)
        // with an empty file.content and shows a blank buffer until the user
        // re-opens the file. Functional updater reads the latest state (which
        // includes the just-saved content from commitTitle's manualSave).
        setItems(arr => {
          const oldItem = arr.find(x => x.id === id);
          if (!oldItem) return arr;
          return arr
            .filter(x => x.id !== id)
            .concat({ ...oldItem, id: newId, name, updatedAt: Date.now() });
        });
        if (wasOpen) setOpenFileId(newId);
        if (wasSplit) setSplitFileId(newId);
        if (currentFolderId === id) setCurrentFolderId(newId);
      }
      await refresh();
      if (newId !== id && (wasOpen || wasSplit)) {
        await ensureContent(newId);
      }
      refreshGit();
    } catch (e) {
      setLoadError('이름 변경 실패: ' + (e?.message || String(e)));
    }
  }

  async function deleteItem(id) {
    try {
      await invoke('delete_item', { relPath: id });
    } catch (e) {
      setLoadError('삭제 실패: ' + (e?.message || String(e)));
      return;
    }
    if (openFileId === id) setOpenFileId(null);
    if (splitFileId === id) setSplitFileId(null);
    if (currentFolderId === id) setCurrentFolderId(parentOf(id) || ROOT_ID);
    await refresh();
  }

  async function handleNewFile() {
    const parent = currentFolderId === ROOT_ID ? null : currentFolderId;
    try {
      const res = await invoke('create_file', { args: { parent, name: '새 글' } });
      await refresh();
      setOpenFileId(res.id);
      await ensureContent(res.id);
    } catch (e) {
      setLoadError('파일 생성 실패: ' + (e?.message || String(e)));
    }
  }
  async function handleNewFolder() {
    const parent = currentFolderId === ROOT_ID ? null : currentFolderId;
    try {
      await invoke('create_folder', { args: { parent, name: '새 폴더' } });
      await refresh();
    } catch (e) {
      setLoadError('폴더 생성 실패: ' + (e?.message || String(e)));
    }
  }
  return (
    <div
      className={`app ${openFile ? 'with-chat' : ''} ${splitFileId ? 'with-split' : ''} ${openFile && chatCollapsed ? 'chat-collapsed' : ''} ${openFile && analysisOpen ? 'with-analysis' : ''}`}
      style={{
        '--chat-width': sidePanelWidth + 'px',
        ...(splitFileId ? { '--split-width': splitWidth + 'px' } : null),
      }}
    >
      {openFile ? (
        <>
          {splitFile && (
            <>
              <ReferencePane
                file={splitFile}
                items={items}
                workspaceId={workspaceId}
                splitWidth={splitWidth}
                onClose={() => setSplitFileId(null)}
                onSwap={() => {
                  const a = openFileId, b = splitFileId;
                  setOpenFileId(b);
                  setSplitFileId(a);
                }}
                onChangeFile={(id) => openSplitById(id)}
              />
              <SplitDivider onDrag={(deltaX) => {
                setSplitWidth(w => Math.max(280, Math.min(window.innerWidth * 0.55, w + deltaX)));
              }} />
            </>
          )}
          <Editor
            key={openFile.id}
            file={openFile}
            breadcrumb={editorBreadcrumb}
            items={items}
            workspaceId={workspaceId}
            workspacePath={workspacePath}
            splitFileId={splitFileId}
            onOpenSplit={(id) => openSplitById(id)}
            onCloseSplit={() => setSplitFileId(null)}
            onChange={(patch) => updateFile(openFile.id, patch)}
            onSaveNow={(patch) => updateFile(openFile.id, patch)}
            onExit={() => { setSplitFileId(null); setOpenFileId(null); }}
            onRenameFile={rename}
            gitStatus={gitStatus}
            gitLoading={gitLoading}
            onRefreshGit={refreshGit}
            analysisOpen={analysisOpen}
            onToggleAnalysis={() => setAnalysisOpen(o => !o)}
            onSyncFromDisk={(data) => setItems(its => its.map(it => it.id === openFile.id
              ? {
                  ...it,
                  content: data.content,
                  ...(data.margins ? { margins: data.margins } : {}),
                  ...(data.updatedAt != null ? { updatedAt: data.updatedAt } : {}),
                }
              : it))}
          />
          {analysisOpen && (
            <AnalysisPanel file={openFile} onClose={() => setAnalysisOpen(false)} />
          )}
          <SidePanel
            mode={sidePanelMode}
            onChangeMode={setSidePanelMode}
            collapsed={chatCollapsed}
            onToggle={toggleChat}
            onResize={handleSidePanelResize}
            terminalEnabled={workspaceKind === 'local' && !!workspacePath}
            terminalCwd={workspaceKind === 'local' ? workspacePath : ''}
            terminalSessionId={terminalSessionId}
            onTerminalSession={setTerminalSessionId}
            onTerminalClosed={() => setTerminalSessionId(null)}
            file={openFile}
            refFile={splitFile}
          />
        </>
      ) : (
        <FileList
          items={items}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          workspacePath={workspacePath}
          workspaceKind={workspaceKind}
          currentFolderId={currentFolderId}
          breadcrumb={breadcrumbForList}
          onOpenWorkspaceDialog={pickWorkspace}
          onEnter={(id) => setCurrentFolderId(id)}
          onJumpToWorkspace={() => setCurrentFolderId(ROOT_ID)}
          onUp={() => {
            if (currentFolderId === ROOT_ID) return;
            setCurrentFolderId(parentOf(currentFolderId) || ROOT_ID);
          }}
          onJumpTo={(id) => setCurrentFolderId(id)}
          onOpenFile={(id) => openFileById(id)}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onDelete={deleteItem}
          onRename={rename}
          syncing={syncing}
          syncMessage={syncMessage}
          onSync={() => runSync({ silent: false })}
          gitStatus={gitStatus}
          gitLoading={gitLoading}
          onRefreshGit={refreshGit}
          onRefresh={() => { refresh(); refreshGit(); }}
        />
      )}

      <WorkspacePickerModal
        open={pickerOpen}
        busy={pickerBusy}
        onClose={() => setPickerOpen(false)}
        onPickLocal={pickLocalFromModal}
        onPickS3={pickS3FromModal}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onPickFile={async (relPath) => {
          setPaletteOpen(false);
          try {
            await openFileById(relPath);
          } catch (e) {
            setLoadError(describeOpenError(e));
          }
        }}
      />

      {loadError && (
        <div style={{
          position: 'fixed', bottom: 12, right: 12, maxWidth: 360,
          background: '#fee', color: '#900', padding: '10px 14px',
          borderRadius: 8, fontSize: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          zIndex: 999,
        }}>
          {loadError}
          <button
            onClick={() => setLoadError(null)}
            style={{ marginLeft: 8, background: 'transparent', border: 'none', color: '#900', cursor: 'pointer' }}
          >닫기</button>
        </div>
      )}
    </div>
  );
}
