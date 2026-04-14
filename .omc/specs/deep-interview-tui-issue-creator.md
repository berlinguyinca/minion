# Deep Interview Spec: TUI Issue Creator

## Metadata
- Interview ID: tui-issue-creator-001
- Rounds: 9
- Final Ambiguity Score: 15%
- Type: brownfield
- Generated: 2026-04-14
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.35 | 0.33 |
| Constraint Clarity | 0.80 | 0.25 | 0.20 |
| Success Criteria | 0.80 | 0.25 | 0.20 |
| Context Clarity | 0.80 | 0.15 | 0.12 |
| **Total Clarity** | | | **0.85** |
| **Ambiguity** | | | **0.15** |

## Goal

Build a fast, keyboard-driven CLI subcommand (`minion tui`) that enables rapid-fire GitHub issue creation using an fzf-style interactive prompt flow. The tool loops within a selected repo for batch issue entry, with a persistent status bar for submission feedback. Speed of issue creation is the primary design goal — faster than GitHub web UI or `gh issue create`.

## Flow

```
minion tui [--config path]
    │
    ▼
┌─────────────────────────────┐
│ Fuzzy repo selection        │  ← Config repos + GitHub API repos on demand
│ (type to filter, ↑↓ + Enter)│
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Title (required)            │  ← Single-line text input
├─────────────────────────────┤
│ Body (required)             │  ← Multi-line text input
├─────────────────────────────┤
│ Labels (optional, Enter     │  ← Fuzzy multi-select from existing repo labels
│   to skip)                  │    + free-form input for new labels
└─────────────┬───────────────┘
              │ Submit shortcut (e.g., Ctrl+S)
              ▼
┌─────────────────────────────┐
│ Status bar: "✓ Issue #42    │  ← Persistent until next action
│   created in owner/repo"    │
└─────────────┬───────────────┘
              │
              ▼
         Loop back to Title
         (same repo — Ctrl+R to switch repo, Ctrl+C to exit)
```

## Constraints

- **Subcommand**: New `minion tui` subcommand, coexists with existing pipeline CLI (`--repo`, `--poll`, `--config`)
- **No complex TUI framework**: fzf-style sequential prompts, NOT a split-panel layout. Deliberately simple.
- **Repo sources**: Primary = repos from `config.yaml`; secondary = GitHub API discovery (fuzzy search triggers API call)
- **Auth**: Reuse existing `GITHUB_TOKEN` environment variable and `GitHubClient` from `src/github/client.ts`
- **Fields**: Title (required), Body (required), Labels (optional — skip with Enter)
- **Labels**: Fuzzy multi-select from existing repo labels (fetched via API) + free-form text input for creating new labels
- **Loop**: After submit, stays on the same repo (back to Title). Switch repo via shortcut (Ctrl+R). Exit via Ctrl+C.
- **Feedback**: Persistent status bar at bottom showing last action result (success/error). Clears on next action.
- **Fire-and-forget**: Issue creation is async — form clears immediately, status bar shows result when API responds
- **ESM-only**: Must comply with existing `"type": "module"` and NodeNext resolution
- **TypeScript strict mode**: All existing strictness flags apply

## Non-Goals

- No split-panel/dashboard TUI (explicitly rejected in favor of speed)
- No issue browsing/listing (search = repo fuzzy filtering only)
- No issue editing or updating
- No PR creation from the TUI
- No integration with the pipeline runner (TUI is independent issue creation)
- No mouse support required
- No assignee or milestone selection (keep it minimal)

## Acceptance Criteria

- [ ] `minion tui` launches the interactive issue creation flow
- [ ] Fuzzy repo selector shows config repos immediately; typing triggers GitHub API search for additional repos
- [ ] Title input accepts single-line text (required — cannot submit empty)
- [ ] Body input accepts multi-line text (required — cannot submit empty)
- [ ] Label step is skippable (Enter on empty = no labels)
- [ ] Label step shows fuzzy-filterable list of existing repo labels + allows free-form new label input
- [ ] Submit shortcut (Ctrl+S or similar) creates the issue via GitHub API
- [ ] Status bar shows success ("✓ Issue #N created in owner/repo") or error ("✗ Failed: reason")
- [ ] After submit, form clears and cursor returns to Title for the same repo
- [ ] Ctrl+R (or similar) returns to repo selection without creating an issue
- [ ] Ctrl+C exits cleanly
- [ ] Creating an issue with title + body + labels results in a correctly labeled issue on GitHub
- [ ] Speed: creating a title-only issue (body = one line, no labels) takes fewer keystrokes than `gh issue create`
- [ ] Existing CLI commands (`--repo`, `--poll`, `--config`) are unaffected
- [ ] All existing tests continue to pass
- [ ] New code has test coverage

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 70/30 split-panel TUI is needed | Contrarian: fzf-style flow might be faster and simpler | User agreed fzf-style is better — pivoted away from panels |
| Search is a separate feature | What does "search" target? | Search = repo fuzzy filtering, already covered by fzf repo selector |
| All three fields (title/body/labels) required | Simplifier: title-only might be faster | User requires title + body; labels are optional |
| User needs to see existing issues | Search existing issues before creating? | No — fire-and-forget only, no duplicate checking |
| Post-submit returns to repo selection | Same-repo loop vs repo-selection loop? | Same-repo loop for batch entry speed; Ctrl+R to switch |

