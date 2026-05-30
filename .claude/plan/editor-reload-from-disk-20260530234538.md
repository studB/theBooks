- [x] applied

# 에디터 파일 디스크에서 다시 불러오기 버튼

현재 열린 에디터 파일을 디스크에서 다시 읽어오는 갱신 버튼. 미저장 변경이 있으면 배너로 덮어쓰기/취소를 선택하고, 없으면 즉시 반영한다.

## Purpose

편집 중에 외부(다른 에디터·git·스크립트)에서 같은 파일이 바뀌어도 앱에는 반영되지 않아, 사용자가 옛 내용을 계속 편집하거나 저장 시 외부 변경을 덮어쓴다. 디스크 내용을 명시적으로 다시 불러오는 수단을 제공해 이 불일치를 해소한다.

## Scope

**In scope**
- 에디터 topbar에 "디스크에서 다시 불러오기" 버튼 추가 (현재 열린 파일 대상)
- 클릭 시 read_file로 디스크 내용(content/title/margins/updatedAt) 재로딩
- 미저장 변경 없으면 즉시 반영, 있으면 배너로 덮어쓰기/취소 선택

**Out of scope (later)**
- 백그라운드 파일 감시(watcher)·주기적 폴링·자동 감지
- 파일목록의 외부 추가/삭제 동기화
- 3-way 병합, 외부/로컬 diff 표시

## Stages

1. 재로딩 경로 — read_file을 다시 호출해 에디터 상태(contentEditable innerText, title, margins, savedAt)를 디스크 내용으로 교체하는 함수
2. 갱신 버튼 UI — topbar에 버튼 추가, 클릭 시 dirty 여부 판단해 분기
3. 충돌 배너 — 미저장 변경이 있을 때 "덮어쓰기 / 취소" 배너 노출 및 처리

## Constraints

- contentEditable는 innerText를 직접 교체해야 반영됨(file.id 전환 로직과 동일 방식). IME(composing)·autosave 핫패스를 건드리지 않을 것.
- 미저장 변경(dirty) 손실 방지가 핵심 — 반드시 사용자 확인 후에만 덮어쓰기.
- read_file은 이미 updatedAt(mtime)을 반환하므로 백엔드 추가 변경은 불필요할 가능성이 높음.

## Direction

Editor 내부에서 직접 invoke('read_file', { relPath: file.id })를 호출해 결과로 editableRef.innerText·title·margins·savedAt·contentRef를 갱신하고 dirty를 해제한다. 버튼 클릭 시 dirty면 즉시 갱신하지 않고 배너 상태를 켜서 "덮어쓰기/취소"를 받는다. 덮어쓰기 선택 시에만 위 재로딩을 실행한다. 백엔드는 기존 read_file을 재사용하므로 Rust 변경은 없을 전망.

## Version

- Current: 0.20.0
- Bump: minor
- Target: 0.21.0
