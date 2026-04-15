# Spec Gap Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the audited spec gaps for TUI issue management, review-output formatting, and the first Electron GUI explicit-run slice.

**Architecture:** Keep existing TUI and pipeline flows intact. Add small, test-driven seams: field-cycle gating in VimProvider, formatter usage in IssueProcessor, a reusable issue workspace layer, and a GUI launcher/IPC shell that reuses existing GitHub/config/MAP/pipeline services.

**Tech Stack:** TypeScript, React/Ink, Electron, Vitest, Octokit, existing MAP wrapper.

---

### Task 1: TUI gap tests and fixes

**Files:**
- Modify: `src/cli/components/VimProvider.tsx`
- Modify: `src/cli/components/IssueForm.tsx`
- Modify: `src/cli/components/SplitPane.tsx`
- Modify: `src/cli/tui.tsx`
- Modify: `test/unit/cli/components/VimProvider.test.tsx`
- Modify: `test/unit/cli/components/IssueForm.test.tsx`
- Modify: `test/unit/cli/components/StatusBar.test.tsx`
- Modify: `test/unit/cli/components/HelpOverlay.test.tsx`
- Modify/Create relevant TUI tests

- [x] Add failing tests for create-mode insert Tab/Shift+Tab excluding the comment field.
- [x] Add failing tests for `:comment`/comment focus entering insert mode.
- [x] Add failing tests for relative comment timestamps.
- [x] Add failing tests proving editor pane width follows the editor pane.
- [x] Implement minimal code to pass those tests.
- [x] Run targeted TUI tests.

### Task 2: Review-output raw AI warning cleanup

**Files:**
- Modify: `src/pipeline/issue-processor.ts`
- Modify: `test/unit/pipeline/issue-processor.test.ts`

- [x] Add failing test for review/follow-up warning paths not leaking raw JSON AI payloads.
- [x] Replace remaining raw `err.message` AI warning output with `humanizeAIError()`.
- [x] Run targeted pipeline issue-processor tests.

### Task 3: Explicit issue run API

**Files:**
- Modify: `src/pipeline/issue-processor.ts`
- Modify: `test/unit/pipeline/issue-processor.test.ts`
- Create: `src/pipeline/explicit-runner.ts`
- Modify: `src/pipeline/index.ts`
- Create: `test/unit/pipeline/explicit-runner.test.ts`

- [x] Add failing tests proving `processIssue(..., { bypassEligibility: true })` skips only `shouldProcessIssue` and still checks branch/open PR safety.
- [x] Implement the option.
- [x] Add a small `ExplicitIssueRunner` wrapper that fetches full issue detail and calls `IssueProcessor` with bypass enabled.
- [x] Run targeted pipeline tests.

### Task 4: Shared workspace layer

**Files:**
- Create: `src/cli/workspace.ts`
- Modify: `src/index.ts`
- Create: `test/unit/cli/workspace.test.ts`

- [x] Add failing tests for workspace dependency parity: repos, issue methods, comments, close, polish, input mode.
- [x] Extract TUI dependency construction into a reusable workspace factory.
- [x] Update TUI path to use the shared workspace.
- [x] Run workspace and index tests.

### Task 5: Electron GUI first slice

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `src/gui/main.ts`
- Create: `src/gui/ipc.ts`
- Create: `src/gui/renderer-html.ts`
- Create: `src/gui/types.ts`
- Create: `test/unit/gui/ipc.test.ts`
- Create: `test/unit/gui/renderer-html.test.ts`
- Modify: `src/index.ts`
- Modify: `test/unit/index.test.ts`

- [x] Add Electron dependency.
- [x] Add failing CLI tests for `--gui` help, launch, and mutual exclusions.
- [x] Add failing IPC tests for typed handler registration including explicit run forwarding.
- [x] Implement GUI launch and IPC handler registration.
- [x] Implement renderer HTML shell with React root marker and functional IPC-driven controls.
- [x] Run GUI and index tests.

### Task 6: Verification

**Files:** all touched files

- [x] Run `pnpm build`.
- [x] Run `pnpm exec eslint "src/**/*.{ts,tsx}" "test/**/*.{ts,tsx}" --no-error-on-unmatched-pattern`.
- [x] Run `pnpm test`.
- [x] Review `git diff` for unintended changes and summarize remaining risks.
