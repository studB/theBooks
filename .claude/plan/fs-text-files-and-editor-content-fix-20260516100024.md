- [x] applied

# 워크스페이스 파일 호환성 + 에디터 본문 표시 버그 수정

`.md` 외 텍스트 파일도 워크스페이스에서 보고 편집할 수 있게 하고, 바이너리는 경고로 처리한다. 파일 열 때 에디터에 본문이 빈 채로 고정되던 비동기 로드 타이밍 버그도 함께 잡는다.

## Version

- Current: 0.7.0
- Bump: patch
- Target: 0.7.1

## Purpose

v0.7.0에서 워크스페이스를 디스크로 옮긴 뒤 두 가지 사용성 문제가 드러났다. (1) `.md` 외 파일은 목록에 아예 노출되지 않아 사용자가 같은 폴더의 일반 텍스트 파일을 인지·열람할 수 없다. (2) `.md` 파일을 열어도 에디터에 본문이 표시되지 않은 채 빈 화면으로 고정되는 경우가 있다. 두 증상 모두 v0.7.0의 결함이므로 patch로 빠르게 잡는다.

## Scope

**In scope**
- `fs.rs::collect_items`에서 `.md` 전용 필터 제거 — 모든 비숨김 파일을 `Item::File`로 노출
- `read_file`에서 UTF-8 디코딩을 시도하고, 실패 시 새로운 `FsError::Binary` 변형 반환
- 프론트에서 `Binary` 에러를 일반 에러와 구분해 "이 파일은 앱에서 열 수 없습니다" 류의 경고 메시지로 표시
- `write_file` 분기: 파일이 `.md`로 끝날 때만 frontmatter 직렬화, 그 외는 평문으로 저장 (title/createdAt은 무시)
- `read_file` 분기: `.md`만 frontmatter 파싱, 그 외는 raw를 그대로 content로 반환 (margins/title은 기본값/파일명)
- `rename_item` 확장자 보존 — 원본 파일의 확장자를 그대로 두고 stem만 교체 (현재는 `.md` 강제)
- `AppShell.openFileById`/`openSplitById`: `ensureContent`를 먼저 await 한 다음 `setOpenFileId`/`setSplitFileId` — Editor가 content가 들어간 file prop으로 마운트되도록
- `refresh()`의 `contentById` 캐시 코드는 그대로 두되, 동작 검증

**Out of scope (later)**
- 이미지/PDF/바이너리 뷰어
- 새 파일 생성 시 확장자 선택 UI (기본 `.md` 유지)
- 확장자별 신택스 하이라이팅
- 매우 큰 파일에 대한 스트리밍/페이지네이션
- `.md` 외 파일에 frontmatter를 추가하는 기능
- 외부 변경 감지(watcher)

## Stages

1. **Rust fs.rs 호환성 처리** — `collect_items`의 `.md` 필터 제거. `FsError::Binary` 변형 추가. `read_file`은 `fs::read`로 바이트를 읽은 뒤 `String::from_utf8` 시도, 실패 시 `Binary` 반환. 확장자가 `.md`일 때만 `parse_frontmatter`/frontmatter 기반 메타데이터 사용, 아니면 raw 그대로. `write_file`은 `.md` 확장자일 때만 `write_md`, 그 외는 `fs::write`로 평문 저장. `rename_item`은 `Path::extension`으로 원본 확장자 추출해 보존.
2. **AppShell 본문 선로드** — `openFileById`/`openSplitById`에서 `await ensureContent(id)`를 먼저 호출하고, 성공 후에만 `setOpenFileId`/`setSplitFileId`. `ensureContent`가 던진 에러는 caller에서 처리. `Binary` 변형은 메시지를 따로 분기해 토스트.
3. **검증** — `bun tauri dev`로 워크스페이스에 ① 기존 `.md` 파일 열기·편집·저장 ② 새 `.txt` 파일 직접 만들어 두고 목록 노출/열기/편집/저장 ③ 작은 이미지(.png) 두고 목록 노출 + 클릭 시 경고 메시지 ④ `.md`와 `.txt` rename 시 확장자 보존 ⑤ 마이그레이션·기존 흐름 회귀 없는지 확인.

## Constraints

- frontmatter는 `.md`에만 적용. 다른 확장자에 `---`로 시작하는 평문이 들어와도 frontmatter로 해석하지 않는다.
- 신규 파일 생성(`create_file`)의 기본 확장자는 계속 `.md`. 사용자가 `.txt` 파일을 만들고 싶으면 외부에서 두거나 rename으로 처리.
- 이진/텍스트 판정은 확장자 화이트리스트가 아니라 UTF-8 디코딩 결과로 한다 — 확장자만으로 거짓 양/음성을 만들지 않기 위해.
- `chat.rs` 및 `config.json` 포맷은 건드리지 않는다.
- 윈도우 경로/POSIX 슬래시 id 규칙 유지.
- 휴지통(`delete_item`) 동작은 그대로.

## Direction

- `FsError`에 `Binary` 변형을 추가하고 `kind: "Binary"` 태그로 직렬화한다. 프론트는 `e.kind === 'Binary'`로 분기.
- `read_file`은 `fs::read(&full)?` → `String::from_utf8(bytes)`. 성공 시 `.md`만 frontmatter, 아니면 raw를 그대로 content로. 실패 시 `Err(FsError::Binary)`. 메타데이터(mtime/ctime)는 동일하게 제공.
- `write_file`은 확장자 검사로 분기: `.md`면 기존 `write_md` 경로, 아니면 `fs::write(&full, &args.content)` + 부모 디렉토리 생성. 평문 경로에서는 `args.title`/`args.created_at`을 무시한다.
- `rename_item`은 원본의 `Path::extension`을 보존하고, 사용자가 입력한 `new_name`은 stem으로 취급(이미 확장자를 포함했으면 stem만 잘라 쓴다). frontmatter 제목 갱신 로직은 `.md`에 한해 동작.
- `AppShell.openFileById`는 `await ensureContent(id)` → `setOpenFileId(id)` 순서로 바꾸고, `ensureContent`가 throw하면 토스트만 띄우고 화면 전환은 하지 않는다. 이렇게 하면 Editor는 항상 content가 채워진 file prop으로 마운트되므로 `useState(file.content || '')` 초기화 이슈가 사라진다.
- 동일한 변경을 `openSplitById`에도 적용.
