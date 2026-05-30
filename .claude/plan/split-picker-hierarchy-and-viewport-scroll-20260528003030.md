- [x] applied

# 분할/참조 파일 피커 계층화 + 짧은 뷰포트 스크롤 수정

분할·참조 파일 피커를 flat 목록에서 폴더 드릴다운 방식으로 바꾸고, 뷰포트가 짧을 때 하단에 접근할 수 있도록 스크롤 컨테이너의 min-height/minmax 누락을 수정한다.

## Version

- Current: 0.16.0
- Bump: minor
- Target: 0.17.0

## Purpose

폴더가 많은 워크스페이스에서 '분할'/'참조 바꾸기' 드롭다운이 모든 파일을 한 줄로 쏟아내 원하는 파일을 찾기 어렵다. 또 창 높이를 줄이면 스크롤이 생기지 않아 하단 영역(목록 끝 행, 에디터 하단/툴바)에 접근할 수 없다. 두 가지 모두 일상 사용을 막는 UI 결함이라 함께 고친다.

## Scope

**In scope**
- 공통 '폴더 드릴다운' 파일 피커 컴포넌트: 현재 폴더의 직속 하위 폴더/파일만 표시(폴더 먼저, 그다음 파일), 폴더 클릭 시 진입, '상위로' 버튼, 현재 경로 표시, 파일 선택 시 콜백
- `SplitButton`(분할)과 `ReferencePane`의 '참조 파일 바꾸기' 피커를 이 공통 컴포넌트로 교체
- 현재 편집 중인 파일은 피커 목록에서 제외(기존 동작 유지)
- 스크롤 컨테이너 전반 점검·수정: `.bucket-table`에 `min-height:0`, `.editor-wrap`의 `grid-template-rows`를 `24px minmax(0,1fr)`, 그 외 flex/grid 자식이 내부 스크롤하도록 누락된 `min-height:0` 보강

**Out of scope (later)**
- 피커 내 검색/필터, 파일 생성·이름변경, 드래그앤드롭
- 트리(전체 펼침) 뷰
- 가상 스크롤(대량 파일 성능)
- 반응형/모바일 레이아웃 재설계
- 사이드 패널/채팅/분석 패널의 신규 레이아웃 변경(스크롤 버그가 거기서 재현될 때만 최소 수정)

## Stages

1. **공통 피커 컴포넌트** — `FilePicker`(가칭) 작성: props `{ items, workspaceId, currentFileId, onPick }`. 내부 `folderId` 상태로 직속 children만 정렬해 표시, 폴더 진입/상위 이동/경로 표시
2. **피커 교체** — `SplitButton` 드롭다운과 `ReferencePane` 피커 내용물을 `FilePicker`로 교체. 기존 `onOpenSplit`/`onChangeFile` 콜백 시그니처·드롭다운 위치/스타일 유지
3. **스크롤 audit & 수정** — `.bucket-table`·`.editor-wrap`(grid row)·기타 스크롤 컨테이너에 `min-height:0`/`minmax(0,1fr)` 보강, `.app`의 `100vh`·`overflow:hidden`은 유지
4. **검증** — `bun tauri dev`로 ① 중첩 폴더 워크스페이스에서 분할/참조 피커 드릴다운·상위이동·파일선택 ② 현재 파일 제외 확인 ③ 창 높이를 크게 줄였을 때 파일목록 마지막 행/에디터 하단 접근 가능 ④ 기존 정상 높이 회귀 없음

## Constraints

- `items` 구조(id=상대경로, type 'folder'|'file', name, parent)와 기존 descendant 필터 로직 재사용
- 기존 콜백 시그니처(`onOpenSplit(id)`, `onChangeFile(id)`) 변경 금지 — 호출부 영향 없게
- `.app`의 `height:100vh`·`overflow:hidden`은 유지하고, 내부 스크롤 컨테이너가 스스로 스크롤하도록만 수정(레이아웃 구조 큰 변경 금지)
- 드롭다운/팝오버는 기존 `split-picker-menu`·`ref-picker` 스타일 최대한 재활용 — 새 스타일 최소화
- `front-assets/`는 건드리지 않음

## Direction

- `FilePicker`: 내부 `const [folderId, setFolderId] = useState(workspaceId)`. 표시 목록은 `items`에서 `parent === folderId`인 항목만, `type==='folder'` 먼저 → `file` 다음, 각 그룹은 이름/updatedAt 정렬. 파일 중 `id===currentFileId`는 제외
- 폴더 행 클릭 → `setFolderId(folder.id)`. 헤더에 현재 경로(workspace > … ) + folderId가 workspace가 아니면 '상위로' 버튼(`parent`로 이동). 파일 행 클릭 → `onPick(file.id)`
- `SplitButton`: 기존 `others` 평탄화 로직 제거, 드롭다운 내부를 `<FilePicker onPick={(id)=>{onOpenSplit(id); close()}} .../>`로 교체. `ReferencePane`도 동일하게 `ref-picker` 내부 교체(`onPick={(id)=>{onChangeFile(id); setPickerOpen(false)}}`)
- 스크롤: flexbox/grid에서 자식이 내용보다 작아질 수 있어야 내부 `overflow:auto`가 동작 → `.bucket-table { min-height:0 }`, `.editor-wrap { grid-template-rows: 24px minmax(0,1fr) }`. 그 외 `overflow:auto`를 가진 컨테이너의 부모 체인에 `min-height:0` 누락 여부 점검
