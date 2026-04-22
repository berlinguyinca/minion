# GUI progressive GitHub loading design

## Goal
Make the GUI feel responsive on large GitHub accounts and large repositories by avoiding all-or-nothing network waits.

## Scope
Implement the next performance tranche for the Electron GUI only while preserving existing CLI/pipeline behavior:

1. Progressive issue loading: fetch and render the first page of open issues quickly, then fetch additional pages in the background.
2. Persistent issue summary cache: show cached issues for a selected repo immediately and refresh in the background.
3. Stale request protection/cancellation hooks: prevent older in-flight issue list loads from continuing through the renderer path when a newer repo selection supersedes them.
4. Lightweight timing/status metadata: expose elapsed milliseconds and source labels in GUI progress text so slow paths are visible.
5. Direct owner/name entry remains available for first launch when no repos are cached/configured.

## Non-goals
- Do not refactor the whole renderer out of `renderer-html.ts` in this pass.
- Do not change pipeline issue processing semantics; full issue listing remains available for non-GUI callers.
- Do not add dependencies.

## Tests
- GitHub client can fetch one page of open issues and report `hasNextPage`.
- Workspace exposes the paged issue API while preserving existing full-list API.
- GUI IPC forwards paged issue requests.
- Renderer script contains progressive loading, persistent cache, stale request cancellation, and timing markers.

## Follow-up additions in this pass
- Pinned repos: store favorite repo keys locally and render them before other repos in the picker.
- Conditional issue-page requests: store page ETags with cached issue summaries and send `If-None-Match` on refresh.
- Network abort plumbing: each paged issue request gets a request id and AbortSignal through IPC into the GitHub client; superseded loads call `cancelRequest`.
