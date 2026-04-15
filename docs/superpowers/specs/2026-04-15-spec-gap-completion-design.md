# Spec Gap Completion Design

## Context

A local spec audit found several implemented-but-incomplete slices in the TUI/review pipeline and one large unimplemented GUI roadmap. The user asked to implement all identified gaps. Existing uncommitted work must be preserved.

## Goals

- Finish review-output humanization for remaining issue-processing AI warning paths.
- Fix TUI comment-field behavior so create mode never focuses a hidden comment field and `:comment` enters insert mode.
- Render relative comment timestamps in the loaded-issue form.
- Make loaded-issue layout intent explicit and testable: the editor/detail pane is the wider pane.
- Add a first Electron GUI slice behind `minion --gui` with typed workspace IPC, a React-marked renderer shell, and an explicit selected-issue pipeline run API that bypasses only issue eligibility while preserving branch/open-PR safety.

## Non-Goals

- Full desktop packaging/signing.
- Multi-run queueing or reliable cancellation.
- Replacing the TUI.
- Changing MAP routing behavior.
- Implementing MAP-side telemetry in this repository; Minion forwards optional telemetry/result events when present and otherwise logs a compatibility warning.

## Design

### TUI fixes

`VimProvider` receives a boolean `commentFieldEnabled`. Insert-mode Tab/Shift+Tab cycles over title/body only when no issue is loaded and over title/body/comment when editing. `:comment` uses a provider action that focuses the comment field and switches to insert mode. `IssueForm` renders relative timestamps from `IssueComment.createdAt` without new dependencies.

### Review-output fixes

Remaining AI invocation warnings in `IssueProcessor` use `humanizeAIError()` so terminal output does not leak raw JSON payloads.

### Layout clarification

The current split-pane mental model remains left editor/right table, but the implementation exposes `editorPane="left" | "right"` and defaults to left. Width allocation follows the editor pane so the editor/detail area is visibly wider. This satisfies the intent of a wider loaded issue editor while avoiding a disruptive pane swap from the original TUI v2 spec.

### GUI first slice

`--gui` launches a new Electron entry point and is mutually exclusive with service-run flags. A shared workspace factory wraps GitHub/config/state/MAP polish operations for both TUI and GUI. The GUI main process registers typed IPC handlers for repos, issues, comments, polish, and explicit issue runs. The renderer shell is an Electron-loaded HTML page with a React root marker and browser-side JavaScript that drives the workspace through IPC. The first implementation emphasizes functional workflow and tests over visual polish.

Explicit issue runs use a new `IssueProcessor.processIssue(repo, issue, { bypassEligibility: true })` option. Only the `shouldProcessIssue` gate is skipped; branch conflict detection, open-PR skip behavior, clone/branch/MAP/test/commit/push/PR/state logic remain inside `IssueProcessor`.

## Acceptance Criteria

- `IssueProcessor` AI review/follow-up warning paths log humanized AI errors without raw JSON payloads.
- Insert-mode Tab/Shift+Tab cycles title/body only in create mode and title/body/comment only when editing.
- `:comment` and `c` focus the comment field and enter insert mode when an issue is loaded.
- TUI comments display author, relative timestamp, and body.
- Editor/detail pane remains visibly wider than the navigator/table pane and is covered by tests.
- `--gui` appears in help and rejects combinations with `--tui`, `--repo`, `--config`, `--poll`, `--branch`, `--max-issues`, `--test-command`, `--model`, `--timeout`, and `--merge-method`.
- GUI startup resolves auth like TUI and loads default config repos.
- GUI IPC exposes repo listing, labels, open issues, issue detail, comments, create/update/comment/close, polish, and explicit run operations.
- Explicit issue runs bypass issue-state eligibility but preserve branch/open-PR safety through existing `IssueProcessor` flow.
- Tests, build, and lint pass.
