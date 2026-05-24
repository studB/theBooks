- [x] applied

# HWP 제거 · 워크스페이스 수정시간 표시 수정 · Markdown viewer GFM 강화

프로젝트를 .md 기반으로 일원화하기 위해 HWP 코드를 완전히 걷어내고, 워크스페이스 최종 수정 시간 버그를 핀포인트로 수정한 뒤, Markdown viewer를 GFM 풀세트로 강화한다.

## Purpose

이 프로젝트는 앞으로 모든 문서를 Markdown(.md)로만 다룬다. HWP 관련 코드와 UI는 더 이상 필요 없어 유지보수 부담만 늘리므로 완전히 제거한다. 동시에 워크스페이스 파일 목록에 최종 수정 시간이 표시되지 않는 결함을 정상화하고, 뷰어가 일반적인 GFM 문서를 손색없이 렌더링하도록 보강한다.

## Scope

**In scope**
- `src-tauri/src/hwp.rs` 삭제, `src-tauri/src/lib.rs`의 `mod hwp` 및 `import_hwp` invoke 등록 해제
- `src-tauri/Cargo.toml`에서 HWP 전용 의존성 정리
- `src/components/AppShell.jsx`의 `import_hwp` 호출과 관련된 다이얼로그 트리거, 버튼/메뉴, 에러 처리 제거
- 워크스페이스 파일 행의 `updatedAt = 0/null` 원인을 `fs.rs::mtime_ms` → Tauri 응답 매핑 → `FileList.timeAgo` 경로에서 추적해 결함 지점만 수정
- Markdown viewer에 GFM 풀세트 적용 (표, 작업 목록 체크박스, 취소선, autolink, footnote)

**Out of scope (later)**
- 코드 블록 syntax highlighting
- KaTeX 수식, mermaid 다이어그램
- TOC 자동 생성, 이미지/외부 링크 보안 정책 강화
- Markdown 편집기(쓰기) 측 기능 변경 — 이번 plan은 뷰어 한정

## Version

- Current: 0.11.0
- Bump: minor
- Target: 0.12.0

## Stages

1. HWP 완전 제거 — 백엔드 모듈/등록/의존성과 프론트엔드 호출·UI를 한 번에 정리하고 `cargo check` + `bun run dev`로 회귀 확인
2. 수정시간 표시 버그 핀포인트 수정 — 원인 레이어를 좁힌 뒤 한 지점만 고치고 FileList에서 표시 확인
3. Markdown viewer GFM 풀세트 도입 — 라이브러리 선정·적용·기존 CSS 충돌 확인

## Constraints

- 세 단계를 하나의 plan/PR에서 순서대로 진행하고, 각 stage 종료마다 빌드와 앱 실행으로 회귀 확인
- 환경: Tauri 2 + React 18 + rsbuild, 기존 의존성 최소화 원칙 유지
- GFM용 신규 의존성은 1세트만 추가 (예: `react-markdown` + `remark-gfm`)
- HWP 제거로 깨지는 import/JSX는 그 자리에서 같이 정리해 dead code를 남기지 않음

## Direction

- Stage 1: `git grep -i hwp` 및 `import_hwp`로 전수 색출 → 백엔드(`hwp.rs`, `lib.rs`, `Cargo.toml`)와 프론트(`AppShell.jsx`)를 같은 커밋 단위에서 제거 → `cargo check`와 dev 런타임으로 invoke 누락/UI 결함 없는지 확인.
- Stage 2: 데이터 흐름은 `fs.rs::mtime_ms` → 응답 구조체의 `updated_at` → 프론트의 `it.updatedAt` → `timeAgo()`. dev에서 실제 워크스페이스의 응답을 찍어 어느 레이어에서 0/null이 발생하는지 좁힌 뒤, 원인이 한 곳이면 그 지점만 수정 (예: 응답 필드 누락, i64↔number 직렬화, 정렬·캐시 키 덮어쓰기 등). 추측 수정 금지.
- Stage 3: `react-markdown` + `remark-gfm` 우선 검토(React 의존성과 자연스럽게 결합, 트리 작음). Editor의 viewer 모드에서 GFM을 토글 없이 상시 적용하고, 기존 `.markdown-body` 류 CSS와 표/체크박스 스타일이 충돌하지 않는지 확인. 라이브러리 선정 후 dev에서 표·체크박스·autolink·footnote 케이스를 직접 렌더해 검증.
