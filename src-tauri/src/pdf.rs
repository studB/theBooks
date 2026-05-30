use tauri::ipc::Response;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

// 한글 글리프를 가진 macOS 시스템 TTF 후보 (런타임 로드 — 번들/재배포 없음).
// 프런트(pdf-lib+fontkit)가 사용 글자만 서브셋 임베드하므로 전체 폰트를 그대로 전달한다.
const FONT_CANDIDATES: &[&str] = &[
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
    "/System/Library/Fonts/Supplemental/AppleMyungjo.ttf",
];

/// PDF 임베드용 한글 폰트 바이트를 프런트로 전달한다.
/// (서브셋은 프런트의 pdf-lib에서 수행 — cmap 일관성 유지를 위해 전체 폰트를 보냄)
#[tauri::command]
pub fn read_pdf_font() -> Result<Response, String> {
    let mut last_err = String::from("사용 가능한 한글 폰트를 찾지 못했습니다.");
    for path in FONT_CANDIDATES {
        match std::fs::read(path) {
            Ok(bytes) => return Ok(Response::new(bytes)),
            Err(e) => last_err = format!("{path}: {e}"),
        }
    }
    Err(last_err)
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePdfArgs {
    /// 생성된 PDF 바이트
    pub bytes: Vec<u8>,
    /// 저장 대화상자 기본 파일명(확장자 제외 가능)
    #[serde(default)]
    pub default_name: Option<String>,
}

fn sanitize_file_stem(name: &str) -> String {
    let cleaned: String = name
        .trim()
        .chars()
        .map(|c| if "/\\:*?\"<>|".contains(c) { '_' } else { c })
        .collect();
    if cleaned.is_empty() {
        "문서".to_string()
    } else {
        cleaned
    }
}

/// 저장 대화상자를 띄워 경로를 받고 PDF 바이트를 기록한다.
/// 반환값: 저장된 경로(Some) — 사용자가 취소하면 None.
#[tauri::command]
pub fn save_pdf(app: AppHandle, args: SavePdfArgs) -> Result<Option<String>, String> {
    let stem = sanitize_file_stem(args.default_name.as_deref().unwrap_or("문서"));
    let default_name = format!("{stem}.pdf");
    let picked = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .set_file_name(&default_name)
        .blocking_save_file();
    let Some(file_path) = picked else {
        return Ok(None); // 사용자가 취소
    };
    let path = file_path
        .into_path()
        .map_err(|e| format!("저장 경로 해석 실패: {e}"))?;
    std::fs::write(&path, &args.bytes).map_err(|e| format!("PDF 저장 실패: {e}"))?;
    Ok(Some(path.display().to_string()))
}
