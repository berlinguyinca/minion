# TUI Issue Creator — Implementation Plan (Revision 2)

**Date:** 2026-04-14
**Feature:** `minion --tui` subcommand — keyboard-driven, fzf-style interactive CLI for rapid-fire GitHub issue creation
**Complexity:** MEDIUM
**Estimated scope:** ~6 new/modified files, ~800-1200 lines of new code + tests
**Revision history:** Rev 1 → Rev 2: incorporated Architect + Critic feedback (5 Architect improvements, 3 Critic major findings, 5 Critic minor findings)

---

## Prerequisites

**Coverage baseline is currently broken.** The working tree has in-progress refactoring (deleted `claude-wrapper.ts`, `codex-wrapper.ts`, `ollama-wrapper.ts`, `router.ts`) that drops coverage to ~90%. This plan targets 100% coverage **for all new TUI code only**. Restoring overall coverage from the refactoring is tracked separately and is NOT in scope.

---

## RALPLAN-DR Summary

### Principles (5)

1. **Speed is king** — Every interaction should be minimal keystrokes. Await API calls (200-500ms is imperceptible while typing) but never block unnecessarily.
2. **Minimal dependency surface** — Install only the 3 specific `@inquirer/*` packages needed, not the umbrella. Project goes from 3 → 6 runtime deps.
3. **Testability over cleverness** — DI at the data level (plain functions), not the widget level. Follow the existing `src/cli/onboarding.ts` DI pattern.
4. **Coexistence, not intrusion** — `--tui` flag via existing `parseArgs`, not a positional subcommand. Zero changes to existing code paths.
5. **Type safety throughout** — Strict TypeScript, no `any` escapes, explicit error types.

### Decision Drivers (top 3)

1. **ESM compatibility** — Must work in ESM-only project with NodeNext resolution.
2. **Fuzzy search UX** — fzf-style interactive filtering for repo selection and label multi-select is the core value proposition.
3. **100% test coverage** — DI interface must enable full coverage with `vi.fn()` mocks, no terminal interaction needed in tests.

### Viable Options

#### Option A: `@inquirer/search` + `@inquirer/input` + `@inquirer/checkbox` (CHOSEN)

| Dimension | Assessment |
|-----------|------------|
| ESM support | Native ESM (`"type": "module"`) |
| Fuzzy search | `@inquirer/search` with async source callback — exact match for fzf-style UX |
| Multi-select | `@inquirer/checkbox` with filtering |
| Text input | `@inquirer/input` with validation |
| Dependency weight | 3 packages + shared `@inquirer/core` peer |
| Testability | Each prompt is a standalone function; mockable via data-level DI |
| **Pros** | Built-in search prompt; each component independently importable; ESM-native |
| **Cons** | Doubles the runtime dependency count (3 → 6) |

#### Option B: `@clack/prompts` + `fuse.js` — REJECTED

| Dimension | Assessment |
|-----------|------------|
| **Rejection rationale** | No built-in search/autocomplete prompt. Would require building a custom `@clack/core` prompt wrapping `fuse.js` for fuzzy filtering — 100+ lines of custom terminal rendering code that is itself hard to test. The fuzzy search is the core UX requirement. |

#### Option C: `readline/promises` + ANSI escapes — REJECTED

| Dimension | Assessment |
|-----------|------------|
| **Rejection rationale** | Could handle basic prompts (title, body) but fuzzy search with incremental filtering, scrollable results, and debouncing requires 200+ lines of terminal rendering code. This is the exact problem that `@inquirer/search` solves in ~19KB of well-maintained code. The dependency cost (3 packages from a single maintainer) is proportional to the UX value. |

### ADR

- **Decision:** Use `@inquirer/search`, `@inquirer/input`, `@inquirer/checkbox` individually
- **Drivers:** Native fuzzy search, ESM compatibility, modular imports, minimal dependency surface
- **Alternatives considered:** `@clack/prompts` (no fuzzy search), `readline/promises` (200+ lines of custom rendering), `ink` (React dependency, wrong paradigm)
- **Why chosen:** Only option providing fzf-style search out of the box without custom prompt development
- **Consequences:** Adds 3 production deps (+ shared `@inquirer/core` peer); all ESM-native
- **Follow-ups:** If search performance is insufficient for large repo lists, add `fuse.js` as the source function

---

## Requirements Summary

### What We're Building

A `minion --tui` flag that launches a fast, keyboard-driven interface for creating GitHub issues:

