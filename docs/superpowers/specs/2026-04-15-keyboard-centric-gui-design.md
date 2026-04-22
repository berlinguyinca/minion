# Keyboard-Centric GUI Redesign Design

## Research Inputs

- GitHub documents a `?` shortcut dialog, `/` search focus, `C` create issue, and `Enter`/`O` open issue shortcuts for issue lists.
- Linear documents `↑`/`↓` or `J`/`K` to highlight issues, `X` to select, `Esc` to clear selection, and `Cmd/Ctrl+K` to open a command bar.
- Jira documents `?` for shortcut discovery, `O` open, `M` comment, and `J`/`K` issue navigation.

## Goal

Make the Electron GUI a lean, fast, keyboard-centric issue tracker: two-pane layout, native scrolling, virtualized lists, command/help overlays, progress bars, and clear keyboard-first status feedback.

## Scope

### In scope

- Replace the three-column desktop shell with a lean two-pane tracker layout.
- Add keyboard model inspired by GitHub, Linear, and Jira:
  - `?` opens shortcuts.
  - `/` focuses repo/search input.
  - `j/k` and arrow keys move through the active issue list.
  - `Enter` or `o` opens the highlighted issue.
  - `c` creates/clears for a new issue.
  - `m` focuses comment composer.
  - `r` refreshes repos/issues.
  - `x` closes loaded issue.
  - `Cmd/Ctrl+K` opens command palette.
  - `Esc` closes overlays and returns focus to the issue list.
- Use native scrollbars with slim styling on repo, issue, comments, and run log panes.
- Virtualize repo and issue lists to keep DOM size bounded for hundreds of repos/issues.
- Show progress bars for repo loading, issue loading, detail/comment loading, save/comment/close actions, and MAP runs.
- Preserve IPC behavior and explicit MAP run flow.

### Out of scope

- Pixel-perfect clone of Linear/Jira/GitHub.
- Full global command execution engine beyond the first command palette actions.
- Drag/drop or board columns.
- Packaging/signing.

## Design

The renderer remains dependency-free and no-bundler. `createRendererHtml()` renders a top command/header bar, a left list pane, and a right detail pane. The right pane includes issue editing, comments, and MAP run output in stacked cards. Repos move into a compact selector at top-left rather than taking a full column.

Performance uses a reusable `renderVirtualList()` helper with native scroll containers, a fixed row height, top/bottom spacers, overscan, and stable event delegation. Repo and issue lists render only visible rows while preserving native scrollbars.

The keyboard controller ignores shortcuts while typing in inputs/textarea except `Escape` and command modifiers. Shortcuts update active issue index, open issues, focus fields, and toggle overlays. The help overlay and command palette are plain semantic overlays with `role="dialog"`.

Progress uses native `<progress>` elements and a shared progress strip. The UI shows current busy operation text and indeterminate bars where exact progress is unavailable.

## Acceptance Criteria

- HTML contains a lean two-pane shell with top command bar and no three-column app grid.
- CSS includes native scrollbar styling and compact issue tracker density.
- Renderer script contains keyboard shortcut handling for `?`, `/`, `j/k`, arrows, `Enter`/`o`, `c`, `m`, `r`, `x`, `Esc`, and `Cmd/Ctrl+K`.
- Renderer script uses a reusable `renderVirtualList()` helper for repos and issues.
- Renderer script bounds rendered list rows with overscan and spacer elements.
- Progress bars are present for global progress and MAP run progress.
- Help overlay lists the keyboard shortcuts.
- Command palette overlay exists and can be toggled.
- Existing GUI IPC tests continue to pass.
- Build, lint, and tests pass.
