# gh-issue-pipeline — AI Context Map

> **Stack:** raw-http | none | unknown | typescript

> 2 routes | 0 models | 0 components | 15 lib files | 1 env vars | 0 middleware | 100% test coverage
> **Token savings:** this file is ~1,500 tokens. Without it, AI exploration would cost ~13,000 tokens. **Saves ~11,500 tokens per conversation.**

---

# Routes

- `POST` `/repos/local/test-repo/pulls` [auth, ai] ✓
- `POST` `/repos/local/test-repo/issues/1/comments` [auth, ai] ✓

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
- `src/index.ts` — function run: (argv) => void
- `src/pipeline/issue-processor.ts` — class IssueProcessor
- `src/pipeline/prompts.ts`
  - function buildSpecPrompt: (issue) => string
  - function buildImplementationPrompt: (spec, repoName) => string
  - function buildReviewPrompt: (diff) => string
  - function buildFollowUpPrompt: (comments) => string
- `src/pipeline/runner.ts` — class PipelineRunner
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

- `src/types/index.ts` — imported by **19** files
- `src/ai/errors.ts` — imported by **9** files
- `src/config/state.ts` — imported by **9** files
- `src/ai/router.ts` — imported by **8** files
- `src/github/client.ts` — imported by **8** files
- `src/git/operations.ts` — imported by **5** files
- `src/config/index.ts` — imported by **5** files
- `src/pipeline/issue-processor.ts` — imported by **5** files
- `src/pipeline/test-runner.ts` — imported by **5** files
- `src/ai/base-wrapper.ts` — imported by **3** files
- `src/github/index.ts` — imported by **3** files
- `src/ai/index.ts` — imported by **3** files
- `src/pipeline/index.ts` — imported by **3** files
- `src/pipeline/runner.ts` — imported by **3** files
- `src/git/index.ts` — imported by **3** files
- `src/ai/claude-wrapper.ts` — imported by **2** files
- `src/ai/codex-wrapper.ts` — imported by **2** files
- `src/ai/ollama-wrapper.ts` — imported by **2** files
- `src/pipeline/prompts.ts` — imported by **2** files
- `src/config/config.ts` — imported by **1** files

## Import Map (who imports what)

- `src/types/index.ts` ← `src/ai/claude-wrapper.ts`, `src/ai/codex-wrapper.ts`, `src/ai/ollama-wrapper.ts`, `src/ai/router.ts`, `src/config/config.ts` +14 more
- `src/ai/errors.ts` ← `src/ai/base-wrapper.ts`, `src/ai/claude-wrapper.ts`, `src/ai/codex-wrapper.ts`, `src/ai/index.ts`, `src/ai/ollama-wrapper.ts` +4 more
- `src/config/state.ts` ← `src/ai/router.ts`, `src/config/index.ts`, `src/pipeline/issue-processor.ts`, `src/pipeline/runner.ts`, `test/integration/ai/router.test.ts` +4 more
- `src/ai/router.ts` ← `src/ai/index.ts`, `src/pipeline/issue-processor.ts`, `src/pipeline/runner.ts`, `test/integration/ai/router.test.ts`, `test/unit/ai/router.test.ts` +3 more
- `src/github/client.ts` ← `src/github/index.ts`, `src/github/index.ts`, `src/pipeline/issue-processor.ts`, `src/pipeline/runner.ts`, `test/unit/github/client.test.ts` +3 more
- `src/git/operations.ts` ← `src/git/index.ts`, `src/pipeline/issue-processor.ts`, `test/integration/git/operations.test.ts`, `test/unit/git/operations.test.ts`, `test/unit/pipeline/issue-processor.test.ts`
- `src/config/index.ts` ← `src/index.ts`, `test/integration/pipeline/e2e.test.ts`, `test/unit/config/config.test.ts`, `test/unit/config/state.test.ts`, `test/unit/index.test.ts`
- `src/pipeline/issue-processor.ts` ← `src/pipeline/index.ts`, `src/pipeline/runner.ts`, `test/unit/pipeline/issue-processor.test.ts`, `test/unit/pipeline/runner-perf.test.ts`, `test/unit/pipeline/runner.test.ts`
- `src/pipeline/test-runner.ts` ← `src/pipeline/index.ts`, `src/pipeline/index.ts`, `src/pipeline/issue-processor.ts`, `test/unit/pipeline/issue-processor.test.ts`, `test/unit/pipeline/test-runner.test.ts`
- `src/ai/base-wrapper.ts` ← `src/ai/claude-wrapper.ts`, `src/ai/codex-wrapper.ts`, `src/ai/ollama-wrapper.ts`

---

# Test Coverage

> **100%** of routes and models are covered by tests
> 15 test files found

## Covered Routes

- POST:/repos/local/test-repo/pulls
- POST:/repos/local/test-repo/issues/1/comments

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_