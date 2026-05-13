---
name: write-docs
description: Update README.md to match the current state of the project. Surveys the repo (Tauri config, Cargo.toml, source layout, CHANGELOG), drafts a refreshed README, shows a diff, and writes only after the user confirms. Use when the user invokes /write-docs.
user-invocable: true
allowed-tools:
  - AskUserQuestion
  - Bash
  - Read
  - Write
  - Edit
---

# /write-docs — Refresh README.md against the project's current state

You are a docs maintainer. The user gave you input in `$ARGUMENTS` (may be empty). `$ARGUMENTS` is an optional focus hint — a phrase like `add usage section` or `update install steps`. If empty, do a full refresh.

This skill only updates `README.md` at the project root. It does not touch other docs.

## Workflow

### 1. Locate the project root

- Resolve `<project-root>` via `git rev-parse --show-toplevel`, falling back to the current working directory.
- If the resolved root is the user's home directory, refuse to proceed.

### 2. Survey the current state

Read in parallel where possible:

- `README.md` — the current contents. If it does not exist, you will create it.
- `src-tauri/tauri.conf.json` — for `productName`, `version`, `identifier`, window config.
- `src-tauri/Cargo.toml` — for the Rust crate name, version, and description.
- `package.json` if it exists at the project root — for scripts, dependencies, and the declared name/version.
- `CHANGELOG.md` if it exists — for the latest version row and the most recent change types.
- The top-level directory listing (`ls`) and one level into `src/`, `src-tauri/`, and `front-assets/` (or whichever frontend directories exist) — to describe the project layout accurately.

If `tauri.conf.json` and `Cargo.toml` versions disagree, flag this to the user and ask whether to proceed (the README will use `tauri.conf.json`'s version).

### 3. Decide the README structure

Aim for a README that covers, in order:

1. **Title and one-line description** — from `tauri.conf.json.productName` (or `Cargo.toml` name) and `Cargo.toml.description`.
2. **Current version** — from `tauri.conf.json.version`. A short line, e.g., `Version: 0.2.0`.
3. **Overview** — 2–4 sentences on what the app does. Pull from the most recent applied plan's title/overview if available (`.claude/plan/*.md` with `- [x] applied`), and from `CHANGELOG.md`'s top rows.
4. **Tech stack** — Tauri + (frontend stack inferred from `front-assets/` or `package.json`). Be honest: if `package.json` doesn't exist, don't claim React/Vite.
5. **Project layout** — bullet list of top-level directories with a short description each. Only include directories that actually exist.
6. **Development** — install + run commands. Default to `npm install` / `npm run tauri dev` if a `package.json` exists; otherwise just `cargo tauri dev`. Never invent scripts that aren't in `package.json`.
7. **Build** — `npm run tauri build` (or `cargo tauri build`).
8. **Changelog** — a one-line pointer to `CHANGELOG.md` if it exists.

Skip sections that have no real content. A short, accurate README is better than a long, half-true one.

If `$ARGUMENTS` is non-empty, prioritize the section it refers to (e.g., `update install steps` → focus the diff on Development/Build, leave other sections untouched if they are already accurate).

### 4. Draft the new README

Compose the full new README content in memory. Constraints:

- Use the same language as the current README (English if the existing file is English; Korean if the user clearly works in Korean and the existing file is Korean). If the existing README is the Tauri template default, switch to English unless the user has indicated otherwise.
- Use plain markdown. No badges unless the existing README already had them.
- Code blocks for commands. Use ```` ```bash ```` for shell.
- No emojis unless the existing README already used them.
- Do not invent features. Every claim must be supported by what you saw in step 2.

### 5. Confirm before writing

Show the user:

- A short summary of what changed vs. the current README (e.g., `버전을 0.1.0 → 0.2.0으로 갱신, Project layout 섹션 추가, Tauri template 안내 문구 제거`).
- The full proposed README content in a fenced code block so the user can review it.

Ask via `AskUserQuestion`:

- `write` — overwrite `README.md` with the new content.
- `revise` — go back and adjust specific sections (the user will say which).
- `cancel` — exit without writing.

### 6. Write README.md

Use the `Write` tool to overwrite `<project-root>/README.md` with the confirmed content.

If the file already exists, you must `Read` it once before writing (the `Write` tool requires this). You already did this in step 2.

### 7. Report back

Reply with:

- The path of `README.md`.
- A 1–3 line summary of what changed.
- If `CHANGELOG.md` exists and the current version is not yet recorded there, remind the user: `현재 버전(<version>)이 CHANGELOG.md에 아직 없으면 /changelog를 실행하세요.`

## Rules

- Never claim a feature, command, or dependency that isn't visible in the repo. If unsure, ask the user or omit.
- Never write the README before the user picks `write`.
- Do not touch any file other than `README.md`.
- Do not delete existing README sections that are still accurate just to shorten the file. Tighten language, but preserve correct content.
- The version line, project layout, and dev/build commands must reflect the repo as it stands right now — those are the parts most likely to drift, so verify each against the survey in step 2.
- If the existing README is identical to the Tauri scaffold's default (`# Tauri + Vanilla` etc.), treat it as a placeholder and replace it wholesale.
