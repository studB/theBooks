- [x] applied

# PDF 내보내기를 직접 생성 방식으로 수정

WKWebView에서 window.print()가 무시돼 PDF 생성이 안 되는 문제를, 에디터 본문 텍스트를 직접 A4 PDF로 만들어 저장 대화상자로 저장하는 방식으로 교체한다.

## Purpose

PDF 버튼을 눌러도 아무 반응이 없다. 원인은 숨긴 iframe에서 window.print()를 호출하는 현재 방식이 WKWebView(macOS Tauri)에서 동작하지 않기 때문. 인쇄 대화상자 의존을 없애고 PDF 파일을 직접 생성·저장해 안정적으로 내보낼 수 있게 한다.

## Scope

**In scope**
- 기존 window.print() 기반 exportPdf 경로 제거/대체
- 에디터 본문(단순 텍스트) + 제목을 A4·문서 여백 적용해 PDF로 직접 생성
- 한글 표시를 위한 유니코드 폰트 임베드(번들)
- 저장 대화상자(dialog.save)로 경로 선택 후 저장, 성공/실패 피드백

**Out of scope (later)**
- 마크다운/GFM 렌더링(표·코드·목록·인용 등 서식)
- 에디터 글꼴·글자크기·자간·행간 등 서식 반영
- 페이지 헤더/푸터/쪽번호, 이미지·하이퍼링크 등 리치 콘텐츠

## Stages

1. 진단 & 정리 — window.print() 미동작 확정, 기존 iframe/print 경로(exportPdf) 제거 또는 교체 지점 정리
2. PDF 생성 백엔드 — Rust 명령으로 {title, content, margins, path}를 받아 A4 PDF 생성(한글 TTF include_bytes 임베드, 줄바꿈/페이지네이션) 후 지정 경로에 저장
3. 프런트 연동 — PDF 버튼 → dialog.save로 경로 받기 → invoke 호출 → 진행/완료/오류 사용자 피드백

## Constraints

- 한글 렌더링에 유니코드(한글) 폰트 임베드 필수. OFL 등 라이선스 확인된 TTF를 번들. 시스템 폰트 경로 의존은 비권장(크로스플랫폼 취약).
- 임의 경로 쓰기 수단 부재(fs 플러그인 없음) → 전용 Rust 명령에서 저장 처리. dialog 플러그인은 이미 존재.
- 단순 텍스트만 처리 — 마크다운 파싱 제거로 결과물이 기존(서식형)과 달라짐(사용자 합의됨).
- 에디터 IME/저장 핫패스와 기존 워크스페이스 fs 로직은 건드리지 않음.

## Direction

인쇄 대화상자 의존을 제거하고 Rust 측 PDF 라이브러리(genpdf/printpdf 등)로 A4 + 문서 여백을 적용해 제목과 본문 텍스트를 페이지 분할 렌더한다. 한글 TTF는 include_bytes로 바이너리에 임베드해 웹 번들 비대화를 피한다. 프런트는 @tauri-apps/plugin-dialog의 save()로 저장 경로를 받아 invoke('export_pdf', { path, title, content, margins })를 호출하고, 성공 시 완료 알림, 실패 시 오류를 표시한다. 대안으로 프런트 pdf-lib+fontkit 생성도 가능하나 폰트가 웹 번들을 키우므로 Rust 임베드를 우선한다.

## Version

- Current: 0.21.0
- Bump: minor
- Target: 0.22.0
