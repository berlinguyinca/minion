# Keyboard-Centric GUI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Electron GUI into a lean, fast, keyboard-centric issue tracker with native scrollbars, virtualized lists, and progress bars.

**Architecture:** Keep the existing no-bundler renderer and typed IPC. Rework `renderer-html.ts` around a top command bar, two-pane layout, virtualized list helper, global keyboard controller, and progress rendering.

**Tech Stack:** TypeScript, Electron, browser DOM APIs, Vitest.

---

### Task 1: Research-backed renderer contract tests

**Files:**
- Modify: `test/unit/gui/renderer-html.test.ts`

- [ ] Add tests for two-pane layout, command bar, native scroll containers, progress bars, keyboard shortcuts, command palette, help overlay, and virtualized list helper.
- [ ] Run tests to verify they fail against the current three-column renderer.

### Task 2: Renderer redesign implementation

**Files:**
- Modify: `src/gui/renderer-html.ts`

- [ ] Implement lean two-pane shell and top command bar.
- [ ] Add compact native-scroll CSS and progress bars.
- [ ] Add `renderVirtualList()` helper with overscan and spacer elements.
- [ ] Add keyboard shortcut controller and overlay rendering.
- [ ] Preserve issue editing, comments, close, and MAP run actions.
- [ ] Run targeted GUI tests.

### Task 3: Launcher durability

**Files:**
- Modify: `src/gui/main.ts`
- Create/Modify: `test/unit/gui/main.test.ts`

- [ ] Add test coverage for launching through Electron binary when `electron.app` is unavailable under Node.
- [ ] Keep the GUI process alive until Electron quits.
- [ ] Run targeted GUI tests.

### Task 4: Verification

**Files:** all touched files

- [ ] Run `pnpm build`.
- [ ] Run `pnpm exec eslint "src/**/*.{ts,tsx}" "test/**/*.{ts,tsx}" --no-error-on-unmatched-pattern`.
- [ ] Run `pnpm test`.
- [ ] Run `node dist/index.js --gui` and verify Electron process starts.
