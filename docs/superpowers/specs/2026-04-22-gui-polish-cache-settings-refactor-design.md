# GUI polish, cache settings, and renderer split design

## Goal
Finish the remaining non-blocking GUI improvements:

1. Show cache status clearly: cached, refreshing, fresh, unchanged, or error.
2. Add a settings/preferences dialog for pinned repos, MAP command guidance, and cache clearing.
3. Add a clear GitHub cache action.
4. Persist issue detail and comment caches in addition to issue summaries.
5. Reduce `renderer-html.ts` responsibility by splitting styles and script generation into separate modules while preserving its public exports.
6. Add a repeatable timed GUI smoke-test checklist artifact for real GitHub/Electron validation.

## Non-goals
- Do not add dependencies.
- Do not store GitHub tokens or credentials in browser storage.
- Do not make runtime config editing mutate `config.yaml`; settings dialog is for local GUI cache/pin controls and MAP command visibility/guidance.

## Design
- Renderer state gains `cacheStatus` and dialog visibility for settings.
- Cache status is rendered in the command bar and updated by repo/issue/detail/comment cache paths.
- Settings dialog includes pinned repo list, cache clear button, and MAP command config guidance.
- Issue detail and comments are persisted in localStorage with bounded entries.
- Renderer generator is split into `renderer-styles.ts`, `renderer-script.ts`, and `renderer-html.ts` re-exports.
- Manual timing checklist is saved under docs so live timing can be repeated consistently.

## Tests
- Renderer HTML exposes settings/cache status/cache clear controls.
- Renderer script contains persisted issue detail/comment cache helpers and updates cache status.
- Public `renderer-html.ts` exports remain compatible.
- Existing full build/lint/test suite passes.
