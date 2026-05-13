---
name: implement-plan
description: Execute a plan file from .claude/plan/ — implement the changes stage-by-stage, bump the project version in tauri.conf.json and src-tauri/Cargo.toml together, and flip the plan's `- [ ] applied` checkbox to `- [x] applied`. Use when the user invokes /implement-plan.
user-invocable: true
allowed-tools:
  - AskUserQuestion
  - Bash
  - Read
  - Write
  - Edit
---

# /implement-plan — Apply a dev plan and bump the version

You are an implementation driver. The user gave you input in `$ARGUMENTS` (may be empty). `$ARGUMENTS` identifies which plan to apply:

- **Empty** → list all unapplied plans in `.claude/plan/` and ask the user to pick one.
- **Plan name** (slug, with or without `.md`, with or without timestamp suffix) → resolve to a single file in `.claude/plan/`.

This skill does the actual coding work guided by the plan, then performs the version bump and applied-marker flip as the final atomic step. Do **not** start coding before the user confirms the plan and bump in step 3.

## Workflow

### 1. Locate the project root and the plan

- Resolve `<project-root>` via `git rev-parse --show-toplevel`, falling back to the current working directory. If the resolved root is the user's home directory, refuse to proceed and tell the user this skill must run inside a project.
- The plan directory is `<project-root>/.claude/plan/`. If it does not exist or is empty, tell the user `적용할 plan이 없습니다. /make-dev-plan으로 먼저 plan을 작성하세요.` and exit.

Resolve the target plan file:

- **Empty `$ARGUMENTS`** → list every `*.md` file in `.claude/plan/`, read each one's first line, and filter to those whose first line is `- [ ] applied` (unapplied). If none remain, tell the user `모든 plan이 이미 applied 상태입니다.` and exit. Otherwise, ask the user via `AskUserQuestion` which plan to apply (use the H1 title from each file as the option label, with the filename in the description).
- **Non-empty `$ARGUMENTS`** → search `.claude/plan/` for files whose name (with or without `.md`) matches `$ARGUMENTS` exactly, or matches `<$ARGUMENTS>-<14-digit-timestamp>.md`:
  - 1 match → use it.
  - 2+ matches → ask the user to pick one via `AskUserQuestion`.
  - 0 matches → tell the user `해당 plan을 찾을 수 없습니다: <$ARGUMENTS>` and exit.

### 2. Validate the plan

Read the chosen plan file. Enforce:

1. **Applied guard** — if the first line is `- [x] applied`, refuse: `이 plan은 이미 applied 상태입니다. 다시 적용하려면 체크박스를 - [ ] applied로 되돌리거나, 새 plan을 만드세요.` Exit without changes.
2. **Structure check** — confirm the file has a `## Version` block with `Current`, `Bump`, and `Target` lines. If not, tell the user `이 plan에는 Version 블록이 없습니다. /make-dev-plan으로 plan을 갱신하세요.` and exit.
3. **Version sanity check** — read the current version from `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. They should match each other and match the plan's `Current`. If they disagree, surface the mismatch to the user via `AskUserQuestion` with options:
   - `use tauri.conf.json` — treat that file's version as ground truth and re-derive the target.
   - `use Cargo.toml` — same, but from Cargo.toml.
   - `use plan's Current` — trust the plan.
   - `cancel` — exit without changes.

   Recompute the target version from the chosen current + the plan's `Bump` (semver: major resets minor/patch to 0; minor resets patch to 0; patch increments patch). Show the recomputed target to the user.

### 3. Confirm scope and bump before coding

**Bump rules (authoritative — override the plan if it disagrees):**

- `major` — only when the user has **explicitly** asked for a major bump. Never infer a major from the change description alone, no matter how large the change feels.
- `minor` — the app's features change in a way users can observe: a feature is added, modified, or removed.
- `patch` — code changes that do not change app behavior for users: optimization, refactor, internal config, build/tooling tweaks, dependency bumps with no behavior change, comments/docs.

Before showing the confirmation summary, classify the plan's actual changes against the rules above:

