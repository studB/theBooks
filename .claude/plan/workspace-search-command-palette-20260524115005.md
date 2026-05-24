- [x] applied

# 워크스페이스 전체 검색 — Ctrl/Cmd+P 커맨드 팔레트로 파일명·본문 동시 검색

워크스페이스의 .md 파일을 파일명·제목·본문에서 즉시 검색하는 Ctrl/Cmd+P 커맨드 팔레트를 추가한다. Rust on-demand 스캔 + 결과 클릭으로 파일 열기까지 완결.

## Purpose

.md 기반 문서가 늘어날수록 파일 트리 탐색만으로는 원하는 글을 빠르게 찾기 어렵다. 인덱싱·서드파티 의존성 없이도 워크스페이스 전체를 키보드 한 번에 검색해 곧장 해당 파일로 이동하는 경험을 더해, 이 앱을 일상 메모/노트용으로 더 가볍게 쓰게 만든다.

## Scope

**In scope**
- Rust `search_workspace(query)` 커맨드: `walkdir`로 .md만 순회, 파일명·frontmatter title·본문에 대해 case-insensitive 부분 일치, 결과는 `{ relPath, title, lineIndex, snippet }` 배열
- React 커맨드 팔레트 컴포넌트: 모달 오버레이, 검색 입력(디바운스 ~200ms), 결과 리스트(파일명 + 스니펫), ↑↓·Enter·Esc 키보드 조작
- 전역 단축키: macOS Cmd+P / Win·Linux Ctrl+P
- 결과 선택 시 해당 파일 열기 (`openFileById` 흐름 재사용)

**Out of scope (later)**
- 정규식·AND/OR 같은 고급 쿼리
- 검색 결과에서 에디터 내 해당 줄로 점프 (contentEditable 좌표 계산 필요)
- 인덱싱·캐싱·결과 페이지네이션
- 검색 기록·즐겨찾기·폴더 한정 검색
- 비-.md 텍스트 파일 검색

## Stages

1. Backend `search_workspace` 커맨드 + `lib.rs` invoke 등록 — 임의 워크스페이스에서 정상 응답 확인
2. Frontend 커맨드 팔레트 컴포넌트와 전역 단축키 — 디자인 토큰에 맞춘 모달 스타일
3. 결과 선택 → 파일 열기 연동 (AppShell 상태 와이어링) + dev 회귀 확인

## Constraints

- Tauri 2 + React 18, 기존 의존성 최소화 — `walkdir`은 이미 사용 중이므로 신규 npm/cargo 의존성 없음
- 응답 크기 제한 (예: 최대 200개) 으로 큰 워크스페이스에서 메모리 폭주 방지
- macOS Cmd+P 가로채기는 React 레이어에서 우선 처리, Tauri WebView가 막으면 Stage 2 도중 Tauri 단축키 등록으로 보강

## Version

- Current: 0.12.0
- Bump: minor
- Target: 0.13.0

## Direction

- Rust: `fs::workspace_root` 재사용 → `walkdir`로 `.md` 파일만 순회. 파일을 읽어 frontmatter 제거 후 본문 라인 단위 매칭. 매칭된 라인의 `lineIndex`와 `snippet`(앞뒤 30자 정도)을 반환. 파일명·title 매칭은 결과에 별도 마커 필드로 표시. 결과는 fileName/title hit를 본문 hit보다 위로 정렬.
- Frontend: `AppShell.jsx`에 키다운 리스너 등록(입력 포커스 중에도 Cmd/Ctrl+P를 preventDefault로 가로채기). 모달은 `WorkspacePickerModal` 구조를 참고해 별도 컴포넌트로 분리. 입력 200ms 디바운스 → `invoke('search_workspace', { query })`. 빈 쿼리는 호출하지 않음.
- 결과 인터랙션: 위/아래 화살표로 강조 이동, Enter로 열기, Esc로 닫기, 클릭도 동일하게 열기. 결과 행에는 파일명·매칭 라인 스니펫을 함께 표시.
- 회귀 확인: dev 실행 후 빈 결과·소량 결과·다수 결과·title vs 본문 매칭 케이스를 직접 테스트.
