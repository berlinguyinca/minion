# Libraries

> **Navigation aid.** Library inventory extracted via AST. Read the source files listed here before modifying exported functions.

**19 library files** across 6 modules

## Ai (8 files)

- `src/ai/base-wrapper.ts` — invokeProcess, InvokeProcessOptions, InvokeProcessResult
- `src/ai/errors.ts` — AITimeoutError, AIBinaryNotFoundError, AIInvocationError
- `src/ai/claude-wrapper.ts` — ClaudeWrapper
- `src/ai/codex-wrapper.ts` — CodexWrapper
- `src/ai/file-scanner.ts` — scanModifiedFiles
- `src/ai/map-wrapper.ts` — MAPWrapper
- `src/ai/ollama-wrapper.ts` — OllamaWrapper
- `src/ai/router.ts` — AIRouter

## Pipeline (6 files)

- `src/pipeline/prompts.ts` — buildSpecPrompt, buildImplementationPrompt, buildReviewPrompt, buildFollowUpPrompt, buildConflictResolutionPrompt
- `src/pipeline/test-runner.ts` — detectTestCommand, runTests, TestResult
- `src/pipeline/issue-processor.ts` — IssueProcessor
- `src/pipeline/merge-processor.ts` — MergeProcessor
- `src/pipeline/runner.ts` — PipelineRunner
- `src/pipeline/spec-cache.ts` — SpecCache

## Config (2 files)

- `src/config/config.ts` — loadConfig
- `src/config/state.ts` — StateManager

## Git (1 files)

- `src/git/operations.ts` — buildBranchName, createTempDir, cleanupTempDir, GitOperations

## Github (1 files)

- `src/github/client.ts` — GitHubClient, CreatePRParams, PRResult

## Index.ts (1 files)

- `src/index.ts` — showStarPrompt, run

---
_Back to [overview.md](./overview.md)_