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
import type { PipelineState, AIModel } from '../types/index.js'

const DEFAULT_CLAUDE_LIMIT = 100
const DEFAULT_CODEX_LIMIT = 50

function currentUtcMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function buildDefaultState(): PipelineState {
  const month = currentUtcMonth()
  return {
    processedIssues: {},
    quota: {
      claude: { used: 0, limit: DEFAULT_CLAUDE_LIMIT, resetMonth: month },
      codex: { used: 0, limit: DEFAULT_CODEX_LIMIT, resetMonth: month },
    },
  }
}

export class StateManager {
  constructor(private readonly statePath: string) {}

  private load(): PipelineState {
    if (!existsSync(this.statePath)) {
      const state = buildDefaultState()
      this.save(state)
      return state
    }

    const raw = readFileSync(this.statePath, 'utf-8')
    const state = JSON.parse(raw) as PipelineState

    // Monthly reset: if either quota's resetMonth is in the past, reset used counters
    const now = currentUtcMonth()
    let dirty = false

    if (state.quota.claude.resetMonth !== now) {
      state.quota.claude.used = 0
      state.quota.claude.resetMonth = now
      dirty = true
    }
    if (state.quota.codex.resetMonth !== now) {
      state.quota.codex.used = 0
      state.quota.codex.resetMonth = now
      dirty = true
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

  isIssueProcessed(repoFullName: string, issueNumber: number): boolean {
    const state = this.load()
    const numbers = state.processedIssues[repoFullName]
    return numbers !== undefined && numbers.includes(issueNumber)
  }

  markIssueProcessed(repoFullName: string, issueNumber: number): void {
    const state = this.load()
    const existing = state.processedIssues[repoFullName]
    if (existing === undefined) {
      state.processedIssues[repoFullName] = [issueNumber]
    } else if (!existing.includes(issueNumber)) {
      existing.push(issueNumber)
    }
    this.save(state)
  }

  /**
   * Returns the best available AI model given current quota usage.
   * Priority: claude → codex → ollama (ollama has no quota limit).
   */
  getAvailableModel(): AIModel {
    const state = this.load()
    const { claude, codex } = state.quota

    if (claude.used < claude.limit) return 'claude'
    if (codex.used < codex.limit) return 'codex'
    return 'ollama'
  }

  /**
   * Increments the used counter for the given model and persists.
   * Quota unit: 1 per invokeStructured or invokeAgent call.
   */
  incrementUsage(model: 'claude' | 'codex'): void {
    const state = this.load()
    state.quota[model].used += 1
    this.save(state)
  }
}
