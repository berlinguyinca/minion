# GUI copy/paste and MAP text optimization design

## Goal
Allow the Electron GUI to behave like a normal desktop editor for issue drafts: users can copy, cut, paste, and select text reliably, then ask MAP to improve either the issue description or the pending comment. The optimized text must be previewed in a dialog before it replaces the visible field.

## Assumptions
- "Issue text" means the editable issue description/body and the new comment composer.
- Existing `polishIssueText` already invokes the `map` binary, so the GUI should reuse and extend that path instead of adding a new AI dependency.
- MAP should be prompted to explain the desired work clearly from available context, while avoiding unsupported invention.

## Design
1. Electron main process installs a native Edit menu with undo/redo/cut/copy/paste/select-all roles. This restores standard keyboard shortcuts in packaged and Node-launched Electron runs.
2. The renderer gains two Optimize with MAP buttons: one for the issue description and one for the comment composer.
3. Optimization sends MAP the selected repository, selected issue, existing description, current comment draft, and visible comments as context. MAP returns a JSON result with either an optimized `body` or optimized `comment`.
4. The renderer opens a modal preview dialog containing the proposed text. Nothing is changed until the user clicks the dialog's update button.
5. The apply button updates only the local field (`issue-body` or `comment-body`). Users still choose whether to save the issue description or post the comment with the existing buttons.

## Error handling
- If no repo/issue context is available, the optimizer still works with the current draft text.
- Empty target text is rejected in the renderer with a status message.
- MAP errors are surfaced in the progress/status label and do not mutate local text.
- If MAP returns no meaningful change, the dialog shows the original optimized result only when provided; otherwise the status reports that no changes were suggested.

## Tests
- Renderer HTML exposes optimize buttons and a confirmation dialog.
- Renderer script routes description/comment optimization through the existing polish IPC channel, includes context, and applies text only after confirmation.
- AI polish tests verify the MAP prompt includes target/context guidance and can return comment-only results.
- GUI main launcher tests verify the native Edit menu wiring for copy/paste shortcuts.
