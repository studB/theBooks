- [x] applied

# 스테퍼 입력 백스페이스 버그 수정

Editor.jsx의 fontSize/letterSpacing/lineHeight 스테퍼가 매 키 입력마다 clamp를 적용해 두 자리 이상 자유롭게 지우거나 수정할 수 없는 문제를 수정.

## Version

- Current: 0.10.1
- Bump: patch
- Target: 0.10.2

## Purpose

`Editor.jsx`의 fmt-stepper input은 onChange에서 즉시 `clamp(min, max)`를 돌려 fmt에 patch한다. 그래서 예컨대 fontSize가 `16`일 때 백스페이스를 누르면 `1` → clamp → `8`로 바로 튀어, 사실상 한 자리만 지운 채 더 이상 편집이 불가능해진다. 사용자가 값을 자연스럽게 비우고 다시 입력할 수 있어야 한다.

## Scope

**In scope**
- `src/components/Editor.jsx`의 세 fmt-stepper (fontSize, letterSpacing, lineHeight) 입력 동작 수정
- 각 input을 로컬 문자열 state로 관리 (입력 중 임시 값 허용)
- `parseFloat` 결과가 유효하고 `min ≤ v ≤ max` 일 때만 `patch()` 호출
- blur 시 invalid면 마지막 유효 값(`fmt.X`)으로 로컬 state 복원
- 외부에서 `fmt.X`가 바뀌면 (포커스 없을 때) 로컬 state 동기화

**Out of scope (later)**
- 그 외 input 필드 (FileList, WorkspacePicker 등)
- 스테퍼 UI/스타일 변경, 단위 표시, 단축키
- 스테퍼를 재사용 컴포넌트로 정식 추출 (필요 최소만)

## Stages

1. 작은 헬퍼(`useStepperInput` hook 또는 인라인 패턴) 도입 — 로컬 문자열 state + 동기화 + onChange/onBlur 핸들러 캡슐화
2. fontSize / letterSpacing / lineHeight 세 stepper에 적용, 기존 clamp 호출 정리
3. 수동 테스트 — 전부 지우기, 재입력, 범위 밖 값 입력 후 blur 보정, 외부 변경 반영, IME 한글 입력 영향 없음 확인

## Constraints

- `Editor.jsx` 외 파일은 가급적 건드리지 않음 (필요 시 같은 파일 내 helper)
- `patch()` 호출 빈도가 기존보다 늘지 않아야 함 — 유효한 변화에서만 호출
- 기존 IME/렌더 핫패스 관련 동작에 회귀 없어야 함 ([[editor-paint-and-ime-tempo]] 참고)

## Direction

각 stepper에 대해 `const [draft, setDraft] = useState(String(fmt.X))`를 두고, `useEffect(() => { if (document.activeElement !== inputRef.current) setDraft(String(fmt.X)); }, [fmt.X])`로 외부 변경을 동기화한다. onChange는 `setDraft(e.target.value)` 후 `parseFloat`이 유한수이고 범위 내일 때만 `patch({ X: v })`. onBlur는 invalid/빈 값이면 `setDraft(String(fmt.X))`로 되돌린다. 세 stepper 패턴이 동일하므로 같은 파일 내 작은 hook으로 빼는 것을 우선 검토하되, 과하면 인라인으로 두 번 반복도 허용.
