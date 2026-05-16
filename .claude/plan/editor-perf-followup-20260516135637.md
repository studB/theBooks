- [x] applied

# 에디터 후속 최적화

v1(페이지네이션 제거)에서 미룬 잔여 최적화: ResizeObserver 재구독 정리, SplitButton 트리 탐색 메모화, AppShell scheduleWrite 흐름 정리, recompute rAF 묶음.

## Version

- Current: 0.9.0
- Bump: patch
- Target: 0.9.1

## Purpose

v1에서 큰 건만 처리하고 미룬 내부 최적화를 마무리한다. UX는 변하지 않지만 키 입력·스크롤·창 크기 변경 시 불필요한 재구독/재탐색/재계산을 줄여 체감 지연을 한 단계 더 낮춘다.

## Scope

**In scope**
- `Editor.jsx`의 `ResizeObserver` effect를 `recompute` 의존성에서 분리 → ref 기반으로 일회 등록, 함수는 ref로 최신값 참조
- `SplitButton`의 `items.find` / `descendant` 트리 탐색을 `useMemo([items, currentFileId, workspaceId])`로 메모화
- `AppShell.scheduleWrite`의 500ms 디바운스와 Editor 내부 600ms 디바운스가 겹치는 부분 정리 — 최종 저장은 `write_file`까지 한 번만 가도록 단순화
- `recompute` 호출을 `requestAnimationFrame`으로 묶어, 빠른 스크롤 중 동일 프레임 내 중복 계산 제거

**Out of scope (later)**
- Editor 컴포넌트 자체의 분리/리팩토링 (PageHeader, PageRulers, PageBody 등)
- 가상 스크롤(react-virtual 등) 도입
- 설정 모달 / 토글 위치 변경
- 다른 컴포넌트(Chat, FileList, ReferencePane) 최적화

## Stages

1. **ResizeObserver 패턴 정리** — recompute를 ref에 담고, effect는 마운트 시 1회만 ObserverHookup. 의존성에서 recompute 제거.
2. **SplitButton 메모화** — `others` 계산을 `useMemo`로 감싸고, `descendant` 함수도 메모화. items 변경 시에만 재계산.
3. **저장 디바운스 정리** — Editor의 자동저장 effect는 그대로 두고, AppShell `scheduleWrite`의 500ms를 0으로 줄이거나 제거. 두 곳 중 한 곳만 디바운스를 책임지도록 명확화.
4. **recompute rAF** — scroll 핸들러와 ResizeObserver 콜백이 같은 프레임에 여러 번 부르더라도 rAF 한 번에만 실제 계산이 돌도록 trailing rAF 패턴.
5. **검증** — `bun run build` 통과, dev에서 (a) 빠른 스크롤 시 룰러 정상 동기화 (b) 자동저장 ON에서 저장이 1회만 일어나는지 (c) 분할 메뉴 정상 표시 확인.

## Constraints

- 동작/UI 회귀 없음. 사용자 입장에서 동일하게 보이고 동일하게 저장되어야 한다.
- v1이 먼저 적용된 상태(0.9.0)에서 시작. v1 적용 전에는 이 plan을 적용할 수 없다.
- 외부 파일은 손대지 않음. 변경 범위는 `Editor.jsx`와 `AppShell.jsx`에 한정.

## Direction

- ResizeObserver 패턴: `const recomputeRef = useRef(recompute); useEffect(() => { recomputeRef.current = recompute; });` 후 effect는 빈 의존성으로 `recomputeRef.current()` 호출.
- SplitButton: `descendant`를 `useCallback([items, workspaceId])`로, `others`를 `useMemo([items, currentFileId, workspaceId])`로.
- 디바운스 단일화: Editor가 이미 600ms로 모으고 있으므로 AppShell `scheduleWrite`의 setTimeout 500ms는 불필요. `setItems` 즉시 + `invoke('write_file')` 즉시로 단순화.
- rAF: `let rafId = null; const schedule = () => { if (rafId) return; rafId = rAF(() => { rafId = null; doRecompute(); }); };` 형태.
