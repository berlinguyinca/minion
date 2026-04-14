# minion

Autonomous pipeline that reads open GitHub issues and turns them into pull requests using AI. Point it at your repos, and it will generate specs, write code, run tests, open PRs, self-review, and address its own review comments -- all without human intervention.

Safe to run on a cron schedule: tracks processed issues and monthly AI quota in a local state file to prevent duplicate work.

## Requirements

- [Node.js 22+](https://nodejs.org/)
- [pnpm](https://pnpm.io/installation)
- A `GITHUB_TOKEN` with `repo` scope
- At least one AI provider CLI installed (see [AI Providers](#ai-providers))

## Quick start

```bash
git clone https://github.com/berlinguyinca/minion.git
cd minion
pnpm install

# Copy and edit the config
cp config.yaml.example config.yaml
# Edit config.yaml -- add your repos

# Run the pipeline
GITHUB_TOKEN=ghp_xxxx pnpm start --config config.yaml
```

To use a custom config path:

```bash
GITHUB_TOKEN=ghp_xxxx pnpm start --config /path/to/config.yaml
```

### Cron example (every 4 hours)

```cron
0 */4 * * * cd /path/to/minion && GITHUB_TOKEN=ghp_... pnpm start --config config.yaml >> /var/log/minion.log 2>&1
```

## How it works

For each open issue across configured repositories, the pipeline runs an 18-step process:

```
Issue fetched
  |
  +-- 1. Skip if already processed (state file)
  +-- 2. Check for existing branch/PR conflicts
  +-- 3. Clone repo to temp directory
  +-- 4. Create feature branch (ai/{number}-{slug})
  |
  +-- 5-6. AI: Generate spec + implement
  |        (MAP does this atomically; Claude/Codex do spec then implement separately)
  |
  +-- 7.  Run tests (auto-detected or configured)
  +-- 8.  Commit all changes
  +-- 9.  Push branch
  +-- 10. Create PR (regular or draft)
  +-- 11. Label PR (ai-generated, ai-failed if errored)
  |
  +-- 12. AI: Review the PR diff, produce comments
  +-- 13. Post review comments on the PR
  +-- 14. AI: Address review comments
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

# Provider chain -- ordered list of AI providers to try
# First provider with remaining quota handles each call
# Supported: map, claude, codex, ollama
providerChain:
  - map
  - claude
  - codex
  - ollama

# Monthly quota limits for hosted providers
quotaLimits:
  claude: 200
  codex: 100

# Default Ollama model (default: qwen2.5-coder:latest)
ollamaModel: qwen2.5-coder:latest

# Per-provider configuration
providers:
  map:
    timeoutMs: 120000
    model: claude-sonnet-4-5
    quota: 50
    agents:                    # Configure which adapter each MAP stage uses
      spec:
        adapter: claude
      review:
        adapter: claude
      execute:
        adapter: claude
  claude:
    timeoutMs: 90000
    quota: 200
  codex:
    timeoutMs: 60000
    quota: 100
  ollama:
    timeoutMs: 300000
    model: qwen2.5-coder:latest
```

### Config reference

| Field | Type | Default | Description |
|---|---|---|---|
| `repos` | array | required | Repositories to process |
| `repos[].owner` | string | required | GitHub org or user |
| `repos[].name` | string | required | Repository name |
| `repos[].defaultBranch` | string | `main` | Base branch for PRs |
| `repos[].testCommand` | string | auto-detect | Override the test command |
| `repos[].cloneUrl` | string | GitHub HTTPS | Custom clone URL (useful for local testing) |
| `maxIssuesPerRun` | number | `10` | Cap on issues processed per invocation |
| `providerChain` | string[] | `[claude, codex, ollama]` | Ordered AI fallback chain |
| `quotaLimits.claude` | number | `100` | Monthly call limit for Claude |
| `quotaLimits.codex` | number | `50` | Monthly call limit for Codex |
| `ollamaModel` | string | `qwen2.5-coder:latest` | Ollama model name |
| `providers.<name>.timeoutMs` | number | varies | Timeout per AI invocation (ms) |
| `providers.<name>.quota` | number | see quotaLimits | Per-provider quota override |
| `providers.map.agents` | object | -- | Configure adapters for each MAP pipeline stage |

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | yes | Personal access token with `repo` scope |

## AI providers

The pipeline supports four AI providers. The `providerChain` controls the fallback order -- the first provider with remaining quota handles each call.

| Provider | CLI binary | Quota | Agent mode | Notes |
|---|---|---|---|---|
| **MAP** | `map` | configurable | Full pipeline | Runs [multi-agent-pipeline](https://github.com/berlinguyinca/multi-agent-pipeline) in `--headless` mode. Handles spec, review, and implementation with TDD in a single call. |
| **Claude** | `claude` | monthly limit (default 100) | Structured + agent | [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code). Uses `--print` for structured output, `--dangerously-skip-permissions` for agent mode. |
| **Codex** | `codex` | monthly limit (default 50) | Structured + agent | [OpenAI Codex CLI](https://github.com/openai/codex). Uses `exec --json` for structured output, `exec --full-auto` for agent mode. |
| **Ollama** | `ollama` | unlimited | Structured only | Local models via [Ollama](https://ollama.com/). Uses `run --format json`. No agent mode -- cannot write code autonomously. |

### How the provider chain works

1. The router iterates through `providerChain` in order
2. For each provider, it checks `StateManager.hasQuota()` -- providers without a quota entry (e.g., Ollama) are always available
3. If the provider's binary is not found (`ENOENT`), it silently falls through to the next
4. If a provider errors (non-zero exit, timeout), the error propagates immediately -- no fallback
5. Ollama's agent mode throws "does not support", which the router treats as a fallthrough

### MAP vs. standard providers

Standard providers (Claude, Codex, Ollama) handle spec generation and implementation as separate steps:
- `invokeStructured` generates a spec from the issue
- `invokeAgent` implements the spec in the working directory

MAP (`handlesFullPipeline: true`) handles both atomically -- it receives the raw issue prompt and runs its own spec-review-execute cycle internally. The router detects this via the `handlesFullPipeline` flag and skips the separate `invokeStructured` call.

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
    "my-org/my-repo": [1, 5, 12]
  },
  "quota": {
    "claude": { "used": 42, "limit": 100, "resetMonth": "2026-04" },
    "codex":  { "used": 8,  "limit": 50,  "resetMonth": "2026-04" }
  }
}
```

- **Processed issues** -- keyed by `owner/name`, stores issue numbers to prevent duplicate processing
- **Quota tracking** -- per-provider monthly call counts; counters reset automatically at the first run of a new UTC month
- **Atomic writes** -- writes to `.tmp` then renames, preventing partial-write corruption

To reprocess an issue, remove its number from the `processedIssues` array. To reset quotas, delete the file or wait for the next calendar month (UTC).

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
pnpm test:coverage    # Tests with V8 coverage (80% threshold)
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
  config/
    config.ts                 YAML/JSON config loader
    state.ts                  State persistence and quota tracking
  github/
    client.ts                 Octokit wrapper (issues, PRs, branches, labels, diffs)
  git/
    operations.ts             Clone, branch, commit, push via child_process
  ai/
    router.ts                 Provider chain with quota-aware fallback
    base-wrapper.ts           Shared spawn wrapper (timeout, error handling)
    claude-wrapper.ts         Claude Code CLI integration
    codex-wrapper.ts          OpenAI Codex CLI integration
    ollama-wrapper.ts         Ollama CLI integration (structured only)
    map-wrapper.ts            multi-agent-pipeline headless integration
    errors.ts                 AIBinaryNotFoundError, AITimeoutError, AIInvocationError
    file-scanner.ts           Detect files modified after a timestamp
  pipeline/
    runner.ts                 Top-level loop: repos -> issues -> process
    issue-processor.ts        Per-issue orchestration (18-step pipeline)
    prompts.ts                Prompt builders for spec, implementation, review
    test-runner.ts            Test command detection and execution
    spec-cache.ts             In-memory spec result cache
test/
  unit/                       Unit tests (mocks allowed)
  integration/                Integration tests (real dependencies)
```

### Technical notes

- ESM-only (`"type": "module"`) -- all imports must include `.js` extensions
- TypeScript strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`
- Coverage thresholds: 80% statements, branches, functions, and lines
- Git identity is auto-configured in cloned repos (`pipeline@minion`) for CI environments where git config is unset

## Troubleshooting

**Binary not found (`claude` / `codex` / `ollama` / `map`)**
Install the missing CLI. The pipeline falls through to the next provider in the chain. If no providers are reachable, the run fails with `AIBinaryNotFoundError`.

**Quota exhausted**
All providers are at their monthly limit. Wait for the UTC month boundary (counts reset on first run of the new month) or increase `quotaLimits` in your config.

**`GITHUB_TOKEN` missing or invalid**
Set `GITHUB_TOKEN` to a token with `repo` scope. Tokens with only `public_repo` scope cannot push branches to private repositories. The pipeline surfaces HTTP 401/403 with a clear message.

**Config file not found**
The pipeline looks for `./repos.json` by default. Pass `--config config.yaml` to use YAML configuration.

**Tests always fail**
Set `testCommand` explicitly in your config if auto-detection picks the wrong command, or if the test suite requires environment setup the pipeline cannot provide.

**MAP binary not found**
Install [multi-agent-pipeline](https://github.com/berlinguyinca/multi-agent-pipeline): `cd /path/to/multi-agent-pipeline && pnpm build && npm link`. The pipeline logs a warning at startup if `map` is in the provider chain but the binary is missing.

## License

MIT
