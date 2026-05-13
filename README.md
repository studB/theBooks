# theBooks

Tauri 2 + React + rsbuild 기반 데스크톱 글쓰기 앱.

Version: 0.2.0

## Overview

`thebooks`는 Rust로 만든 Tauri 데스크톱 셸 위에 React 프론트엔드를 얹은 macOS·Windows용 앱입니다. 현재는 React + rsbuild + Tauri 기본 프레임만 갖춰진 상태(Hello, theBooks 윈도우)이며, 실제 글쓰기 UI는 `front-assets/`의 React 프로토타입에서 후속 plan을 통해 옮겨올 예정입니다.

## Tech stack

- **Shell**: Tauri 2 (Rust 2021)
- **Frontend**: React 18 + rsbuild
- **Package manager**: bun

## Project layout

- `src/` — React 엔트리(`main.jsx`, `App.jsx`)와 HTML 템플릿
- `src-tauri/` — Rust 측 Tauri 셸 (`tauri.conf.json`, `Cargo.toml`, `src/`)
- `front-assets/` — 후속 plan에서 옮겨올 React 프로토타입 자산 (현재 빌드에 포함되지 않음)
- `.claude/plan/` — 개발 plan 파일 (`/make-dev-plan` → `/implement-plan` 흐름)
- `CHANGELOG.md` — 버전별 변경 요약

## Development

```bash
bun install
bun tauri dev
```

`bun tauri dev`는 `tauri.conf.json`의 `beforeDevCommand`로 `bun run dev`를 띄워 rsbuild 데브 서버(http://localhost:3000)를 자동 시작하고, Rust 셸을 컴파일한 뒤 창을 엽니다.

## Build

```bash
bun tauri build
```

rsbuild 빌드 결과(`dist/`)를 Tauri가 `frontendDist`로 번들합니다. macOS·Windows에서 각각 인스톨러가 산출됩니다.

## Development workflow

이 프로젝트는 Claude Code의 네 가지 프로젝트 스킬로 관리됩니다. 모든 기능 변경은 plan → 구현 → changelog → docs 순으로 흐릅니다.

| Skill | 역할 |
|-------|------|
| [/make-dev-plan](.claude/skills/make-dev-plan/SKILL.md) | 사용자와의 대화로 개발 목적·범위·단계·제약·접근법과 semver bump를 결정해 `.claude/plan/`에 plan 파일 작성 |
| [/implement-plan](.claude/skills/implement-plan/SKILL.md) | plan을 단계별로 구현하고 `tauri.conf.json` + `Cargo.toml` 버전을 동기화한 뒤 plan을 `- [x] applied`로 표시 |
| [/changelog](.claude/skills/changelog/SKILL.md) | 적용된 버전을 `CHANGELOG.md` 테이블에 append-only로 한 행씩 기록 (Version / Date / Type / Summary) |
| [/write-docs](.claude/skills/write-docs/SKILL.md) | 현재 프로젝트 상태(버전·구조·스택)에 맞게 이 `README.md`를 갱신 |

### Bump 규칙

- `major` — 사용자의 명시적 요청이 있을 때만
- `minor` — 사용자에게 보이는 기능의 추가·변경·삭제
- `patch` — 동작이 바뀌지 않는 코드 변경 (최적화, 리팩토링, 내부 설정 등)

## Changelog

전체 버전 이력은 [CHANGELOG.md](CHANGELOG.md)에 있습니다.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
