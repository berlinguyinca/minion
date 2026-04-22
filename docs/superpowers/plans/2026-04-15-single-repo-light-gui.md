# Single-Repository Lightweight GUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the GUI around one active repo, a collapsible issue list, central editor, and collapsible MAP output.

**Architecture:** Keep the no-bundler renderer; update shell markup/CSS/script state and tests in `renderer-html.ts`.

**Tech Stack:** TypeScript, Electron, DOM APIs, Vitest.

---

### Task 1: Contract tests
- [ ] Add tests for searchable repo dropdown, collapsible issue list, central editor, collapsible MAP output, and shortcuts.
- [ ] Verify tests fail.

### Task 2: Renderer implementation
- [ ] Update HTML shell, CSS, and script state/actions.
- [ ] Verify targeted tests pass.

### Task 3: Verification
- [ ] Run build, lint, full tests, and launch GUI.
