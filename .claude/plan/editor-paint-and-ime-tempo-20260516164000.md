- [x] applied

# 에디터 페인트 비용 절감 + 한글 IME "한 템포 늦음" 수정

`input→nextPaint`가 70~120ms로 측정되어 키 입력 간격(약 170ms)을 거의 다 잡아먹고 있다. 그 결과 (a) 영문 입력은 다음 키를 누른 순간 이전 글자가 그려지고, (b) 한글 IME는 다음 음절을 시작해야 직전 음절이 commit되며 시각화되는 "한 템포 늦음" 현상이 발생한다. 두 증상은 같은 원인(페인트 지연)의 두 얼굴이므로 같은 patch로 해결한다.

## Version

- Current: 0.10.0
- Bump: patch
- Target: 0.10.1

## Purpose

JS측 비용(`innerText` 0~1ms, `input.apply` 0~2ms)은 이미 충분히 빠르다. 병목은 contentEditable이 다시 그려질 때 브라우저 내부의 layout/paint/composite 파이프라인 비용이고, WebKitGTK + WSLg 환경에서 특히 두드러진다. CSS containment / GPU 레이어 분리 / 텍스트 렌더링 옵션 조정으로 페인트 영역과 비용을 줄여 `input→nextPaint`를 16~32ms대로 끌어내리는 게 목표. 동시에 IME composition update 단계에서 페인트가 누락되지 않도록 안전 장치를 추가한다.

## Scope

**In scope**
- `src/styles.css`의 `.page-content` / `.page-sheet`에 containment + GPU 레이어 힌트 적용 (실험 결과를 기반으로 영구 패치)
- `.page-sheet`의 무거운 `box-shadow: var(--shadow-md)`를 페인트 비용이 작은 단순 그림자로 교체 (시각적 회귀 없이)
- `.page-content`에 `text-rendering: optimizeSpeed`, 폰트 스무딩 힌트 조정 — 가독성 회귀 검증 후 채택/롤백
- IME 안전 장치: `onCompositionUpdate` 핸들러 추가. composition 진행 중 페인트가 stall되지 않도록 최소한의 read(`offsetHeight`)로 layout 강제. `applyContentFromDOM`은 여전히 composition 중 no-op 유지
- `src/main.jsx`의 `<React.StrictMode>` 영향 정량화 — 일시 비활성 빌드와 비교 측정 후, dev 한정 영향이면 그대로 두고 (out of scope), 영향이 크면 dev 전용 가드 추가
- 모든 PERF 계측 로직(`Editor.jsx`, `AppShell.jsx`, `src-tauri/src/lib.rs`)은 제거하고 깨끗한 상태로 마무리

**Out of scope (later)**
- contentEditable을 단락 단위로 쪼개는 구조적 페이지네이션 — 별도 plan으로 분리
- 가상 스크롤(react-virtual 등) 도입
- 폰트 자체 교체 / 사용자 폰트 옵션 축소
- WebView 렌더링 백엔드 변경 (예: WebKitGTK → Chromium CEF) — 환경 의존
- Windows 네이티브 빌드와의 환경 비교는 별도 검증 작업
- Chat / FileList / ReferencePane 최적화

## Stages

1. **CSS containment 영구 패치** — 실험에서 적용한 다음을 `styles.css`에 정식 반영.
   - `.page-content`: `contain: layout style paint`, `will-change: contents`, `transform: translateZ(0)`, `backface-visibility: hidden`
   - `.page-sheet`: `will-change: transform`, `transform: translateZ(0)`
   - `box-shadow: var(--shadow-md)` → 가벼운 단일 레이어 그림자(`box-shadow: 0 1px 4px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)`)로 교체. 시각 비교 후 채택.
2. **텍스트 렌더링 옵션** — `.page-content`에 `text-rendering: optimizeSpeed`와 `-webkit-font-smoothing: antialiased` 추가. 시각적 차이가 크면 `optimizeSpeed`만 롤백하고 containment만 유지.
3. **IME compositionupdate 안전 장치** — `Editor.jsx`의 `<div contentEditable>`에 `onCompositionUpdate` 핸들러 추가. 핸들러는 `editableRef.current.offsetHeight`를 한 번 읽어 강제 layout 트리거 → composition 중간 단계 페인트가 누락되어 "다음 키를 눌러야 이전 글자가 보이는" 현상 완화. setState는 호출하지 않음. composition 중에는 여전히 `applyContentFromDOM`은 early return.
4. **StrictMode 영향 분리 측정 (dev only)** — `main.jsx`에서 `<React.StrictMode>`를 일시 제거하고 같은 시나리오로 `input→nextPaint` 비교. 차이가 작으면 (≤10ms) 그대로 복구. 차이가 크면 (>30ms) dev 빌드에서만 StrictMode 끄는 분기 추가 (`import.meta.env.DEV`) — production은 영향 없음.
5. **PERF 계측 제거** — 다음 위치의 `// --- PERF ---` 블록 모두 삭제, 원본 동작 복구.
   - `src/components/Editor.jsx`: perfLog 헬퍼, lastInputAtRef, lastKeyAtRef, keydown listener useEffect, longtask observer useEffect, `applyContentFromDOM`/`handleCompositionEnd`/`scheduleAutosave` 안의 계측
   - `src/components/AppShell.jsx`: `writeNow`의 IPC 계측, `get_workspace` 직후 워크스페이스 경로 계측
   - `src-tauri/src/lib.rs`: `perf_log` 명령 정의와 `invoke_handler` 등록 라인
