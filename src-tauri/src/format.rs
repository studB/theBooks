use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use crate::fs::{workspace_root, FsError};

pub const BOOKS_DIR: &str = ".books";
const MANIFEST_FILE: &str = "format.json";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FormatMeta {
    pub font_family: String,
    pub font_size: f64,
    pub letter_spacing: f64,
    pub line_height: f64,
}

impl Default for FormatMeta {
    fn default() -> Self {
        FormatMeta {
            font_family: "system".to_string(),
            font_size: 16.0,
            letter_spacing: 0.0,
            line_height: 1.7,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct FormatManifest {
    #[serde(default)]
    entries: BTreeMap<String, FormatMeta>,
}

fn books_dir(root: &Path) -> PathBuf {
    root.join(BOOKS_DIR)
}

fn manifest_path(root: &Path) -> PathBuf {
    books_dir(root).join(MANIFEST_FILE)
}

pub fn ensure_books_dir(root: &Path) -> Result<(), FsError> {
    let dir = books_dir(root);
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    let mf = manifest_path(root);
    if !mf.exists() {
        let empty = FormatManifest::default();
        let raw = serde_json::to_string_pretty(&empty)
            .map_err(|e| FsError::Parse(e.to_string()))?;
        fs::write(&mf, raw)?;
    }
    Ok(())
}

fn read_manifest(root: &Path) -> Result<FormatManifest, FsError> {
    let mf = manifest_path(root);
    if !mf.exists() {
        return Ok(FormatManifest::default());
    }
    let raw = fs::read_to_string(&mf)?;
    if raw.trim().is_empty() {
        return Ok(FormatManifest::default());
    }
    serde_json::from_str::<FormatManifest>(&raw).map_err(|e| FsError::Parse(e.to_string()))
}

fn write_manifest(root: &Path, manifest: &FormatManifest) -> Result<(), FsError> {
    ensure_books_dir(root)?;
    let raw = serde_json::to_string_pretty(manifest)
        .map_err(|e| FsError::Parse(e.to_string()))?;
    fs::write(manifest_path(root), raw)?;
    Ok(())
}

pub fn remove_path(root: &Path, rel_path: &str) -> Result<(), FsError> {
    let mut m = read_manifest(root)?;
    let mut changed = false;
    let prefix = format!("{rel_path}/");
    m.entries.retain(|k, _| {
        let keep = k != rel_path && !k.starts_with(&prefix);
        if !keep {
            changed = true;
        }
        keep
    });
    if changed {
        write_manifest(root, &m)?;
    }
    Ok(())
}

pub fn rename_path(root: &Path, old_rel: &str, new_rel: &str) -> Result<(), FsError> {
    if old_rel == new_rel {
        return Ok(());
    }
    let mut m = read_manifest(root)?;
    let old_prefix = format!("{old_rel}/");
    let new_prefix = format!("{new_rel}/");
    let mut renames: Vec<(String, String)> = Vec::new();
    for k in m.entries.keys() {
        if k == old_rel {
            renames.push((k.clone(), new_rel.to_string()));
        } else if let Some(rest) = k.strip_prefix(&old_prefix) {
            renames.push((k.clone(), format!("{new_prefix}{rest}")));
        }
    }
    if renames.is_empty() {
        return Ok(());
    }
    for (from, to) in renames {
        if let Some(v) = m.entries.remove(&from) {
            m.entries.insert(to, v);
        }
    }
    write_manifest(root, &m)?;
    Ok(())
}

#[tauri::command]
pub fn get_format(app: AppHandle, rel_path: String) -> Result<FormatMeta, FsError> {
    let root = workspace_root(&app)?;
    let m = read_manifest(&root)?;
    Ok(m.entries.get(&rel_path).cloned().unwrap_or_default())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetFormatArgs {
    pub rel_path: String,
    pub meta: FormatMeta,
}

#[tauri::command]
pub fn set_format(app: AppHandle, args: SetFormatArgs) -> Result<(), FsError> {
    let root = workspace_root(&app)?;
    let mut m = read_manifest(&root)?;
    if args.meta == FormatMeta::default() {
        m.entries.remove(&args.rel_path);
    } else {
        m.entries.insert(args.rel_path, args.meta);
    }
    write_manifest(&root, &m)?;
    Ok(())
}

#[tauri::command]
pub fn remove_format(app: AppHandle, rel_path: String) -> Result<(), FsError> {
    let root = workspace_root(&app)?;
    remove_path(&root, &rel_path)
}

#[tauri::command]
pub fn get_default_format() -> FormatMeta {
    FormatMeta::default()
}
