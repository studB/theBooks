- [x] applied

# 편집기 상단 툴바에 글자수 표시 (공백 포함/제외)

에디터 상단 툴바에 현재 본문의 글자수를 공백 포함·공백 제외 두 가지로 디바운스 실시간 표시한다.

## Purpose

글을 쓰는 사람이 분량을 즉시 파악할 수 있게 한다. 분석 패널을 열지 않고도 상단에서 늘 확인 가능하도록 만들어, 매번 분석 버튼을 누를 필요 없이 작성 흐름 안에 자연스럽게 통합한다.

## Scope

**In scope**
- 에디터 상단 툴바(`.topbar`)에 카운트 표시 — 예: `2,341자 · 공백 제외 1,920자`
- 타이핑 중 ~150ms 디바운스로 갱신, 본문 비어있을 때는 0으로 표시
- 한글/영문/이모지 등 유니코드 코드포인트가 아닌 사람이 인식하는 글자 단위 카운트
- 천 단위 콤마 포매팅(`Intl.NumberFormat('ko-KR')`)

**Out of scope (later)**
- 단어 수, 줄 수, 문단·문장 수 (분석 패널이 담당)
- 선택 영역 카운트, 커서 위치 표시
- 챕터별 분기, 목표 글자수 / 진행률 게이지
- 카운트 표시 토글 설정

## Stages

1. 카운트 유틸 + 디바운스 훅 + 툴바 컴포넌트 — `contentRef.current` 또는 `file.content` 변화에서 디바운스로 두 수치를 계산해 토비 옆 슬롯에 렌더 (1 PR로 마무리)

## Constraints

- 대용량 본문(수만 자)에서도 입력 지연이 없어야 함 — 메인 스레드 1회 패스로 끝나는 단순 카운트만 사용
- 기존 분석 패널의 `characters` 통계와 중복 정보지만 의도된 중복(상시 노출 vs 정밀 분석)
- contentRef 기반 hot-path 변경(IME 안정성)을 깨지 않도록, 카운트 계산은 commit 후 또는 별도 setState 경로로 처리
- 자동저장 ON/OFF, 다크 모드, 좁은 화면(반응형)에서도 깨지지 않을 것
- Semver: patch bump (`tauri.conf.json`, `src-tauri/Cargo.toml` 동시 갱신)

## Direction

새 컴포넌트 `CharCountBadge`를 만들어 [`src/components/Editor.jsx`](src/components/Editor.jsx)의 `topbar` 안 `topbar-spacer` 직전에 끼워 넣는다. 입력 시 `applyContentFromDOM` 등에서 갱신되는 `contentRef.current`를 직접 구독할 수 없으므로, 기존에 dirty/savedAt을 갱신하는 흐름에 보조 state `charText`(문자열)를 추가해 디바운스 setter로 동기화한다. 두 수치는 `text.length` 대신 `Array.from(text).length`(코드포인트 단위)로 계산하고, 공백 제외 카운트는 정규식 `/\s+/g` 제거 후 같은 방식으로 길이를 잰다. 스타일은 `.btn.ghost`와 비슷한 톤의 새 클래스(`.char-count-badge`)로 가볍게 추가한다.
