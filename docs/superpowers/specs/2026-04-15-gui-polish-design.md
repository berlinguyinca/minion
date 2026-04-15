# Electron GUI Polish and Efficiency Design

## Context

The first GUI slice added `minion --gui` with typed IPC and a functional Electron-rendered HTML shell. It works as a basic proof of workflow, but it is visually plain, uses ad-hoc DOM mutation, and does not yet present the issue workspace or MAP run state in a polished desktop style.

## Goal

Make the GUI feel like a usable Minion desktop app while keeping the implementation lightweight and efficient. The GUI should look intentional, handle loading/error/empty states gracefully, avoid wasteful DOM rebuilds where practical, and expose the explicit MAP run flow clearly.

## Scope

### In scope

- Replace the raw three-column shell with a polished app frame: sidebar, issue workspace, and run console.
- Add Minion-themed visual language: banana accent, dark surfaces, status chips, cards, subtle gradients, and accessible contrast.
- Add responsive layout behavior for narrower windows.
- Add loading, empty, selected, error, and success states for repos, issues, comments, and runs.
- Add efficient renderer helpers: centralized state, cached repo/issue/comment data, request sequencing to ignore stale responses, document fragments, event delegation, and small targeted render functions.
- Add semantic IDs/classes and `aria-live` status regions to support tests and accessibility.
- Keep dependency footprint unchanged beyond Electron already added.

### Out of scope

- Full React/Vite bundling.
- Desktop app packaging/signing.
- Advanced cancellation.
- MAP-side structured telemetry changes.
- Pixel-perfect screenshot testing.

## Design

`src/gui/renderer-html.ts` remains a self-contained renderer generator, but it is split into clear units:

- `createRendererStyles()` returns the visual system CSS.
- `createRendererScript()` returns the browser-side app controller.
- `createRendererHtml()` composes the HTML shell.

The renderer script owns one state object with selected repo, selected issue, caches, busy flags, and run status. Event delegation handles all click/input actions from stable container roots. Fetch helpers write to caches and use monotonically increasing request IDs so stale async responses cannot overwrite newer selections. Rendering uses small functions (`renderRepos`, `renderIssues`, `renderIssueDetail`, `renderComments`, `renderRunPanel`, `setStatus`) and `DocumentFragment` for lists.

The UI presents:

- **Sidebar:** repo search, repo list, refresh button, configured/API repo badges.
- **Issue list:** selected repo name, refresh button, cards for open issues, label pills, empty state.
- **Issue detail:** title/body editor, comment composer, comments list with timestamps, save/comment/close buttons.
- **Run panel:** Start MAP button, live status, compact result cards, JSON details fallback, telemetry warning when trace data is absent.

## Acceptance Criteria

- Renderer HTML includes a polished app shell with sidebar, issue workspace, and run panel landmarks.
- CSS includes theme variables, responsive media query, cards, buttons, pills, and accessible focus styles.
- Renderer script uses event delegation instead of per-button inline handlers.
- Renderer script uses caching/request sequencing for repo/issue/comment loads.
- Renderer script uses `DocumentFragment` for list rendering.
- Status messages use an `aria-live` region.
- Run results render human-friendly summary fields and a raw JSON fallback.
- Existing GUI IPC behavior remains unchanged.
- Build, lint, and tests pass.
