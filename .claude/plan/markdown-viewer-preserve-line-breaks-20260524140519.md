- [x] applied

# 마크다운 뷰어에서 단일 줄바꿈 보존

ReferencePane 마크다운 렌더링에 remark-breaks를 적용해, 에디터에서 친 단일 줄바꿈이 뷰어에서도 그대로 한 줄로 보이도록 한다.

## Purpose

작성자는 에디터에서 줄바꿈으로 문장 단위를 끊어 쓰는데, 분할 참조 뷰어가 표준 마크다운 규칙으로 단일 `\n`을 공백으로 합쳐서 의도와 다르게 보이는 문제가 있다. 사용자가 본 그대로 보이도록 동작을 맞춘다.

## Scope

**In scope**
- `remark-breaks` 의존성 추가 (`bun add remark-breaks`)
- [ReferencePane.jsx](src/components/ReferencePane.jsx)의 `ReactMarkdown` `remarkPlugins`에 `remarkBreaks` 추가

**Out of scope (later)**
- 에디터 자체 동작 변경
- 사용자 토글로 표준 markdown ↔ 줄바꿈 보존 전환
- 새 마크다운 뷰어 추가
- GFM 외 다른 확장 도입

## Stages

1. dep 추가 + plugins 배열에 한 줄 추가 (1 PR로 마무리)

## Constraints

- 기존 GFM 표(테이블/체크박스/링크 자동인식) 동작과 충돌하지 않을 것 — `remarkBreaks`는 GFM과 함께 쓰도록 설계되어 있음
- 두 줄 띄움(빈 줄)이 만드는 문단 구분은 유지되어야 함
- 코드블록/리스트/blockquote 안의 줄바꿈 동작이 의도치 않게 깨지지 않을 것
- Semver: patch bump (`tauri.conf.json`, `src-tauri/Cargo.toml` 동시 갱신)

## Direction

`bun add remark-breaks` 로 dependency를 추가하고, [ReferencePane.jsx](src/components/ReferencePane.jsx)의 import에 `import remarkBreaks from 'remark-breaks'` 한 줄, `remarkPlugins={[remarkGfm, remarkBreaks]}` 로 한 줄을 수정한다. 그 외 컴포넌트나 스타일 변경은 없다. 적용 후 분할 뷰어에서 줄바꿈/문단 구분/리스트/표가 모두 의도대로 보이는지 짧게 수동 확인한다.
