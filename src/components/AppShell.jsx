import { useState, useEffect, useMemo } from 'react';
import FileList from './FileList.jsx';
import FolderPickerDialog from './FolderPickerDialog.jsx';
import Editor from './Editor.jsx';
import Chat from './Chat.jsx';
import ReferencePane, { SplitDivider } from './ReferencePane.jsx';

const STORAGE_KEY = 'thebooks.v4.items';
const WORKSPACE_KEY = 'thebooks.v4.workspace';

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return seedItems();
}
function saveItems(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) {}
}
function loadWorkspace() {
  try { return localStorage.getItem(WORKSPACE_KEY); } catch (e) {}
  return null;
}
function saveWorkspace(id) {
  try {
    if (id) localStorage.setItem(WORKSPACE_KEY, id);
    else localStorage.removeItem(WORKSPACE_KEY);
  } catch (e) {}
}

function seedItems() {
  const now = Date.now();
  return [
    { id: 'd-essay',   type: 'folder', name: '에세이', parent: null, createdAt: now - 86400000*60, updatedAt: now - 86400000*2 },
    { id: 'd-novel',   type: 'folder', name: '소설',   parent: null, createdAt: now - 86400000*45, updatedAt: now - 86400000*7 },
    { id: 'd-memo',    type: 'folder', name: '메모',   parent: null, createdAt: now - 86400000*40, updatedAt: now - 86400000*14 },
    { id: 'd-journal', type: 'folder', name: '일기',   parent: null, createdAt: now - 86400000*20, updatedAt: now - 86400000*1 },
    { id: 'd-short',   type: 'folder', name: '단편',   parent: 'd-novel', createdAt: now - 86400000*30, updatedAt: now - 86400000*7 },

    {
      id: 'f-summer', type: 'file', name: '여름의 끝에서', parent: 'd-essay',
      content:
`매미 소리가 잦아들기 시작한 8월 말. 창문 너머로 들리던 그 끈질긴 울음이 사라지자, 동네는 갑자기 조용해졌다.

나는 책상 앞에 앉아 한참을 가만히 있었다. 무언가 쓰려고 했지만, 글자는 손끝에서 멈춰 있었다.`,
      margins: { left: 2.5, right: 2.5, top: 2.5, bottom: 2.5 },
      createdAt: now - 86400000*3, updatedAt: now - 86400000*2,
    },
    {
      id: 'f-walk', type: 'file', name: '산책에 대하여', parent: 'd-essay',
      content: '걷기는 가장 오래된 사유 방식이다.',
      margins: { left: 2.5, right: 2.5, top: 2.5, bottom: 2.5 },
      createdAt: now - 86400000*10, updatedAt: now - 86400000*4,
    },
    {
      id: 'f-spring', type: 'file', name: '서울 4월 메모', parent: 'd-memo',
      content: `벚꽃이 지는 속도. 사람들이 그 아래에서 사진을 찍는 속도. 둘 다 비슷한 것 같다.`,
      margins: { left: 2.5, right: 2.5, top: 2.5, bottom: 2.5 },
      createdAt: now - 86400000*30, updatedAt: now - 86400000*14,
    },
    {
      id: 'f-library', type: 'file', name: '도서관의 밤', parent: 'd-short',
      content: '', margins: { left: 2.5, right: 2.5, top: 2.5, bottom: 2.5 },
      createdAt: now - 86400000*7, updatedAt: now - 86400000*7,
    },
    {
      id: 'f-today', type: 'file', name: '오늘의 기록', parent: 'd-journal',
      content: '날씨가 좋았다.', margins: { left: 2.5, right: 2.5, top: 2.5, bottom: 2.5 },
      createdAt: now - 86400000*1, updatedAt: now - 86400000*1,
    },
  ];
}

function newFile(parent) {
  const now = Date.now();
  return {
    id: 'f-' + now + '-' + Math.random().toString(36).slice(2, 6),
    type: 'file', name: '', parent: parent || null,
    content: '', margins: { left: 2.5, right: 2.5, top: 2.5, bottom: 2.5 },
    createdAt: now, updatedAt: now,
  };
}
function newFolder(parent, name = '새 폴더') {
  const now = Date.now();
  return {
    id: 'd-' + now + '-' + Math.random().toString(36).slice(2, 6),
    type: 'folder', name, parent: parent || null,
    createdAt: now, updatedAt: now,
  };
}

