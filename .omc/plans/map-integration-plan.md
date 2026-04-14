# Implementation Plan: Integrate MAP as AIProvider (v3 — Post-Critic Review)

## Source Spec
`.omc/specs/deep-interview-map-integration.md`

## Changelog
- **v3**: Fixed Critic findings: corrected AIInvocationError constructor signature, moved quota increment after success, added wrapper constructor refactoring step, added barrel export update, fixed default config path, fixed invokeStructuredThenAgent prompt handling for full-pipeline providers, addressed exactOptionalPropertyTypes interaction.
- **v2**: Addressed all Architect feedback: replaced invokeStructured passthrough with capability flag, extracted scanModifiedFiles, promoted StateManager refactor, fixed all line numbers, specified temp config mapping, added HeadlessResult versioning, addressed OllamaWrapper gap and stderr risk.

## Requirements Summary

Integrate multi-agent-pipeline (MAP) as a 4th AIProvider in gh-issue-pipeline, invoked via CLI subprocess with a new `--headless` mode. Changes span two repositories:

1. **MAP repo**: Add `--headless` flag for non-interactive pipeline execution with JSON output
2. **gh-issue-pipeline repo**: Add MAPWrapper, refactor AIRouter for configurable chains, migrate config to YAML

When MAP is selected by the AIRouter, it replaces steps 5+6 (spec + implementation) with a single `invokeAgent` call that runs MAP's full 3-stage pipeline internally.

---

## RALPLAN-DR Summary

### Principles
1. **Consistency**: MAPWrapper follows the same subprocess pattern as existing wrappers (claude-wrapper, codex-wrapper, ollama-wrapper)
2. **Configuration simplicity**: Single YAML config file for the entire system, including MAP's internal adapter assignments
3. **Composability**: Provider chain order is user-configurable, not hardcoded — any provider can be first, last, or excluded
4. **Separation of concerns**: MAP handles its own spec→review→execute pipeline internally; gh-issue-pipeline handles git/GitHub operations around it
5. **Honest contracts**: AIProvider interface extended with a capability flag rather than faking invokeStructured results — no semantic lies in the type system

### Decision Drivers
1. **User configuration UX** — the user explicitly wants "configuration as easy as possible" with YAML format
2. **Architectural fit** — MAP's 3-stage pipeline doesn't map 1:1 to invokeStructured/invokeAgent, so the router needs to know which providers handle the full pipeline atomically
3. **Type safety** — no `null as unknown as T` casts; the AIProvider contract must be honest about capabilities

### Viable Options

#### Option A: Thin MAPWrapper + Capability Flag + Headless Mode (Chosen)
MAPWrapper implements AIProvider with `handlesFullPipeline: true`. AIRouter checks this flag and skips `invokeStructured` for full-pipeline providers, routing directly to `invokeAgent`. MAP gets a `--headless` flag. Config migrated to YAML with configurable chain.

**Pros:**
- Honest type contract — no passthrough fakes
- Router-level branching — IssueProcessor doesn't need `=== 'map'` checks
- Future-proof — any new provider with atomic pipeline support just sets the flag
- Consistent subprocess pattern

**Cons:**
- Cross-repo changes
- AIProvider interface change touches all existing wrappers (adding `handlesFullPipeline: false`)
- Config migration scope

#### Option B: MAP Replaces Entire IssueProcessor Flow
**Invalidated**: Duplicates git/GitHub orchestration, prevents per-step fallback granularity if MAP fails partway through.

---

## Acceptance Criteria

- [ ] AC1: `map --headless "prompt"` runs full pipeline non-interactively, auto-approves at feedback, outputs versioned JSON (`{version: 1, ...}`) to stdout
- [ ] AC2: `map --headless --output-dir <path>` writes generated files to specified directory
- [ ] AC3: MAP headless captures all adapter output internally; only final JSON result goes to stdout, everything else to stderr
- [ ] AC4: MAPWrapper.invokeAgent() spawns `map --headless`, parses JSON output, returns AgentResult with filesWritten
- [ ] AC5: MAPWrapper declares `handlesFullPipeline: true`; AIRouter skips invokeStructured for such providers
- [ ] AC6: AIRouter reads `providerChain` from YAML config and iterates in specified order
- [ ] AC7: AIRouter skips providers that don't support the requested method (e.g., OllamaWrapper throws from invokeAgent → skip to next, don't propagate)
- [ ] AC8: `config.yaml` replaces `repos.json` — validated by Zod, includes repos, providerChain, providers (with MAP agents, timeouts, quotas)
- [ ] AC9: IssueProcessor delegates to AIRouter which handles the full-pipeline branching — IssueProcessor has no `=== 'map'` checks
- [ ] AC10: StateManager.quota type is extensible (`Record<AIModel, QuotaState>`) with MAP quota, monthly reset
- [ ] AC11: E2E test: real MAP binary processes a prompt, creates files, returns valid JSON
- [ ] AC12: Unit tests: MAPWrapper spawn, parse, error handling (ENOENT → AIBinaryNotFoundError, timeout → AITimeoutError, non-zero → AIInvocationError)
- [ ] AC13: Unit tests: AIRouter respects configurable chain order, skips unsupported methods, falls back correctly
- [ ] AC14: Unit tests: YAML config loading, validation, ProviderConfig with MAP agents

