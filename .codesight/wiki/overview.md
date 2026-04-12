# gh-issue-pipeline — Overview

> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.

**gh-issue-pipeline** is a typescript project built with raw-http.

## Scale

2 API routes · 1 environment variables

## Subsystems

- **[E2e.test](./e2e.test.md)** — 2 routes — touches: auth, ai

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `src/types/index.ts` — imported by **19** files
- `src/ai/errors.ts` — imported by **9** files
- `src/config/state.ts` — imported by **9** files
- `src/ai/router.ts` — imported by **8** files
- `src/github/client.ts` — imported by **8** files
- `src/git/operations.ts` — imported by **5** files

## Required Environment Variables

- `GITHUB_TOKEN` — `src/github/client.ts`

---
_Back to [index.md](./index.md) · Generated 2026-04-11_