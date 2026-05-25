- [x] applied

# 편집기 사이드 패널 — AI 채팅 / 터미널 토글

오른쪽 채팅 패널 자리에 'AI 채팅 | 터미널' 탭 두 개를 두고 한 번에 하나만 표시. 터미널은 portable-pty + xterm.js로 워크스페이스 경로에서 진짜 셸을 띄운다.

## Version

- Current: 0.14.2
- Bump: minor
- Target: 0.15.0

## Purpose

VSCode Claude Code 플러그인처럼 편집기 옆에서 셸 명령을 바로 띄울 수 있게 하기 위함. 워크스페이스 디렉토리 컨텍스트로 git/build/script 실행을 별도 창 없이 처리하고, 기존 AI 채팅과 같은 자리에서 토글해 화면 면적을 새로 빼앗지 않는다.

## Scope

**In scope**
- Rust `src-tauri/src/terminal.rs` — `portable-pty` crate 의존성 추가, Tauri command `terminal_open(cwd, cols, rows) -> sessionId`, `terminal_write(sessionId, data)`, `terminal_resize(sessionId, cols, rows)`, `terminal_close(sessionId)`
- stdout/stderr는 `terminal://output/<sessionId>` 이벤트로 청크 스트리밍 (UTF-8 bytes → base64 또는 String, lossy 허용)
- 셸은 `std::env::var("SHELL").unwrap_or("/bin/zsh".into())`로 결정, args 없음, env는 부모 프로세스 상속
- 프론트 `src/components/Terminal.jsx` — `xterm` + `@xterm/addon-fit` 사용, `onData` → `terminal_write`, ResizeObserver/window resize → fit + `terminal_resize`, 이벤트 listener → `term.write`
- `AppShell.jsx`에 `sidePanelMode` 상태 (`'chat'` | `'terminal'`)와 `terminalSessionId` 상태 추가. 채팅 자리(오른쪽 320px)에 `SidePanel.jsx`를 두고 그 안에서 상단 탭 두 개 + 선택된 컴포넌트 렌더
- `chat-toggle`은 그대로 둘 다 접음 (collapsed 상태는 모드와 독립)
- 터미널 탭은 로컬 워크스페이스(workspaceKind === 'local')에서만 활성. S3 또는 미선택이면 disabled + 툴팁
- `onExit`(파일 목록으로 나갈 때) → `terminal_close` 호출 후 `setTerminalSessionId(null)`. collapse·탭 전환에서는 세션 유지
- CSS: `.side-panel-tabs`, `.side-panel-tab`, `.terminal-wrap` (xterm 컨테이너) 신규 추가

**Out of scope (later)**
- 다중 탭/분할 터미널, 세션 이름 변경
- 출력 검색, 링크 클릭, 셸 통합(정확한 종료 코드)
- S3 워크스페이스에서의 터미널 (cwd 매핑 모호)
- 폰트/컬러 테마 커스터마이즈 UI, 설정 다이얼로그
- 윈도우 지원(ConPTY 검증) — 현재 앱은 macOS 위주로 검증, Win은 portable-pty가 추상화는 해주지만 별도 검증 plan
- 첫 줄 프롬프트 자동 노출용 OSC 7 / 셸 통합 스크립트
- 명령 히스토리 직렬화, 출력 영구 저장
- 단축키(예: ⌘`) — 우선 탭 클릭으로만

## Stages

1. **Rust PTY 브릿지** — Cargo.toml에 `portable-pty` 추가. `terminal.rs` 작성: 세션을 `Mutex<HashMap<String, SessionHandle>>`로 관리, SessionHandle은 `MasterPty + Child + writer + reader thread`. reader thread는 `app_handle.emit("terminal://output/<id>", chunk)`. `lib.rs`에 commands 등록
2. **프론트 Terminal 컴포넌트** — `bun add xterm @xterm/addon-fit`. `Terminal.jsx`에서 mount 시 `terminal_open` 호출 → sessionId 받음 → xterm 초기화 → listen('terminal://output/...') → write. unmount 시 listener만 정리 (close는 AppShell에서)
3. **SidePanel & AppShell 통합** — `SidePanel.jsx`에 탭 UI와 `mode`/`onChangeMode` props, 내부에서 Chat 또는 Terminal 렌더. `AppShell.jsx`는 `<Chat>` 직접 렌더 자리에 `<SidePanel mode={...} sessionId={...} onCreateSession={...} onCloseSession={...} .../>` 배치. `onExit`/워크스페이스 변경 시 close
4. **스타일 + 검증** — 탭/터미널 CSS. `bun tauri dev`로 ① 채팅↔터미널 토글 ② collapse 토글 ③ 파일 닫고 다시 열기 — 세션 종료/재생성 확인 ④ vim/top/ls --color 정상 ⑤ S3 워크스페이스에서 터미널 탭 disabled 확인

## Constraints

- 기존 `Chat` 컴포넌트의 props (`file refFile collapsed onToggle`)와 동작은 그대로. SidePanel은 wrapper만 추가
- 채팅 접기/펴기 키와 상태(`CHAT_COLLAPSED_KEY`) 호환 — 모드와 무관하게 collapse는 패널 전체에 적용
- xterm 컨테이너 크기 = 패널 width − 탭/패딩. `<aside>`의 320px 그리드 셀 안에서 fit addon이 cols/rows 계산
- portable-pty는 rustls 같은 추가 TLS 없이 순수 OS API라 빌드 부담 적음. 단 macOS 권한(Developer Tools, Hardened Runtime의 fork+exec) 확인 필요
- 이벤트 페이로드 크기: 한 청크는 4KB 정도로 잘라 emit (대량 출력 시 채널 폭주 방지)
- `front-assets/`는 건드리지 않음

## Direction

- 세션 관리는 Rust 측 전역 `Lazy<Mutex<HashMap<String, SessionHandle>>>`. sessionId는 `uuid::Uuid::new_v4()` 또는 단순 카운터 문자열 (간단히 카운터로 충분)
- reader thread는 `master.try_clone_reader()`로 별도 스레드에서 blocking read, 종료 신호는 `Child::try_wait` Some이면 final 이벤트(`terminal://exit/<id>`) emit 후 종료
- 프론트 컴포넌트는 mount-once 패턴: AppShell이 sessionId를 들고 있고 Terminal은 sessionId prop으로 받음. sessionId가 null이면 mount 시 `terminal_open` 호출해 부모에 setState. 같은 sessionId면 xterm 인스턴스 재사용 — Terminal 컴포넌트는 `key={sessionId}`로 mount 경계 명확화
- 탭 UI는 채팅 헤더 위에 얇은 막대(높이 28px) — `chat-head`보다 위. 모드 전환 시 Chat/Terminal 둘 다 DOM에서 unmount되지 않게 `display:none` 토글로 처리 (둘 다 비싼 mount 비용 있음). 그러면 xterm fit addon이 hidden 상태에서도 살아있어 다시 보일 때 onResize 한 번만 호출하면 됨
- `onExit` 흐름: AppShell에서 splitFileId/openFileId를 null로 세팅하기 직전에 `if (terminalSessionId) { invoke('terminal_close', { sessionId: terminalSessionId }); setTerminalSessionId(null); }` 호출. 워크스페이스 전환에서도 동일