---

## Implementation Steps

### Phase 0: Preparatory Refactors (gh-issue-pipeline repo)

#### Step 0.1: Extract scanModifiedFiles to shared module
**File:** `src/ai/file-scanner.ts` (NEW)
**Why:** `scanModifiedFiles` is duplicated in `claude-wrapper.ts:31` and `codex-wrapper.ts:44`. MAPWrapper will need it too. Extract before adding a third copy.

- Move the function to `src/ai/file-scanner.ts`
- Update `claude-wrapper.ts:31` → import from `./file-scanner.js`
- Update `codex-wrapper.ts:44` → import from `./file-scanner.js`
- Verify existing tests still pass

#### Step 0.2: Refactor StateManager — extract hasQuota/chain iteration
**File:** `src/config/state.ts` (MODIFY)
**Why:** `getAvailableModel()` at line 109 has hardcoded `claude → codex → ollama` priority and owns provider selection. With configurable chains, the AIRouter should own chain iteration; StateManager just answers "does this model have quota?"

Changes:
- Add method `hasQuota(model: AIModel): boolean` — returns true if model has remaining quota or is unlimited
- Widen `incrementUsage()` type from `(model: 'claude' | 'codex')` to `(model: AIModel)` at line 122 — with `noUncheckedIndexedAccess` enabled, `state.quota[model]` returns `QuotaState | undefined`, so add a guard: `const q = this.state.quota[model]; if (!q) return;`
- Keep `getAvailableModel()` for backward compatibility but deprecate
- Change `PipelineState.quota` type at `src/types/index.ts:38-44` from fixed `{ claude: QuotaState; codex: QuotaState }` to `Record<AIModel, QuotaState>` — this is a **state file schema change** requiring migration logic in `StateManager.load()`

Migration in `load()` (around line 55): if loaded state has only `claude`/`codex` keys in `quota`, add `ollama` and `map` entries with `{ used: 0, limit: Infinity }` and `{ used: 0, limit: 50 }` defaults.

#### Step 0.3: Add handlesFullPipeline capability to AIProvider
**File:** `src/types/index.ts` (MODIFY line 87-91)

```typescript
interface AIProvider {
  readonly model: AIModel;
  readonly handlesFullPipeline: boolean; // true = provider does spec+impl atomically
  invokeStructured<T>(prompt: string, schema: object): Promise<StructuredResult<T>>;
  invokeAgent(prompt: string, workingDir: string): Promise<AgentResult>;
}
```

Update existing wrappers to add `readonly handlesFullPipeline = false`:
- `src/ai/claude-wrapper.ts:53` (ClaudeWrapper class)
- `src/ai/codex-wrapper.ts` (CodexWrapper class)
- `src/ai/ollama-wrapper.ts` (OllamaWrapper class)

#### Step 0.4: Refactor wrapper constructors to accept ProviderConfig
**Files:** `src/ai/claude-wrapper.ts:56-59`, `src/ai/codex-wrapper.ts:69-72`, `src/ai/ollama-wrapper.ts` (MODIFY)
**Why:** Plan Phase 4 constructs wrappers as `new ClaudeWrapper(config.providers?.claude)` but current constructors take positional `(structuredTimeoutMs: number, agentTimeoutMs: number)`. Must refactor to accept `ProviderConfig`.

ClaudeWrapper change (at line 56):
```typescript
// Before:
constructor(
  private readonly structuredTimeoutMs = DEFAULT_STRUCTURED_TIMEOUT_MS,
  private readonly agentTimeoutMs = DEFAULT_AGENT_TIMEOUT_MS,
) {}

// After:
constructor(private readonly config?: ProviderConfig) {
  this.structuredTimeoutMs = config?.timeoutMs ?? DEFAULT_STRUCTURED_TIMEOUT_MS;
  this.agentTimeoutMs = config?.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
}
```

