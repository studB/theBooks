---
name: make-dev-plan
description: Interactively design a development plan with the user and save it as a markdown file under .claude/plan/. Use when the user invokes /make-dev-plan — ask focused questions about purpose, scope, stages, constraints, approach, and the proposed semver bump, then write the plan file.
user-invocable: true
allowed-tools:
  - AskUserQuestion
  - Bash
  - Read
  - Write
  - Edit
---

# /make-dev-plan — Co-design a focused dev plan

You are a planning facilitator. The user gave you input in `$ARGUMENTS` (may be empty). `$ARGUMENTS` plays one of two roles:

- **Seed idea** for a brand-new plan (descriptive sentence, free-form). → run **Create mode**.
- **Plan name** referring to an existing file in `.claude/plan/` (single slug-like token, optionally `.md`). → run **Edit mode** to modify that plan in place.

Decide which mode applies in step 2 below. Do **not** start implementation work — only produce or update the plan file. Implementation belongs to `/implement-plan`.

## Workflow

### 1. Locate the project root

The plan must land in `<project-root>/.claude/plan/`. Resolve the project root from the current working directory:

- If `git rev-parse --show-toplevel` succeeds, use that as the project root.
- Otherwise, use the current working directory.

If the resolved root is the user's home directory (e.g. `/Users/<name>` or `~`), stop and tell the user: "이 스킬은 프로젝트 디렉토리 안에서 실행해야 합니다. 홈 디렉토리에서는 plan 파일을 만들지 않습니다." Then exit without writing anything.

Create `.claude/plan/` if it does not exist.

### 2. Detect mode (create vs. edit)

- If `$ARGUMENTS` is empty → **create mode**. Skip to step 3 with no seed idea.
- If `$ARGUMENTS` is non-empty, search `<project-root>/.claude/plan/` for files whose name (with or without `.md`) matches `$ARGUMENTS` exactly, or matches the pattern `<$ARGUMENTS>-<14-digit-timestamp>.md`:
  - **1 match** → **edit mode** on that file. Jump to the "Edit mode workflow" section below.
  - **2+ matches** → ask the user via `AskUserQuestion` which file to edit (offer each candidate as an option), then enter edit mode on the chosen file.
  - **0 matches**:
    - If `$ARGUMENTS` *looks like* a plan name (no whitespace, kebab-case-like, or ends with `.md`) → tell the user `해당 이름의 plan 파일을 찾을 수 없습니다: <$ARGUMENTS>` and exit without writing.
    - Otherwise (looks like a descriptive seed idea — contains spaces or natural-language phrasing) → **create mode**, using `$ARGUMENTS` as the seed idea.

### 3. Read the current version (create mode)

Before interviewing, read the current app version from `src-tauri/tauri.conf.json` (the `"version"` field). Keep this in mind so the bump suggestion in step 5 is grounded in reality.

If the file does not exist or has no version, fall back to `0.0.0` and note this in the bump discussion.

### 4. Interview the user (create mode)

Ask 1–4 focused questions per turn using `AskUserQuestion`. Cover these dimensions, in roughly this order — but skip any that `$ARGUMENTS` already answers clearly:

1. **Purpose** — What problem does this solve? Who benefits? What does success look like?
2. **Scope** — What is in / out of scope? This is the most important dimension. Actively push back if scope feels too broad. Suggest cutting items into a "later" list.
3. **Stages** — What are the implementation phases or milestones? Can a thin first slice ship independently?
4. **Constraints** — Deadlines, tech stack limits, dependencies, compatibility, performance, team capacity.
5. **Direction / approach** — High-level technical approach, key decisions, alternatives considered.

Rules for the interview:

- Prefer 2–4 concrete options per question over open-ended prompts. Use `AskUserQuestion` with realistic choices the user can pick from.
- Recommend the option you think fits best by listing it first with `(Recommended)` and explain the trade-off in the description.
- After every 1–2 question rounds, briefly summarize what you've heard (2–4 lines) so the user can correct misunderstandings before more questions.
- Stop interviewing once you have enough to write a coherent plan. Do not keep asking for the sake of asking.

### 5. Decide the semver bump (create mode)

Once scope and direction are clear, ask the user which semver bump this plan implies. Show the current version (from step 3) and propose the bump you think fits, listed first as `(Recommended)`:

- `major` — backward-incompatible changes, removing public features, breaking data formats.
- `minor` — new feature, additive change, no breaking behavior for existing users.
- `patch` — bug fix, internal refactor, docs/build tweaks, no behavior change for users.

Record the chosen bump and the resulting target version (e.g., current `0.1.0` + `minor` → target `0.2.0`). These will be written into the plan file and read by `/implement-plan`.

### 6. Help the user keep scope tight (create mode)

Scope creep is the default failure mode. Before writing the file, explicitly check:

- Is the scope describable in one sentence under 200 characters? If not, it is probably too big.
- Are there 2+ "nice-to-have" items mixed in with core items? Offer to move them to a `## Out of scope (later)` section.
- Could a smaller version of this ship in a few days and still deliver value? If yes, propose that as the v1 and push the rest to later phases.

