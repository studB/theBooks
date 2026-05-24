use std::fs;
use std::path::Path;
use serde::Serialize;
use tauri::AppHandle;
use walkdir::WalkDir;

use crate::fs::{workspace_root, FsError};

const MAX_RESULTS: usize = 200;
const SNIPPET_PAD: usize = 30;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub rel_path: String,
    pub title: String,
    pub match_type: &'static str,
    pub line_index: Option<usize>,
    pub snippet: String,
}

fn is_md(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

fn split_frontmatter(raw: &str) -> (Option<&str>, &str) {
    let trimmed = raw.trim_start_matches('\u{feff}');
    if !trimmed.starts_with("---") {
        return (None, raw);
    }
    let after = &trimmed[3..];
    let after = after.strip_prefix('\n').unwrap_or(after);
    if let Some(end_idx) = after.find("\n---") {
        let yaml = &after[..end_idx];
        let rest_start = end_idx + 4;
        let rest = &after[rest_start..];
        let body = rest.strip_prefix('\n').unwrap_or(rest);
        (Some(yaml), body)
    } else {
        (None, raw)
    }
}

fn extract_title(yaml: &str) -> Option<String> {
    for line in yaml.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("title:") {
            let v = rest.trim();
            let v = v
                .trim_start_matches('"')
                .trim_end_matches('"')
                .trim_start_matches('\'')
                .trim_end_matches('\'');
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }
    None
}

fn rel_id(root: &Path, full: &Path) -> Option<String> {
    let rel = full.strip_prefix(root).ok()?;
    let s = rel
        .components()
        .filter_map(|c| c.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/");
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn make_snippet(line: &str, lower_line: &str, needle_lower: &str) -> String {
    let idx = lower_line.find(needle_lower).unwrap_or(0);
    let start = idx.saturating_sub(SNIPPET_PAD);
    let end = (idx + needle_lower.len() + SNIPPET_PAD).min(line.len());
    let mut start = start;
    while !line.is_char_boundary(start) && start > 0 {
        start -= 1;
    }
    let mut end = end;
    while !line.is_char_boundary(end) && end < line.len() {
        end += 1;
    }
    let mut s = String::new();
    if start > 0 {
        s.push('…');
    }
    s.push_str(&line[start..end]);
    if end < line.len() {
        s.push('…');
    }
    s
}

#[tauri::command]
pub fn search_workspace(app: AppHandle, query: String) -> Result<Vec<SearchHit>, FsError> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let needle = q.to_lowercase();
    let root = workspace_root(&app)?;
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut name_hits: Vec<SearchHit> = Vec::new();
    let mut body_hits: Vec<SearchHit> = Vec::new();

    for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
        if name_hits.len() + body_hits.len() >= MAX_RESULTS {
            break;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(s) => s,
            None => continue,
        };
        if file_name.starts_with('.') {
            continue;
        }
        if !is_md(file_name) {
            continue;
        }
        let rel = match rel_id(&root, path) {
            Some(s) => s,
            None => continue,
        };
        // Skip hidden parent dirs (e.g. ".git/")
        if rel.split('/').any(|seg| seg.starts_with('.')) {
            continue;
        }

        let raw = match fs::read_to_string(path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let (fm_yaml, body) = split_frontmatter(&raw);
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let title = fm_yaml
            .and_then(extract_title)
            .unwrap_or_else(|| stem.clone());

        let name_lower = file_name.to_lowercase();
        let title_lower = title.to_lowercase();

        if name_lower.contains(&needle) {
            name_hits.push(SearchHit {
                rel_path: rel.clone(),
                title: title.clone(),
                match_type: "name",
                line_index: None,
                snippet: file_name.to_string(),
            });
            continue;
        }
        if title_lower.contains(&needle) {
            name_hits.push(SearchHit {
                rel_path: rel.clone(),
                title: title.clone(),
                match_type: "title",
                line_index: None,
                snippet: title.clone(),
            });
            continue;
        }

        for (i, line) in body.lines().enumerate() {
            let lower = line.to_lowercase();
            if lower.contains(&needle) {
                let snippet = make_snippet(line, &lower, &needle);
                body_hits.push(SearchHit {
                    rel_path: rel.clone(),
                    title: title.clone(),
                    match_type: "body",
                    line_index: Some(i),
                    snippet,
                });
                break;
            }
        }
    }

    let mut out = name_hits;
    out.append(&mut body_hits);
    if out.len() > MAX_RESULTS {
        out.truncate(MAX_RESULTS);
    }
    Ok(out)
}
