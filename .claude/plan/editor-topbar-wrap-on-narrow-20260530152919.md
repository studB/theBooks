- [x] applied

# Editor topbar 좁은 폭에서 두 줄 줄바꿈 대응

분할/사이드 패널이 열려 에디터 폭이 좁아지면 topbar 요소들이 겹치고 잘리는 문제를 flex-wrap 기반 두 줄 레이아웃으로 해결한다.

## Purpose

분할 보기, 사이드 패널, 작은 윈도우 등으로 에디터 폭이 줄어들면 `.topbar`의 버튼/배지/제목이 글자가 세로로 깨지거나 겹쳐 보인다. 폭이 부족할 때 자연스럽게 두 줄(또는 그 이상)로 줄바꿈되어 모든 요소가 항상 읽히고 클릭 가능하도록 만든다.

## Scope

**In scope**
- [src/components/Editor.jsx:352-431](src/components/Editor.jsx#L352-L431)의 `.topbar` 마크업 (필요 시 좌/우 그룹 컨테이너 추가)
- [src/styles.css:379-417](src/styles.css#L379-L417)의 `.topbar`, `.topbar-spacer`, `.topbar-title` 관련 스타일
- 한 줄 유지 우선순위: [목록] 뒤로가기, 제목(초안), [분할], [저장]

**Out of scope (later)**
- GitEditorBar([src/components/Editor.jsx:433-441](src/components/Editor.jsx#L433-L441)) 반응형 처리
- FileList 헤더, SidePanel 헤더 등 다른 영역의 좁은 폭 처리
- 모바일/터치 최적화, 오버플로우 메뉴(...) 패턴 도입

## Stages

1. CSS 우선 처리 — `.topbar`를 `flex-wrap: wrap`, `min-height: 52px`, `row-gap` 적용. `topbar-spacer`를 제거하거나 우선순위 우측 그룹에 `margin-left: auto` 적용하여 비우선 요소가 먼저 다음 줄로 떨어지도록.
2. JSX 그룹화 — 필요 시 우선순위 요소를 `.topbar-priority-left` / `.topbar-priority-right` 컨테이너로 묶고, 그 외 요소(분석/PDF/자동저장/SaveStatus/FormatControls/CharCountBadge)를 중간 그룹으로 묶어 wrap 시 깨끗하게 두 번째 줄로 흐르게 한다.
3. 검증 — 패널 분할, 사이드 패널 열기/닫기, 윈도우 리사이즈로 폭을 점진적으로 줄여 보며 깨짐 없이 두 줄 전환되는지 확인. 충분히 넓을 때 기존 한 줄 모양 유지되는지 회귀 체크.

## Constraints

- 기존 한 줄 모드의 비주얼/높이(52px) 유지 — 충분히 넓을 때 보이는 모양이 바뀌면 안 됨.
- `position: sticky`/스크롤 동작에 의존하는 다른 영역(예: ruler-h, GitEditorBar 위치)이 topbar 높이 변화에 따라 자연스럽게 밀려나야 함.
- 두 줄로 늘어났을 때도 어색한 큰 빈 공간이 생기지 않도록 `row-gap`/`column-gap`을 작게 유지.

## Direction

핵심은 `.topbar { flex-wrap: wrap }` + `min-height` 전환. 우선순위 제어는 (a) `margin-left: auto`로 우측 그룹을 떼어내거나, (b) 우선/비우선 요소를 각각 inline-flex 컨테이너로 감싸 한 단위로 묶어 줄바꿈 단위를 통제하는 방식 중 단순한 쪽을 택한다. 가능하면 (a)를 먼저 시도하고 시각적으로 부족하면 (b)로 보강. `topbar-spacer`(`flex: 1`)는 wrap 환경에서 빈 공간을 점유해 어색하므로 제거 또는 비표시.
