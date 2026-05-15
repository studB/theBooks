- [x] applied

# AI 작가 비서 — Claude API 연결

window.claude stub을 Tauri Rust 사이드의 Anthropic Messages API 호출로 대체해 채팅이 실제 응답하도록 만들고, API 키는 app config의 JSON에 저장한다.

## Version

- Current: 0.5.0
- Bump: minor
- Target: 0.6.0

## Purpose

현재 Chat 컴포넌트는 `window.claude.complete`를 호출하지만 Tauri 앱에는 그런 글로벌이 존재하지 않아 항상 catch 분기로 떨어진다. 이 plan에서 채팅을 실제로 동작시켜 사용자에게 가장 큰 첫 번째 기능적 가치(글쓰기 비서)를 제공한다.

## Scope

**In scope**
- Rust(`src-tauri/src/`)에 `chat_complete` Tauri command — Anthropic Messages API (`POST /v1/messages`) 호출, non-streaming, JSON `{ messages: [{role, content}] }` 입력 → 응답 텍스트 반환
- Rust에 `get_api_key` / `set_api_key` Tauri command — `tauri::api::path::app_config_dir` 아래 `config.json`에 평문 JSON으로 저장·로드
- 프론트 `Chat.jsx`에서 `window.claude.complete` 호출을 `invoke('chat_complete', ...)`로 교체
- 키 미설정 또는 401 응답 시 채팅 패널 상단에 인라인 배너 표시 — `<input type="password">` + 저장 버튼, 저장 후 즉시 사용 가능
- 모델 `claude-sonnet-4-6`과 시스템 프롬프트("한국어 글쓰기 조수…")를 Rust에 하드코딩
- reqwest 의존성 추가 (또는 이미 가능한 HTTP 클라이언트 사용)

**Out of scope (later)**
- SSE 스트리밍 응답
- 모델 선택·온도·max_tokens 등 사용자 설정 UI
- 채팅 대화 로컬 저장/복원
- OS keychain·암호화 저장 (이번엔 평문 JSON, 이후 plan으로 keychain 이전)
- 시스템 프롬프트 사용자 편집
- 별도 설정 화면(메뉴/다이얼로그)
- 첨부 파일·이미지·tool use

## Stages

1. **Rust API 브릿지** — Cargo.toml에 reqwest+serde_json 추가, `commands::chat::{chat_complete, get_api_key, set_api_key}` 작성, `tauri::Builder`에 등록. 키 없거나 401이면 명시적 에러 타입 반환
2. **프론트 통합** — `Chat.jsx`에서 `invoke('chat_complete', { messages })`로 호출, 에러 타입에 따라 인라인 배너(키 입력) 또는 기존 "응답을 받아오지 못했습니다" 메시지 분기
3. **검증** — `bun tauri dev`로 ① 키 없이 채팅 → 배너 표시 ② 키 저장 후 메시지 보내고 응답 수신 확인 ③ config.json 위치 확인 ④ 잘못된 키 → 배너 재표시

## Constraints

- Chat 컴포넌트 외부 인터페이스(props) 그대로 유지 — AppShell의 `<Chat file refFile/>` 호출 깨지 않음
- 모델 ID는 `claude-sonnet-4-6` (현재 최신 Sonnet, system reminder 환경 정보 기준)
- 키 파일은 평문 JSON이지만 경로는 OS별 app config 디렉토리(외부에 노출되지 않는 위치)
- reqwest는 rustls 백엔드 사용 권장 (OS별 빌드 부담 최소화)
- `front-assets/`는 건드리지 않음

## Direction

- Tauri 2.x command 패턴: `#[tauri::command] async fn chat_complete(...) -> Result<String, ChatError>`. `ChatError`는 `serde`로 직렬화 가능한 enum (`NoApiKey`, `Unauthorized`, `Network(String)`, `Api(String)`)
- 프론트는 `try { invoke(...) } catch (e) { switch (e.kind) ... }`로 분기 — 배너 표시는 `NoApiKey`/`Unauthorized` 시
- 시스템 프롬프트는 `const SYSTEM_PROMPT: &str = "…"`로 Rust에 두어 추후 prompt 튜닝을 한 곳에서 관리
- `config.json` 스키마는 `{ "anthropic_api_key": "sk-..." }` — 추후 추가 필드(모델, prompt override 등) 확장 가능한 형태
- 인라인 배너는 기존 chat 스타일(인라인 박스, primary 버튼) 재활용 — 새 스타일 정의 최소화
