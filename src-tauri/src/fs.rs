use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::AppHandle;

use crate::chat::{load_config, save_config};

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum FsError {
    NoWorkspace,
    InvalidPath(String),
    Io(String),
    Parse(String),
    Trash(String),
    Conflict(String),
}

impl From<std::io::Error> for FsError {
    fn from(e: std::io::Error) -> Self {
        FsError::Io(e.to_string())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Margins {
    pub left: f64,
    pub right: f64,
    pub top: f64,
    pub bottom: f64,
}

impl Default for Margins {
    fn default() -> Self {
        Margins {
            left: 2.5,
            right: 2.5,
            top: 2.5,
            bottom: 2.5,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileFrontmatter {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    margins: Option<Margins>,
    #[serde(default)]
    created_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum Item {
    #[serde(rename = "folder")]
    Folder {
        id: String,
        name: String,
        parent: Option<String>,
        created_at: i64,
        updated_at: i64,
    },
    #[serde(rename = "file")]
    File {
        id: String,
        name: String,
        parent: Option<String>,
        margins: Margins,
        created_at: i64,
        updated_at: i64,
    },
}

fn workspace_root(app: &AppHandle) -> Result<PathBuf, FsError> {
    let cfg = load_config(app).map_err(|e| FsError::Io(format!("config: {:?}", e)))?;
    cfg.workspace.ok_or(FsError::NoWorkspace)
}

fn validate_rel(rel: &str) -> Result<PathBuf, FsError> {
    let p = Path::new(rel);
    if p.is_absolute() {
        return Err(FsError::InvalidPath("absolute path not allowed".into()));
    }
    for c in p.components() {
        match c {
            Component::Normal(_) => {}
            Component::CurDir => {}
            _ => return Err(FsError::InvalidPath(format!("disallowed segment in: {rel}"))),
        }
    }
    Ok(p.to_path_buf())
}

fn resolve(root: &Path, rel: &str) -> Result<PathBuf, FsError> {
    if rel.is_empty() {
        return Ok(root.to_path_buf());
    }
    let rel_path = validate_rel(rel)?;
    Ok(root.join(rel_path))
}

fn to_rel_id(root: &Path, full: &Path) -> Option<String> {
    let rel = full.strip_prefix(root).ok()?;
    let s = rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(os) => os.to_str().map(String::from),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/");
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn parent_id(rel_id: &str) -> Option<String> {
    let parts: Vec<&str> = rel_id.split('/').collect();
    if parts.len() <= 1 {
        None
    } else {
        Some(parts[..parts.len() - 1].join("/"))
    }
}

fn sanitize_name(name: &str) -> String {
    let trimmed = name.trim();
    trimmed
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if (c as u32) < 0x20 => '_',
            c => c,
        })
        .collect::<String>()
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn mtime_ms(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or_else(now_ms)
}

fn ctime_ms(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.created())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or_else(|| mtime_ms(path))
}

fn parse_frontmatter(raw: &str) -> (FileFrontmatter, String) {
    let trimmed = raw.trim_start_matches('\u{feff}');
    if !trimmed.starts_with("---") {
        return (FileFrontmatter::default(), raw.to_string());
    }
    let after = &trimmed[3..];
    let after = after.strip_prefix('\n').unwrap_or(after);
    if let Some(end_idx) = after.find("\n---") {
        let yaml = &after[..end_idx];
        let rest_start = end_idx + 4;
        let rest = &after[rest_start..];
        let body = rest.strip_prefix('\n').unwrap_or(rest);
        let fm = serde_yaml::from_str::<FileFrontmatter>(yaml).unwrap_or_default();
        (fm, body.to_string())
    } else {
        (FileFrontmatter::default(), raw.to_string())
    }
}

impl Default for FileFrontmatter {
    fn default() -> Self {
        FileFrontmatter {
            title: None,
            margins: None,
            created_at: None,
        }
    }
}

fn write_md(path: &Path, title: &str, margins: &Margins, created_at: i64, body: &str) -> Result<(), FsError> {
    let fm = FileFrontmatter {
        title: Some(title.to_string()),
        margins: Some(margins.clone()),
        created_at: Some(created_at),
    };
    let yaml = serde_yaml::to_string(&fm).map_err(|e| FsError::Parse(e.to_string()))?;
    let mut out = String::new();
    out.push_str("---\n");
    out.push_str(&yaml);
    if !yaml.ends_with('\n') {
        out.push('\n');
    }
    out.push_str("---\n");
    out.push_str(body);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, out)?;
    Ok(())
}

fn collect_items(root: &Path, dir: &Path, out: &mut Vec<Item>) -> Result<(), FsError> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name_os = entry.file_name();
        let raw_name = name_os.to_string_lossy().to_string();
        if raw_name.starts_with('.') {
            continue;
        }
        let ft = entry.file_type()?;
        if ft.is_dir() {
            let id = match to_rel_id(root, &path) {
                Some(s) => s,
                None => continue,
            };
            out.push(Item::Folder {
                id: id.clone(),
                name: raw_name.clone(),
                parent: parent_id(&id),
                created_at: ctime_ms(&path),
                updated_at: mtime_ms(&path),
            });
            collect_items(root, &path, out)?;
        } else if ft.is_file() {
            if !raw_name.to_lowercase().ends_with(".md") {
                continue;
            }
            let id = match to_rel_id(root, &path) {
                Some(s) => s,
                None => continue,
            };
            let raw = fs::read_to_string(&path).unwrap_or_default();
            let (fm, _) = parse_frontmatter(&raw);
            let stem = raw_name.trim_end_matches(".md").trim_end_matches(".MD");
            let title = fm.title.unwrap_or_else(|| stem.to_string());
            let margins = fm.margins.unwrap_or_default();
            let created_at = fm.created_at.unwrap_or_else(|| ctime_ms(&path));
            let parent = parent_id(&id);
            out.push(Item::File {
                id,
                name: title,
                parent,
                margins,
                created_at,
                updated_at: mtime_ms(&path),
            });
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_workspace(app: AppHandle) -> Result<Vec<Item>, FsError> {
    let root = workspace_root(&app)?;
    if !root.exists() {
        return Err(FsError::Io(format!("workspace does not exist: {}", root.display())));
    }
    let mut out = Vec::new();
    collect_items(&root, &root, &mut out)?;
    Ok(out)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub content: String,
    pub margins: Margins,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[tauri::command]
pub fn read_file(app: AppHandle, rel_path: String) -> Result<FileContent, FsError> {
    let root = workspace_root(&app)?;
    let full = resolve(&root, &rel_path)?;
    let raw = fs::read_to_string(&full)?;
    let (fm, body) = parse_frontmatter(&raw);
    let stem = full
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    Ok(FileContent {
        content: body,
        margins: fm.margins.unwrap_or_default(),
        title: fm.title.unwrap_or(stem),
        created_at: fm.created_at.unwrap_or_else(|| ctime_ms(&full)),
        updated_at: mtime_ms(&full),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileArgs {
    pub rel_path: String,
    pub content: String,
    pub margins: Margins,
    pub title: String,
    #[serde(default)]
    pub created_at: Option<i64>,
}

#[tauri::command]
pub fn write_file(app: AppHandle, args: WriteFileArgs) -> Result<i64, FsError> {
    let root = workspace_root(&app)?;
    let full = resolve(&root, &args.rel_path)?;
    let created_at = args.created_at.unwrap_or_else(now_ms);
    write_md(&full, &args.title, &args.margins, created_at, &args.content)?;
    Ok(mtime_ms(&full))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFileArgs {
    #[serde(default)]
    pub parent: Option<String>,
    pub name: String,
    #[serde(default)]
    pub margins: Option<Margins>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedItem {
    pub id: String,
    pub created_at: i64,
}

#[tauri::command]
pub fn create_file(app: AppHandle, args: CreateFileArgs) -> Result<CreatedItem, FsError> {
    let root = workspace_root(&app)?;
    let parent_dir = match &args.parent {
        Some(p) if !p.is_empty() => resolve(&root, p)?,
        _ => root.clone(),
    };
    fs::create_dir_all(&parent_dir)?;
    let title = args.name.trim();
    let display_title = if title.is_empty() { "새 파일" } else { title };
    let stem = sanitize_name(display_title);
    let stem = if stem.is_empty() { "새 파일".to_string() } else { stem };
    let (final_stem, full) = pick_available_name(&parent_dir, &stem, "md", false)?;
    let now = now_ms();
    let margins = args.margins.unwrap_or_default();
    write_md(&full, display_title, &margins, now, "")?;
    let id = to_rel_id(&root, &full).ok_or_else(|| FsError::Io("cannot derive id".into()))?;
    let _ = final_stem;
    Ok(CreatedItem { id, created_at: now })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderArgs {
    #[serde(default)]
    pub parent: Option<String>,
    pub name: String,
}

#[tauri::command]
pub fn create_folder(app: AppHandle, args: CreateFolderArgs) -> Result<CreatedItem, FsError> {
    let root = workspace_root(&app)?;
    let parent_dir = match &args.parent {
        Some(p) if !p.is_empty() => resolve(&root, p)?,
        _ => root.clone(),
    };
    fs::create_dir_all(&parent_dir)?;
    let title = args.name.trim();
    let display = if title.is_empty() { "새 폴더" } else { title };
    let stem = sanitize_name(display);
    let stem = if stem.is_empty() { "새 폴더".to_string() } else { stem };
    let (_final_stem, full) = pick_available_name(&parent_dir, &stem, "", true)?;
    fs::create_dir_all(&full)?;
    let id = to_rel_id(&root, &full).ok_or_else(|| FsError::Io("cannot derive id".into()))?;
    Ok(CreatedItem { id, created_at: now_ms() })
}

fn pick_available_name(
    parent_dir: &Path,
    stem: &str,
    ext: &str,
    is_dir: bool,
) -> Result<(String, PathBuf), FsError> {
    let make_name = |s: &str| -> String {
        if is_dir || ext.is_empty() {
            s.to_string()
        } else {
            format!("{s}.{ext}")
        }
    };
    let mut candidate = stem.to_string();
    let mut full = parent_dir.join(make_name(&candidate));
    let mut i = 2;
    while full.exists() {
        candidate = format!("{stem} ({i})");
        full = parent_dir.join(make_name(&candidate));
        i += 1;
        if i > 9999 {
            return Err(FsError::Conflict("too many name conflicts".into()));
        }
    }
    Ok((candidate, full))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameArgs {
    pub rel_path: String,
    pub new_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamedItem {
    pub id: String,
}

#[tauri::command]
pub fn rename_item(app: AppHandle, args: RenameArgs) -> Result<RenamedItem, FsError> {
    let root = workspace_root(&app)?;
    let full = resolve(&root, &args.rel_path)?;
    let meta = fs::metadata(&full)?;
    let is_dir = meta.is_dir();
    let parent_dir = full
        .parent()
        .ok_or_else(|| FsError::InvalidPath("no parent".into()))?
        .to_path_buf();
    let new_name = args.new_name.trim();
    if new_name.is_empty() {
        return Err(FsError::InvalidPath("empty name".into()));
    }
    let stem = sanitize_name(new_name);
    let (ext, file_title) = if is_dir {
        ("", String::new())
    } else {
        ("md", new_name.to_string())
    };
    let (_final_stem, new_full) = pick_available_name(&parent_dir, &stem, ext, is_dir)?;
    if new_full == full {
        let id = to_rel_id(&root, &full).ok_or_else(|| FsError::Io("id".into()))?;
        return Ok(RenamedItem { id });
    }
    fs::rename(&full, &new_full)?;
    if !is_dir {
        let raw = fs::read_to_string(&new_full).unwrap_or_default();
        let (fm, body) = parse_frontmatter(&raw);
        let margins = fm.margins.unwrap_or_default();
        let created_at = fm.created_at.unwrap_or_else(|| ctime_ms(&new_full));
        write_md(&new_full, &file_title, &margins, created_at, &body)?;
    }
    let id = to_rel_id(&root, &new_full).ok_or_else(|| FsError::Io("id".into()))?;
    Ok(RenamedItem { id })
}

#[tauri::command]
pub fn delete_item(app: AppHandle, rel_path: String) -> Result<(), FsError> {
    let root = workspace_root(&app)?;
    let full = resolve(&root, &rel_path)?;
    if !full.exists() {
        return Err(FsError::Io(format!("not found: {}", full.display())));
    }
    trash::delete(&full).map_err(|e| FsError::Trash(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn get_workspace(app: AppHandle) -> Result<Option<String>, FsError> {
    let cfg = load_config(&app).map_err(|e| FsError::Io(format!("config: {:?}", e)))?;
    Ok(cfg.workspace.map(|p| p.display().to_string()))
}

#[tauri::command]
pub fn set_workspace(app: AppHandle, path: Option<String>) -> Result<(), FsError> {
    let mut cfg = load_config(&app).map_err(|e| FsError::Io(format!("config: {:?}", e)))?;
    cfg.workspace = match path {
        Some(p) if !p.trim().is_empty() => {
            let pb = PathBuf::from(p);
            if !pb.exists() {
                fs::create_dir_all(&pb)?;
            }
            Some(pb)
        }
        _ => None,
    };
    save_config(&app, &cfg).map_err(|e| FsError::Io(format!("config: {:?}", e)))?;
    Ok(())
}

#[tauri::command]
pub fn is_migrated_v4_local(app: AppHandle) -> Result<bool, FsError> {
    let cfg = load_config(&app).map_err(|e| FsError::Io(format!("config: {:?}", e)))?;
    Ok(cfg.migrated_v4_local)
}

fn mark_migrated(app: &AppHandle) -> Result<(), FsError> {
    let mut cfg = load_config(app).map_err(|e| FsError::Io(format!("config: {:?}", e)))?;
    cfg.migrated_v4_local = true;
    save_config(app, &cfg).map_err(|e| FsError::Io(format!("config: {:?}", e)))?;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyItem {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub parent: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub margins: Option<Margins>,
    #[serde(default)]
    pub created_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateArgs {
    pub items: Vec<LegacyItem>,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateResult {
    pub written: usize,
}

#[tauri::command]
pub fn migrate_from_local(app: AppHandle, args: MigrateArgs) -> Result<MigrateResult, FsError> {
    let root = workspace_root(&app)?;
    fs::create_dir_all(&root)?;

    let by_id: std::collections::HashMap<String, &LegacyItem> =
        args.items.iter().map(|it| (it.id.clone(), it)).collect();

    fn rel_for<'a>(
        id: &str,
        items: &std::collections::HashMap<String, &'a LegacyItem>,
        workspace_id: &Option<String>,
        stack: &mut Vec<String>,
    ) -> Option<String> {
        let it = items.get(id)?;
        if stack.contains(&id.to_string()) {
            return None;
        }
        stack.push(id.to_string());
        let name = sanitize_name(&it.name);
        let name = if name.is_empty() { "이름없음".to_string() } else { name };
        let parent_rel = match (&it.parent, workspace_id) {
            (Some(pid), Some(wid)) if pid == wid => Some(String::new()),
            (Some(pid), _) => rel_for(pid, items, workspace_id, stack),
            (None, _) => Some(String::new()),
        };
        stack.pop();
        let parent_rel = parent_rel?;
        if parent_rel.is_empty() {
            Some(name)
        } else {
            Some(format!("{parent_rel}/{name}"))
        }
    }

    let mut written = 0usize;
    let folders: Vec<&LegacyItem> = args.items.iter().filter(|it| it.kind == "folder").collect();
    let files: Vec<&LegacyItem> = args.items.iter().filter(|it| it.kind == "file").collect();

    for it in &folders {
        if let Some(wid) = &args.workspace_id {
            if &it.id == wid {
                continue;
            }
        }
        let mut stack: Vec<String> = Vec::new();
        let rel = match rel_for(&it.id, &by_id, &args.workspace_id, &mut stack) {
            Some(r) => r,
            None => continue,
        };
        if rel.is_empty() {
            continue;
        }
        let full = root.join(&rel);
        if !full.exists() {
            fs::create_dir_all(&full)?;
        }
    }

    for it in &files {
        let mut stack: Vec<String> = Vec::new();
        let rel = match rel_for(&it.id, &by_id, &args.workspace_id, &mut stack) {
            Some(r) => r,
            None => continue,
        };
        if rel.is_empty() {
            continue;
        }
        let mut full = root.join(format!("{rel}.md"));
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent)?;
        }
        if full.exists() {
            let parent_dir = full.parent().unwrap().to_path_buf();
            let stem = full.file_stem().and_then(|s| s.to_str()).unwrap_or("file").to_string();
            let (_n, alt) = pick_available_name(&parent_dir, &stem, "md", false)?;
            full = alt;
        }
        let margins = it.margins.clone().unwrap_or_default();
        let created_at = it.created_at.unwrap_or_else(now_ms);
        let body = it.content.clone().unwrap_or_default();
        write_md(&full, &it.name, &margins, created_at, &body)?;
        written += 1;
    }

    mark_migrated(&app)?;
    Ok(MigrateResult { written })
}
