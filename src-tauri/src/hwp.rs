use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use quick_xml::events::Event;
use quick_xml::reader::Reader;
use serde::Serialize;
use tauri::AppHandle;
use zip::ZipArchive;

use crate::fs::{workspace_root, FsError};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HwpImportResult {
    pub rel_path: String,
    pub title: String,
}

#[derive(Debug)]
enum Kind {
    Hwpx,
    HwpLegacy,
    Unknown,
}

fn detect_kind(src: &Path) -> Kind {
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    let mut head = [0u8; 8];
    let _ = fs::File::open(src).and_then(|mut f| f.read(&mut head).map(|_| ()));
    let is_zip = head.starts_with(b"PK\x03\x04") || head.starts_with(b"PK\x05\x06");
    let is_ole2 = head == [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    if ext == "hwpx" || (ext.is_empty() && is_zip) {
        Kind::Hwpx
    } else if ext == "hwp" || is_ole2 {
        Kind::HwpLegacy
    } else if is_zip {
        Kind::Hwpx
    } else {
        Kind::Unknown
    }
}

fn extract_text_from_section(xml: &str) -> Result<String, FsError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut buf = Vec::new();
    let mut paragraphs: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_text_el = 0i32;
    let mut depth_in_paragraph = 0i32;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = e.name();
                let local = name.as_ref();
                let local_str = std::str::from_utf8(local).unwrap_or("");
                let local_only = local_str.rsplit(':').next().unwrap_or(local_str);
                if local_only == "p" {
                    depth_in_paragraph += 1;
                }
                if local_only == "t" {
                    in_text_el += 1;
                }
                if local_only == "lineBreak" || local_only == "linesegarray" {
                    // ignore — paragraph boundaries handled by <p>
                }
            }
            Ok(Event::End(e)) => {
                let local_str = std::str::from_utf8(e.name().as_ref()).unwrap_or("").to_string();
                let local_only = local_str.rsplit(':').next().unwrap_or(&local_str).to_string();
                if local_only == "t" {
                    in_text_el = (in_text_el - 1).max(0);
                }
                if local_only == "p" {
                    depth_in_paragraph = (depth_in_paragraph - 1).max(0);
                    if depth_in_paragraph == 0 {
                        paragraphs.push(std::mem::take(&mut current));
                    }
                }
            }
            Ok(Event::Empty(e)) => {
                let local_str = std::str::from_utf8(e.name().as_ref()).unwrap_or("").to_string();
                let local_only = local_str.rsplit(':').next().unwrap_or(&local_str);
                if local_only == "lineBreak" {
                    current.push('\n');
                }
            }
            Ok(Event::Text(t)) => {
                if in_text_el > 0 {
                    if let Ok(decoded) = t.unescape() {
                        current.push_str(decoded.as_ref());
                    }
                }
            }
            Ok(Event::CData(c)) => {
                if in_text_el > 0 {
                    if let Ok(s) = std::str::from_utf8(c.as_ref()) {
                        current.push_str(s);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(FsError::Parse(format!("xml: {e}"))),
            _ => {}
        }
        buf.clear();
    }
    if !current.is_empty() {
        paragraphs.push(current);
    }
    Ok(paragraphs.join("\n"))
}

fn extract_hwpx_text(src: &Path) -> Result<String, FsError> {
    let file = fs::File::open(src)?;
    let mut zip = ZipArchive::new(file).map_err(|e| FsError::Parse(format!("zip: {e}")))?;
    let mut section_names: Vec<String> = Vec::new();
    for i in 0..zip.len() {
        if let Ok(entry) = zip.by_index(i) {
            let name = entry.name().to_string();
            if name.starts_with("Contents/section") && name.ends_with(".xml") {
                section_names.push(name);
            }
        }
    }
    if section_names.is_empty() {
        return Err(FsError::Parse(
            "HWPX 본문 섹션(Contents/section*.xml)을 찾지 못했습니다".to_string(),
        ));
    }
    section_names.sort();
    let mut out = String::new();
    for name in section_names {
        let mut entry = zip
            .by_name(&name)
            .map_err(|e| FsError::Parse(format!("zip entry {name}: {e}")))?;
        let mut xml = String::new();
        entry
            .read_to_string(&mut xml)
            .map_err(|e| FsError::Parse(format!("read {name}: {e}")))?;
        let text = extract_text_from_section(&xml)?;
        if !out.is_empty() {
            out.push_str("\n\n");
        }
        out.push_str(&text);
    }
    Ok(out)
}

fn sanitize_for_filename(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if (c as u32) < 0x20 => '_',
            c => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn pick_unique(parent: &Path, stem: &str, ext: &str) -> PathBuf {
    let mut candidate = format!("{stem}.{ext}");
    let mut i = 2;
    loop {
        let p = parent.join(&candidate);
        if !p.exists() {
            return p;
        }
        candidate = format!("{stem} ({i}).{ext}");
        i += 1;
        if i > 9999 {
            return parent.join(format!("{stem}-{}.{ext}", std::process::id()));
        }
    }
}

#[tauri::command]
pub fn import_hwp(app: AppHandle, src_path: String) -> Result<HwpImportResult, FsError> {
    let src = PathBuf::from(&src_path);
    if !src.exists() {
        return Err(FsError::Io(format!("파일을 찾을 수 없습니다: {src_path}")));
    }
    let kind = detect_kind(&src);
    let text = match kind {
        Kind::Hwpx => extract_hwpx_text(&src)?,
        Kind::HwpLegacy => {
            return Err(FsError::Parse(
                "HWP 5.0(.hwp) 바이너리 형식은 아직 지원하지 않습니다. 한글에서 .hwpx로 다른 이름으로 저장해 다시 시도하세요.".to_string(),
            ));
        }
        Kind::Unknown => {
            return Err(FsError::Parse(
                "이 파일은 HWP/HWPX 형식이 아니거나 손상되었습니다.".to_string(),
            ));
        }
    };
    if text.trim().is_empty() {
        return Err(FsError::Parse(
            "본문에서 추출할 텍스트가 없습니다.".to_string(),
        ));
    }
    let root = workspace_root(&app)?;
    let stem_raw = src.file_stem().and_then(|s| s.to_str()).unwrap_or("문서");
    let stem = {
        let cleaned = sanitize_for_filename(stem_raw);
        if cleaned.is_empty() {
            "문서".to_string()
        } else {
            cleaned
        }
    };
    let dst = pick_unique(&root, &stem, "txt");
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&dst, &text)?;
    let rel = dst
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let title = dst
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&stem)
        .to_string();
    Ok(HwpImportResult {
        rel_path: rel,
        title,
    })
}
