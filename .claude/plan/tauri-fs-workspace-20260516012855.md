- [x] applied

# Tauri 파일시스템 워크스페이스 — localStorage 제거

localStorage 대신 OS 폴더를 워크스페이스로 사용한다. 파일은 frontmatter 마크다운(.md)으로 디스크에 저장, 폴더는 OS 다이얼로그로 선택, 삭제는 휴지통으로 이동.

## Version

- Current: 0.6.0
- Bump: minor
- Target: 0.7.0

## Purpose

지금까지 데이터는 브라우저 localStorage에만 존재해 사용자가 디스크에서 자기 글에 접근할 수 없고, 다른 기기로 옮기지도 못한다. 진짜 데스크탑 앱으로 만들려면 사용자가 지정한 OS 폴더 자체가 워크스페이스가 되어야 한다. 이 plan에서 데이터 레이어를 디스크로 옮기고 localStorage를 완전히 제거한다.

## Scope

**In scope**
- Rust 사이드(`src-tauri/src/fs.rs` 신설)에 파일시스템 commands: `pick_workspace_dir`, `list_workspace`, `read_file`, `write_file`, `create_file`, `create_folder`, `rename_item`, `delete_item`(휴지통), `get_workspace`, `set_workspace`
- 디스크 포맷: `.md` 파일에 YAML frontmatter(`title`, `margins`, `createdAt`)와 본문 텍스트
- item 모델: `id`는 워크스페이스 루트 기준 상대 경로(POSIX 슬래시), `parent`는 부모 디렉토리 상대 경로 또는 `null`
- 워크스페이스 경로는 기존 `config.json`(chat의 키 저장 파일)에 `workspace` 필드로 함께 보관
- 첫 실행 시 `localStorage.thebooks.v4.items`가 존재하면 워크스페이스 루트로 한 번 내보낸 후 localStorage 키 제거(idempotent flag)
- `@tauri-apps/plugin-dialog` 추가 (Rust + JS), 워크스페이스 폴더 선택은 OS 다이얼로그로
- 휴지통 처리: `trash` crate 추가
- 기존 `FolderPickerDialog.jsx`(인앱 폴더 모달) 제거하고 호출 지점 정리
- `AppShell.jsx`의 `loadItems/saveItems/seedItems`/items 변경 함수들이 Tauri commands를 호출하도록 재작성

**Out of scope (later)**
- 파일 watcher(외부 변경 감지·자동 재로드)
- 동시 편집·잠금·충돌 해소
- 마크다운 외 포맷(.txt 호환, 이미지, 첨부)
- 멀티 워크스페이스(복수 폴더)
- 전역 파일 검색
- 휴지통 복원 UI
- 빈 파일명·중복 처리 UX 고도화(최소 처리만)

## Stages

1. **Rust FS 모듈** — `Cargo.toml`에 `trash`, `tauri-plugin-dialog`, frontmatter용 `serde_yaml` 추가. `fs.rs`에 commands + frontmatter 직렬화 헬퍼 작성. `lib.rs`에 등록
2. **`config.json` 확장** — chat 모듈의 `AppConfig`에 `workspace: Option<PathBuf>` 필드 추가, `get_workspace`/`set_workspace` command 노출. chat 키 기능 깨지 않음
3. **AppShell 데이터 레이어 전환** — `loadItems/saveItems` 제거, `list_workspace` 호출로 items 구성. CRUD가 commands를 호출하도록 재작성. 파일 본문은 열 때 `read_file`, 저장 시 `write_file`
4. **마이그레이션** — 워크스페이스 첫 설정 시 `localStorage.thebooks.v4.items`를 읽어 `migrate_from_local` command로 디스크에 내보내고 localStorage 키 제거. flag로 1회만 실행
5. **OS 다이얼로그 + 인앱 모달 제거** — `FolderPickerDialog.jsx` 삭제, 워크스페이스 선택 버튼은 plugin-dialog의 `open({ directory: true })`로 직접 호출. AppShell에서 dialog 관련 state 정리
6. **검증** — `bun tauri dev`로 ① OS 다이얼로그로 빈 폴더 선택 → 빈 워크스페이스 ② 파일/폴더 생성·이름변경·열기·저장·삭제(휴지통 확인) ③ 마이그레이션: localStorage에 기존 데이터 있는 상태에서 새 워크스페이스 지정 시 디스크에 내보내짐 ④ 앱 재시작 시 workspace 경로 기억

## Constraints

- 기존 chat 기능(`chat_complete`, `get_api_key`, `set_api_key`)과 `config.json` 포맷 호환성 유지 — chat 코드는 건드리지 않거나 최소 수정
- frontmatter는 표준 `---` 구분자 사용해 외부 에디터·git에서도 자연스럽게 보이도록
- 파일명에 OS 금지 문자 들어가지 않도록 한 번만 sanitize(공백 허용, `<>:"/\|?*` 제거/치환)
- 윈도우 경로 처리 — 내부 id는 POSIX 슬래시로 통일, OS 호출 시점에 변환
- 휴지통이 OS에서 막혀 있으면(권한 등) 사용자에게 명시적 에러 표시 후 작업 중단(영구 삭제 fallback 없음)
- `front-assets/`는 건드리지 않음

## Direction

- frontmatter 스키마는 최소: `title: string`, `margins: { left, right, top, bottom }`, `createdAt: number`. 미존재 시 합리적 기본값
- 폴더는 디렉토리, 파일은 `<name>.md`로 1:1 매핑. id는 디렉토리는 디렉토리 경로, 파일은 `.md` 포함 상대 경로
- `list_workspace`는 디렉토리 트리를 한 번에 평면화한 `Vec<Item>` 반환 — 프론트는 현재 모델 그대로 `items` 배열로 사용
- 이름 변경은 `rename_item(old_rel_path, new_name)` — 디렉토리 통째 이동은 이번 범위 밖, 같은 부모 안에서의 rename만 지원
- 마이그레이션은 Rust에서 받은 JSON(localStorage 그대로)을 워크스페이스 루트에 풀어 쓰는 단방향 단순 함수
- 휴지통은 `trash` crate(`trash::delete`) — 단일 의존성으로 macOS/Windows/Linux 처리
