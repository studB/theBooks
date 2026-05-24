use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::process::Command;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum GitError {
    NotARepo,
    GitMissing(String),
    Io(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFile {
    pub path: String,
    pub status: String,
    pub added: u32,
    pub removed: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusSummary {
    pub branch: Option<String>,
    pub files: Vec<GitFile>,
}

fn resolve_workspace_root(workspace_path: &str) -> Option<PathBuf> {
    if workspace_path.is_empty() || workspace_path.starts_with("s3://") {
        return None;
    }
    let p = Path::new(workspace_path);
    if !p.is_dir() {
        return None;
    }
    if !p.join(".git").exists() {
        return None;
    }
    Some(p.to_path_buf())
}

async fn run_git(root: &Path, args: &[&str]) -> Result<String, GitError> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .await
        .map_err(|e| GitError::GitMissing(e.to_string()))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(GitError::Io(stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn parse_porcelain(raw: &str) -> Vec<(String, String)> {
    // status --porcelain=v1 -z: NUL-terminated entries. Rename entries have two paths separated by NUL.
    let mut out = Vec::new();
    let mut iter = raw.split('\0').peekable();
    while let Some(entry) = iter.next() {
        if entry.is_empty() {
            continue;
        }
        if entry.len() < 3 {
            continue;
        }
        let code = entry[..2].trim();
        let path = entry[3..].to_string();
        let status = if code.is_empty() { "?".to_string() } else { code.to_string() };
        // For renamed (R..), the next token is the old path — consume and discard.
        if status.starts_with('R') {
            iter.next();
        }
        out.push((status, path));
    }
    out
}

fn parse_numstat(raw: &str) -> HashMap<String, (u32, u32)> {
    let mut map = HashMap::new();
    for line in raw.lines() {
        let mut parts = line.splitn(3, '\t');
        let added = parts.next().unwrap_or("0");
        let removed = parts.next().unwrap_or("0");
        let path = match parts.next() {
            Some(p) => p.to_string(),
            None => continue,
        };
        let a: u32 = added.parse().unwrap_or(0);
        let r: u32 = removed.parse().unwrap_or(0);
        map.insert(path, (a, r));
    }
    map
}

#[tauri::command]
pub async fn git_file_diff(workspace_path: String, rel_path: String) -> Result<String, GitError> {
    let root = resolve_workspace_root(&workspace_path).ok_or(GitError::NotARepo)?;
    // diff against HEAD; for untracked files this returns empty.
    run_git(&root, &["diff", "HEAD", "--", &rel_path]).await
}

#[tauri::command]
pub async fn git_status_summary(workspace_path: String) -> Result<GitStatusSummary, GitError> {
    let root = resolve_workspace_root(&workspace_path).ok_or(GitError::NotARepo)?;

    let branch_fut = run_git(&root, &["rev-parse", "--abbrev-ref", "HEAD"]);
    let status_fut = run_git(&root, &["status", "--porcelain=v1", "-z"]);
    let numstat_fut = run_git(&root, &["diff", "--numstat", "HEAD"]);

    let (branch_res, status_res, numstat_res) =
        tokio::join!(branch_fut, status_fut, numstat_fut);

    let branch = branch_res.ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let status_raw = status_res?;
    let numstat_raw = numstat_res.unwrap_or_default();

    let numstat = parse_numstat(&numstat_raw);
    let entries = parse_porcelain(&status_raw);

    let mut files: Vec<GitFile> = entries
        .into_iter()
        .map(|(status, path)| {
            let (added, removed) = numstat.get(&path).copied().unwrap_or((0, 0));
            GitFile {
                path,
                status,
                added,
                removed,
            }
        })
        .collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(GitStatusSummary { branch, files })
}