Same pattern for CodexWrapper. OllamaWrapper already takes a model string; change to:
```typescript
constructor(private readonly config?: ProviderConfig) {
  this.modelName = config?.model ?? 'qwen2.5-coder:latest';
}
```

Update existing wrapper tests to verify construction with ProviderConfig.

### Phase 1: MAP Headless Mode (multi-agent-pipeline repo)

#### Step 1.1: Add HeadlessResult type
**File:** `src/types/headless.ts` (NEW)

```typescript
export interface HeadlessOptions {
  prompt: string;
  outputDir?: string;
  configPath?: string;
}

export interface HeadlessResult {
  version: 1;  // Schema version for forward compatibility
  success: boolean;
  spec: string;
  filesCreated: string[];
  outputDir: string;
  testsTotal: number;
  testsPassing: number;
  testsFailing: number;
  duration: number;
  error?: string;
}
```

Export from `src/index.ts` (after line 37).

#### Step 1.2: Add headless runner module
**File:** `src/headless/runner.ts` (NEW)

Create `runHeadless(options: HeadlessOptions): Promise<HeadlessResult>`:
- Load config via `loadConfig()` from `src/config/loader.ts`, optionally from `options.configPath`
- Create pipeline actor from XState machine using `createPipelineActor()` (`src/pipeline/machine.ts:153`)
- Override `outputDir` in context if `options.outputDir` provided
- Subscribe to state transitions:
  - On `specifying` → wait for SPEC_COMPLETE (adapter runs spec stage)
  - On `reviewing` → wait for REVIEW_COMPLETE (adapter runs review stage)
  - On `feedback` → auto-send APPROVE event (no user interaction — `src/pipeline/machine.ts:83-103`)
  - On `executing` → wait for EXECUTE_COMPLETE
  - On `complete` → collect `ExecutionResult` (`src/types/spec.ts:35-43`)
  - On `failed`/`cancelled` → return error result
- **Critical**: Redirect all adapter output (streaming chunks from `AgentAdapter.run()`) to `process.stderr`, NOT `process.stdout`. Only the final JSON result goes to stdout. This prevents non-JSON contamination.
- Return `HeadlessResult` with `version: 1`

#### Step 1.3: Modify CLI entry point for --headless flag
**File:** `src/cli.ts` (MODIFY — `main()` at line 13, before TUI render at line 41)

Add before `render()`:
```typescript
if (args.includes('--headless')) {
  const prompt = args.filter(a => !a.startsWith('--')).join(' ');
  const outputDir = extractFlag(args, '--output-dir');
  const configPath = extractFlag(args, '--config');
  
  const result = await runHeadless({ prompt, outputDir, configPath });
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(result.success ? 0 : 1);
}
```

Add `extractFlag(args: string[], flag: string): string | undefined` helper that finds `--flag value` pairs.

#### Step 1.4: Tests for headless mode
**Files:** `test/unit/headless/runner.test.ts`, `test/integration/headless.test.ts` (NEW)

Unit tests:
- State machine transitions correctly in headless mode
- Auto-approve fires at feedback state
- HeadlessResult includes `version: 1`
- Adapter output goes to stderr, only JSON to stdout
- Error cases: adapter failure → `{ success: false, error: "..." }`

Integration tests (require adapter binaries):
- Full pipeline with real or mock adapter
- `--output-dir` creates files in specified path
- `--config` uses specified config file

### Phase 2: Config Migration (gh-issue-pipeline repo)

#### Step 2.1: Add yaml dependency
**File:** `package.json` (MODIFY)

Add `"yaml": "^2.8.0"` to `dependencies`.

#### Step 2.2: Extend AIModel type
**File:** `src/types/index.ts` (MODIFY line 46)

```typescript
// Before:
type AIModel = 'claude' | 'codex' | 'ollama';
// After:
type AIModel = 'claude' | 'codex' | 'ollama' | 'map';
```

#### Step 2.3: Add ProviderConfig type
**File:** `src/types/index.ts` (ADD after line 30)

```typescript
interface ProviderConfig {
  timeoutMs?: number;
  quota?: number;
  model?: string;
  agents?: {  // MAP-specific: maps to MAP's AgentAssignment
    spec?: { adapter: 'claude' | 'codex' | 'ollama' };
    review?: { adapter: 'claude' | 'codex' | 'ollama' };
    execute?: { adapter: 'claude' | 'codex' | 'ollama' };
  };
}
```

Note: `agents.*.adapter` uses MAP's `AdapterType` values (`'claude' | 'codex' | 'ollama'` from `multi-agent-pipeline/src/types/adapter.ts:1`), NOT gh-issue-pipeline's `AIModel`.

