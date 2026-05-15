- [x] applied

# front-assets 포팅 1단계 — 디자인 토큰 + 워크스페이스 브라우징

front-assets의 디자인 토큰을 정의하고 ESM 환경으로 변환한 뒤, App + FileList + FolderPickerDialog만 동작시켜 워크스페이스 선택과 폴더 탐색까지 화면에 띄운다.

## Purpose

`front-assets/`의 React 프로토타입을 실제 앱으로 옮기는 첫 슬라이스. 이 단계에서 디자인 토큰 체계와 ESM 변환 패턴을 정립해 후속 plan(에디터, 사이드 패널)이 의존할 토대를 만든다. 사용자 체감은 "워크스페이스를 고르고 폴더·파일 목록을 클릭으로 탐색할 수 있다"까지 (파일 열기는 아직 placeholder).

## Scope

**In scope**
- `src/design-system/colors_and_type.css` 신규 작성 (styles.css가 쓰는 `--gray-*`, `--fg-*`, `--text-*`, `--primary-*` 등 토큰 정의)
- `front-assets/styles.css` → `src/styles.css`로 이동, 상단에서 토큰 파일 `@import`
- `app.jsx`, `filelist.jsx`, `folder-picker-dialog.jsx` 3개를 ESM `.jsx`로 변환해 `src/components/`로 이동
- `src/main.jsx`·`src/App.jsx` 새 컴포넌트로 교체
- 기존 localStorage 키(`thebooks.v4.items`, `thebooks.v4.workspace`)·시드 데이터 유지
- Editor/Chat/ReferencePane 자리는 placeholder stub("에디터는 다음 단계에 추가" 정도)

**Out of scope (later)**
- `editor.jsx` 포팅 → plan 2 (target 0.4.0)
- `chat.jsx`, `reference-pane.jsx` 포팅 → plan 3 (target 0.5.0)
- Tauri 파일시스템 전환
- 시드 데이터 변경, 코드사이닝/배포

## Stages

1. **토큰 파일 작성** — `styles.css`가 참조하는 CSS 변수 전수 스캔 → 합리적 기본값으로 `colors_and_type.css` 생성
2. **ESM 변환** — `app/filelist/folder-picker-dialog`를 표준 `import { useState }` 패턴으로 변환, 컴포넌트 간 의존성은 import로 명시. Editor/Chat은 stub div
3. **통합 + 검증** — `src/styles.css`·`main.jsx`·`App.jsx` 갱신, `bun tauri dev`로 워크스페이스 선택·폴더 탐색 동작 확인

## Constraints

- localStorage 키(`thebooks.v4.*`)는 후속 plan과의 호환을 위해 변경 금지
- `front-assets/` 원본 파일은 건드리지 않음 (참고용 보존)
- 파일 아이템 클릭 시 깨지지 않고 placeholder가 보여야 함

## Version

- Current: 0.2.0
- Bump: minor
- Target: 0.3.0

## Direction

- `src/components/`에 ESM 모듈 배치(default export, React 18 hooks)
- 프로토타입의 `const { useState: useStateA } = React;` alias 제거 → 표준 `import { useState } from 'react'`
- 디자인 토큰은 `:root` 스코프로 정의, `src/styles.css` 상단에서 `@import`
- Editor/Chat 자리는 단순 `<div>` placeholder — App의 상태 흐름(openFileId 등)은 보존
- 시드 데이터(`seedItems`)는 그대로 옮겨 첫 실행 시 샘플 워크스페이스가 보이도록
- 포팅 사이클 전체: plan 1(0.3.0) → plan 2 에디터(0.4.0) → plan 3 사이드 패널(0.5.0), 각 plan minor +1
