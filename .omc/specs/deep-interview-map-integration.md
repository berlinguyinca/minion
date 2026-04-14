# Deep Interview Spec: Integrate multi-agent-pipeline (MAP) as AIProvider

## Metadata
- Interview ID: di-map-integration-20260412
- Rounds: 8
- Final Ambiguity Score: 17%
- Type: brownfield
- Generated: 2026-04-12
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.315 |
| Constraint Clarity | 0.80 | 0.25 | 0.200 |
| Success Criteria | 0.80 | 0.25 | 0.200 |
| Context Clarity | 0.75 | 0.15 | 0.113 |
| **Total Clarity** | | | **0.828** |
| **Ambiguity** | | | **0.172** |

## Goal

Integrate the multi-agent-pipeline (MAP) tool as a 4th AIProvider in gh-issue-pipeline's AIRouter fallback chain, invoked as a CLI subprocess via a new headless mode. When MAP is selected by the AIRouter, it replaces pipeline steps 5 and 6 (spec generation + implementation) with a single `invokeAgent` call that runs MAP's full 3-stage pipeline (spec → review → execute with TDD) internally. The entire system is configured via a single YAML config file that replaces the current `repos.json`, with a fully configurable provider chain order and per-provider timeouts.

## Scope — Two Repositories

### 1. multi-agent-pipeline (MAP) — `/Users/wohlgemuth/IdeaProjects/multi-agent-pipeline`
- Add `--headless` CLI flag that runs the full pipeline non-interactively
- Auto-approve at the feedback stage (no user input required)
- Output structured JSON to stdout with results (success, spec, filesCreated, outputDir)
- Accept `--output-dir <path>` to control where files are written (for integration with gh-issue-pipeline's cloned tmpdir)
- Accept `--config <path>` to use a specific config file

### 2. gh-issue-pipeline — `/Users/wohlgemuth/IdeaProjects/gh-issue-pipeline`
- Create `MAPWrapper` implementing `AIProvider` interface
- Refactor `AIRouter` to support configurable provider chain order
- Migrate config from `repos.json` (JSON) to `config.yaml` (YAML)
- Include MAP adapter assignments and per-provider timeouts in YAML config
- Modify `IssueProcessor` to conditionally skip step 5 (spec generation) when MAP is selected
- Add quota tracking for MAP calls

## Constraints

- **Invocation**: CLI subprocess via `invokeProcess()` from `base-wrapper.ts`, consistent with existing Claude/Codex/Ollama wrappers
- **Config format**: Single YAML file (`config.yaml`) replaces `repos.json` — YAML is easier for humans to edit
- **Provider chain**: Fully configurable order in YAML — any provider can be first, last, or excluded
- **Per-provider timeouts**: Configurable in YAML (MAP default ~30min for full pipeline, others retain existing defaults)
- **MAP headless mode**: Must output structured JSON to stdout; must accept `--output-dir` for working directory control
- **MAP quota**: Separate monthly quota limit, configurable like claude/codex
- **Backward compatibility**: Not required for `repos.json` — clean migration to YAML

## Non-Goals

- Programmatic API import of MAP (decided: CLI subprocess only)
- MAP as a "simple executor" that only runs the execute stage
- Cherry-picking MAP for individual steps (spec-only, review-only)
- Supporting MAP's interactive TUI mode from gh-issue-pipeline
- Changes to MAP's TUI/Ink interface (headless is additive)

## Acceptance Criteria

- [ ] **MAP headless mode**: `map --headless "prompt"` runs full spec→review→execute pipeline non-interactively, auto-approves at feedback, outputs structured JSON to stdout
- [ ] **MAPWrapper implements AIProvider**: `invokeAgent()` runs full MAP pipeline in working directory; `invokeStructured()` returns passthrough/no-op when MAP is the selected provider
- [ ] **AIRouter configurable chain**: Provider chain order is defined in YAML config (e.g., `providerChain: [map, claude, codex]`); any provider can be included/excluded
- [ ] **Single YAML config**: `config.yaml` replaces `repos.json` with all settings (repos, provider chain, MAP adapter assignments, per-provider timeouts, quota limits)
- [ ] **IssueProcessor conditional flow**: When MAP is the selected provider, step 5 (spec generation via `invokeStructured`) is skipped; step 6 (`invokeAgent`) delegates the full issue to MAP's pipeline
- [ ] **Quota tracking for MAP**: Monthly quota limit for MAP calls, auto-reset at UTC month boundary, configurable in YAML
- [ ] **E2E test**: Real MAP binary processes an issue end-to-end — MAP headless mode runs, files are created in working directory, JSON output is parsed correctly
- [ ] **Unit tests for MAPWrapper**: Spawn correctness, JSON output parsing, error handling (`AIBinaryNotFoundError` on ENOENT, `AITimeoutError`, `AIInvocationError`), AIRouter fallback behavior

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| MAP can be used as a simple provider in the fallback chain | MAP's 3-stage pipeline doesn't map cleanly to the 2-method AIProvider interface | MAP replaces steps 5+6 combined via `invokeAgent`; `invokeStructured` is passthrough |
| MAP should use its own config independently | Two config files increases cognitive load | Single YAML config in gh-issue-pipeline includes MAP adapter assignments |
| MAP should be called programmatically | All existing providers use CLI subprocess | CLI subprocess via `invokeProcess()`, requires headless mode in MAP |
| The fallback chain order is hardcoded | User needs flexibility for different environments | Fully configurable chain order in YAML config |
| MAP fits between existing providers in a fixed position | Different users have different quality/speed preferences | User defines chain order; MAP can be first, last, or anywhere |

## Technical Context

### gh-issue-pipeline (brownfield)
- **Entry point**: `src/index.ts` → `run()` wires dependencies, delegates to `PipelineRunner`
- **AI layer**: `AIProvider` interface with `invokeStructured<T>()` and `invokeAgent()` methods
- **Router**: `src/ai/router.ts` — currently hardcoded chain `claude → codex → ollama`
- **Base wrapper**: `src/ai/base-wrapper.ts` — `invokeProcess()` spawns CLI subprocesses
- **Existing wrappers**: `claude-wrapper.ts`, `codex-wrapper.ts`, `ollama-wrapper.ts`
- **Config**: `src/config/config.ts` — Zod-validated JSON from `repos.json`
- **State**: `src/config/state.ts` — `.pipeline-state.json` with quota tracking
- **Issue processor**: `src/pipeline/issue-processor.ts` — 18-step pipeline
- **Prompts**: `src/pipeline/prompts.ts` — 4 prompt builders

### multi-agent-pipeline (MAP)
- **Entry point**: `src/cli.ts` → Ink TUI app
- **State machine**: XState v5 in `src/pipeline/machine.ts` (7 states: idle → specifying → reviewing → feedback → executing → complete/cancelled)
- **Adapters**: `src/adapters/` — `claude-adapter.ts`, `codex-adapter.ts`, `ollama-adapter.ts` (all implement `AgentAdapter` interface)
- **Config**: `src/config/loader.ts` — YAML from `pipeline.yaml` with per-stage adapter assignments
- **Prompts**: `src/prompts/` — `spec-system.ts`, `review-system.ts`, `execute-system.ts`, `feedback-system.ts`
- **Key types**: `AgentAdapter`, `PipelineConfig`, `Spec`, `ReviewedSpec`, `RefinementScore`, `ExecutionResult`

### Key Integration Points
- MAPWrapper in gh-issue-pipeline spawns `map --headless --output-dir <tmpdir> --config <path> "prompt"`
- MAP outputs JSON: `{ success: boolean, spec: string, filesCreated: string[], outputDir: string, testsTotal: number, testsPassing: number }`
- AIRouter refactored from hardcoded chain to configurable array from YAML config
- Config migration: `repos.json` (Zod/JSON) → `config.yaml` (Zod/YAML with `yaml` npm package)

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| AIRouter | core domain | providerChain, configurable order | selects from AIProvider instances |
| AIProvider | core domain | invokeStructured, invokeAgent | interface implemented by all wrappers |
| MAPWrapper | core domain | binary="map", headless flag, JSON parsing | implements AIProvider, spawns MAP CLI |
| HeadlessMode | core domain | --headless flag, auto-approve, JSON stdout | new feature added to MAP |
| IssueProcessor | core domain | 18-step pipeline, conditional flow | skips step 5 when MAP selected |
| PipelineConfig | supporting | YAML format, provider chain, timeouts, quotas, MAP adapters | configures entire system |
| invokeProcess | supporting | binary, args, timeoutMs | subprocess mechanism for all wrappers |
| StateManager | supporting | quota per provider, processed issues, monthly reset | tracks MAP quota alongside others |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 5 | 5 | - | - | N/A |
| 2 | 6 | 1 | 0 | 5 | 83% |
| 3 | 7 | 1 | 0 | 6 | 86% |
| 4 | 8 | 1 | 0 | 7 | 88% |
| 5 | 8 | 0 | 0 | 8 | 100% |
| 6 | 8 | 0 | 1 | 7 | 100% |
| 7 | 8 | 0 | 0 | 8 | 100% |
| 8 | 8 | 0 | 0 | 8 | 100% |

Domain model fully converged at round 5 and remained stable through round 8.

## Example YAML Config

```yaml
# config.yaml — replaces repos.json
repos:
  - owner: your-org
    name: your-repo
    defaultBranch: main
    testCommand: pnpm test

# Provider chain order (first available is used)
providerChain:
  - map
  - claude
  - codex
  # ollama omitted = not used

# Per-provider configuration
providers:
  map:
    # MAP's internal adapter assignments (passed via --config)
    agents:
      spec:
        adapter: claude
      review:
        adapter: codex
      execute:
        adapter: claude
    timeoutMs: 1800000  # 30 minutes (full pipeline)
    quota: 50           # monthly limit
  claude:
    timeoutMs: 1200000  # 20 minutes
    quota: 100
  codex:
    timeoutMs: 1200000
    quota: 50
  ollama:
    model: qwen2.5-coder:latest
    timeoutMs: 120000   # 2 minutes
    # no quota (unlimited)

maxIssuesPerRun: 10
```

## Interview Transcript
<details>
<summary>Full Q&A (8 rounds)</summary>

### Round 1
**Q:** The gh-issue-pipeline currently makes 4 AI calls per issue via AIRouter (spec generation, implementation, code review, address feedback). MAP has its own 3-stage pipeline (spec → review → execute with TDD). When you say 'utilize MAP in the different steps', which integration model do you envision?
**A:** MAP as a new AIProvider — 4th provider in the AIRouter fallback chain (claude → codex → ollama → map). MAP's adapters would be called via invokeStructured/invokeAgent just like the others.
**Ambiguity:** 69% (Goal: 0.50, Constraints: 0.10, Criteria: 0.10, Context: 0.60)

### Round 2
**Q:** The existing Claude/Codex/Ollama wrappers all spawn CLI subprocesses via `invokeProcess()` in `src/ai/base-wrapper.ts`. MAP exposes both a CLI (`map "prompt"`) and a programmatic TypeScript API (exported types + adapters). How should the new MAPWrapper invoke MAP?
**A:** CLI subprocess (like others) — spawn `map` as a subprocess, consistent with existing pattern. Requires MAP to be built and on PATH. Parses stdout for results.
**Ambiguity:** 61% (Goal: 0.55, Constraints: 0.35, Criteria: 0.10, Context: 0.55)

### Round 3
**Q:** MAP currently launches an interactive TUI (Ink/React) that requires user input for spec approval and feedback loops. But gh-issue-pipeline's `invokeProcess()` spawns a process, captures stdout, and waits for exit. This means MAP needs a non-interactive/headless mode. Does this mean you're planning to add a headless CLI mode to MAP?
**A:** Add headless mode to MAP — `--headless` flag that skips the TUI, auto-approves specs, and outputs structured JSON results to stdout. This is new work in the MAP repo.
**Ambiguity:** 54% (Goal: 0.70, Constraints: 0.40, Criteria: 0.10, Context: 0.60)

### Round 4 (Contrarian Mode)
**Q:** The existing `AIProvider` interface has two methods (`invokeStructured` returns parsed JSON, `invokeAgent` writes files in a working directory). MAP's headless pipeline does spec+review+execute as one unit. Forcing MAP into the 2-method interface may be fighting the grain — what if MAP should replace the entire per-issue flow instead of fitting into individual method calls?
**A:** MAP replaces steps 5+6 combined — when the pipeline reaches the implementation phase, it hands the issue to MAP which does spec+review+execute as one unit, replacing steps 5 AND 6. invokeStructured is skipped for MAP, only invokeAgent is used.
**Ambiguity:** 49% (Goal: 0.80, Constraints: 0.45, Criteria: 0.10, Context: 0.65)

### Round 5
**Q:** If I showed you the finished integration and ran `pnpm test`, what would make you say 'yes, that's it'?
**A:** E2E with real MAP binary — full end-to-end: the pipeline processes a test issue using MAP's headless mode against a real repo. Requires MAP to be installed and functional. Plus all unit tests.
**Ambiguity:** 37% (Goal: 0.80, Constraints: 0.45, Criteria: 0.55, Context: 0.65)

### Round 6 (Simplifier Mode)
**Q:** MAP has its own config (`pipeline.yaml`) where users assign adapters per stage. gh-issue-pipeline has `repos.json` for repo list and quota limits. What's the simplest configuration model?
**A:** Single config for all in YAML format (not JSON) — YAML is easier for humans to work with. Everything in one file including MAP's adapter assignments.
**Ambiguity:** 34% (Goal: 0.80, Constraints: 0.60, Criteria: 0.55, Context: 0.65)

### Round 7
**Q:** Which of the proposed 8 acceptance criteria are must-haves vs nice-to-haves?
**A:** All are must-haves — every criterion is required before this is considered done.
**Ambiguity:** 24% (Goal: 0.85, Constraints: 0.65, Criteria: 0.80, Context: 0.70)

### Round 8
**Q:** Where should MAP sit in the AIRouter fallback chain? Currently it's claude → codex → ollama.
**A:** Fully configurable order — user defines the entire chain order in YAML config. No hardcoded position. Any provider can be first, last, or excluded. Per-provider timeouts also configurable.
**Ambiguity:** 17% (Goal: 0.90, Constraints: 0.80, Criteria: 0.80, Context: 0.75)

</details>