## Technical Context

### Existing Codebase Integration Points
- **`src/index.ts`**: CLI entry point — add `tui` subcommand detection before existing `--repo`/`--config` arg parsing
- **`src/github/client.ts`**: `GitHubClient` already wraps `@octokit/rest` with methods for issue creation (`postIssueComment`), label management (`addLabel`), and issue fetching (`fetchOpenIssues`). Will need new methods: `createIssue()`, `fetchLabels()`, `searchRepos()`
- **`src/config/config.ts`**: `loadConfig()` returns `PipelineConfig` with `repos: RepoConfig[]` — reuse for initial repo list
- **`src/types/index.ts`**: `RepoConfig` type (owner, name, defaultBranch) — reuse directly
- **`src/cli/onboarding.ts`**: Existing readline-based interactive prompts — pattern reference but will be replaced by fzf-style library

### Suggested Library
[`@clack/prompts`](https://github.com/bombshell-dev/clack) or [`inquirer`](https://github.com/SBoudrias/Inquirer.js) with autocomplete plugin — both support fuzzy selection, multi-select, text input, and are ESM-compatible. Choice is an implementation detail.

### New Files (estimated)
- `src/cli/tui.ts` — TUI entry point, orchestrates the interactive loop
- `src/github/client.ts` — Add `createIssue()`, `fetchLabels()`, `searchRepos()` methods

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Repository | core domain | owner, name, defaultBranch, source (config/api) | has many Issues, has many Labels |
| Issue | core domain | title (req), body (req), labels (opt), number, url | belongs to Repository |
| Label | supporting | name, color, description, isNew | belongs to Repository, applied to Issue |
| Fuzzy Prompt | UI component | type (select/text/multiselect), options, filter | displays Repositories, Labels |
| Status Bar | UI component | message, type (success/error), timestamp | reports Issue creation result |
| Subcommand | integration | name ("tui"), args (--config) | entry point for TUI flow |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 4 | 4 | - | - | N/A |
| 2 | 5 | 1 | 0 | 4 | 80% |
| 3 | 6 | 1 | 0 | 5 | 83% |
| 4 | 6 | 0 | 0 | 6 | 100% |
| 5 | 5 | 1 | 1 | 3 | 67% (pivot: TUI Panel → Fuzzy Prompt) |
| 6 | 5 | 0 | 0 | 5 | 100% |
| 7 | 5 | 0 | 0 | 5 | 100% |
| 8 | 5 | 0 | 0 | 5 | 100% |
| 9 | 6 | 1 | 0 | 5 | 83% (Label entity surfaced) |

## Interview Transcript
<details>
<summary>Full Q&A (9 rounds)</summary>

### Round 1
**Q:** Where should the list of repositories come from? Config file only, GitHub API, or both?
**A:** Both — start with config repos, allow searching/adding from GitHub API on demand.
**Ambiguity:** 64% (Goal: 0.55, Constraints: 0.25, Criteria: 0.15, Context: 0.45)

### Round 2
**Q:** When you create an issue and hit submit, what should happen? And what does "search" target?
**A:** Status bar feedback — persistent status bar shows last action result, form clears immediately, errors stay visible.
**Ambiguity:** 56% (Goal: 0.65, Constraints: 0.25, Criteria: 0.30, Context: 0.50)

### Round 3
**Q:** Should the TUI be a new subcommand, replace the CLI, or be a separate binary?
**A:** New subcommand — coexists with existing pipeline CLI.
**Ambiguity:** 50% (Goal: 0.65, Constraints: 0.45, Criteria: 0.30, Context: 0.60)

### Round 4
**Q:** Speed is #1. A full TUI with split panels adds complexity. Would fzf-style sequential prompts be faster and simpler? (Contrarian mode)
**A:** fzf-style is better — pivoted away from 70/30 panel layout.
**Ambiguity:** 44% (Goal: 0.55, Constraints: 0.55, Criteria: 0.55, Context: 0.60)

### Round 5
**Q:** What does "search" mean in the new fzf-style flow?
**A:** Search = repo filtering — the fzf-style fuzzy selection already covers this.
**Ambiguity:** 35% (Goal: 0.80, Constraints: 0.55, Criteria: 0.55, Context: 0.65)

### Round 6
**Q:** Title-only issues (with optional body/labels) or all three always? (Simplifier mode)
**A:** Title + body required, labels optional.
**Ambiguity:** 29% (Goal: 0.85, Constraints: 0.65, Criteria: 0.60, Context: 0.70)

### Round 7
**Q:** After submit, loop to same repo, back to repo selection, or exit?
**A:** Same repo loop — fastest for batch entry. Switch repos with a shortcut.
**Ambiguity:** 21% (Goal: 0.90, Constraints: 0.70, Criteria: 0.75, Context: 0.75)

### Round 8
**Q:** Labels: fuzzy from existing, free-form text, or both?
**A:** Fuzzy + free-form — select existing labels AND type new ones.
**Ambiguity:** 15% (Goal: 0.95, Constraints: 0.80, Criteria: 0.80, Context: 0.80)

### Round 9
**Threshold met.** Spec crystallized.

</details>
