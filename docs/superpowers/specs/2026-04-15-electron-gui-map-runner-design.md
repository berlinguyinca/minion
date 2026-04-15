# Electron GUI for Explicit MAP Issue Runs

## Context

`gh-issue-pipeline` currently provides a service mode and an Ink-based TUI. The TUI already supports repo selection, issue creation, issue loading, editing, comments, close actions, label loading, recent/open issue lists, Minion-flavored status messages, and optional MAP-powered polish. The requested GUI should preserve that workflow while adding a desktop split view that can start the pipeline for one selected GitHub issue and show live diagnostics.

`multi-agent-pipeline` already has headless and TUI execution paths with stage-level knowledge of spec, review, QA, execute, docs, adapter assignments, fallback chains, streamed output, and final results. It does not currently expose enough machine-readable telemetry for another app to show the actual runtime order of models used.

Both repositories currently have existing uncommitted work. Implementation must preserve those edits and keep changes scoped.

## Goals

- Add `minion --gui` to launch an Electron GUI based on React.
- Provide the same functional workflow as the current TUI.
- Reuse existing GitHub, config, auth, polish, and pipeline logic wherever practical.
- Let the user select one issue and explicitly start a MAP-backed pipeline run for that issue.
- Bypass processed/retry state eligibility for this explicit GUI action.
- Preserve current branch and open-PR safety behavior.
- Stream run output in a split view.
- Show the actual MAP stage, adapter, model, fallback, retry, status, and elapsed-time sequence used during the run.
- Modify MAP to emit the structured telemetry needed by the GUI.

## Non-Goals

- Multi-run queueing.
- Force delete or force reprocess controls.
- Replacing the existing TUI.
- Changing MAP routing or agent selection behavior.
- Adding a web server mode.
- Packaging, signing, or distributing desktop installers.
- A broad visual redesign beyond translating the existing TUI style into React/Electron.

## Architecture

`minion --gui` is a new desktop entry point beside `--tui`. The Electron main process owns filesystem, process, GitHub, config, MAP, and pipeline access. The renderer is a React UI that talks to the main process through typed IPC.

The current TUI dependency wiring should be extracted into a framework-neutral issue workspace layer. Ink and Electron should both consume this shared layer for:

- repo listing and config repo merging
- label fetching
- open issue fetching
- issue detail loading
- issue create, update, comment, and close operations
- MAP polish availability and execution
- persisted input-mode preferences where relevant

The GUI adds one operation to this shared surface: start an explicit issue pipeline run. That operation should call the existing pipeline processing path instead of launching MAP directly. This keeps Minion responsible for branch naming, clone/branch/push behavior, tests, PR creation, labels, state recording, retries after the run, and review/follow-up behavior.

MAP should expose structured telemetry from the execution paths that already know the real runtime sequence. Minion should consume those events through `MAPWrapper` and forward them to the GUI reporter.

## UI Design

The GUI should translate the current TUI workflow into a desktop layout with the same Minion personality and visual vocabulary.

Primary regions:

- Repo selector screen at startup.
- Main issue workspace after repo selection.
- Issue form/detail area for creating, editing, commenting, and closing issues.
- Issue list area with open and recent tabs.
- Run panel for the selected issue.

The run panel is the GUI-only addition. It should stay visible while the selected issue remains loaded and include:

- `Live log`: appended outer pipeline and MAP output.
- `Stage/model trace`: ordered table of actual runtime events.
- `Result`: final status, PR URL if created, draft status, tests, files changed, and humanized errors.

The first release should allow only one active run at a time. While a run is active, the start button is disabled or replaced by a best-effort cancel control if cancellation is supported.

## Data Flow

1. User runs `minion --gui`.
2. CLI parsing launches Electron. `--gui` is mutually exclusive with `--tui`, `--repo`, `--config`, `--poll`, and other service-run flags because the GUI owns repo selection and config loading after startup.
3. Electron main resolves auth from `GITHUB_TOKEN` or `gh auth token`.
4. Electron main loads `config.yaml`, `config.yml`, or `repos.json`.
5. Renderer requests repos, labels, open issues, issue details, comments, and polish through typed IPC.
6. User selects a repo and loads or creates issues using the same behavior as the TUI.
7. User presses `Start MAP` for a loaded issue.
8. Electron main fetches full issue detail and calls an explicit selected-issue pipeline API.
9. The explicit run bypasses only the state eligibility check that would skip already processed or retry-blocked issues.
10. Existing branch/open-PR safety remains unchanged.
11. The GUI reporter streams outer Minion pipeline events and nested MAP telemetry events to the renderer.
12. Renderer updates the live log, model trace, and final result.
13. Pipeline state is recorded normally after the run outcome is known.