#### Step 2.4: Extend PipelineConfig type
**File:** `src/types/index.ts` (MODIFY line 22-30)

Add to existing `PipelineConfig`:
```typescript
providerChain?: AIModel[];
providers?: Partial<Record<AIModel, ProviderConfig>>;
```

**Note on `exactOptionalPropertyTypes`**: With this tsconfig flag enabled, optional properties cannot be explicitly assigned `undefined`. Zod's `.optional()` produces `T | undefined` which is incompatible. Use the `toTyped()` mapping function (already exists at config.ts) to strip `undefined` values before returning, or use Zod's `.transform()` to remove undefined keys. The existing `toTyped()` pattern at config.ts already handles this for current optional fields — extend it for the new fields.

#### Step 2.5: Rewrite config loader for YAML
**File:** `src/config/config.ts` (MODIFY)

- Add `import { parse as parseYaml } from 'yaml'`
- Update Zod schema (`PipelineConfigSchema` at line 13) to include:
  - `providerChain: z.array(z.enum(['claude','codex','ollama','map'])).optional()`
  - `providers: z.record(z.enum(['claude','codex','ollama','map']), ProviderConfigSchema).optional()`
- Add `ProviderConfigSchema` Zod object matching `ProviderConfig` type
- Update `loadConfig()` (line 50): try `config.yaml` first (parse with `parseYaml`), fall back to `repos.json` (JSON is valid YAML, so `parseYaml` handles both)
- Apply defaults for missing `providerChain` (default: `['claude', 'codex', 'ollama']`)

#### Step 2.6: Create config.yaml.example
**File:** `config.yaml.example` (NEW)

```yaml
# config.yaml — single configuration for gh-issue-pipeline
# Replaces the previous repos.json format

repos:
  - owner: your-org
    name: your-repo
    defaultBranch: main
    testCommand: pnpm test

# Provider chain order — first available provider with quota is used
# Remove a provider to exclude it from the chain
providerChain:
  - map
  - claude
  - codex
  # - ollama  # uncomment to add as last resort

# Per-provider configuration
providers:
  map:
    timeoutMs: 1800000  # 30 minutes (MAP runs full spec→review→execute)
    quota: 50           # monthly invocation limit
    # MAP's internal adapter assignments
    # These control which AI model MAP uses for each pipeline stage
    agents:
      spec:
        adapter: claude     # claude | codex | ollama
      review:
        adapter: codex
      execute:
        adapter: claude
  claude:
    timeoutMs: 1200000  # 20 minutes
    quota: 100
  codex:
    timeoutMs: 1200000
    quota: 50
  ollama:
    model: qwen2.5-coder:latest
    timeoutMs: 120000   # 2 minutes
    # no quota — unlimited

maxIssuesPerRun: 10
```

#### Step 2.7: Update default config path in index.ts
**File:** `src/index.ts` (MODIFY around line 14 and line 29)
**Why:** The entry point currently defaults to `'./repos.json'`. With the YAML migration, the default must change to `'./config.yaml'`. The `loadConfig()` function takes an explicit path, so the fallback logic (try config.yaml, then repos.json) must live in `index.ts`:

```typescript
// Before:
const configPath = values.config ?? './repos.json';

// After:
const configPath = values.config ?? (
  existsSync('./config.yaml') ? './config.yaml' : './repos.json'
);
```

This provides backward compatibility: if the user has `repos.json` but no `config.yaml`, it still works. The YAML parser handles JSON transparently.

#### Step 2.8: Update config tests
**File:** `test/unit/config/config.test.ts` (MODIFY)

- Update existing tests from JSON to YAML format
- Add tests for: providerChain validation, ProviderConfig with MAP agents, default chain when omitted, loading repos.json as fallback (YAML parser handles JSON)

### Phase 3: MAPWrapper (gh-issue-pipeline repo)

#### Step 3.1: Create MAPWrapper
**File:** `src/ai/map-wrapper.ts` (NEW)

