- [x] applied

# 워크스페이스 git 변경 감지 패널

워크스페이스 루트에 `.git`이 있으면 폴더 화면 하단에 추가/수정/삭제 파일 목록을, 편집 화면 상단에 수정 요약 토글을 표시한다. VSCode git 패널의 축소판.

## Purpose

작업 중인 폴더가 git 저장소일 때 변경 상태를 앱 안에서 바로 확인할 수 있어야 한다. 사용자는 폴더 화면에서 한눈에 변경된 파일 목록을, 편집 중에는 지금 보는 파일이 변경 상태인지와 전체 변경 요약을 확인하길 원한다.

## Scope

**In scope**
- Rust 사이드 Tauri 커맨드 — `.git` 존재 여부 확인, `git status --porcelain=v1`, `git diff --numstat` 호출 + 파싱
- 폴더 화면 하단 패널 — 수정/추가/삭제로 그룹 분류된 파일 목록 (스크롤 가능)
- 편집 화면 상단 토글 — 현재 파일이 변경 상태일 때 표시, 펼치면 전체 워크스페이스 파일별 임벨 요약 + `+N/-M` 라인 수
- 갱신 트리거 — 파일 저장 직후, 앱 윈도우 포커스 진입, 수동 새로고침 버튼
- `.git`이 없거나 git 호출 실패 시 패널/토글 모두 숨김 (조용한 폴백)

**Out of scope (later)**
- stage/unstage/commit/push UI
- 라인 단위 diff 뷰어
- 파일 시스템 이벤트 기반 자동 감지(notify crate)
- submodule, untracked 디렉토리 재귀 전개

## Stages

1. Rust 커맨드 — `git_status_summary(workspace_path)` 한 개로 묶어 `{ branch, files: [{path, status, added, removed}] }` 반환
2. 폴더 화면 하단 패널 — 워크스페이스 선택/탐색 화면 하단 fixed/sticky 영역, 빈 상태 처리
3. 편집 화면 상단 토글 + 펼치기 — 현재 파일의 상태 표시 + 펼치면 전체 요약 리스트
4. 갱신 트리거 통합 — 저장 hook, `window.focus` 이벤트, 패널의 새로고침 버튼 모두 같은 커맨드 호출
5. 수동 확인 — git repo / 비 git 폴더 양쪽, 파일 추가/수정/삭제/이름변경, 외부에서 변경 후 새로고침

## Constraints

- git CLI에 의존 — 사용자 PATH에 `git`이 있어야 함. 없을 경우 1회 안내 후 패널 숨김
- 폴링/watcher 없음 — 갱신은 명시적 트리거에서만 (CPU/배터리 비용 최소화)
- Version bump은 [[chat-toggle-ruler-and-split-scroll]] 과 합쳐 한 번에 minor (0.10.2 → 0.11.0). 이 plan 적용 시점에 함께 진행.
- 기존 워크스페이스 UI ([[s3-workspace]], [[tauri-fs-workspace]]) 회귀 없을 것

## Direction

Rust: `src-tauri/src/git.rs`(또는 `fs.rs` 확장)에 한 개의 커맨드 추가. `tokio::process::Command`로 `git -C <root> status --porcelain=v1 -z`와 `git -C <root> diff --numstat`를 병렬 실행, 결과를 path별로 머지. status 코드는 M/A/D/R/?? 만 기본 케이스로 처리. 비 git 폴더면 `Err(NotARepo)` 반환.

프론트: 단일 `useGitStatus(workspaceId)` hook이 커맨드 호출 + 캐싱 + 트리거 매니저. 폴더 화면 패널과 편집 화면 토글이 같은 hook 결과를 구독. 토글의 펼친 영역은 임벨만 — 파일명/상태 칩/`+N/-M`. 폴드/펼침 상태는 localStorage 영속.

UI 위치: 폴더 화면 하단은 기존 sidebar/footer 자리에 별도 영역. 편집 화면 토글은 topbar 우측 또는 brebreadcrumb 라인 아래. 자세한 픽셀은 구현 단계에서 결정.
