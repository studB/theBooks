- [x] applied

# front-assets 포팅 2단계 — 에디터

editor.jsx와 보조 컴포넌트(PageStack, CornerCrops, SplitButton)를 ESM으로 옮겨, 파일을 열고 편집·자동 저장하며 페이지 레이아웃이 보이도록 한다.

## Purpose

플랜 1에서 워크스페이스 탐색까지 동작하지만 파일을 클릭해도 placeholder만 보인다. 이 단계에서 에디터를 실제로 연결해 사용자가 파일을 열고 글을 쓰고 자동 저장이 되는 핵심 라이팅 흐름을 완성한다.

## Scope

**In scope**
- `editor.jsx`(Editor / PageStack / CornerCrops / SplitButton 4개 컴포넌트) ESM 변환 → `src/components/Editor.jsx` (필요 시 `src/components/editor/`로 분리)
- App의 Editor placeholder를 실제 `<Editor/>`로 교체
- 파일 열기 → 편집 → 자동 저장 → "나가기" 전체 흐름 동작
- breadcrumb 표시, 마진(`margins`) 객체 그대로 유지
- SplitButton 자체는 포팅하되, `splitFileId` 상태만 흐르고 화면 렌더는 plan 3에서

**Out of scope (later)**
- 실제 split view 렌더 → plan 3 (target 0.5.0)
- Chat 사이드바 → plan 3
- 에디터 기능 확장(검색·치환, 단어 수, 글꼴 변경 등)
- Tauri 파일시스템 전환

## Stages

1. **Editor ESM 변환** — editor.jsx 내 hook alias(`useStateE`, `useRefE` 등) 제거 → 표준 `import { useState, useRef, useEffect } from 'react'`. 4개 컴포넌트 분리·재배치
2. **App 통합** — App에서 Editor placeholder를 실제 컴포넌트로 교체, Chat/ReferencePane은 placeholder 유지. SplitButton의 onOpenSplit/onCloseSplit는 App의 `setSplitFileId`로 연결만
3. **검증** — `bun tauri dev`로 파일 열기, 글 입력, 자동 저장(localStorage 반영), 마진 조정, 나가기 동작 확인

## Constraints

- plan 1의 localStorage 키(`thebooks.v4.*`)와 시드 데이터 그대로 사용
- 데이터 모델(`items`, `margins` 등) 변경 금지 — plan 3과의 호환을 위함
- `front-assets/` 원본 파일은 건드리지 않음
- SplitButton 클릭 시 깨지지 않고 조용히 상태만 변경되어야 함

## Version

- Current: 0.3.0
- Bump: minor
- Target: 0.4.0

## Direction

- editor.jsx의 hook alias는 표준 import로 정리. 같은 패턴을 plan 1·3에도 일관 적용
- PageStack/CornerCrops/SplitButton은 단일 파일 또는 `src/components/editor/` 하위 분리 — 가독성 기준으로 선택
- App의 분기(`openFile ? <Editor/Chat/ReferencePane> : <FileList>`)는 plan 1 구조 유지, 자식 컴포넌트만 실제로 교체
- SplitButton은 진짜 split을 띄우지 않고 `splitFileId` 상태만 변경 — plan 3에서 ReferencePane이 들어오면 자동으로 화면에 반영
- 검증은 사람이 직접 — 자동 테스트는 plan 밖
