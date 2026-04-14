/**
 * StateManager — tracks processed issues and AI quota consumption.
 *
 * Quota unit: 1 per `invokeStructured` or `invokeAgent` call.
 * Limits: claude=100, codex=50 by default.
 * Monthly reset: when `resetMonth` (YYYY-MM) is a past month the counters
 * are zeroed and `resetMonth` is updated to the current UTC month.
 *
 * Writes are atomic: data is written to `<statePath>.tmp` then renamed to
 * `<statePath>`, which prevents partial-write corruption.
 */

import { writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs'
import type { PipelineState, AIModel, PipelineConfig, IssueOutcome, PROutcome, RetryConfig } from '../types/index.js'

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BACKOFF_MINUTES = 60

function currentUtcMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function buildDefaultState(): PipelineState {
  const month = currentUtcMonth()
  return {
    processedIssues: {},
    quota: {
      claude: { used: 0, limit: 100, resetMonth: month },
      codex: { used: 0, limit: 50, resetMonth: month },
    },
  }
}

function mergeQuotaLimits(
  state: PipelineState,
  quotaLimits?: PipelineConfig['quotaLimits'],
): PipelineState {
  if (quotaLimits?.claude !== undefined) {
    const q = state.quota['claude']
    if (q) q.limit = quotaLimits.claude
  }
  if (quotaLimits?.codex !== undefined) {
    const q = state.quota['codex']
    if (q) q.limit = quotaLimits.codex
  }
  return state
}

/** Migrate old number[] format to Record<number, IssueOutcome>. */
function migrateProcessedIssues(
  raw: Record<string, unknown>,
): Record<string, Record<number, IssueOutcome>> {
  const result: Record<string, Record<number, IssueOutcome>> = {}
  for (const [repo, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      // Old format: number[]
      const outcomes: Record<number, IssueOutcome> = {}
      for (const num of value as number[]) {
        outcomes[num] = {
          status: 'success',
          lastAttempt: new Date().toISOString(),
          attemptCount: 1,
        }
      }
      result[repo] = outcomes
    } else if (typeof value === 'object' && value !== null) {
      // New format: Record<number, IssueOutcome>
      result[repo] = value as Record<number, IssueOutcome>
    }
  }
  return result
}

export class StateManager {
  private readonly maxAttempts: number
  private readonly backoffMs: number

  constructor(
    private readonly statePath: string,
    private readonly quotaLimits?: PipelineConfig['quotaLimits'],
    retryConfig?: RetryConfig,
  ) {
    this.maxAttempts = retryConfig?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    this.backoffMs = (retryConfig?.backoffMinutes ?? DEFAULT_BACKOFF_MINUTES) * 60 * 1000
  }

  private load(): PipelineState {
    if (!existsSync(this.statePath)) {
      const state = mergeQuotaLimits(buildDefaultState(), this.quotaLimits)
      this.save(state)
      return state
    }

    const raw = readFileSync(this.statePath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      processedIssues: Record<string, unknown>
      reviewedPRs?: PipelineState['reviewedPRs']
      quota: PipelineState['quota']
      starPromptSeen?: boolean
    }

    const state: PipelineState = {
      processedIssues: migrateProcessedIssues(parsed.processedIssues),
      quota: parsed.quota,
    }
    if (parsed.reviewedPRs !== undefined) {
      state.reviewedPRs = parsed.reviewedPRs
    }
    if (parsed.starPromptSeen !== undefined) {
      state.starPromptSeen = parsed.starPromptSeen
    }

    mergeQuotaLimits(state, this.quotaLimits)

    // Monthly reset: iterate all quota entries and reset stale ones
    const now = currentUtcMonth()
    let dirty = false

    for (const key of Object.keys(state.quota)) {
      const q = state.quota[key]
      if (q && q.resetMonth !== now) {
        q.used = 0
        q.resetMonth = now
        dirty = true
      }
    }

    if (dirty) {
      this.save(state)
    }

    return state
  }

  /** Atomic write: write to .tmp then rename to avoid partial-write corruption. */
  private save(state: PipelineState): void {
    const tmp = `${this.statePath}.tmp`
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8')
    renameSync(tmp, this.statePath)
  }

  /**
   * Returns true if the issue should be processed:
   * - Never seen before → true
   * - Previous success → false
   * - Previous failure AND under max retries AND backoff elapsed → true
   * - Previous failure at/over max retries → false
   */
  shouldProcessIssue(repoFullName: string, issueNumber: number): boolean {
    const state = this.load()
    const repoIssues = state.processedIssues[repoFullName]
    if (repoIssues === undefined) return true

    const outcome = repoIssues[issueNumber]
    if (outcome === undefined) return true
    if (outcome.status === 'success') return false

    // Failure or partial (draft PR with failing tests): check retry eligibility
    if (outcome.attemptCount >= this.maxAttempts) return false

    const elapsed = Date.now() - new Date(outcome.lastAttempt).getTime()
    return elapsed >= this.backoffMs
  }

  /** @deprecated Use shouldProcessIssue instead. */
  isIssueProcessed(repoFullName: string, issueNumber: number): boolean {
    return !this.shouldProcessIssue(repoFullName, issueNumber)
  }

  /** Record the outcome of processing an issue (success or failure). */
  markIssueOutcome(repoFullName: string, issueNumber: number, outcome: IssueOutcome): void {
    const state = this.load()
    let repoIssues = state.processedIssues[repoFullName]
    if (repoIssues === undefined) {
      repoIssues = {}
      state.processedIssues[repoFullName] = repoIssues
    }
    repoIssues[issueNumber] = outcome
    this.save(state)
  }

  /** @deprecated Use markIssueOutcome instead. */
  markIssueProcessed(repoFullName: string, issueNumber: number): void {
    this.markIssueOutcome(repoFullName, issueNumber, {
      status: 'success',
      lastAttempt: new Date().toISOString(),
      attemptCount: 1,
    })
  }

  /**
   * Returns true if the given model has remaining quota or has no quota tracking.
   * Models without a quota entry are considered unlimited.
   */
  hasQuota(model: AIModel): boolean {
    const state = this.load()
    const q = state.quota[model]
    if (!q) return true // No quota entry = unlimited (e.g., ollama)
    return q.used < q.limit
  }

  /**
   * Returns the best available AI model given current quota usage.
   * Priority: claude → codex → ollama (ollama has no quota limit).
   * @deprecated Use hasQuota() with a configurable provider chain instead.
   */
  getAvailableModel(): AIModel {
    const state = this.load()
    const claude = state.quota['claude']
    const codex = state.quota['codex']

    if (claude && claude.used < claude.limit) return 'claude'
    if (codex && codex.used < codex.limit) return 'codex'
    return 'ollama'
  }

  /**
   * Increments the used counter for the given model and persists.
   * Quota unit: 1 per invokeStructured or invokeAgent call.
   * Models without a quota entry are silently ignored (unlimited).
   */
  incrementUsage(model: AIModel): void {
    const state = this.load()
    const q = state.quota[model]
    if (!q) return // No quota entry = unlimited, nothing to track
    q.used += 1
    this.save(state)
  }

  hasSeenStarPrompt(): boolean {
    const state = this.load()
    return state.starPromptSeen ?? false
  }

  markStarPromptSeen(): void {
    const state = this.load()
    state.starPromptSeen = true
    this.save(state)
  }

  /**
   * Returns true if the PR should be reviewed/merged:
   * - Never seen before → true
   * - Previous 'merged' or 'split' → false (terminal states)
   * - Previous 'failed' AND under max retries AND backoff elapsed → true
   * - Previous 'failed' at/over max retries → false
   */
  shouldReviewPR(repoFullName: string, prNumber: number): boolean {
    const state = this.load()
    const repoPRs = state.reviewedPRs?.[repoFullName]
    if (repoPRs === undefined) return true

    const outcome = repoPRs[prNumber]
    if (outcome === undefined) return true
    if (outcome.status === 'merged' || outcome.status === 'split') return false

    // Failed: check retry eligibility
    if (outcome.attemptCount >= this.maxAttempts) return false

    const elapsed = Date.now() - new Date(outcome.lastAttempt).getTime()
    return elapsed >= this.backoffMs
  }

  /** Get the current attempt count for a PR (0 if never seen). */
  getPRAttemptCount(repoFullName: string, prNumber: number): number {
    const state = this.load()
    const outcome = state.reviewedPRs?.[repoFullName]?.[prNumber]
    return outcome?.attemptCount ?? 0
  }

  /** Record the outcome of reviewing/merging a PR. */
  markPROutcome(repoFullName: string, prNumber: number, outcome: PROutcome): void {
    const state = this.load()
    if (state.reviewedPRs === undefined) {
      state.reviewedPRs = {}
    }
    let repoPRs = state.reviewedPRs[repoFullName]
    if (repoPRs === undefined) {
      repoPRs = {}
      state.reviewedPRs[repoFullName] = repoPRs
    }
    repoPRs[prNumber] = outcome
    this.save(state)
  }
}
