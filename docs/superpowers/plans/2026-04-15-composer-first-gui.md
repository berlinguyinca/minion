# Composer-First GUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tracker-first GUI with a compact issue composer-first workflow.

**Architecture:** Update the no-bundler renderer shell, CSS, and script in `src/gui/renderer-html.ts`; keep existing IPC.

**Tech Stack:** TypeScript, Electron, DOM APIs, Vitest.

---

### Task 1: Contract tests
- [ ] Add renderer contract tests for composer-first layout and shortcuts.
- [ ] Verify tests fail.

### Task 2: Renderer implementation
- [ ] Rewrite shell/CSS/script for composer-first flow.
- [ ] Verify targeted tests pass.

### Task 3: Verification
- [ ] Run build, lint, tests, launch GUI.
