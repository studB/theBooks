- [x] applied

# 에디터 문서 내 찾기(Ctrl+F) 기능

현재 에디터 문서 안에서 Ctrl+F로 단어/문장을 찾아 모든 일치를 하이라이트하고 다음·이전으로 이동하는 찾기 바를 추가한다.

## Purpose

긴 문서를 편집할 때 특정 단어/문장을 빠르게 찾을 수단이 없다. 브라우저 기본 Ctrl+F는 contentEditable 위에서 동작이 불안정하므로, 에디터에 내장된 찾기 바로 입력한 텍스트의 모든 일치를 하이라이트하고 다음·이전으로 이동할 수 있게 한다.

## Scope

**In scope**
- Ctrl+F로 토글되는 찾기 바 (입력창, 일치 수 표시, 닫기 버튼, Esc로 닫기)
- 기본 부분일치(대소문자 무시)로 현재 문서의 모든 일치 하이라이트
- 다음·이전 이동(Enter / Shift+Enter, 버튼) + 현재 일치 강조 + 해당 위치로 스크롤

**Out of scope (later)**
- 바꾸기(Replace) / 모두 바꾸기
- 대소문자 구분, 단어 단위, 정규식 등 매칭 옵션
- 워크스페이스 전체 검색 (이미 command-palette가 담당)

## Stages

1. 찾기 바 UI — Ctrl+F 토글, 입력창/일치 수/닫기, Esc 핸들링 (Editor.jsx 내부)
2. 매칭 & 하이라이트 — DOM 변형 없이 CSS Custom Highlight API로 부분일치 전체 하이라이트, 디바운스 적용
3. 네비게이션 — 다음·이전 인덱스 이동, 현재 일치 별도 강조 + scrollIntoView

## Constraints

- 에디터는 contentEditable div이므로 매치 span 삽입으로 DOM을 변형하면 IME/저장 핫패스가 깨진다 → CSS Custom Highlight API(`CSS.highlights`, WKWebView 지원)로 비파괴 하이라이트.
- 기존 IME(composing)·autosave·카운트 타이머 로직을 건드리지 않을 것.
- Ctrl+F 단축키가 command-palette 등 기존 키 바인딩과 충돌하지 않도록 확인.

## Direction

Editor.jsx 안에 찾기 상태(open, query, matches, activeIndex)를 두고, contentEditable의 텍스트 노드를 순회해 부분일치 Range들을 만든 뒤 `CSS.highlights`에 등록한다. 전체 일치용 Highlight와 현재 일치용 Highlight를 분리해 `::highlight()` CSS로 색을 다르게 준다. 입력은 디바운스하고, 다음·이전은 activeIndex만 바꿔 해당 Range를 scrollIntoView한다. DOM을 바꾸지 않으므로 편집·IME·저장 경로에 영향이 없다.

## Version

- Current: 0.19.0
- Bump: minor
- Target: 0.20.0
