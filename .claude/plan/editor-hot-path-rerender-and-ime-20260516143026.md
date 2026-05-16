- [x] applied

# 에디터 핫패스 React 재렌더 제거 + 한글 IME 조합 수정

스크롤·키 입력 시 Editor 전체가 매번 재렌더되어 느린 문제와 한글 IME 조합이 깨지는 문제를 함께 잡는다. content는 ref/DOM 진실로, geom은 ref/transform으로, composition 처리로 IME 안전.

## Version

- Current: 0.9.1
- Bump: patch
- Target: 0.9.2

## Purpose

직전 v2 최적화(rAF/메모화)는 "중복 호출 합치기"였고, Editor가 매 키 입력·매 스크롤 프레임마다 React 재렌더되는 구조 자체는 그대로였다. 그래서 체감 성능이 거의 바뀌지 않았고, contentEditable에 React state가 묶여 있어 한글 IME 조합(예: `ㅎ` + `ㅏ` → `하`)이 깨지는 버그도 동시에 발생한다. 이 두 가지를 같은 patch로 해결한다.

## Scope

**In scope**
- `content`를 React state → `contentRef`로. 키 입력마다 setContent 호출하지 않음. autosave 디바운스 flush 시점에 `editableRef.current.innerText`를 읽어 onChange로 흘림.
- `geom`을 React state에서 제거. `scheduleRecompute`의 rAF 콜백이 `rulerHInnerRef`/`rulerVInnerRef`의 `style.transform`을 직접 갱신. 스크롤 시 Editor render 발생 안 함.
- `compositionstart`/`compositionend` 핸들러 추가 → 조합 중에는 `applyContentFromDOM`이 무시. composition 끝 시점에 한 번 반영.
- `saving` 토글을 `savingRef`로 보호 → 키 입력마다 setSaving 호출 안 함. 디바운스 사이클 시작/종료 각 1회만.
- 마운트 후 첫 effect는 `touchedRef` 가드로 spurious save 방지.

**Out of scope (later)**
- 다른 컴포넌트(FileList, Chat, AppShell) 최적화
- 가상 스크롤 / 매우 긴 문서 처리
- 포맷팅 기능(굵게/기울임 등), 설정 화면
- 다른 IME(중국어/일본어 등) 별도 테스트 — 같은 composition 패턴으로 자동 커버되지만 명시 검증은 한국어만
- 마진 드래그 시 React 재렌더 최적화 (드물게 일어나므로 v1 아님)

## Stages

1. **Composition 가드** — `composingRef` ref + `onCompositionStart`/`onCompositionEnd` 핸들러 추가. `applyContentFromDOM`에 composing 가드 추가. compositionend에서 한 번 applyContentFromDOM 호출.
2. **content를 ref 기반으로** — `contentRef = useRef(file.content || '')` 도입. 키 입력 시 setContent 제거. autosave timer 콜백에서 `editableRef.current.innerText`를 읽어 `onChange` 호출. 마운트/파일 전환/토글 ON 시점에만 ref ↔ DOM 동기화.
3. **geom을 ref 기반으로** — `rulerHInnerRef`/`rulerVInnerRef` 추가. scheduleRecompute의 rAF 콜백 안에서 setGeom 대신 `style.transform` 직접 갱신. `geom` state 제거.
4. **saving 한 번씩만 set** — `savingRef`로 중복 호출 방지. applyContentFromDOM에서 첫 변경 시에만 setSaving(true), timer fire 시 setSaving(false). 마진/타이틀 변경도 동일 경로.
5. **검증** — `bun run build` 통과. dev에서 (a) 한글 입력 `ㅎ`+`ㅏ`→`하` 정상 (b) 빠른 스크롤 부드러움 (c) 자동저장 ON/OFF 정상 (d) 룰러 동기화 유지 (e) 마진 드래그 정상 (f) 분할 패널 정상.

## Constraints

- contentEditable의 innerText를 진실로 사용. React `content` state는 제거하거나 마운트/파일 전환/저장 직전에만 동기화.
- AppShell과의 인터페이스(`onChange`, `onSaveNow`)는 그대로. AppShell 코드 수정 없음.
- 자동저장 토글, 미저장 표시, 분할 패널, 룰러 드래그 등 기존 동작 회귀 없음.
- composition 가드는 onCompositionStart/End만으로 충분 (onInput은 composition 중에도 발화하지만 가드로 무시).
- 룰러 inner DOM이 마운트 전에 ref가 비어 있을 수 있으므로 null 체크 필수.

## Direction

- `contentRef = useRef(file.content || '')` — DOM 진실의 in-memory 복사본. 디바운스 flush 시점에만 onChange로 흘림.
- `composingRef = useRef(false)`. compositionstart 시 true, compositionend 시 false + 그 시점에 한 번 applyContentFromDOM. onInput은 composing 중이면 즉시 return.
- `scheduleRecompute`의 rAF 콜백:
  ```js
  const pageR = pageRef.current.getBoundingClientRect();
  const hR = rulerHRef.current.getBoundingClientRect();
  const vR = rulerVRef.current.getBoundingClientRect();
  const scrollTop = scrollRef.current.scrollTop;
  const pageLeft = pageR.left - hR.left;
  const pageTop = pageR.top - vR.top;
  rulerHInnerRef.current.style.transform = `translateX(${pageLeft}px)`;
  rulerVInnerRef.current.style.transform = `translateY(${pageTop - scrollTop}px)`;
  ```
- 마진 핸들 위치는 `margins.left * PX_PER_CM` 등 margins만으로 결정 (이미 Plan A에서 .ruler-inner translate로 분리됨). geom 제거가 가능한 이유.
- `useEffect([title, margins, autosave], scheduleAutosave)` + 콘텐츠 입력은 applyContentFromDOM 안에서 직접 scheduleAutosave 호출. content state가 deps에 없어도 onInput → applyContentFromDOM → scheduleAutosave 경로로 디바운스 갱신.
- 마운트 후 첫 effect는 `touchedRef.current` 가드로 spurious save 방지.
- saving 표시는 `savingRef`로 중복 호출 방지하되, 시각적 효과는 유지 — 첫 변경 시 setSaving(true), timer fire 시 setSaving(false).