1. **Repo Selection** — Fuzzy search across config.yaml repos + on-demand user's GitHub repos
2. **Title** (required) — Single-line text input
3. **Body** (required) — Single-line text input (speed-first; complex bodies use the web UI)
4. **Labels** (optional) — Fuzzy multi-select from repo's existing labels + free-form entry; skip with Enter
5. **Submit** — Awaited (200-500ms), then shows result in status line
6. **Status Line** — Inline success/error message after submission
7. **Loop** — Returns to Title prompt (same repo). "Switch repo" menu option between issues. Ctrl+C exits.

### What We're NOT Building

- No split-panel UI, no dashboard
- No issue editing/viewing/searching
- No integration with the pipeline runner
- No multi-line editor for body (speed-first design)

---

## Implementation Steps

### Step 1: Add New GitHub Client Methods

**File:** `src/github/client.ts`
**Test file:** `test/unit/github/client.test.ts` (existing file, add tests)

Add three new methods to `GitHubClient`:

```typescript
async createIssue(
  owner: string, name: string, title: string, body: string, labels?: string[]
): Promise<{ number: number; url: string }>
```
- Uses `this.octokit.issues.create({ owner, repo: name, title, body, labels })`
- Wraps errors via existing `wrapError()` pattern (lines 28-42)
- Returns `{ number, url }` for status feedback

```typescript
async fetchLabels(owner: string, name: string): Promise<string[]>
```
- Uses `this.octokit.issues.listLabelsForRepo({ owner, repo: name, per_page: 100 })`
- Paginates like `fetchOpenIssues` does (lines 66-83)
- Returns `string[]` of label names (sorted alphabetically)

```typescript
async listUserRepos(): Promise<Array<{ owner: string; name: string; description: string }>>
```
- Uses `this.octokit.repos.listForAuthenticatedUser({ per_page: 100, sort: 'updated', affiliation: 'owner,collaborator,organization_member' })`
- Returns the authenticated user's accessible repos (own + org + collaborator)
- NOT `octokit.search.repos()` (which searches all of GitHub and returns millions of irrelevant results)
- Paginates for users with >100 repos
- Wraps errors via `wrapError()` (using empty string for owner/repo since this is user-scoped)

**Why `listUserRepos` not `searchRepos`:** The spec says repos come from config + GitHub API. The GitHub Search API (`/search/repositories`) searches ALL public repos, which would return millions of results for common queries. `listForAuthenticatedUser` with `affiliation` parameter returns only repos the user has access to, which is the correct semantic. Fuzzy filtering happens client-side via `@inquirer/search`.

**Acceptance Criteria:**
- All three methods follow existing `wrapError()` error handling pattern
- `fetchLabels` paginates correctly for repos with >100 labels
- `listUserRepos` returns repos across owner, collaborator, and org affiliations
- 100% test coverage with mocked Octokit

### Step 2: Install Dependencies

**Files:** `package.json`

```bash
pnpm add @inquirer/search @inquirer/input @inquirer/checkbox
```

These are **production dependencies** (not dev) because the TUI is a runtime feature invoked by end users, consistent with how `@octokit/rest` is in `dependencies`.

**Do NOT** install the umbrella `@inquirer/prompts` — it includes 7 unused sub-packages (`confirm`, `editor`, `expand`, `password`, `rawlist`, `number`, `select`).

**Acceptance Criteria:**
- `@inquirer/search`, `@inquirer/input`, `@inquirer/checkbox` appear in `dependencies`
- `pnpm build` passes (TypeScript resolves the new imports)
- Existing tests still pass

### Step 3: Create TUI Module

**File:** `src/cli/tui.ts` (NEW)

**Exported function:**
```typescript
export async function runTui(deps: TuiDeps): Promise<number>
```

**`TuiDeps` interface — Data-level DI** (follows `src/cli/onboarding.ts:7-20` pattern):
```typescript
export interface TuiDeps {
  // Data layer (injected from GitHubClient in production, vi.fn() in tests)
  listUserRepos: () => Promise<Array<{ owner: string; name: string; description: string }>>
  fetchLabels: (owner: string, name: string) => Promise<string[]>
  createIssue: (owner: string, name: string, title: string, body: string, labels: string[]) => Promise<{ number: number; url: string }>
  // Prompt layer (injected from @inquirer/* in production, vi.fn() in tests)
  promptSearch: <T>(config: { message: string; source: (term: string) => Promise<Array<{ name: string; value: T }>> }) => Promise<T>
  promptInput: (config: { message: string; validate?: (v: string) => boolean | string }) => Promise<string>
  promptCheckbox: <T>(config: { message: string; choices: Array<{ name: string; value: T }> }) => Promise<T[]>
  // Config
  configRepos: Array<{ owner: string; name: string }>
  output: Pick<Console, 'log' | 'error'>
}
```

