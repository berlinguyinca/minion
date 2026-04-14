# minion

Autonomous pipeline that reads open GitHub issues and turns them into pull requests using AI. Point it at your repos, and it will generate specs, write code, run tests, open PRs, self-review, and address its own review comments -- all without human intervention.

Minion has two modes:

- **Service mode** -- processes issues automatically, suitable for cron or daemon use
- **TUI mode** -- interactive issue creator with AI-powered text polishing

## Requirements

- [Node.js 22+](https://nodejs.org/)
- [pnpm](https://pnpm.io/installation)
- A `GITHUB_TOKEN` with `repo` scope
- The [MAP](https://github.com/berlinguyinca/multi-agent-pipeline) CLI (`map` binary on PATH)

## Quick start

```bash
git clone https://github.com/berlinguyinca/minion.git
cd minion
pnpm install

# Interactive setup (creates config.yaml)
pnpm start --init

# Or copy and edit the example config
cp config.yaml.example config.yaml

# Run the pipeline
GITHUB_TOKEN=ghp_xxxx pnpm start --config config.yaml
```

## Modes

### Service mode (automated pipeline)

Processes open issues across configured repos, creating PRs automatically. Designed to run unattended on a schedule or as a long-running daemon.

**Single repo (no config file needed):**

```bash
GITHUB_TOKEN=ghp_xxxx pnpm start --repo my-org/my-repo
```

**Multiple repos via config file:**

```bash
GITHUB_TOKEN=ghp_xxxx pnpm start --config config.yaml
```

**Continuous polling (daemon mode):**

```bash
# Re-check every 5 minutes
GITHUB_TOKEN=ghp_xxxx pnpm start --config config.yaml --poll 300
```

**Cron example (every 4 hours):**

```cron
0 */4 * * * cd /path/to/minion && GITHUB_TOKEN=ghp_... pnpm start --config config.yaml >> /var/log/minion.log 2>&1
```

### TUI mode (interactive issue creator)

Launch an interactive terminal UI for rapid issue creation across your repositories. Requires a TTY (not suitable for cron).

```bash
GITHUB_TOKEN=ghp_xxxx pnpm start --tui
```

**Features:**
- Fuzzy-search across all your GitHub repos (config repos + API-discovered repos)
- Create multiple issues in sequence, switching repos on the fly
- **Polish with AI** -- send your draft to MAP for spell correction, clarity improvements, and better formatting before submitting
- Multi-select labels from the repo's existing label set

**TUI flow:**

```
Select repository (fuzzy search)
  |
  +-- Enter issue title
  +-- Enter issue body
  |
  +-- Review draft
  |     Submit | Polish with AI | Edit title | Edit body
  |
  +-- Select labels (multi-select, optional)
  +-- Submit to GitHub
  |
  +-- New issue | Switch repo | Quit
```

The "Polish with AI" option is available when the `map` binary is installed. It sends your title and body to MAP for reformatting, spell correction, and clarity improvements, then updates your draft in-place so you can review before submitting.

## CLI reference

```
Usage: minion --repo <owner/name> [options]
       minion --config <path> [options]

Repository (CLI mode):
  --repo <owner/name>       Target repository (mutually exclusive with --config)
  --branch <name>           Default branch (default: main)
  --max-issues <n>          Max issues per run (default: 10)
  --test-command <cmd>      Test command for the repo
  --model <model>           Model for MAP to use internally
  --timeout <ms>            MAP timeout in milliseconds (default: 1800000)
  --merge-method <method>   merge|squash|rebase (default: merge)

Config file mode:
  --config <path>           Config file path (default: config.yaml or repos.json)

Interactive mode:
  --tui                     Launch interactive issue creator (requires TTY)

General:
  --init                    Run first-time setup wizard
  --poll <seconds>          Continuous polling mode (min: 30s)
  --help                    Show help
```

## How the pipeline works

For each open issue across configured repositories, the pipeline runs an 18-step process:

```
Issue fetched
  |
  +-- 1. Skip if already processed (state file)
  +-- 2. Check for existing branch/PR conflicts
  +-- 3. Clone repo to temp directory
  +-- 4. Create feature branch (ai/{number}-{slug})
  |
  +-- 5-6. MAP: Generate spec + implement (atomic)
  |        MAP runs its own spec -> review -> execute cycle with TDD
  |
  +-- 7.  Run tests (auto-detected or configured)
  +-- 8.  Commit all changes
  +-- 9.  Push branch
  +-- 10. Create PR (regular or draft)
  +-- 11. Label PR (ai-generated, ai-failed if errored)
  |
  +-- 12. MAP: Review the PR diff, produce comments
  +-- 13. Post review comments on the PR
  +-- 14. MAP: Address review comments
  +-- 15. Commit and push follow-up fixes
  |
  +-- 16. Collect changed file list
  +-- 17. Post summary comment on the issue
  +-- 18. Mark issue as processed in state file
```

Steps 12-15 (self-review) are non-fatal -- if they fail, the PR is still created. The pipeline is idempotent: rerunning it skips already-processed issues.

## Configuration

The pipeline reads `config.yaml` (preferred) or falls back to `repos.json` for backward compatibility.

```yaml
# Repositories to process
repos:
  - owner: my-org
    name: my-repo
    defaultBranch: main
    testCommand: pnpm test     # optional -- auto-detected if omitted
  - owner: my-org
    name: another-repo
    defaultBranch: develop

# Maximum issues to process per run (default: 10)
maxIssuesPerRun: 10

# MAP (multi-agent-pipeline) configuration
# mapModel: claude-sonnet-4-5      # Model MAP uses internally (optional)
# mapTimeoutMs: 1800000            # Timeout in milliseconds (default: 30 minutes)

# Retry configuration for failed issues
retry:
  maxAttempts: 3        # max retries per issue (default: 3)
  backoffMinutes: 60    # minimum wait between retries (default: 60)

# Auto-merge settings
mergeCommentTrigger: '/merge'     # comment that triggers merge (default: '/merge')
mergeMethod: merge                # merge | squash | rebase (default: merge)
mergeDraftPRs: false              # allow merging draft PRs (default: false)
autoMerge: true                   # AI auto-review and merge open PRs (default: true)
autoMergeRequireTests: true       # require tests to pass before merge (default: true)

# Poll loop failsafes (only apply with --poll)
# maxPollRuns: 100                # stop after N poll iterations (default: unlimited)
maxConsecutiveFailures: 5         # stop after N consecutive failures (default: 5)
```

### Config reference

| Field | Type | Default | Description |
|---|---|---|---|
| `repos` | array | required | Repositories to process |
| `repos[].owner` | string | required | GitHub org or user |
| `repos[].name` | string | required | Repository name |
| `repos[].defaultBranch` | string | `main` | Base branch for PRs |
| `repos[].testCommand` | string | auto-detect | Override the test command |
| `repos[].cloneUrl` | string | GitHub HTTPS | Custom clone URL |
| `maxIssuesPerRun` | number | `10` | Cap on issues processed per invocation |
| `mapModel` | string | -- | Model for MAP to use internally |
| `mapTimeoutMs` | number | `1800000` | MAP timeout in milliseconds (30 min) |
| `retry.maxAttempts` | number | `3` | Max retries per failed issue |
| `retry.backoffMinutes` | number | `60` | Minimum wait between retries |
| `mergeCommentTrigger` | string | `/merge` | Comment text that triggers merge |
| `mergeMethod` | string | `merge` | `merge`, `squash`, or `rebase` |
| `autoMerge` | boolean | `true` | AI auto-review and merge open PRs |
| `autoMergeRequireTests` | boolean | `true` | Require tests to pass before merge |
| `maxPollRuns` | number | unlimited | Stop polling after N iterations |
| `maxConsecutiveFailures` | number | `5` | Stop polling after N consecutive failures |

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | yes | Personal access token with `repo` scope |

## Test auto-detection

When no `testCommand` is configured for a repo, the pipeline detects the test runner from the cloned project:

| Detected file | Command |
|---|---|
| `pnpm-lock.yaml` | `pnpm test` |
| `package-lock.json` | `npm test` |
| `yarn.lock` | `yarn test` |
| `Makefile` with `test:` target | `make test` |
| `go.mod` | `go test ./...` |
| `Cargo.toml` | `cargo test` |
| `pom.xml` | `mvn test` |

## State management

`.pipeline-state.json` is written automatically in the working directory. Writes are atomic (write to `.tmp`, then rename) to prevent corruption on crash.

```json
{
  "processedIssues": {
    "my-org/my-repo": {
      "1": { "status": "success", "lastAttempt": "2026-04-14T12:00:00Z", "attemptCount": 1, "prUrl": "..." },
      "5": { "status": "failure", "lastAttempt": "2026-04-14T13:00:00Z", "attemptCount": 2, "error": "MAP timeout" }
    }
  },
  "reviewedPRs": {
    "my-org/my-repo": {
      "10": { "status": "merged", "lastAttempt": "2026-04-14T14:00:00Z", "attemptCount": 1 }
    }
  }
}
```

- **Processed issues** -- keyed by `owner/name`, tracks outcome, attempt count, and backoff timing for retry eligibility
- **Reviewed PRs** -- tracks auto-review/merge outcomes per PR
- **Atomic writes** -- writes to `.tmp` then renames, preventing partial-write corruption

Failed issues are automatically retried up to `retry.maxAttempts` times with a configurable backoff. To force reprocessing, remove the issue entry from the state file.

## Branch naming and PR behavior

Branches are created as `ai/{issue-number}-{slugified-title}` (slug capped at 50 characters):

```
ai/42-add-user-authentication
```

If a branch already exists with an open PR, the issue is skipped. If the branch exists without a PR (orphan), it is deleted and the issue is re-processed.

| Condition | PR type | Labels |
|---|---|---|
| Tests pass, AI succeeded | Regular PR | `ai-generated` |
| Tests fail | Draft PR | `ai-generated` |
| AI invocation failed | Draft PR | `ai-generated`, `ai-failed` |

A summary comment is posted on the original issue with the PR link, model used, test results, and changed files.

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Type-check (tsc --noEmit)
pnpm lint             # ESLint over src/ and test/
pnpm test             # All tests (unit + integration)
pnpm test:unit        # Unit tests only
pnpm test:integration # Integration tests only
pnpm test:coverage    # Tests with V8 coverage (100% threshold)
```

Run a single test file:

```bash
pnpm vitest run test/unit/pipeline/runner.test.ts
```

### Project structure

```
src/
  index.ts                    CLI entry point, wires dependencies
  types/index.ts              All domain types and interfaces
  cli/
    tui.ts                    Interactive issue creator (--tui)
    onboarding.ts             First-time setup wizard (--init)
  config/
    config.ts                 YAML/JSON config loader
    state.ts                  State persistence (processed issues, PR outcomes)
  github/
    client.ts                 Octokit wrapper (issues, PRs, branches, labels, diffs)
  git/
    operations.ts             Clone, branch, commit, push via child_process
  ai/
    map-wrapper.ts            MAP headless integration (sole AI provider)
    polish.ts                 Text polishing for TUI (spell check, formatting)
    base-wrapper.ts           Shared spawn wrapper (timeout, error handling)
    errors.ts                 AIBinaryNotFoundError, AITimeoutError, AIInvocationError
    file-scanner.ts           Detect files modified after a timestamp
  pipeline/
    runner.ts                 Top-level loop: repos -> issues -> process
    issue-processor.ts        Per-issue orchestration (18-step pipeline)
    pr-review-processor.ts    Auto-review open PRs with AI
    merge-processor.ts        Merge PRs on /merge comment or auto-merge
    prompts.ts                Prompt builders for spec, review, conflict resolution
    test-runner.ts            Test command detection and execution
    spec-cache.ts             In-memory spec result cache
test/
  unit/                       Unit tests (mocks allowed)
  integration/                Integration tests (real dependencies)
```

### Technical notes

- ESM-only (`"type": "module"`) -- all imports must include `.js` extensions
- TypeScript strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`
- Coverage thresholds: 100% statements, branches, functions, and lines
- Git identity is auto-configured in cloned repos (`pipeline@minion`) for CI environments where git config is unset

## Troubleshooting

**MAP binary not found**
Install [multi-agent-pipeline](https://github.com/berlinguyinca/multi-agent-pipeline): `cd /path/to/multi-agent-pipeline && pnpm build && npm link`. The pipeline logs a warning if the `map` binary is missing.

**`GITHUB_TOKEN` missing or invalid**
Set `GITHUB_TOKEN` to a token with `repo` scope. Tokens with only `public_repo` scope cannot push branches to private repositories. The pipeline surfaces HTTP 401/403 with a clear message.

**Config file not found**
The pipeline looks for `./config.yaml` by default, falling back to `./repos.json`. Pass `--config config.yaml` explicitly, or use `--repo owner/name` for single-repo mode.

**Tests always fail**
Set `testCommand` explicitly in your config if auto-detection picks the wrong command, or if the test suite requires environment setup the pipeline cannot provide.

**Polish with AI not available in TUI**
The polish option only appears when the `map` binary is installed and on PATH. Run `map --version` to verify.

## License

MIT