```typescript
import { invokeProcess } from './base-wrapper.js';
import { scanModifiedFiles } from './file-scanner.js';
import type { AIModel, AIProvider, AgentResult, StructuredResult, ProviderConfig } from '../types/index.js';

export class MAPWrapper implements AIProvider {
  readonly model: AIModel = 'map';
  readonly handlesFullPipeline = true;

  constructor(private readonly config?: ProviderConfig) {}

  async invokeStructured<T>(): Promise<StructuredResult<T>> {
    // Full-pipeline providers should never have invokeStructured called.
    // AIRouter checks handlesFullPipeline and skips this method.
    // This exists only to satisfy the interface — throw if called directly.
    throw new Error('MAPWrapper does not support invokeStructured — use invokeAgent (handlesFullPipeline=true)');
  }

  async invokeAgent(prompt: string, workingDir: string): Promise<AgentResult> {
    const beforeMs = Date.now();
    const args = ['--headless', '--output-dir', workingDir];

    // Bridge config: write temp pipeline.yaml from config.agents if provided
    const tempConfigPath = await this.writeTempMapConfig(workingDir);
    if (tempConfigPath) {
      args.push('--config', tempConfigPath);
    }

    args.push(prompt);

    const timeoutMs = this.config?.timeoutMs ?? 1_800_000; // 30min default
    const { stdout } = await invokeProcess({
      command: 'map',
      args,
      cwd: workingDir,
      timeoutMs,
      model: 'map',
    });

    // Parse the last line of stdout as JSON (MAP writes final result as last line)
    const lines = stdout.trim().split('\n');
    const jsonLine = lines[lines.length - 1]!;
    const result = JSON.parse(jsonLine) as { version: number; success: boolean; spec: string; filesCreated: string[]; error?: string };

    if (!result.success) {
      // AIInvocationError(model, exitCode, message) — 3 args per src/ai/errors.ts:18-25
      throw new AIInvocationError('map', 1, 'MAP pipeline failed: ' + (result.error ?? '').slice(0, 200));
    }

    const filesWritten = scanModifiedFiles(workingDir, beforeMs);

    // Note: AgentResult has { success, filesWritten, stdout, stderr } — no model field.
    // The model field is added by AIRouter's spread, not by the wrapper.
    return {
      success: true,
      filesWritten,
      stdout: result.spec,
      stderr: '',
    };
  }

  private async writeTempMapConfig(baseDir: string): Promise<string | undefined> {
    if (!this.config?.agents) return undefined;
    // Generate MAP-compatible pipeline.yaml
    const mapConfig = {
      agents: {
        spec: { adapter: this.config.agents.spec?.adapter ?? 'claude' },
        review: { adapter: this.config.agents.review?.adapter ?? 'codex' },
        execute: { adapter: this.config.agents.execute?.adapter ?? 'claude' },
      },
      outputDir: baseDir,
      gitCheckpoints: false, // Not needed — gh-issue-pipeline handles git
    };
    // Write to temp file in baseDir
    const configPath = path.join(baseDir, '.map-pipeline.yaml');
    await fs.writeFile(configPath, yaml.stringify(mapConfig), 'utf-8');
    return configPath;
  }
}
```