6. **검증** — `bun run build` 통과, `bun run tauri dev`로:
   - (a) 빈 문서 + 한 페이지 + 18K자 문서 각각에서 한글 연속 입력 시 글자가 키 누른 순간 즉시 보이는지 확인
   - (b) 영문 빠른 타이핑이 한 키씩 즉시 반영되는지 확인
   - (c) 룰러 동기화, 마진 드래그, 자동저장 ON/OFF, 분할 패널 동작 회귀 없음
   - (d) 페이지 그림자 변경이 시각적으로 어색하지 않음
   - (e) 가독성(폰트 렌더링) 회귀 없음 — 본문 한 페이지 분량으로 육안 비교

## Constraints

- 동작 회귀 없음. 모든 기존 기능(자동저장, 룰러, 마진, 분할, 포맷 컨트롤, IME) 그대로.
- 시각적 회귀 최소화. 페이지 그림자가 살짝 약해질 수는 있지만 "그림자가 사라졌다"고 인식되면 롤백. 폰트가 흐릿해 보이면 `text-rendering: optimizeSpeed` 롤백.
- IME 핸들러는 read-only 작업(layout 강제)만. setState 호출 금지 — composition 깨짐 위험.
- CSS 외 변경은 최소. JS 측 핫패스 코드는 직전 patch(0.9.2)에서 이미 정리되어 있으므로 손대지 않는다.
- 패치 적용 후 `[perf]` 로그가 콘솔/터미널에 절대 남지 않아야 한다 — 측정 코드 잔존 금지.
- WSL/WSLg 환경 자체의 합성기 비용은 CSS로 0이 되지 않는다. 이 patch의 성공 기준은 "WSL에서도 사용 가능한 수준(즉시 글자가 보임)"이지 "60fps 완벽 달성"이 아니다.

## Direction

- **CSS containment의 핵심**: `contain: layout style paint`은 `.page-content` 내부의 layout/paint 무효화를 컨테이너 안에 가둔다. 룰러·페이지 시트·마진 핸들은 모두 바깥 형제 노드이므로 영향 받지 않으며, contentEditable이 다시 그려질 때 페인트 비용이 노드 크기에 비례하는 게 아니라 dirty 영역(보통 마지막 줄 한두 줄)에 비례하게 된다. 이게 가장 큰 효과를 기대하는 변경.
- **GPU 레이어**: `transform: translateZ(0)` + `will-change`는 별도 레이어로 합성. WebKitGTK가 GPU 모드로 동작 중이면 효과 큼. CPU 모드면 중립 또는 약간 손해. `will-change: contents`는 "내용 자주 바뀜" 힌트 — 텍스트 노드 변경이 잦은 contentEditable에 적합. 실험 결과로 효과 확인된 상태.
- **box-shadow 교체**: `--shadow-md`는 보통 여러 레이어 그림자 스택이라 페인트 비용이 크다. 가벼운 단일 그림자로 바꾸면 페인트 시간 줄어듦. 시각적 손실이 거의 없도록 1px 거리 + 1px hairline border 조합.
- **`text-rendering`**: 기본값 `optimizeLegibility`는 커닝/리거처 계산을 활성화해서 글자가 많을수록 페인트가 무거워진다. `optimizeSpeed`는 그걸 끈다. 한국어 본문에서는 리거처가 거의 무의미하므로 가독성 손실 작음. 다만 영문 가독성에 영향이 있으면 롤백.
- **`onCompositionUpdate` 안전 장치**:
  ```js
  function handleCompositionUpdate() {
    if (!editableRef.current) return;
    // void read to force layout; 페인트 큐 flush 유도
    void editableRef.current.offsetHeight;
  }
  ```
  setState 없음. React state 흐름은 그대로. composition 도중 IME가 DOM을 갱신했는데 페인트가 다음 key까지 보류되는 케이스만 잡는다. 효과가 미미하면 빈 핸들러로 두거나 제거.
- **StrictMode 분기**: 만약 큰 영향이 확인되면 `main.jsx`에서:
  ```js
  const Root = import.meta.env.DEV
    ? ({ children }) => children   // dev에서 StrictMode 끔
    : React.StrictMode;
  ```
  하지만 production 빌드는 StrictMode가 자동으로 단일 렌더이므로 사용자 경험에는 영향 없음. 이 옵션은 측정 결과가 크게 다를 때만 채택.
- **PERF 잔존물 제거 체크리스트**: 적용 직전에 `grep -n "PERF\|perf_log\|perfLog\|\[perf\]" src/ src-tauri/src/` 결과가 빈 라인이어야 한다.
- **롤백 경로**: 모든 변경은 CSS와 JSX 핸들러 한두 줄 수준. 문제가 생기면 `git restore src/styles.css src/components/Editor.jsx`로 즉시 복구 가능. 시멘틱 버전은 patch이므로 다음 patch로 복구해도 됨.
