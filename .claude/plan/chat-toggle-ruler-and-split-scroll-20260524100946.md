- [x] applied

# 채팅 토글 + 좌측 눈금자 제거 + 분할 보기 스크롤

편집 화면에서 AI 채팅 패널을 접고/펼치고, 의미 없는 좌측 세로 눈금자를 제거하고, 분할 보기 시 좌측 ref-pane에 세로 스크롤을 추가하는 작은 UI 정리 묶음.

## Purpose

세 가지 작은 UX 결함을 한 번에 정리한다. (a) 채팅 패널이 항상 자리를 차지해 본문 폭을 좁히므로 사용자가 접을 수 있어야 한다. (b) 좌측 세로 눈금자는 페이지가 아래로 계속 늘어나는 구조라 의미가 거의 없다. (c) 분할 보기에서 좌측 영역에 스크롤이 없어 긴 문서를 확인할 수 없다.

## Scope

**In scope**
- 채팅 패널 가장자리 토글 버튼 — 클릭으로 접기/펼치기, 상태는 localStorage에 영속
- 접힌 상태에서도 다시 펼 수 있는 작은 핸들 유지 (완전 unmount 아님)
- `.ruler-v` 및 좌측 상단 corner DOM/CSS 제거, 본문 영역 폭/오프셋 보정
- 분할 보기 좌측 ref-pane에 `overflow-y: auto` 추가, 헤더 고정 여부 확인

**Out of scope (later)**
- 채팅 패널 너비 조절, 가로 눈금자 변경
- 분할 패널 너비 드래그 동작 변경
- 채팅 접힘 상태에서의 단축키/명령 팔레트

## Stages

1. 채팅 패널 토글 — `Chat.jsx`/`AppShell.jsx`에 collapse state + 토글 버튼, `.with-chat` 그리드 컬럼 분기 처리
2. 좌측 세로 눈금자 제거 — `.ruler-v` 렌더링과 corner 정리, 페이지 stack의 좌측 오프셋/마진 보정
3. 분할 좌측 패널 스크롤 — `.ref-pane` (또는 해당 컴포넌트)에 세로 스크롤 적용
4. 수동 확인 — 토글 영속, 눈금자 제거 후 정렬, 분할에서 긴 문서 스크롤 동작

## Constraints

- `Editor.jsx` 외에도 `AppShell.jsx`/`Chat.jsx`/`styles.css` 변경 필요
- Version bump은 이 plan 단독으로는 진행하지 않고 [[workspace-git-status-panel]] 적용 시점에 함께 묶어서 minor bump
- 분할 보기의 기존 본문 영역 스크롤 동작에 회귀 없을 것

## Direction

채팅 토글: `AppShell`에 `chatCollapsed` state 추가, `localStorage`에 영속(autosave 토글 패턴 참고). collapse 시 `.app` 클래스에 `with-chat-collapsed` 같은 변형을 주고 그리드 컬럼을 좁은 핸들 폭(예: 24px)으로 축소. 핸들은 채팅 영역 좌측 가장자리에 고정 위치 작은 버튼.

눈금자: `PageStack` 주변에서 `.ruler-v`와 `.ruler-corner`를 제거하고, 본문이 좌측에서 차지하던 눈금자 폭만큼 오프셋을 줄인다. 가로 눈금자 `.ruler-h`는 유지.

분할 스크롤: 분할 좌측 ref-pane 컨테이너에 `overflow-y: auto`와 충분한 `min-height: 0`을 주어 flex/grid 자식 스크롤이 작동하게 한다.