If the user resists narrowing, accept their decision but note the risk in the **Constraints** or **Direction** section.

### 7. Confirm before writing (create mode)

Show a short summary of what you will write (title, overview, scope bullets, bump → target version) and ask one final `AskUserQuestion` with options:

- `write` — proceed and create the file.
- `revise` — go back and adjust (user will say what to change).
- `cancel` — abort without writing.

### 8. Write the plan file (create mode)

File path: `<project-root>/.claude/plan/<slug>-<YYYYMMDDHHmmss>.md`

- `<slug>` is a kebab-case slug derived from the title (lowercase, ASCII letters/digits/hyphens, ≤ 50 chars). The 50-char cap applies to the slug portion only — the timestamp is always appended after it. If the title is non-ASCII, transliterate or ask the user for a short English slug.
- `<YYYYMMDDHHmmss>` is the local time at file creation as 14 contiguous digits (e.g. `20260514153012`). Generate it via `date +%Y%m%d%H%M%S` (Bash) — do not invent or estimate the value.
- If a file with the same `<slug>-<timestamp>.md` somehow already exists (extremely unlikely due to the timestamp), regenerate the timestamp once and retry.

File format (write **exactly** this structure — match it character-for-character at the top):

```markdown
- [ ] applied

# <One-line title summarizing the dev plan>

<Overview, ≤ 200 characters, single paragraph, no line breaks.>

## Version

- Current: <current-version>
- Bump: <major | minor | patch>
- Target: <target-version>

## Purpose

<Why this work exists. The problem and the desired outcome.>

## Scope

**In scope**
- <bullet>
- <bullet>

**Out of scope (later)**
- <bullet>
- <bullet>

## Stages

1. <Stage 1 — short name and what ships>
2. <Stage 2 — ...>
3. <Stage 3 — ...>

## Constraints

- <deadline / dependency / compatibility / capacity item>
- <...>

## Direction

<High-level technical approach and key decisions. 3–8 lines.>
```

Hard requirements for the written file:

- The very first line MUST be `- [ ] applied` (unchecked checkbox, exact text).
- The next non-empty line MUST be a single `# ` H1 title.
- The line(s) after the H1 form the overview and MUST be ≤ 200 characters total. If the user's overview is longer, tighten it together before writing.
- The `## Version` block is mandatory and must list Current / Bump / Target on three lines, exactly as shown.
- Use the user's original language for the body (Korean if they spoke Korean), but keep the section headings as shown above (English) unless the user asks otherwise.
- Do not add any sections, badges, or metadata above the `- [ ] applied` line.

### 9. Report back

After writing (create or edit), reply with:

- The absolute path of the file.
- A 1–2 line recap of the title, scope, and the bump → target version (create mode) or the changes made (edit mode).
- A reminder that `/implement-plan <name>` will execute this plan, flip `- [ ] applied` → `- [x] applied`, and bump the project version.

Do **not** start implementing the plan. This skill ends at the file write.

## Edit mode workflow

Triggered by step 2 when `$ARGUMENTS` matches an existing plan file. Let `<path>` be the matched file.

1. **Read** `<path>` and inspect its first line.
2. **Applied guard** — if the first line is `- [x] applied` (checked), refuse the edit:
   - Tell the user: `이 plan은 이미 applied 상태로 표시되어 있어 수정할 수 없습니다 (<path>). 적용 체크를 해제하거나(- [x] → - [ ]), 새 plan을 만드세요.`
   - Exit without modifying anything.
3. **Editable** — if the first line is `- [ ] applied`, proceed:
   - Show the user the current file contents (or a section-by-section summary) so they can see what is in place.
   - Ask via `AskUserQuestion` which sections they want to change and gather the new content. Apply the same scope-tightening discipline from step 6 of create mode. If the bump changes, re-derive the target version from the current version in `tauri.conf.json`.
   - Keep the file's structure intact: `- [ ] applied` line, H1 title, overview ≤ 200 chars, `## Version` block, the standard sections in the same order. Do not introduce new top-level sections without asking.
4. **Confirm** before writing — show a summary of intended changes and ask `write` / `revise` / `cancel` (same options as step 7 of create mode).
5. **Overwrite** the same file at `<path>`. Preserve the original filename and its timestamp; do not rename or re-timestamp on edit.
6. Continue to step 9 (Report back).

## Rules

- Never write the plan file before the user picks `write` in the confirm step (whether create or edit).
- Never expand scope on the user's behalf. If something is unclear, ask — do not invent.
- Keep the file concise. A plan longer than ~100 lines is a sign the scope is too wide.
- Do not create files outside `<project-root>/.claude/plan/`.
- In edit mode, never edit a plan whose first line is `- [x] applied`. The applied guard is mandatory.
- In create mode, the filename must always end with `-<YYYYMMDDHHmmss>.md`. Never write a plan file without the timestamp suffix.
- The `## Version` block is part of the contract with `/implement-plan`. Never omit it.
- If `$ARGUMENTS` is empty, start the create-mode interview from question 1 (Purpose). If `$ARGUMENTS` already states a clear purpose (and didn't match any existing plan), acknowledge it and skip ahead.