**Internal structure:**

1. **`runTui(deps)`** — Main entry point:
   - Wraps entire flow in try/catch for `ExitPromptError` (Ctrl+C) → return 0
   - Calls `selectRepo()` → `issueLoop()` → repeat

2. **`selectRepo(deps)`** — Fuzzy search prompt:
   - Source function merges config repos (instant) + `listUserRepos()` (fetched once, cached)
   - Config repos shown first, API repos appended after
   - Returns `{ owner, name }`

3. **`issueLoop(deps, owner, name)`** — The main loop:
   - Fetch labels once for the selected repo (cache locally)
   - Loop:
     a. Prompt for title (required, non-empty validation)
     b. Prompt for body (required, non-empty validation)
     c. Prompt for labels (multi-select from fetched labels; Enter to skip = empty array)
     d. `await deps.createIssue(owner, name, title, body, labels)` — **NOT fire-and-forget** (200-500ms is imperceptible while user is reading the result)
     e. Print status: `✓ Issue #N created in owner/name (url)` or `✗ Failed: error message`
     f. Prompt: "Create another?" with choices: ["New issue (same repo)", "Switch repository", "Quit"]
     g. Based on choice: loop back to (a), return to `selectRepo()`, or return 0

4. **`submitIssue(deps, ...)`** — Thin wrapper around `deps.createIssue()`:
   - Returns `{ success: true, number, url }` or `{ success: false, error: string }`
   - **Never throws** — catches and wraps errors

