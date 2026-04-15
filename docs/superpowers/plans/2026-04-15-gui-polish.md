# Electron GUI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Electron GUI shell into a visually intentional, responsive, and efficient issue workspace.

**Architecture:** Keep the no-bundler Electron renderer, but split the HTML generator into styles/script/composition helpers. The browser controller uses centralized state, event delegation, caches, request sequencing, and targeted render functions.

**Tech Stack:** TypeScript, Electron, browser DOM APIs, Vitest.

---

### Task 1: Renderer polish contract tests

**Files:**
- Modify: `test/unit/gui/renderer-html.test.ts`

- [x] Add tests asserting the shell has sidebar/workspace/run landmarks, aria-live status, polished CSS classes, responsive media query, event delegation, caching/request sequencing, DocumentFragment usage, and run-result summary rendering hooks.
- [x] Run the renderer tests and verify they fail against the current plain shell.

### Task 2: Renderer HTML/CSS/script implementation

**Files:**
- Modify: `src/gui/renderer-html.ts`

- [x] Export `createRendererStyles()` and `createRendererScript()`.
- [x] Replace the plain shell with a polished app frame.
- [x] Implement theme variables, cards, pills, status chips, focus styles, loading/empty/error states, and responsive layout.
- [x] Implement centralized browser state, event delegation, caches, request IDs, DocumentFragment list rendering, and targeted render functions.
- [x] Render run summaries and raw JSON fallback.
- [x] Run renderer tests and verify they pass.

### Task 3: Verification

**Files:** all touched files

- [x] Run targeted GUI tests.
- [x] Run `pnpm build`.
- [x] Run `pnpm exec eslint "src/**/*.{ts,tsx}" "test/**/*.{ts,tsx}" --no-error-on-unmatched-pattern`.
- [x] Run `pnpm test`.
