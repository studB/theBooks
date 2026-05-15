- [x] applied

# front-assets 포팅 3단계 — 채팅 사이드바 + 레퍼런스 패널

chat.jsx와 reference-pane.jsx를 ESM으로 옮겨 에디터 옆 채팅 사이드바와 split view 레퍼런스 패널을 동작시켜 front-assets 포팅을 마무리한다.

## Purpose

플랜 1·2로 워크스페이스 탐색과 에디터 핵심 흐름이 동작한다. 이 단계에서 채팅 사이드바와 split 레퍼런스 패널을 붙여 프로토타입의 전체 사용자 경험을 앱에 옮겨 마무리한다. front-assets 포팅이 끝나면 후속 작업(LLM 연결, Tauri fs 등)이 본격적으로 시작된다.

## Scope

**In scope**
- `chat.jsx`(Chat / Icon) ESM 변환 → `src/components/Chat.jsx`
- `reference-pane.jsx`(ReferencePane / SplitDivider) ESM 변환 → `src/components/ReferencePane.jsx`
- App에서 Chat·ReferencePane placeholder를 실제 컴포넌트로 교체
- split view 좌우 패널 드래그 리사이즈·swap·close 동작
- plan 2에서 stub였던 SplitButton 클릭이 실제 ReferencePane을 띄우도록 연결

**Out of scope (later)**
- 채팅 LLM 백엔드 연결(현재는 UI만 동작)
- 레퍼런스 패널 추가 기능(다중 split, 동기 스크롤 등)
- Tauri 파일시스템 전환
- `front-assets/` 폴더 정리(삭제 또는 README 주석) → 별도 plan

## Stages

1. **Chat 포팅** — chat.jsx의 Chat + Icon을 ESM로 변환, App의 Chat placeholder 교체
2. **ReferencePane 포팅** — reference-pane.jsx의 ReferencePane + SplitDivider를 ESM로 변환, App의 ReferencePane placeholder 교체
3. **검증** — `bun tauri dev`로 채팅 사이드바 표시, split 열기/닫기/리사이즈/swap 동작 확인

## Constraints

- SplitDivider의 너비 제약(`Math.max(280, Math.min(window.innerWidth * 0.55, ...))`) 그대로 유지
- plan 1·2의 상태 모델(`openFileId`, `splitFileId`, `splitWidth`) 변경 금지
- `--split-width` CSS 변수로 너비 전달 (App 인라인 스타일 패턴 유지)
- `front-assets/` 원본 파일은 건드리지 않음

## Version

- Current: 0.4.0
- Bump: minor
- Target: 0.5.0

## Direction

- Chat은 우측 320px 고정 사이드바, ReferencePane은 좌측 가변 너비
- styles.css의 `.app.with-chat`, `.app.with-split` grid 컬럼 정의 그대로 활용 (plan 1에서 이미 포팅됨)
- SplitDivider는 mouse drag 이벤트로 `splitWidth` 갱신 — plan 2에서 흐르던 상태에 이제 시각 효과가 붙음
- ReferencePane의 onSwap은 App의 `openFileId`↔`splitFileId` 교환으로 구현 (front-assets 원본 그대로)
- 포팅 완료 후 `front-assets/`는 일단 보존 — 정리는 별도 plan에서 결정
