# GUI GitHub loading speed design

## Root cause
The GUI currently makes a full GitHub repository listing call before the repo picker becomes useful. In `ipc.ts`, `listRepos` waits for `workspace.listUserRepos()` even though configured repos are already available locally. In the renderer, the repo list is replaced by a loading state while a refresh is in flight, so any previously known repos disappear. Opening an issue also fetches issue detail and comments sequentially.

## Goal
Make the GUI feel responsive while GitHub calls are still in flight. Users should be able to see known/configured repos quickly, keep seeing cached repo choices during refresh, and open issue details with fewer sequential waits.

## Design
1. Allow `listRepos` IPC to accept `{ includeApi: false }`, returning configured repos immediately without calling GitHub.
2. Renderer startup uses a fast two-stage repo load: show localStorage cached repos if present, fetch configured repos only, then refresh the full GitHub repo list in the background.
3. Renderer repo dropdown keeps showing existing repos during refresh instead of replacing them with a loading card.
4. Issue opening fetches issue detail and comments concurrently with `Promise.all` when either part is uncached.
5. Preserve existing request sequencing so stale slower responses do not overwrite newer selections.

## Tests
- IPC verifies config-only repo loading does not call the GitHub repo listing method.
- Renderer tests verify cached repo helpers, two-stage repo loading, and no blanking while repo refresh is busy.
- Renderer tests verify issue detail and comments are fetched with `Promise.all`.
