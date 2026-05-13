- [x] applied

# React + rsbuild + Tauri 기본 프레임 구축

Tauri 데스크톱 앱에 rsbuild 기반 React 프론트엔드를 연결해, dev/prod 빌드 모두에서 Windows·macOS에 React "Hello, theBooks" 윈도우가 뜨는 기본 프레임을 구축한다.

## Purpose

`src/`의 vanilla 템플릿 위에서는 본격적인 기능 작업이 어렵다. `front-assets/`의 React 프로토타입을 추후 옮겨오기 위한 토대로, rsbuild 기반 React 프론트엔드를 Tauri와 정식으로 연결해 두 OS에서 "헬로 월드"가 동작하는 깨끗한 프레임을 먼저 만든다.

## Scope

**In scope**
- rsbuild + React 프론트엔드 프로젝트 셋업 (`package.json`, `rsbuild.config`, React 엔트리, `App` 컴포넌트)
- `src-tauri/tauri.conf.json` build 섹션 정비 (`beforeDevCommand`, `beforeBuildCommand`, `devUrl`, `frontendDist`)
- rsbuild output 경로와 `frontendDist` 일치
- 기존 `src/` 하의 vanilla 템플릿(`index.html`, `main.js`, `styles.css`, `assets/`)을 React 엔트리로 대체
- Windows·macOS 양쪽에서 `tauri dev`·`tauri build` 동작 확인

**Out of scope (later)**
- FileList/Editor/Chat/ReferencePane 레이아웃 셸
- `src-tauri` 측 커스텀 커맨드 (ping 수준 포함)
- `front-assets/` 프로토타입 컴포넌트 포팅
- TypeScript 도입
- `design-system` 토큰·글로벌 CSS 정리
- CI / 코드사이닝 / 배포 파이프라인

## Stages

1. **rsbuild + React 셋업** — `package.json` 생성, rsbuild·React 의존성 설치, `rsbuild.config`(또는 동등 설정) 작성, `src/`에 React 엔트리와 `App` 컴포넌트("Hello, theBooks") 작성. `npm/pnpm/yarn` 중 하나 픽스.
2. **Tauri 통합** — `tauri.conf.json` build 섹션에 `beforeDevCommand`·`beforeBuildCommand`·`devUrl`(rsbuild dev 포트)·`frontendDist`(rsbuild output dir) 설정. 기존 `frontendDist: "../src"` 대체.
3. **양 OS 검증** — macOS와 Windows에서 각각 `tauri dev`로 창과 React 렌더링 확인, `tauri build`로 인스톨러 산출까지 한 번씩 통과.

## Constraints

- Windows + macOS 양쪽에서 `tauri dev` / `tauri build`가 모두 정상 동작해야 함 (한쪽만 통과는 불가)
- `front-assets/`, `design-system/` 자산은 이번 plan에서 건드리지 않음 — 후속 plan에서 재사용해야 하므로 보존

## Version

- Current: 0.1.0
- Bump: minor
- Target: 0.2.0

## Direction

- 빌드 도구로 rsbuild를 채택, React 18 + JSX 표준 구성. 진입점은 `src/main.jsx` → `<App/>`.
- rsbuild output을 `dist/`로 두고 `tauri.conf.json`의 `frontendDist`를 `"../dist"`로 맞춘다. `devUrl`은 rsbuild dev 기본 포트(예: `http://localhost:3000`)로.
- `beforeDevCommand`/`beforeBuildCommand`로 rsbuild dev/build를 자동 트리거 — `tauri dev` 한 번이면 둘 다 뜨도록.
- React 엔트리에는 라우팅·상태·스타일링 라이브러리를 도입하지 않는다. `ReactDOM.createRoot` + 단일 `App`만.
- 검증은 양쪽 OS에서 사람이 직접 한 번씩 — CI는 이 plan 밖.