export default function AppShell() {
  const [items, setItems] = useState(loadItems);
  const [workspaceId, setWorkspaceIdInner] = useState(() => {
    const stored = loadWorkspace();
    return stored && loadItems().some(i => i.id === stored) ? stored : null;
  });
  const [currentFolderId, setCurrentFolderId] = useState(workspaceId);
  const [openFileId, setOpenFileId] = useState(null);
  const [splitFileId, setSplitFileId] = useState(null);
  const [splitWidth, setSplitWidth] = useState(420);
  const [dialogOpen, setDialogOpen] = useState(false);

  function setWorkspaceId(id) {
    setWorkspaceIdInner(id);
    saveWorkspace(id);
    setCurrentFolderId(id);
    setOpenFileId(null);
  }

  useEffect(() => { saveItems(items); }, [items]);

  const breadcrumbForList = useMemo(() => {
    if (!workspaceId) return [];
    const trail = [];
    let id = currentFolderId;
    while (id) {
      const f = items.find(x => x.id === id);
      if (!f) break;
      trail.unshift({ id: f.id, name: f.name });
      if (id === workspaceId) break;
      id = f.parent;
    }
    return trail;
  }, [items, currentFolderId, workspaceId]);

  const openFile = openFileId ? items.find(x => x.id === openFileId) : null;
  const splitFile = splitFileId ? items.find(x => x.id === splitFileId) : null;
  useEffect(() => {
    if (splitFileId && !splitFile) setSplitFileId(null);
  }, [splitFileId, splitFile]);

  const editorBreadcrumb = useMemo(() => {
    if (!openFile) return [];
    const trail = [];
    let id = openFile.parent;
    while (id) {
      const f = items.find(x => x.id === id);
      if (!f) break;
      trail.unshift(f.name);
      if (id === workspaceId) break;
      id = f.parent;
    }
    return trail;
  }, [items, openFile, workspaceId]);

  function updateFile(id, patch) {
    setItems(its => its.map(it => it.id === id ? { ...it, ...patch, updatedAt: Date.now() } : it));
  }

  function rename(id, name) {
    setItems(its => its.map(it => it.id === id ? { ...it, name, updatedAt: Date.now() } : it));
  }
  function deleteItem(id) {
    const toDelete = new Set();
    function collect(t) {
      toDelete.add(t);
      items.forEach(it => { if (it.parent === t) collect(it.id); });
    }
    collect(id);
    setItems(its => its.filter(it => !toDelete.has(it.id)));
    if (openFileId && toDelete.has(openFileId)) setOpenFileId(null);
    if (splitFileId && toDelete.has(splitFileId)) setSplitFileId(null);
    if (toDelete.has(workspaceId)) {
      setWorkspaceIdInner(null);
      saveWorkspace(null);
      setCurrentFolderId(null);
    } else if (toDelete.has(currentFolderId)) {
      setCurrentFolderId(workspaceId);
    }
  }
  function handleNewFile() {
    const f = newFile(currentFolderId);
    setItems(its => [f, ...its]);
    setOpenFileId(f.id);
  }
  function handleNewFolder() {
    const f = newFolder(currentFolderId);
    setItems(its => [f, ...its]);
  }
  function handleNewWorkspaceFromDialog() {
    const name = prompt('새 폴더 이름:', '새 폴더');
    if (!name) return;
    const f = newFolder(null, name.trim());
    setItems(its => [f, ...its]);
  }

  return (
    <div
      className={`app ${openFile ? 'with-chat' : ''} ${splitFileId ? 'with-split' : ''}`}
      style={splitFileId ? { '--split-width': splitWidth + 'px' } : null}
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
                  setOpenFileId(splitFileId);
                  setSplitFileId(openFileId);
                }}
                onChangeFile={(id) => setSplitFileId(id)}
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
            splitFileId={splitFileId}
            onOpenSplit={(id) => setSplitFileId(id)}
            onCloseSplit={() => setSplitFileId(null)}
            onChange={(patch) => updateFile(openFile.id, patch)}
            onSaveNow={(patch) => updateFile(openFile.id, patch)}
            onExit={() => { setSplitFileId(null); setOpenFileId(null); }}
          />
          <Chat file={openFile} refFile={splitFile} />
        </>
      ) : (
        <FileList
          items={items}
          workspaceId={workspaceId}
          currentFolderId={currentFolderId}
          breadcrumb={breadcrumbForList}
          onOpenWorkspaceDialog={() => setDialogOpen(true)}
          onEnter={(id) => setCurrentFolderId(id)}
          onJumpToWorkspace={() => setCurrentFolderId(workspaceId)}
          onUp={() => {
            if (currentFolderId === workspaceId) return;
            const cur = items.find(x => x.id === currentFolderId);
            setCurrentFolderId(cur ? cur.parent : workspaceId);
          }}
          onJumpTo={(id) => setCurrentFolderId(id)}
          onOpenFile={(id) => setOpenFileId(id)}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onDelete={deleteItem}
          onRename={rename}
        />
      )}

      <FolderPickerDialog
        open={dialogOpen}
        items={items}
        initialFolderId={workspaceId}
        onCancel={() => setDialogOpen(false)}
        onCreateAtRoot={handleNewWorkspaceFromDialog}
        onSelect={(id) => { setDialogOpen(false); if (id) setWorkspaceId(id); }}
      />
    </div>
  );
}
