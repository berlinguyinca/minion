# Single-Repository Lightweight GUI Design

## Goal

Make the GUI lighter by optimizing for one active repository at a time: a compact searchable repo dropdown, a collapsible left issue list, a center issue editor/viewer, and a collapsible MAP output panel below the editor.

## Design

The top bar contains only the brand, a searchable repository dropdown, refresh controls, and global progress. The app body is a two-region layout: a collapsible issue list on the left and a main work area in the center. The main work area contains the issue editor and comments, with MAP output below it in a collapsible panel. All large lists use native scrollbars and bounded rendering.

Keyboard shortcuts remain lightweight: `/` focuses the repo dropdown search, `j/k` move issue focus, `Enter` opens the focused issue, `[` toggles the issue list, `]` toggles MAP output, `m` focuses comments, `r` refreshes, and `?` opens help.

## Acceptance Criteria

- Repository selector is a small searchable dropdown, not a full list pane.
- Issue list is on the left and can be collapsed.
- Issue editor/viewer is the central focus.
- MAP output is below the editor and can be collapsed.
- Native scrollbars remain for issue list, comments, and MAP output.
- Progress bar remains visible in the top bar.
- Keyboard help documents the new collapse shortcuts.
