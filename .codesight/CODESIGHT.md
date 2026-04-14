# minion — AI Context Map

> **Stack:** raw-http | none | react | typescript

> 2 routes (2 inferred) | 0 models | 11 components | 21 lib files | 1 env vars | 0 middleware | 100% test coverage
> **Token savings:** this file is ~2,200 tokens. Without it, AI exploration would cost ~19,300 tokens. **Saves ~17,200 tokens per conversation.**
> **Last scanned:** 2026-04-14 17:08 — re-run after significant changes

---

# Routes

- `POST` `/repos/local/test-repo/pulls` [auth, ai] `[inferred]` ✓
- `POST` `/repos/local/test-repo/issues/1/comments` [auth, ai] `[inferred]` ✓

---

# Components

- **HelpOverlay** — `src/cli/components/HelpOverlay.tsx`
- **IssueForm** — props: title, body, labels, onTitleChange, onBodyChange, active, editingIssue, formField — `src/cli/components/IssueForm.tsx`
- **IssueTable** — props: openIssues, recentIssues, active, cursor, tab — `src/cli/components/IssueTable.tsx`
- **MessageToast** — props: message, variant — `src/cli/components/MessageToast.tsx`
- **RepoSelector** — props: repos, onSelect — `src/cli/components/RepoSelector.tsx`
- **SplitPane** — props: left, right — `src/cli/components/SplitPane.tsx`
- **StatusBar** — props: repo, message — `src/cli/components/StatusBar.tsx`
- **TextField** — props: label, value, onChange, active, multiline — `src/cli/components/TextField.tsx`
- **VimProvider** — props: onAction, onCommand — `src/cli/components/VimProvider.tsx`
- **PromptComponent** — props: question, onSubmit — `src/cli/ink-prompt.tsx`
- **App** — props: deps — `src/cli/tui.tsx`

---

# Libraries

- `src/ai/base-wrapper.ts`
  - function invokeProcess: (options) => Promise<InvokeProcessResult>
  - interface InvokeProcessOptions
  - interface InvokeProcessResult
- `src/ai/errors.ts`
  - function detectRateLimitError: (model, exitCode, rawOutput) => AIRateLimitError | undefined
  - function humanizeAIError: (err) => string
  - class AITimeoutError
  - class AIBinaryNotFoundError
  - class AIInvocationError
  - class AIRateLimitError
- `src/ai/file-scanner.ts` — function scanModifiedFiles: (workingDir, beforeMs) => string[]
- `src/ai/map-wrapper.ts` — class MAPWrapper
- `src/ai/polish.ts` — function polishIssueText: (title, body) => Promise<
- `src/cli/env.ts` — function loadDotEnv: (envPath) => void
- `src/cli/hooks/useDeps.ts`
  - function useDeps: () => TuiDeps
  - interface TuiDeps
  - const DepsContext
- `src/cli/hooks/useVim.ts`
  - function useVim: () => VimContextValue
  - interface VimState
  - interface VimActions
  - type VimMode
  - type Pane
  - type FormField
  - _...2 more_
- `src/cli/onboarding.ts` — function runOnboarding: (options) => Promise<number>, interface OnboardingOptions
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
  - function buildReviewPrompt: (diff) => string
  - function buildFollowUpPrompt: (comments) => string
  - function buildAutoReviewPrompt: (diff, changedFiles) => string
  - function buildSplitPlanPrompt: (diff, changedFiles) => string
  - function buildConflictResolutionPrompt: (conflict) => string
- `src/pipeline/runner.ts` — class PipelineRunner
- `src/pipeline/spec-cache.ts` — class SpecCache
- `src/pipeline/test-runner.ts`
  - function detectTestCommand: (dir, repoConfig) => string | null
  - function runTests: (dir, command) => TestResult
  - interface TestResult

---

# Config

## Environment Variables

- `GITHUB_TOKEN` **required** — .env.example

## Config Files

- `.env.example`
- `tsconfig.json`

## Key Dependencies

