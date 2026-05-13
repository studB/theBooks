# Tauri + Vanilla

This template should help get you started developing with Tauri in vanilla HTML, CSS and Javascript.

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

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
