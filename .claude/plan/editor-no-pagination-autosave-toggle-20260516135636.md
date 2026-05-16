- [x] applied

# 에디터 페이지네이션 제거 + 자동저장 토글

페이지 단위 레이아웃을 없애고 A4 너비 단일 스크롤 캔버스로 전환. 자동저장은 기본 OFF, 상단바 토글로 켜기. 룰러/timeAgo 등 큰 재렌더 비용 정리.

## Version

- Current: 0.8.0
- Bump: minor
- Target: 0.9.0

## Purpose

작가가 글을 쓸 때 입력 커서가 페이지 경계의 mask 영역으로 들어가 사라지는 버그, 페이지 자동 분할이 어색하게 동작하는 문제, 그리고 키 입력 사이 체감 지연을 한 번에 해결한다. 페이지 메타포 자체를 포기하고 "긴 종이 한 장"으로 단순화한다.

## Scope

**In scope**
- `Editor.jsx`에서 다중 페이지 관련 코드 제거: `pageCount`, `currentPage`, `measurePages`, mask gradient, 페이지 카운터 UI, `PageStack`의 다중 시트 렌더링
- A4 너비(21cm) 유지, 높이는 콘텐츠 길이에 따라 자유 확장 (단일 `page-sheet` + `page-content`)
- 룰러 세로 눈금은 한 페이지(29.7cm)분만 유지하되, 스크롤에 따라 위치만 갱신 (기존 `geom.pageTop - geom.scrollTop` 방식 유지)
- 자동저장 토글: 상단바에 작은 토글 컨트롤, 기본 OFF, `localStorage["thebooks.autosave"]`에 영속
- OFF 상태 표시: status text를 "미저장 변경 있음"으로 전환, 저장 버튼에 강조 클래스(예: pulse) 적용
- 큰 최적화 3종:
  - 룰러 ticks(hTicks/vTicks) `useMemo`
  - save-status / 30초 `force` 인터벌을 작은 자식 컴포넌트(`SaveStatus`)로 분리
  - 자동저장 OFF일 때 `applyContentFromDOM`은 setContent를 호출하지 않음(저장 시점에 innerText만 읽기)

**Out of scope (later → Plan B)**
- `ResizeObserver` re-subscription 패턴 정리
- `SplitButton` 트리 탐색 `useMemo`
- `AppShell.scheduleWrite` 디바운스와 Editor 디바운스의 이중 호출 정리
- `recompute`의 rAF 묶음
- 설정 모달, 토글의 워크스페이스별/전역 구분

## Stages

1. **단일 시트 단순화** — `PageStack`을 한 장의 `page-sheet`로 단순화, `page-content`의 height를 stackHeight → auto, mask 제거, `measurePages` 제거, `pageCount`/`currentPage` state 및 페이지 카운터 UI 제거
2. **자동저장 토글 state** — `useState` + localStorage 동기화 hook, 상단바에 토글 UI 배치
3. **저장 로직 분기** — `[title, content, margins]` effect에서 토글 ON일 때만 600ms 디바운스 저장, OFF면 effect 발화 안 함. 수동 저장 버튼은 늘 즉시 onSaveNow 호출
4. **상태 표시 강조** — OFF + 미저장 시 status text/저장 버튼 시각적 강조 스타일 추가 (CSS 클래스)
5. **큰 최적화 적용** — 룰러 ticks useMemo, `SaveStatus` 자식 컴포넌트 분리, OFF 시 setContent 생략
6. **검증** — `bun run build` 통과, dev에서 (a) 긴 글 입력 시 커서가 끝까지 따라오는지 (b) 토글 ON/OFF 전환 시 저장 동작 (c) 룰러 정상 표시 확인

## Constraints

- 여백 룰러/드래그 핸들/저장 핸들러는 기존 동작 그대로 유지
- 룰러 세로 눈금은 한 페이지 분량만 그리며, 스크롤 시 위치만 갱신 (룰러 자체 길이 변경은 v1 아님)
- localStorage 키는 `thebooks.autosave`로 고정. 기본값 `"off"`
- 외부 파일(AppShell, FileList 등)은 가능한 한 손대지 않음. status indicator 강조용 CSS만 styles.css에 추가
- 동작 회귀 없음: 파일 열기/닫기, 분할 패널, 저장 모두 그대로 동작
- 페이지 카운터 UI 제거에 따른 상단바 빈 공간은 spacer/디바이더로 자연스럽게 채움

## Direction

- 다중 페이지를 위한 mask + page-stack 구조 자체를 들어내고, contentEditable 한 개를 단일 `page-sheet` 안에 박는다. 시트 높이는 콘텐츠에 맞춰 `auto`.
- 자동저장 토글은 가장 단순한 형태: `const [autosave, setAutosave] = useState(() => localStorage.getItem('thebooks.autosave') === 'on')` + setter에서 localStorage 동기화.
- 저장 effect의 트리거 조건에 `if (!autosave) return;` 한 줄을 추가. 기존 600ms 디바운스는 ON 경로에서만 작동.
- 키 입력 → `applyContentFromDOM` → `setContent`는 OFF 경로에서는 트리 업데이트가 의미 없으므로(자동저장도 안 일어남) 생략. 다만 수동 저장 시점에 `editableRef.current.innerText`를 직접 읽어 최신 상태로 저장.
- `SaveStatus`는 `savedAt` prop과 자체 `useEffect(setInterval, 30000)`을 들고 있는 가벼운 컴포넌트. 부모 리렌더와 분리되어 30초마다 자신만 갱신.
- 룰러 ticks는 `margins`와 `PAGE_W_CM`/`PAGE_H_CM`에만 의존하므로 `useMemo([margins])`로 충분. 위치 보정(`geom.pageLeft` 등)은 인라인 스타일로 분리해 메모 대상에서 제외.
