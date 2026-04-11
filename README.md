# gh-issue-pipeline

An autonomous pipeline that fetches open GitHub issues, generates a specification, implements changes using an AI coding assistant (Claude, Codex, or Ollama), runs the project's test suite, opens a pull request, and posts a review with follow-up fixes — all without human intervention. It tracks processed issues and monthly AI quota usage in a local state file, making it safe to run on a cron schedule.

## Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [pnpm](https://pnpm.io/installation)
- [claude CLI](https://docs.anthropic.com/en/docs/claude-code) — primary AI provider
- [codex CLI](https://github.com/openai/codex) — secondary AI provider (fallback)
- [ollama](https://ollama.com/) with a code model (e.g., `qwen2.5-coder:latest`) — tertiary fallback

## Installation

```bash
git clone https://github.com/your-org/gh-issue-pipeline.git
cd gh-issue-pipeline
pnpm install
```

## Configuration

Create a `repos.json` file (or copy the included example):

```json
{
  "repos": [
    {
      "owner": "your-org",
      "name": "your-repo",
      "defaultBranch": "main",
      "testCommand": "npm test"
    }
  ],
  "ollamaModel": "qwen2.5-coder:latest",
  "maxIssuesPerRun": 10,
  "quotaLimits": {
    "claude": 100,
    "codex": 50
  }
}
```

### Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `repos` | array | yes | List of repositories to process |
| `repos[].owner` | string | yes | GitHub organisation or user |
| `repos[].name` | string | yes | Repository name |
| `repos[].defaultBranch` | string | no | Base branch for PRs (default: `main`) |
| `repos[].testCommand` | string | no | Command to run tests (auto-detected if omitted) |
| `ollamaModel` | string | no | Ollama model name (default: `qwen2.5-coder:latest`) |
| `maxIssuesPerRun` | number | no | Max issues to process per invocation (default: `10`) |
| `quotaLimits.claude` | number | no | Monthly call limit for claude (default: `100`) |
| `quotaLimits.codex` | number | no | Monthly call limit for codex (default: `50`) |

## Environment

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | yes | Personal access token with `repo` scope |

## Running Manually

```bash
GITHUB_TOKEN=ghp_... pnpm start
```

To use a custom config path:

```bash
GITHUB_TOKEN=ghp_... node dist/index.js --config /path/to/repos.json
```

## Cron Example

Run every 4 hours:

```cron
0 */4 * * * cd /path/to/gh-issue-pipeline && GITHUB_TOKEN=ghp_... node dist/index.js >> /var/log/gh-pipeline.log 2>&1
```

## State File

`.pipeline-state.json` is created automatically in the working directory. It tracks:

- **Processed issues** — `{ "owner/name": [1, 2, 3] }` — prevents duplicate PRs across runs
- **Quota usage** — monthly call counts for `claude` and `codex`, reset at the start of each UTC month

Do not delete this file between runs unless you want the pipeline to re-process already-handled issues.

## AI Model Selection

The pipeline selects the AI model in priority order based on remaining monthly quota:

1. **claude** — used first, up to `quotaLimits.claude` calls per month
2. **codex** — used when claude quota is exhausted, up to `quotaLimits.codex` calls per month
3. **ollama** — used when both claude and codex quotas are exhausted; has no quota limit

If a CLI binary is not installed, the pipeline automatically falls through to the next provider. Each issue requires up to 4 AI calls (spec generation, implementation, code review, follow-up).

## Troubleshooting

**Binary not found (claude / codex / ollama)**
Install the missing CLI. If you only have one provider, the pipeline will use it exclusively. If none are available, the run will fail with `AIBinaryNotFoundError`.

**Quota exhausted**
All three providers are at their monthly limit. Wait for the monthly reset (first day of the next UTC month) or increase `quotaLimits` in `repos.json`.

**GITHUB_TOKEN missing or invalid**
Set the `GITHUB_TOKEN` environment variable to a token with `repo` scope. Tokens with only `public_repo` scope cannot push branches to private repositories.

**Config file not found**
By default the pipeline looks for `./repos.json` in the working directory. Pass `--config <path>` to specify a different location.
