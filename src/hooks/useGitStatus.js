import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

const EMPTY = { available: false, branch: null, files: [] };

export default function useGitStatus(workspacePath, workspaceKind) {
  const [state, setState] = useState(EMPTY);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspacePath || workspaceKind !== 'local') {
      setState(EMPTY);
      return;
    }
    setLoading(true);
    try {
      const res = await invoke('git_status_summary', { workspacePath });
      setState({ available: true, branch: res.branch || null, files: res.files || [] });
    } catch (e) {
      // NotARepo, GitMissing, Io — all collapse to "not available", panel stays hidden.
      setState(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [workspacePath, workspaceKind]);

  // Reset when workspace changes; initial fetch is driven from outside so we
  // never race with list_workspace's directory walk (the git child process'
  // SIGCHLD can otherwise EINTR an in-flight read_dir).
  useEffect(() => {
    setState(EMPTY);
  }, [workspacePath, workspaceKind]);

  useEffect(() => {
    function onFocus() { refresh(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return { gitStatus: state, gitLoading: loading, refreshGit: refresh };
}
