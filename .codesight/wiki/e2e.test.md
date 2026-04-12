# E2e.test

> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.

The E2e.test subsystem handles **2 routes** and touches: auth, ai.

## Routes

- `POST` `/repos/local/test-repo/pulls` [auth, ai]
  `test/integration/pipeline/e2e.test.ts`
- `POST` `/repos/local/test-repo/issues/1/comments` [auth, ai]
  `test/integration/pipeline/e2e.test.ts`

## Source Files

Read these before implementing or modifying this subsystem:
- `test/integration/pipeline/e2e.test.ts`

---
_Back to [overview.md](./overview.md)_