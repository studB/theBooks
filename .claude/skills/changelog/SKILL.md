---
name: changelog
description: Append a new row to CHANGELOG.md as a table (Version / Date / Type / Summary). Reads the current project version and the most recently applied plan to draft the entry, confirms the row with the user, and appends it without rewriting existing rows. Use when the user invokes /changelog.
user-invocable: true
allowed-tools:
  - AskUserQuestion
  - Bash
  - Read
  - Write
  - Edit
---

# /changelog — Append a row to CHANGELOG.md

You are a release-note recorder. The user gave you input in `$ARGUMENTS` (may be empty). `$ARGUMENTS` is an optional one-line summary that overrides the auto-drafted summary.

This skill appends **one row** to a markdown table in `CHANGELOG.md`. It never edits or removes existing rows. If the table does not yet exist, it creates the file with a header.

## Workflow

### 1. Locate the project root

- Resolve `<project-root>` via `git rev-parse --show-toplevel`, falling back to the current working directory.
- If the resolved root is the user's home directory, refuse to proceed.

### 2. Read the current version

- Read the `"version"` field from `src-tauri/tauri.conf.json`. This is the version to record.
- Also read `src-tauri/Cargo.toml`'s `[package]` `version`. If it disagrees with `tauri.conf.json`, tell the user `두 파일의 버전이 다릅니다 (tauri.conf.json=<a>, Cargo.toml=<b>). /implement-plan으로 동기화한 뒤 다시 시도하세요.` and exit.

### 3. Pick the most recently applied plan (best-effort)

To draft the summary, look in `<project-root>/.claude/plan/` for files whose first line is `- [x] applied`. Pick the one whose filename timestamp suffix is the largest (most recent). Read its H1 title and overview — these seed the default summary.

If no applied plan exists, skip this step. The summary will come from `$ARGUMENTS` or a user prompt instead.

### 4. Draft the row

Compose the four columns:

- **Version** — from step 2 (e.g., `0.2.0`).
- **Date** — today's local date in `YYYY-MM-DD`. Generate via `date +%Y-%m-%d` (Bash). Do not invent it.
- **Type** — pick the change category. Default candidates: `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, `test`, `build`, `init`. Infer from the plan's bump (`major` or `minor` → likely `feat`, `patch` → likely `fix` or `chore`) and the plan's wording. You will confirm this with the user in step 5.
- **Summary** — one line, ≤ 100 chars. Source of truth, in order of precedence:
  1. `$ARGUMENTS` if non-empty — use it verbatim (trim trailing whitespace).
  2. Otherwise, draft from the applied plan's H1 title + overview, tightened to one line.
  3. Otherwise (no plan, no $ARGUMENTS), ask the user for a one-line summary via `AskUserQuestion`.

The summary must not contain a pipe character `|` (it would break the table). If the drafted summary contains `|`, replace each with `/` or rephrase.

### 5. Confirm the row

Show the user the drafted row in markdown table form (single row), and ask via `AskUserQuestion`:

- `append` — write the row.
- `edit summary` — re-prompt for a new summary, then re-confirm.
- `change type` — re-prompt for the Type column (offer the candidate list from step 4 as options), then re-confirm.
- `cancel` — exit without writing.

### 6. Append to CHANGELOG.md

Path: `<project-root>/CHANGELOG.md`.

**If the file does not exist**, create it with this exact content (then the row goes on the line below the separator):

```markdown
# Changelog

All notable changes to this project are recorded here. Newest entries on top.

| Version | Date | Type | Summary |
|---------|------|------|---------|
| <new row goes here> |
```

**If the file exists**:

1. Read it and locate the table. The header line `| Version | Date | Type | Summary |` and the separator `|---------|------|------|---------|` should already be present.
2. If the header is missing or malformed, do not silently rewrite it. Tell the user `CHANGELOG.md의 테이블 헤더를 찾지 못했습니다. 헤더를 복구한 뒤 다시 실행하세요.` and exit.
3. Insert the new row **immediately after the separator line** (newest on top). Do not touch any existing rows.

Use the `Edit` tool with the separator line as `old_string` and the separator line + `\n` + the new row as `new_string`. This keeps the diff minimal and the row order correct.

The new row format (exactly four columns, pipe-delimited, with leading and trailing pipes):

```
| <version> | <YYYY-MM-DD> | <type> | <summary> |
```

### 7. Report back

Reply with:

- The full row as written.
- The path of `CHANGELOG.md`.
- A one-line reminder: `/write-docs 로 README.md도 함께 갱신할 수 있습니다.` (only if the bump was non-trivial — for a `patch`, skip the reminder).

## Rules

- This skill is **append-only**. Never edit or delete existing rows. Never reorder.
- Always insert directly after the separator line (newest on top).
- Never invent a version. Pull from `tauri.conf.json` and verify against `Cargo.toml`.
- Never invent the date. Generate via `date +%Y-%m-%d`.
- The summary column must be ≤ 100 chars and must not contain `|`.
- If `$ARGUMENTS` is provided, treat it as the authoritative summary — do not "improve" it; only sanitize for the pipe character.
- One row per invocation. If the user wants multiple rows, run the skill multiple times.