**Key design decisions:**
- Labels fetched once per repo selection, cached in local variable (re-fetched on repo switch)
- Ctrl+C at any prompt throws `ExitPromptError` from `@inquirer/core` → caught at top level → exit 0
- "Switch repo" is a menu option after submission (not Ctrl+R, since `@inquirer/search` doesn't support raw keybindings)
- Body is single-line `input`, not `editor` — speed-first design; complex bodies use the web UI
- User repos from API are fetched once on first repo selection and cached for the session (avoids repeated API calls)
- Label fetch failure → continue with empty label list, log warning (non-fatal)

**Acceptance Criteria:**
- `runTui()` can be called with injected mock functions (no real terminal or API)
- Each prompt cancellation triggers clean exit with code 0
- API calls are awaited (not fire-and-forget)
- Label cache is per-repo (re-fetched on repo switch)
- All branches tested: success, API failure, cancel, validation, label fetch failure, repo switch

### Step 4: Wire `--tui` Flag into Entry Point

**File:** `src/index.ts`

Add `tui` to the `parseArgs` options object (around line 154-168):
```typescript
tui: { type: 'boolean', default: false },
```

Add **mutual exclusion check** after the existing `--repo`/`--config` check (line 176-179):
```typescript
if (values.tui) {
  if (values.repo !== undefined || values.config !== undefined) {
    console.error('Error: --tui cannot be combined with --repo or --config')
    return 1
  }
}
```

Add **TTY detection** (the TUI requires an interactive terminal):
```typescript
if (values.tui) {
  if (!process.stdout.isTTY) {
    console.error('Error: --tui requires an interactive terminal')
    return 1
  }
}
```

Add handler after token validation (line 181-185):
```typescript
if (values.tui) {
  // Load repos from default config if available (optional)
  let configRepos: RepoConfig[] = []
  const configPath = findDefaultConfig()
  if (configPath !== undefined && existsSync(configPath)) {
    configRepos = loadConfig(configPath).repos
  }
  
  const github = new GitHubClient(token)
  const { runTui } = await import('./cli/tui.js')
  return runTui({
    listUserRepos: () => github.listUserRepos(),
    fetchLabels: (o, n) => github.fetchLabels(o, n),
    createIssue: (o, n, t, b, l) => github.createIssue(o, n, t, b, l),
    promptSearch: (await import('@inquirer/search')).default,
    promptInput: (await import('@inquirer/input')).default,
    promptCheckbox: (await import('@inquirer/checkbox')).default,
    configRepos,
    output: console,
  })
}
```

Note: Dynamic `import()` for TUI module and `@inquirer/*` so they are only loaded when `--tui` is used, keeping cold-start fast for the pipeline mode.

**Acceptance Criteria:**
- `minion --tui` launches the TUI
- `minion --tui --repo x/y` → error "cannot be combined"
- `minion --tui` in non-TTY → error "requires an interactive terminal"
- `minion` (no args) still works as before
- All existing flags (`--repo`, `--poll`, `--config`, `--help`) are unaffected
- `src/index.ts` remains excluded from coverage (line 25 of vitest.config.ts)

### Step 5: Update Help Text and Exports

**Files:** `src/index.ts` (help text), `src/cli/index.ts` (barrel export)

Update `printHelp()` at line 54-72 to add:
```
Interactive mode:
  --tui                       Launch interactive issue creator (requires TTY)
```

Create `src/cli/index.ts` barrel file if it doesn't exist:
```typescript
export { runTui } from './tui.js'
export type { TuiDeps } from './tui.js'
```

**Acceptance Criteria:**
- `minion --help` mentions `--tui`
- Barrel exports follow existing patterns (`src/github/index.ts`, `src/config/index.ts`)

### Step 6: Write Comprehensive Tests

**Files:**
- `test/unit/cli/tui.test.ts` (NEW) — Unit tests for `runTui()`
- `test/unit/github/client.test.ts` (MODIFY) — Tests for 3 new methods

**Coverage strategy:** Add `"src/cli/tui.ts"` specifically to vitest coverage includes (NOT `"src/cli/**/*.ts"` — that would pull in `onboarding.ts` and `env.ts` which are intentionally excluded). Update `vitest.config.ts` line 16-22:
```typescript
include: [
  "src/ai/**/*.ts",
  "src/cli/tui.ts",    // ← only the new TUI module
  "src/config/**/*.ts",
  "src/git/**/*.ts",
  "src/github/**/*.ts",
  "src/pipeline/**/*.ts",
],
```

**TUI test scenarios (using DI mocks):**

```typescript
const mockDeps: TuiDeps = {
  listUserRepos: vi.fn().mockResolvedValue([{ owner: 'org', name: 'api', description: 'API service' }]),
  fetchLabels: vi.fn().mockResolvedValue(['bug', 'enhancement', 'docs']),
  createIssue: vi.fn().mockResolvedValue({ number: 42, url: 'https://github.com/org/api/issues/42' }),
  promptSearch: vi.fn().mockResolvedValue('org/api'),
  promptInput: vi.fn()
    .mockResolvedValueOnce('Bug: login fails')   // title
    .mockResolvedValueOnce('Steps to reproduce'), // body
  promptCheckbox: vi.fn().mockResolvedValue(['bug']),
  configRepos: [{ owner: 'org', name: 'api' }],
  output: { log: vi.fn(), error: vi.fn() },
}
```

| # | Scenario | Key assertions |
|---|----------|----------------|
| 1 | Happy path: select repo → title → body → labels → submit → quit | createIssue called with correct args, success message logged |
| 2 | No config repos: starts with empty list, API repos shown | listUserRepos called, results available in search |
| 3 | Cancel at repo selection (Ctrl+C) | Exits with code 0 |
| 4 | Cancel at title prompt | Exits with code 0 |
| 5 | Cancel at body prompt | Exits with code 0 |
| 6 | Submit failure (API error) | Error message logged, loop continues |
| 7 | Empty title rejected | Validation rejects empty string |
| 8 | Empty body rejected | Validation rejects empty string |
| 9 | No labels selected (skip) | createIssue called with empty labels array |
| 10 | Label fetch failure | Warning logged, empty label list, issue creation still works |
| 11 | Multiple issues in same repo (loop) | Second prompt cycle starts correctly |
| 12 | Repo switch via menu | Returns to repo selection, labels re-fetched |

**GitHub client test additions:**
- `createIssue` — success, 401, 403, 404, with labels, without labels
- `fetchLabels` — success, pagination (>100 labels), empty repo
- `listUserRepos` — success, pagination, API error, empty results

**Acceptance Criteria:**
- `pnpm test:unit` passes with all new tests
- `pnpm test:coverage` shows 100% on `src/cli/tui.ts` (new code)
- `pnpm test:coverage` shows 100% on `src/github/client.ts` (existing + new methods)
- No real HTTP calls or terminal interaction in any test

---

## File Change Summary

| File | Change | Description |
|------|--------|-------------|
| `src/github/client.ts` | MODIFY | Add `createIssue()`, `fetchLabels()`, `listUserRepos()` |
| `src/cli/tui.ts` | NEW | TUI module with `runTui()`, `TuiDeps` interface |
| `src/cli/index.ts` | NEW | Barrel export for `runTui`, `TuiDeps` |
| `src/index.ts` | MODIFY | Add `--tui` flag, mutual exclusion, TTY check, handler |
| `package.json` | MODIFY | Add `@inquirer/search`, `@inquirer/input`, `@inquirer/checkbox` |
| `vitest.config.ts` | MODIFY | Add `"src/cli/tui.ts"` to coverage includes |
| `test/unit/github/client.test.ts` | MODIFY | Tests for 3 new methods |
| `test/unit/cli/tui.test.ts` | NEW | 12 TUI test scenarios |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `@inquirer/search` source callback called per keystroke → GitHub API rate limits | MEDIUM | MEDIUM | `listUserRepos` is fetched ONCE and cached client-side. Source callback does client-side string matching only — no per-keystroke API calls. |
| `@inquirer/*` types incompatible with strict TS config | LOW | MEDIUM | Verify types during Step 2; if needed, add thin wrapper with explicit types |
| `ExitPromptError` not caught → unclean process exit | HIGH if uncaught | HIGH | Wrap main TUI loop in try/catch for `ExitPromptError`; return exit code 0 |
| Issue created but label application fails (partial failure) | LOW | LOW | `octokit.issues.create()` applies labels atomically in the create call — not a separate API call. If create fails, no issue is created. |
| Broken coverage baseline masks new code coverage gaps | MEDIUM | LOW | Add `src/cli/tui.ts` specifically (not `src/cli/**/*.ts`) to coverage includes. The existing baseline breakage from the AI refactoring is out-of-scope. |
| `listUserRepos` returns hundreds of repos for users with many orgs | LOW | LOW | `@inquirer/search` handles large lists with fuzzy filtering. Pagination caps at reasonable limits. |

---

## Acceptance Criteria (Final)

1. `minion --tui` launches an interactive session without errors
2. `minion --tui` in non-TTY environment → clear error message, exit 1
3. `minion --tui --repo x/y` → clear error message, exit 1
4. Repo selection uses fuzzy search across config repos + user's GitHub repos (fetched once)
5. Title and body are required (non-empty validation)
6. Labels are optional: fuzzy multi-select from repo labels + free-form; skip with Enter
7. Issue submission is awaited; result shown inline (URL on success, error on failure)
8. After submission, user chooses: new issue (same repo), switch repo, or quit
9. Ctrl+C at any prompt exits cleanly with code 0
10. `minion --tui --help` shows usage
11. All existing CLI behavior (`--repo`, `--poll`, `--config`, `--help`) is unchanged
12. `pnpm test:coverage` shows 100% on `src/cli/tui.ts`
13. `pnpm build` passes (no type errors)
14. `pnpm lint` passes

---

## Verification Steps

1. `pnpm build` — TypeScript compiles without errors
2. `pnpm lint` — No linting violations
3. `pnpm test:unit` — All unit tests pass (existing + new)
4. `pnpm test:coverage` — 100% coverage on `src/cli/tui.ts` and `src/github/client.ts`
5. Manual: `GITHUB_TOKEN=xxx pnpm start -- --tui` — interactive session works
6. Manual: create issue via TUI, verify it appears on GitHub with correct title/body/labels
7. Manual: Ctrl+C exits cleanly at each prompt stage
8. Manual: Switch repo works, labels re-fetched for new repo
9. Regression: `pnpm start -- --repo owner/name` still works as before
10. Regression: `echo "test" | pnpm start -- --tui` → "requires interactive terminal" error

---

## Changelog (Rev 2)

Applied the following improvements from Architect + Critic review:

| # | Source | Change |
|---|--------|--------|
| 1 | Architect | Await `createIssue()` instead of fire-and-forget (prevents unhandled rejections) |
| 2 | Architect | Use `--tui` flag via `parseArgs` instead of positional arg (maintains single-parser invariant) |
| 3 | Architect | Install `@inquirer/search`, `@inquirer/input`, `@inquirer/checkbox` individually, not umbrella |
| 4 | Architect | DI at data level (`TuiDeps`) not widget level, following `onboarding.ts` pattern |
| 5 | Architect | Catch `ExitPromptError` from `@inquirer/core` for clean Ctrl+C handling |
| 6 | Critic | Specify coverage strategy: add `src/cli/tui.ts` specifically, not `src/cli/**/*.ts` |
| 7 | Critic | Specify `listUserRepos` semantics: uses `repos.listForAuthenticatedUser` with affiliation, not `search.repos` |
| 8 | Critic | Acknowledge broken coverage baseline (AI refactoring in progress, out of scope) |
| 9 | Critic | Add `--tui` mutual exclusion with `--repo` and `--config` |
| 10 | Critic | Add TTY detection — `--tui` requires interactive terminal |
| 11 | Critic | Clarify body is single-line by design (speed-first) |
| 12 | Critic | Client-side fuzzy filtering eliminates API rate-limit risk for search |
| 13 | Critic | Add `src/cli/index.ts` barrel file |
