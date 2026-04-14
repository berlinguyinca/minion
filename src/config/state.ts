/**
 * StateManager — tracks processed issues and PR outcomes.
 *
 * Writes are atomic: data is written to `<statePath>.tmp` then renamed to
 * `<statePath>`, which prevents partial-write corruption.
 */

import { writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs'
import type { PipelineState, IssueOutcome, PROutcome, RetryConfig } from '../types/index.js'

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BACKOFF_MINUTES = 60

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
    retryConfig?: RetryConfig,
  ) {
    this.maxAttempts = retryConfig?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    this.backoffMs = (retryConfig?.backoffMinutes ?? DEFAULT_BACKOFF_MINUTES) * 60 * 1000
  }

  private load(): PipelineState {
    if (!existsSync(this.statePath)) {
      const state: PipelineState = { processedIssues: {} }
      this.save(state)
      return state
    }

    const raw = readFileSync(this.statePath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      processedIssues: Record<string, unknown>
      reviewedPRs?: PipelineState['reviewedPRs']
      starPromptSeen?: boolean
    }

    const state: PipelineState = {
      processedIssues: migrateProcessedIssues(parsed.processedIssues),
    }
    if (parsed.reviewedPRs !== undefined) {
      state.reviewedPRs = parsed.reviewedPRs
    }
    if (parsed.starPromptSeen !== undefined) {
      state.starPromptSeen = parsed.starPromptSeen
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
