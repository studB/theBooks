- [x] applied

# HWP 임포트 + 문서 전역 서식 컨트롤

rhwp를 참고/통합해 HWP·HWPX 파일을 텍스트로 가져오고, 글꼴·글자크기·자간·행간을 문서 단위로 지정·저장하는 기능을 추가한다.

## Version

- Current: 0.9.2
- Bump: minor
- Target: 0.10.0

## Purpose

지금 워크스페이스는 평문 텍스트만 다루고, HWP 사용자의 기존 원고를 끌어들일 수단이 없다. 그리고 글꼴·자간·행간 같은 가독성 옵션이 전혀 없어서 작가 입장에서 "쓰기 환경"으로서는 부족하다. 이 plan은 두 결핍을 같이 메운다: rhwp로 HWP/HWPX를 한 번에 텍스트로 임포트하고, 문서마다 4가지 서식 값을 지정해 저장한다. 단, 직전 plan들에서 다듬은 에디터 핫패스(ref 기반 innerText, IME 보호, CSS-only 갱신)를 깨지 않는 것이 전제다.

## Scope

**In scope**
- 워크스페이스 루트에 `.books/` 디렉토리 + `.books/format.json` 매니페스트 도입. path(워크스페이스 상대경로) → `{ fontFamily, fontSize, letterSpacing, lineHeight }` 매핑
- Tauri command: 매니페스트 read/write/upsert/remove(파일 이름 변경·삭제 시 동기화), 누락 시 기본값 반환
- Editor 상단바에 서식 컨트롤 4개 추가 — 글꼴 select(시스템 폰트 + 기본 한글 폰트 몇 종), 글자 크기, 자간, 행간. 변경 시 매니페스트 디바운스 저장
- Editor 본문에 CSS 변수(`--editor-font-family`, `--editor-font-size`, `--editor-letter-spacing`, `--editor-line-height`)로 주입 — innerText/contentEditable 구조와 키 입력 핫패스는 그대로
- 문서 전환 시 매니페스트 값 로드 → 컨트롤·CSS 변수 동기화. 매니페스트에 항목이 없으면 기본값 사용
- HWP 임포트: Tauri command `import_hwp(path) -> { text, suggestedName }`. 메뉴/버튼에서 `.hwp`/`.hwpx` 파일 다이얼로그로 선택 → 본문 단락 텍스트만 줄바꿈 단위로 합쳐 반환 → 현재 워크스페이스에 새 `.txt`로 저장 후 열기
- rhwp는 Rust crate 의존성으로 통합. crates.io 발행본이 있으면 그쪽, 없으면 `Cargo.toml`의 git 의존성으로 핀 고정. WASM(`@rhwp/core`)은 폴백 옵션으로만 plan B에 메모

**Out of scope (later)**
- 인라인/단락 단위 서식(굵게, 기울임, 단락별 다른 글꼴 등)
- HWP의 표·이미지·수식·헤더/풋터·각주 추출 (텍스트만)
- HWP/HWPX 저장(쓰기)
- 워크스페이스 전역 기본 서식·테마 프리셋
- 폰트 설치/번들링 — 시스템에 설치된 폰트만 사용
- 에디터 성능 개선(다음 plan에서 따로)

## Stages

1. **매니페스트 모델** — `.books/format.json` 스키마 정의, Tauri command(read/write/upsert/remove/get_for_path) 구현, 기본값 상수, 워크스페이스 마이그레이션(없으면 빈 매니페스트 생성). 파일 이름 변경·삭제 명령에 매니페스트 동기화 훅 연결
2. **서식 컨트롤 UI** — Editor 상단바에 4개 컨트롤 추가, 매니페스트 디바운스 저장(기존 autosave와 별도 채널), CSS 변수 주입, 문서 전환 시 값 로드. 직전 plan의 ref/innerText 흐름을 절대 건드리지 않음
3. **HWP 임포트** — src-tauri에 rhwp crate 의존성 추가, `import_hwp` command 구현(HWP 5.0 + HWPX 자동 판별), 프론트에 임포트 메뉴/버튼 + 파일 다이얼로그, 추출 텍스트를 새 `.txt`로 저장 후 자동 오픈

## Constraints

- 직전 3개 editor plan(페이지네이션 제거, 핫패스 ref화·IME, 후속 최적화)에서 만든 키 입력·스크롤 핫패스를 깨지 않을 것. 서식 컨트롤은 React state 변화만으로 동작하되, 본문 렌더는 CSS 변수만 갱신하도록 분리
- 한글 IME 조합 정상 동작 유지(compositionstart/end 흐름 보존)
- rhwp 라이선스·빌드 호환성 확인 필요. crates.io 미게시 시 git rev 핀 고정으로 재현성 확보
- 매니페스트는 워크스페이스에 종속 — 워크스페이스 전환 시 다른 매니페스트를 다시 로드. `.books/`는 파일 목록 UI에서 숨김 처리
- HWP 임포트는 동기 처리로 시작하되, 대용량 파일을 위해 추후 비동기/취소 지원 여지를 남길 것(이번 plan 범위 외)

## Direction

전체 흐름은 "에디터 본문 구조는 그대로 두고, 주변(매니페스트·상단바·임포트 파이프라인)만 확장"하는 방향이다.

- **매니페스트**: `<workspace>/.books/format.json`에 단일 객체로 path→meta 매핑. 단일 파일이라 atomic write·watcher 부담 최소. `migrate_from_local`처럼 워크스페이스 set 시 한 번 보장 생성
- **서식 적용**: 상태는 React에 있지만 본문 DOM은 건드리지 않고 wrapper에 CSS 변수만 흘려 적용한다. 컨트롤 변경 → state 업데이트 → CSS 변수만 바뀜 → editable는 재렌더 없음. 자간(letter-spacing)은 px 또는 em, 행간(line-height)은 unitless 권장
- **HWP 통합**: rhwp는 Rust+WASM 양쪽 노출이지만 우리는 Tauri 환경이라 Rust crate 쪽이 자연스럽다. `import_hwp` command는 rhwp의 parser/document_core를 거쳐 단락 텍스트 배열을 만들고 `\n`으로 합쳐 반환. HWP/HWPX 판별은 확장자 + 매직 바이트로 이중 체크
- **임포트 UX**: 파일 트리/탑바에 "HWP 가져오기" 버튼 1개. 다이얼로그 → 파싱 → 결과 텍스트를 워크스페이스의 현재 디렉토리(또는 루트)에 같은 이름의 `.txt`로 저장 → 새 문서 열기. 충돌 시 ` (1)` 등 suffix
- **실패 처리**: 파싱 실패 시 사용자에게 "이 파일은 지원되지 않거나 손상되었습니다" 토스트, 빈 파일 생성하지 않음
