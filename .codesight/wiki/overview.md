# gh-issue-pipeline — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**gh-issue-pipeline** is a typescript project built with raw-http.

## Scale

2 API routes · 19 library files · 1 environment variables

## Subsystems

- **[E2e.test](./e2e.test.md)** — 2 routes — touches: auth, ai

**Libraries:** 19 files — see [libraries.md](./libraries.md)

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `src/types/index.ts` — imported by **25** files
- `src/ai/errors.ts` — imported by **12** files
- `src/ai/router.ts` — imported by **10** files
- `src/github/client.ts` — imported by **10** files
- `src/config/state.ts` — imported by **9** files
- `src/git/operations.ts` — imported by **7** files

## Required Environment Variables

- `GITHUB_TOKEN` — `src/github/client.ts`

---
_Back to [index.md](./index.md) · Generated 2026-04-14_