- react: ^18.3.1
- zod: ^3.23.0

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `src/types/index.ts` — imported by **27** files
- `src/github/client.ts` — imported by **11** files
- `src/cli/theme.ts` — imported by **9** files
- `src/git/operations.ts` — imported by **8** files
- `src/pipeline/test-runner.ts` — imported by **7** files
- `src/git/index.ts` — imported by **7** files
- `src/cli/hooks/useVim.ts` — imported by **6** files
- `src/config/state.ts` — imported by **6** files
- `src/config/index.ts` — imported by **6** files
- `src/ai/errors.ts` — imported by **5** files
- `src/cli/components/VimProvider.tsx` — imported by **5** files
- `src/pipeline/issue-processor.ts` — imported by **5** files
- `src/ai/base-wrapper.ts` — imported by **4** files
- `src/cli/tui.tsx` — imported by **4** files
- `src/pipeline/merge-processor.ts` — imported by **4** files
- `src/pipeline/pr-review-processor.ts` — imported by **4** files
- `src/pipeline/spec-cache.ts` — imported by **4** files
- `src/pipeline/prompts.ts` — imported by **4** files
- `src/cli/components/HelpOverlay.tsx` — imported by **3** files
- `src/cli/hooks/useDeps.ts` — imported by **3** files

## Import Map (who imports what)

- `src/types/index.ts` ← `src/ai/map-wrapper.ts`, `src/cli/onboarding.ts`, `src/config/config.ts`, `src/config/state.ts`, `src/git/operations.ts` +22 more
- `src/github/client.ts` ← `src/github/index.ts`, `src/github/index.ts`, `src/pipeline/issue-processor.ts`, `src/pipeline/merge-processor.ts`, `src/pipeline/pr-review-processor.ts` +6 more
- `src/cli/theme.ts` ← `src/cli/components/HelpOverlay.tsx`, `src/cli/components/IssueForm.tsx`, `src/cli/components/IssueTable.tsx`, `src/cli/components/MessageToast.tsx`, `src/cli/components/RepoSelector.tsx` +4 more
- `src/git/operations.ts` ← `src/git/index.ts`, `src/pipeline/issue-processor.ts`, `src/pipeline/merge-processor.ts`, `src/pipeline/pr-review-processor.ts`, `test/integration/git/operations.test.ts` +3 more
- `src/pipeline/test-runner.ts` ← `src/pipeline/index.ts`, `src/pipeline/index.ts`, `src/pipeline/issue-processor.ts`, `src/pipeline/pr-review-processor.ts`, `test/unit/pipeline/issue-processor.test.ts` +2 more
- `src/git/index.ts` ← `src/pipeline/issue-processor.ts`, `src/pipeline/merge-processor.ts`, `src/pipeline/pr-review-processor.ts`, `src/pipeline/runner.ts`, `test/unit/pipeline/issue-processor.test.ts` +2 more
- `src/cli/hooks/useVim.ts` ← `src/cli/components/IssueForm.tsx`, `src/cli/components/StatusBar.tsx`, `src/cli/components/TextField.tsx`, `src/cli/components/VimProvider.tsx`, `src/cli/tui.tsx` +1 more
- `src/config/state.ts` ← `src/config/index.ts`, `src/pipeline/issue-processor.ts`, `src/pipeline/runner.ts`, `test/unit/pipeline/issue-processor.test.ts`, `test/unit/pipeline/runner-perf.test.ts` +1 more
- `src/config/index.ts` ← `src/index.ts`, `test/integration/pipeline/e2e.test.ts`, `test/unit/config/config-non-error.test.ts`, `test/unit/config/config.test.ts`, `test/unit/config/state.test.ts` +1 more
- `src/ai/errors.ts` ← `src/ai/base-wrapper.ts`, `src/ai/index.ts`, `src/ai/map-wrapper.ts`, `src/pipeline/issue-processor.ts`, `test/unit/ai/map-wrapper.test.ts`

---

# Test Coverage

> **100%** of routes and models are covered by tests
> 31 test files found

## Covered Routes

- POST:/repos/local/test-repo/pulls
- POST:/repos/local/test-repo/issues/1/comments

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_