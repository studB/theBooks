- [x] applied

# 파일목록에 새로고침 버튼 추가

파일목록 서브툴바(↑ 상위 / 검색 옆)에 새로고침 아이콘 버튼을 추가해 워크스페이스 파일 목록과 git 상태를 한 번에 다시 읽어온다.

## Version

- Current: 0.17.0
- Bump: minor
- Target: 0.18.0

## Purpose

외부에서 파일이 추가·삭제·이름변경되었을 때 앱이 자동으로 감지하지 않으면 사용자가 화면을 다시 띄우거나 워크스페이스를 재선택해야 한다. 한 번 클릭으로 파일목록과 git 상태를 다시 읽어오게 해 수동 동기화 비용을 줄인다.

## Scope

**In scope**
- `FileList.jsx`의 `bucket-toolbar`에 새로고침 아이콘 버튼 추가 (현재 ↑ 상위 버튼 / 검색 옆)
- `AppShell.jsx`에서 `onRefresh = () => { refresh(); refreshGit(); }` 콜백을 만들어 `FileList`에 prop으로 전달
- 로딩 상태(`gitLoading` 또는 자체 in-flight 플래그)일 때 버튼 `disabled`

**Out of scope (later)**
- 단축키(Cmd+R 등)
- 자동 폴링·간격 새로고침
- 파일시스템 watcher 기반 자동 갱신
- 회전 애니메이션/스피너 시각 효과
- 새로고침 결과 토스트("3 파일 추가됨" 등)
- S3 동기화 버튼 동작과의 통합

## Stages

1. **콜백 + prop 전달** — `AppShell.jsx`에 `handleRefresh = () => { refresh(); refreshGit(); }` 추가, `<FileList ... onRefresh={handleRefresh} />`로 전달
2. **버튼 추가** — `FileList.jsx`에 `onRefresh` prop 추가, `bucket-toolbar`에 `Icon name="refresh"` 아이콘 버튼 (`bucket-up`과 비슷한 스타일 재활용 또는 신규 `.bucket-refresh` 한 줄)
3. **검증** — `bun tauri dev`로 ① 외부에서 파일 추가 후 버튼 클릭 → 목록에 반영 ② git 변경 후 버튼 → git 패널/배지 갱신 ③ 로딩 중 버튼 비활성화 확인

## Constraints

- `AppShell.jsx`의 기존 `refresh()` / `refreshGit()` 함수 시그니처/동작 변경 금지 — 콜백만 묶어 호출
- `bucket-toolbar` 레이아웃·스타일 큰 변경 금지 — 기존 `.bucket-up` 패턴 재활용
- S3 워크스페이스에서도 동작 (refresh는 list_workspace 호출이라 동일하게 OK)
- `front-assets/`는 건드리지 않음

## Direction

- `AppShell`은 이미 `refresh`/`refreshGit` 모두 보유. 새 콜백은 단순히 두 호출을 묶기만 함
- 버튼 스타일은 `bucket-up`/`icon-btn` 같은 기존 클래스 재사용해 새 CSS 최소화. 필요시 `.bucket-refresh`를 `.bucket-up`과 유사하게 한 블록 추가
- `disabled` 조건: 우선 `gitLoading`을 그대로 활용(파일 목록 재로드는 빠르고 동기적이라 별도 in-flight 상태 추가 불필요)
- 아이콘은 기존 `refresh` 이미 정의됨 (`<path d="M21 12a9 9..."/>`)
