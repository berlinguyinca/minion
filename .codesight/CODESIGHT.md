# gh-issue-pipeline — AI Context Map

> **Stack:** raw-http | none | unknown | typescript

> 2 routes (2 inferred) | 0 models | 0 components | 20 lib files | 1 env vars | 0 middleware | 100% test coverage
> **Token savings:** this file is ~1,700 tokens. Without it, AI exploration would cost ~15,500 tokens. **Saves ~13,800 tokens per conversation.**
> **Last scanned:** 2026-04-14 04:05 — re-run after significant changes

---

# Routes

- `POST` `/repos/local/test-repo/pulls` [auth, ai] `[inferred]` ✓
- `POST` `/repos/local/test-repo/issues/1/comments` [auth, ai] `[inferred]` ✓

---

# Libraries

- `src/ai/base-wrapper.ts`
  - function invokeProcess: (options) => Promise<InvokeProcessResult>
  - interface InvokeProcessOptions
  - interface InvokeProcessResult
- `src/ai/claude-wrapper.ts` — class ClaudeWrapper
- `src/ai/codex-wrapper.ts` — class CodexWrapper
- `src/ai/errors.ts`
  - class AITimeoutError
  - class AIBinaryNotFoundError
  - class AIInvocationError
- `src/ai/file-scanner.ts` — function scanModifiedFiles: (workingDir, beforeMs) => string[]
- `src/ai/map-wrapper.ts` — class MAPWrapper
- `src/ai/ollama-wrapper.ts` — class OllamaWrapper
- `src/ai/router.ts` — class AIRouter
- `src/config/config.ts` — function loadConfig: (configPath) => PipelineConfig
- `src/config/state.ts` — class StateManager
- `src/git/operations.ts`
  - function buildBranchName: (issueNumber, title) => string
  - function createTempDir: () => string
  - function cleanupTempDir: (dirPath) => void
  - class GitOperations
- `src/github/client.ts`
  - class GitHubClient
  - interface CreatePRParams
  - interface PRResult
- `src/index.ts` — function showStarPrompt: (state) => Promise<void>, function run: (argv) => void
- `src/pipeline/issue-processor.ts` — class IssueProcessor
- `src/pipeline/merge-processor.ts` — class MergeProcessor
- `src/pipeline/pr-review-processor.ts` — class PRReviewProcessor
- `src/pipeline/prompts.ts`
  - function buildSpecPrompt: (issue) => string
  - function buildImplementationPrompt: (spec, repoName) => string
  - function buildReviewPrompt: (diff) => string
  - function buildFollowUpPrompt: (comments) => string
  - function buildAutoReviewPrompt: (diff) => string
  - function buildAutoReviewFixPrompt: (comments) => string
  - _...2 more_
- `src/pipeline/runner.ts` — class PipelineRunner
- `src/pipeline/spec-cache.ts` — class SpecCache
- `src/pipeline/test-runner.ts`
  - function detectTestCommand: (dir, repoConfig) => string | null
  - function runTests: (dir, command) => TestResult
  - interface TestResult

---

# Config

## Environment Variables

- `GITHUB_TOKEN` **required** — src/github/client.ts

## Config Files

- `tsconfig.json`

## Key Dependencies

- zod: ^3.23.0

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `src/types/index.ts` — imported by **27** files
- `src/ai/errors.ts` — imported by **12** files
- `src/ai/router.ts` — imported by **12** files
- `src/github/client.ts` — imported by **12** files
- `src/config/state.ts` — imported by **9** files
- `src/git/operations.ts` — imported by **9** files
- `src/pipeline/test-runner.ts` — imported by **7** files
- `src/git/index.ts` — imported by **7** files
- `src/config/index.ts` — imported by **6** files
- `src/pipeline/issue-processor.ts` — imported by **5** files
- `src/ai/base-wrapper.ts` — imported by **4** files
- `src/ai/file-scanner.ts` — imported by **4** files
- `src/pipeline/merge-processor.ts` — imported by **4** files
- `src/pipeline/pr-review-processor.ts` — imported by **4** files
- `src/pipeline/spec-cache.ts` — imported by **4** files
- `src/pipeline/prompts.ts` — imported by **4** files
- `src/github/index.ts` — imported by **3** files
- `src/ai/index.ts` — imported by **3** files
- `src/pipeline/index.ts` — imported by **3** files
- `src/pipeline/runner.ts` — imported by **3** files

## Import Map (who imports what)

- `src/types/index.ts` ← `src/ai/claude-wrapper.ts`, `src/ai/codex-wrapper.ts`, `src/ai/map-wrapper.ts`, `src/ai/ollama-wrapper.ts`, `src/ai/router.ts` +22 more
- `src/ai/errors.ts` ← `src/ai/base-wrapper.ts`, `src/ai/claude-wrapper.ts`, `src/ai/codex-wrapper.ts`, `src/ai/index.ts`, `src/ai/map-wrapper.ts` +7 more
- `src/ai/router.ts` ← `src/ai/index.ts`, `src/pipeline/issue-processor.ts`, `src/pipeline/merge-processor.ts`, `src/pipeline/pr-review-processor.ts`, `src/pipeline/runner.ts` +7 more
- `src/github/client.ts` ← `src/github/index.ts`, `src/github/index.ts`, `src/pipeline/issue-processor.ts`, `src/pipeline/merge-processor.ts`, `src/pipeline/pr-review-processor.ts` +7 more
- `src/config/state.ts` ← `src/ai/router.ts`, `src/config/index.ts`, `src/pipeline/issue-processor.ts`, `src/pipeline/runner.ts`, `test/integration/ai/router.test.ts` +4 more
- `src/git/operations.ts` ← `src/git/index.ts`, `src/pipeline/issue-processor.ts`, `src/pipeline/merge-processor.ts`, `src/pipeline/pr-review-processor.ts`, `test/integration/git/operations.test.ts` +4 more
- `src/pipeline/test-runner.ts` ← `src/pipeline/index.ts`, `src/pipeline/index.ts`, `src/pipeline/issue-processor.ts`, `src/pipeline/pr-review-processor.ts`, `test/unit/pipeline/issue-processor.test.ts` +2 more
- `src/git/index.ts` ← `src/pipeline/issue-processor.ts`, `src/pipeline/merge-processor.ts`, `src/pipeline/pr-review-processor.ts`, `src/pipeline/runner.ts`, `test/unit/pipeline/issue-processor.test.ts` +2 more
- `src/config/index.ts` ← `src/index.ts`, `test/integration/pipeline/e2e.test.ts`, `test/unit/config/config-non-error.test.ts`, `test/unit/config/config.test.ts`, `test/unit/config/state.test.ts` +1 more
- `src/pipeline/issue-processor.ts` ← `src/pipeline/index.ts`, `src/pipeline/runner.ts`, `test/unit/pipeline/issue-processor.test.ts`, `test/unit/pipeline/runner-perf.test.ts`, `test/unit/pipeline/runner.test.ts`

---

# Test Coverage

> **100%** of routes and models are covered by tests
> 22 test files found

## Covered Routes

- POST:/repos/local/test-repo/pulls
- POST:/repos/local/test-repo/issues/1/comments

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_