1. If the plan's `Bump` is `major` and you don't see an explicit user request for major in the plan body or in this conversation, treat the bump as wrong and propose a corrected bump (`minor` if the plan adds/changes/removes user-visible features, otherwise `patch`).
2. If the plan's `Bump` is `minor` but the stages only describe internal/non-functional work (refactor, optimization, config, build), propose `patch` instead.
3. If the plan's `Bump` is `patch` but the stages describe user-visible feature changes, propose `minor` instead.

When you propose a corrected bump, surface it clearly: state the plan's bump, your proposed bump, and one sentence on why. Recompute the target version from the corrected bump.

Then summarize back to the user in a short message:

- Plan title and overview.
- The stages, in order.
- Current → Target version (and the bump type, with a note if it was corrected from the plan's original).
- Files you expect to touch (best guess from reading the plan + a quick scan of the repo).

Then ask via `AskUserQuestion`:

- `proceed` — start implementing with the (possibly corrected) bump.
- `adjust bump` — pick a different bump explicitly. If the user picks `major` here, treat that as the explicit request the rules require.
- `cancel` — exit without changes.

Do not begin coding until the user picks `proceed`.

### 4. Implement stage by stage

Use a `TodoWrite` task list with one entry per stage from the plan's `## Stages` section, plus a final "Bump version and mark plan applied" task. Mark exactly one task `in_progress` at a time and complete it as you go.

For each stage:

1. State briefly what you're about to do (one sentence).
2. Read the files you need to change. Prefer `Edit` over `Write` for existing files.
3. Make the change in the smallest reasonable diff. Respect the plan's `Direction` section — if reality forces a deviation, surface it to the user before continuing.
4. If a stage is ambiguous or has unstated decisions, ask via `AskUserQuestion` rather than guessing.
5. Mark the stage complete in the todo list.

Rules during implementation:

- Do not expand scope beyond what the plan describes. If you notice tangential issues, surface them at the end as suggestions — do not silently fix them.
- Do not run destructive commands (force push, hard reset, rm -rf, branch deletion) without asking.
- Do not commit changes unless the user explicitly asks. Implementation produces a working tree diff; committing is a separate user decision.

### 5. Bump the version (atomic final step)

After every stage in the plan is complete, do the version bump in one tight sequence so the two files stay in sync:

1. Read `src-tauri/tauri.conf.json` and update its `"version"` field to the target version.
2. Read `src-tauri/Cargo.toml` and update the `[package]` `version = "..."` line to the target version. Only the `[package]` version — leave dependency version pins alone.
3. After both edits, run `grep -n '"version"' src-tauri/tauri.conf.json src-tauri/Cargo.toml` to verify both files now show the target version. Show the output to the user.

If either file fails to update, stop and tell the user before flipping the plan checkbox.

### 6. Flip the applied checkbox

Edit the plan file so the first line changes from `- [ ] applied` to `- [x] applied`. Leave the rest of the file untouched.

### 7. Report back and hand off

Reply with:

- A 2–4 line summary: which plan was applied, the new version, and a short list of stages completed.
- The path of the plan file (now marked applied) and confirmation both version files show the target version.
- A handoff line: `다음으로 /changelog 를 실행하면 이번 버전을 CHANGELOG.md에 기록할 수 있습니다.` and `/write-docs 로 README.md를 현재 상태에 맞게 갱신할 수 있습니다.`

## Rules

- Never modify a plan whose first line is `- [x] applied`. The applied guard is mandatory.
- Never bump the version partially. If one file is updated and the other can't be, revert the first edit and stop.
- Never silently override the plan's `Bump`. If the bump rules in step 3 disagree with the plan, surface the corrected bump to the user and let them confirm or override.
- `major` is reserved for explicit user requests. Never auto-promote a `minor`/`patch` plan to `major` based on your own judgment of "size."
- Never commit, push, or create git branches as part of this skill. Surface the diff and let the user commit.
- The `## Version` block in the plan is authoritative. Do not invent a target version that isn't derivable from `Current + Bump`.
- This skill flips exactly one checkbox in exactly one plan file. Do not touch other plan files.