**Schema mapping** (bridging gh-issue-pipeline config → MAP's `PipelineConfig` at `multi-agent-pipeline/src/types/config.ts:8-16`):
- `config.agents.spec.adapter` → MAP's `agents.spec.adapter` (same string values: `'claude' | 'codex' | 'ollama'`)
- `config.agents.review.adapter` → MAP's `agents.review.adapter`
- `config.agents.execute.adapter` → MAP's `agents.execute.adapter`
- `outputDir` → set to `workingDir` (the cloned repo tmpdir)
- `gitCheckpoints` → `false` (gh-issue-pipeline manages git operations)

#### Step 3.2: Update barrel export
**File:** `src/ai/index.ts` (MODIFY)
Add `export { MAPWrapper } from './map-wrapper.js'` alongside the existing wrapper exports.

#### Step 3.3: MAPWrapper unit tests
**File:** `test/unit/ai/map-wrapper.test.ts` (NEW)

Test cases:
- invokeAgent spawns `map --headless --output-dir <dir> <prompt>`
- invokeAgent with config.agents writes temp `.map-pipeline.yaml` and passes `--config`
- invokeAgent parses JSON stdout (last line) into AgentResult
- invokeAgent throws AIBinaryNotFoundError when `map` not on PATH (ENOENT)
- invokeAgent throws AITimeoutError on timeout (30min default, configurable)
- invokeAgent throws AIInvocationError (model='map', exitCode=1, message) on non-zero exit or `success: false`
- invokeStructured throws Error (should never be called)
- handlesFullPipeline is true
- Temp config matches MAP's expected schema (agents with AdapterType values, outputDir, gitCheckpoints: false)

### Phase 4: AIRouter Refactor (gh-issue-pipeline repo)

#### Step 4.1: Refactor AIRouter for configurable chain + capability awareness
**File:** `src/ai/router.ts` (MODIFY)

Current state:
- Line 5: `ProvidersMap = Record<AIModel, AIProvider>` (requires all providers)
- Line 8: `FALLBACK_ORDER: AIModel[] = ['claude', 'codex', 'ollama']` (hardcoded)
- Line 10: `AIRouter` class constructor
- Line 16: `invokeStructured` iterates FALLBACK_ORDER
- Line 43: `invokeAgent` iterates FALLBACK_ORDER
- Line 68: `buildCandidates()` slices FALLBACK_ORDER
- Line 75: `trackUsage()` only accepts claude/codex

Changes:

```typescript
type ProvidersMap = Partial<Record<AIModel, AIProvider>>;

class AIRouter {
  constructor(
    private state: StateManager,
    private providers: ProvidersMap,
    private providerChain: AIModel[],
  ) {}

  async invokeStructuredThenAgent<T>(
    structuredPrompt: string,
    schema: object,
    agentPrompt: string | ((spec: string) => string),
    workingDir: string,
  ): Promise<{ structured: StructuredResult<T> | null; agent: AgentResult; model: AIModel }> {
    // New method that handles the full-pipeline branching:
    // For handlesFullPipeline providers: skip structured, call invokeAgent with the raw prompt
    // For standard providers: call invokeStructured, then invokeAgent with spec-derived prompt
    for (const model of this.getChainCandidates()) {
      const provider = this.providers[model];
      if (!provider) continue;
      try {
        if (provider.handlesFullPipeline) {
          // Full-pipeline providers receive the raw structuredPrompt (the issue text),
          // NOT the lambda. They generate spec+implement internally.
          const agent = await provider.invokeAgent(structuredPrompt, workingDir);
          this.state.incrementUsage(model); // Increment AFTER success (mirrors router.ts:27)
          return { structured: null, agent, model };
        } else {
          const structured = await provider.invokeStructured<T>(structuredPrompt, schema);
          const spec = (structured.data as any)?.spec ?? structured.rawOutput;
          const finalPrompt = typeof agentPrompt === 'function' ? agentPrompt(spec) : agentPrompt;
          const agent = await provider.invokeAgent(finalPrompt, workingDir);
          this.state.incrementUsage(model); // Increment AFTER success
          return { structured, agent, model };
        }
      } catch (e) {
        if (e instanceof AIBinaryNotFoundError) continue;
        throw e;
      }
    }
    throw new Error('No AI provider available');
  }

  // Keep existing invokeStructured/invokeAgent for steps 13-16 (review/fix)
  async invokeStructured<T>(prompt: string, schema: object): Promise<StructuredResult<T> & { model: AIModel }> {
    for (const model of this.getChainCandidates()) {
      const provider = this.providers[model];
      if (!provider || provider.handlesFullPipeline) continue; // Skip full-pipeline providers
      try {
        const result = await provider.invokeStructured<T>(prompt, schema);
        this.state.incrementUsage(model); // Increment AFTER success
        return { ...result, model };
      } catch (e) {
        if (e instanceof AIBinaryNotFoundError) continue;
        throw e;
      }
    }
    throw new Error('No AI provider available for structured calls');
  }

  async invokeAgent(prompt: string, workingDir: string): Promise<AgentResult & { model: AIModel }> {
    for (const model of this.getChainCandidates()) {
      const provider = this.providers[model];
      if (!provider) continue;
      try {
        const result = await provider.invokeAgent(prompt, workingDir);
        this.state.incrementUsage(model); // Increment AFTER success
        return { ...result, model };
      } catch (e) {
        if (e instanceof AIBinaryNotFoundError) continue;
        // Also catch invokeAgent-not-supported (e.g., OllamaWrapper throws AIInvocationError)
        if (e instanceof AIInvocationError && e.message.includes('does not support')) continue;
        throw e;
      }
    }
    throw new Error('No AI provider available for agent calls');
  }

  private getChainCandidates(): AIModel[] {
    return this.providerChain.filter(m => this.state.hasQuota(m));
  }
}
```

**Key design decisions:**
- New `invokeStructuredThenAgent()` method encapsulates the full-pipeline branching — IssueProcessor calls this for steps 5+6 instead of separate calls
- `invokeStructured()` skips full-pipeline providers (they don't support it)
- `invokeAgent()` catches unsupported-method errors and continues fallback (fixes OllamaWrapper gap)
- `ProvidersMap` becomes `Partial<Record<...>>` — providers not in chain are simply absent

#### Step 4.2: Update IssueProcessor to use new router method
**File:** `src/pipeline/issue-processor.ts` (MODIFY lines 87-110)

Replace separate steps 5+6 with:
```typescript
// Steps 5+6: Spec + Implementation (combined for full-pipeline providers)
const { structured: specResult, agent: implResult, model } = 
  await this.ai.invokeStructuredThenAgent<{ spec: string }>(
    buildSpecPrompt(issue),
    { type: 'object', properties: { spec: { type: 'string' } } },
    (spec) => buildImplementationPrompt(spec, `${repo.owner}/${repo.name}`),
    tempDir,
  );
modelUsed = model;
specText = specResult?.data?.spec ?? specResult?.rawOutput;
```

**No `=== 'map'` check** — the router handles full-pipeline branching internally based on `handlesFullPipeline` flag.

#### Step 4.3: Update AIRouter construction in index.ts
**File:** `src/index.ts` (MODIFY around line 38)

```typescript
const providerChain = config.providerChain ?? ['claude', 'codex', 'ollama'];
const providers: Partial<Record<AIModel, AIProvider>> = {};

if (providerChain.includes('claude')) providers.claude = new ClaudeWrapper(config.providers?.claude);
if (providerChain.includes('codex')) providers.codex = new CodexWrapper(config.providers?.codex);
if (providerChain.includes('ollama')) providers.ollama = new OllamaWrapper(config.providers?.ollama);
if (providerChain.includes('map')) providers.map = new MAPWrapper(config.providers?.map);

const ai = new AIRouter(state, providers, providerChain);
```

#### Step 4.4: AIRouter tests
**File:** `test/unit/ai/router.test.ts` (MODIFY)

Add tests for:
- Custom chain `[map, claude]` — invokeStructuredThenAgent uses MAP (full pipeline), skips invokeStructured
- Custom chain `[claude, codex]` — invokeStructuredThenAgent calls invokeStructured then invokeAgent
- Fallback on AIBinaryNotFoundError within custom chain
- invokeStructured skips full-pipeline providers
- invokeAgent catches OllamaWrapper's "not supported" error and continues
- getChainCandidates respects quota via hasQuota()

### Phase 5: StateManager Quota for MAP (gh-issue-pipeline repo)

#### Step 5.1: Implement changes from Step 0.2
Already specified in Phase 0. This step adds MAP-specific quota configuration:

**File:** `src/config/state.ts` (MODIFY)
- `mergeQuotaLimits()` (line 34): Accept MAP quota from `config.providers?.map?.quota`
- Default MAP quota: 50/month
- `hasQuota('map')` returns true if `used < limit`
- `incrementUsage('map')` increments counter

**File:** `test/unit/config/state.test.ts` (MODIFY)
- MAP quota tracking and monthly reset
- `hasQuota('map')` returns false when limit reached
- State file migration: old format (only claude/codex) loads correctly with MAP/ollama defaults added

### Phase 6: E2E & Integration Tests

#### Step 6.1: E2E test for MAP headless mode (MAP repo)
**File:** `test/integration/headless.test.ts` (NEW in multi-agent-pipeline repo)

- `map --headless "create a hello world Node.js CLI"` exits 0
- stdout is valid JSON matching HeadlessResult schema with `version: 1`
- `--output-dir /tmp/test` creates files in /tmp/test
- Auto-approve (no stdin required, no TUI rendered)
- stderr captures adapter output (not empty, not JSON)
- `--config <path>` uses specified config

**Hard dependency:** This test requires at least one adapter binary (claude, codex, or ollama) to be available. Skip gracefully if none found.

#### Step 6.2: E2E test for full integration (gh-issue-pipeline repo)
**File:** `test/integration/map-integration.test.ts` (NEW)

**Hard dependency:** Requires MAP binary (`map`) on PATH and built. Skip gracefully if not available.

- Load YAML config with MAP first in provider chain
- MAPWrapper.invokeAgent() processes a prompt end-to-end
- Files created in working directory
- JSON output parsed correctly into AgentResult
- AIRouter falls back to next provider when MAP not available

### Phase 7: Documentation

#### Step 7.1: Update CLAUDE.md
**File:** `CLAUDE.md` (MODIFY)

- Document `config.yaml` format (replaces `repos.json`)
- Document MAP integration: headless mode, provider chain config
- Update commands section if changed

#### Step 7.2: Rename repos.json.example → config.yaml.example
If a `repos.json.example` exists, replace it with `config.yaml.example` from Step 2.6.

---

## Execution Sequencing & Dependencies

```
Phase 0 (gh-issue-pipeline)     Phase 1 (MAP repo)
├─ 0.1 Extract scanModifiedFiles  ├─ 1.1 HeadlessResult type
├─ 0.2 Refactor StateManager      ├─ 1.2 Headless runner
├─ 0.3 Add handlesFullPipeline    ├─ 1.3 CLI --headless flag
                                   ├─ 1.4 Headless tests
        ↓ (can proceed in parallel) ↓
Phase 2 (config migration)    Phase 3 (MAPWrapper)
├─ 2.1 Add yaml dep             ├─ 3.1 MAPWrapper class
├─ 2.2 Extend AIModel           ├─ 3.2 Unit tests (mock MAP binary)
├─ 2.3-2.5 Config types+loader
├─ 2.6-2.7 Example + tests
        ↓                        ↓
Phase 4 (AIRouter refactor)  ←─── depends on Phase 2+3
├─ 4.1 Router refactor
├─ 4.2 IssueProcessor update
├─ 4.3 index.ts wiring
├─ 4.4 Router tests
        ↓
Phase 5 (Quota) → Phase 6 (E2E) → Phase 7 (Docs)
                   ↑ requires MAP binary from Phase 1
```

**Critical path:** Phase 1 (MAP headless) and Phase 0-3 (gh-issue-pipeline prep) can proceed in parallel. Phase 4 requires both. Phase 6 E2E requires Phase 1 completed and MAP binary available.

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| MAP headless mode complexity (XState without TUI) | High | Medium | MAP's state machine is decoupled from Ink; headless just skips render() and auto-sends APPROVE |
| Config migration breaks existing users | Medium | Low | YAML parser handles JSON transparently; old repos.json works with new schema + defaults |
| MAP subprocess slow (30min timeout) | Medium | Medium | Per-provider timeouts configurable; user controls chain position |
| E2E tests require MAP binary on PATH | Medium | High | Skip gracefully in CI if MAP not available; separate unit tests cover contract |
| Cross-repo JSON schema drift | Medium | Medium | HeadlessResult has `version: 1` field; MAPWrapper validates version on parse |
| PipelineState.quota schema change | Low | High | Migration logic in StateManager.load() adds missing provider entries |
| Adapter output contaminates stdout | High | Medium | MAP headless routes adapter output to stderr; only final JSON to stdout |

---

## Verification Steps

1. `pnpm test` passes in both repos with >80% coverage
2. `pnpm lint` passes in both repos
3. `pnpm build` succeeds in both repos
4. `map --headless "hello world"` outputs valid JSON with `version: 1` and exits 0
5. `map --headless --output-dir /tmp/test "hello world"` creates files in /tmp/test
6. Loading `config.yaml` with MAP provider chain works; loading old `repos.json` also works
7. AIRouter with chain `[map, claude]` tries MAP first, falls back to claude on ENOENT
8. `invokeStructuredThenAgent()` skips invokeStructured for MAP, calls it for claude
9. IssueProcessor has zero `=== 'map'` checks — branching is in AIRouter
10. StateManager tracks MAP quota with monthly reset
11. Old state files (without MAP quota) load correctly with defaults

---

## ADR: MAP Integration Architecture

### Decision
Integrate MAP as a 4th AIProvider via CLI subprocess with headless mode, using capability flags (`handlesFullPipeline`) to handle architectural mismatch, and a single YAML configuration file.

### Drivers
- User wants MAP's quality pipeline available in the automated issue pipeline
- Configuration must be simple — single YAML file
- Must compose with existing fallback chain
- Type safety — no contract violations or unsafe casts

### Alternatives Considered
1. **MAP replaces entire IssueProcessor** — rejected: duplicates git/GitHub logic, prevents fallback
2. **Fake invokeStructured passthrough** — rejected: violates AIProvider contract, introduces `null as unknown as T`
3. **MAP for individual steps only** — rejected: user chose combined steps 5+6 model
4. **Separate config files** — rejected: user wants single YAML config

### Why Chosen
Capability flag approach (`handlesFullPipeline`) maintains honest type contracts, moves branching to the router (correct abstraction layer), and composes naturally with the fallback chain. Single YAML config with schema bridging to MAP's pipeline.yaml delivers the simplest UX.

### Consequences
- **Positive**: Honest types, router-level branching, configurable chain, single config, future-proof capability system
- **Negative**: Cross-repo changes, AIProvider interface change touches all wrappers, config schema bridging creates maintenance coupling
- **Neutral**: MAP subprocess slower than direct AI calls but produces higher quality output

### Follow-ups
- Consider MAP binary auto-detection/installation hints
- Consider caching MAP specs across runs for similar issues
- Consider MAP version compatibility checking in MAPWrapper
- Consider adding more capability flags as needed (e.g., `supportsStructured`, `supportsAgent`)