If MAP does not support structured telemetry, the GUI should still run the issue and show raw output with a warning that detailed model trace requires a newer MAP build.

## MAP Telemetry

MAP should emit machine-readable events in addition to its existing final result. The event stream should cover classic pipeline stages and v2 DAG mode when used.

Required event fields:

- event type
- timestamp
- pipeline id when available
- stage or DAG step id
- logical agent or stage name
- adapter name
- model name when configured or discovered
- attempt number
- fallback source and target when failover happens
- status: started, chunk, completed, failed, skipped, retried
- elapsed milliseconds for completion/failure events
- error message for failures
- chunk length and optional raw chunk for log streaming

The final MAP headless result should include the trace collected during the run without breaking current consumers. Minion should treat the trace as optional for compatibility.

## Pipeline Changes

`gh-issue-pipeline` should add an explicit issue processing path. The path should reuse `IssueProcessor` and its existing dependencies, but it needs a controlled way to skip only `state.shouldProcessIssue(...)` for GUI-triggered runs.

The explicit path must still preserve:

- branch conflict detection
- open PR skip behavior
- orphan branch behavior as currently implemented
- clone, branch, MAP invocation, tests, commit, push, PR, label, review, follow-up, status comment, and state logic

The progress reporting surface should be extended with structured events. Console progress can keep its current output. The GUI reporter should receive event objects and forward them to Electron.

## Error Handling

Startup errors should be actionable:

- missing GitHub auth
- invalid config
- missing MAP binary
- MAP binary present but telemetry unavailable
- Electron launch failure

Issue operation errors should show inline status/toast messages and preserve local form state.

Pipeline errors should preserve all logs and trace events collected so far. If a draft PR is created after a partial failure, the result tab should show it. MAP JSON parse errors, timeouts, and AI invocation failures should use the existing humanized error path where possible.

Cancellation is best-effort in the first release. If the current process graph cannot be interrupted cleanly, the UI should say so rather than pretending the run stopped.

## Testing

`gh-issue-pipeline` coverage:

- CLI help and parse behavior for `--gui`.
- Mutual exclusion between `--gui`, `--tui`, `--repo`, `--config`, `--poll`, and other service-run flags.
- Shared workspace service behavior with mocked GitHub/config/auth dependencies.
- Full TUI dependency parity through the shared workspace layer.
- Explicit issue processing bypasses state eligibility.
- Explicit issue processing preserves branch/open-PR safety.
- GUI reporter emits ordered outer pipeline events.
- MAP telemetry events are forwarded to the renderer.
- Electron IPC handlers with mocked dependencies.
- Renderer behavior for issue list/detail/form, comments, run state, live log, model trace, and result rendering.

`multi-agent-pipeline` coverage:

- Classic stage telemetry for spec, review, QA, execute, and docs.
- Actual adapter/model order including fallback attempts.
- Partial telemetry retained on failure.
- Final headless result includes optional trace data.
- v2 DAG telemetry emits step, agent, adapter, model, and security-gate events when applicable.

Verification commands:

- `pnpm test`
- `pnpm build`
- Targeted GUI renderer and IPC tests once added.
- A local smoke test that launches `minion --gui`, loads issues, and streams a fake or real MAP run.

## Open Implementation Notes

Electron and React will add new dependencies to `gh-issue-pipeline`. This is explicitly part of the requested GUI feature, but dependency choices should remain minimal. Prefer Electron, Vite or a similarly standard renderer build path, and existing React versions already present in the project.

The implementation should avoid copying Ink component internals directly. Shared behavior belongs in framework-neutral services and types; UI-specific rendering belongs in Ink or React components.

The first implementation plan should sequence MAP telemetry before the GUI run panel depends on it. The GUI can be built against mocked telemetry events first, but final verification should use the real MAP event path.
