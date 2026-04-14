import { describe, it, expect } from 'vitest'
import { tmpdir } from 'node:os'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { StateManager } from '../../../src/config/index.js'

function makeTempStatePath(): string {
  const dir = join(tmpdir(), `gh-pipeline-state-test-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  return join(dir, 'state.json')
}

describe('StateManager', () => {
  describe('initialization', () => {
    it('creates a new state file if none exists', () => {
      const statePath = makeTempStatePath()
      expect(existsSync(statePath)).toBe(false)

      const sm = new StateManager(statePath)

      // Accessing any method triggers a load (and save) cycle
      sm.isIssueProcessed('owner/repo', 1)

      expect(existsSync(statePath)).toBe(true)
    })

    it('initializes with empty processedIssues and zero quota', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)

      // Trigger file creation
      sm.isIssueProcessed('owner/repo', 1)

      const raw = JSON.parse(readFileSync(statePath, 'utf-8'))
      expect(raw.processedIssues).toEqual({})
      expect(raw.quota.claude.used).toBe(0)
      expect(raw.quota.codex.used).toBe(0)
    })

    it('loads existing state file correctly', () => {
      const statePath = makeTempStatePath()

      // Pre-populate a state file
      const sm1 = new StateManager(statePath)
      sm1.markIssueProcessed('owner/repo', 7)

      // Second instance loads from disk
      const sm2 = new StateManager(statePath)
      expect(sm2.isIssueProcessed('owner/repo', 7)).toBe(true)
    })
  })

  describe('isIssueProcessed', () => {
    it('returns false for an unprocessed issue', () => {
      const sm = new StateManager(makeTempStatePath())
      expect(sm.isIssueProcessed('owner/repo', 42)).toBe(false)
    })

    it('returns true after markIssueProcessed is called', () => {
      const sm = new StateManager(makeTempStatePath())
      sm.markIssueProcessed('owner/repo', 42)
      expect(sm.isIssueProcessed('owner/repo', 42)).toBe(true)
    })
  })

  describe('markIssueProcessed', () => {
    it('persists to file so a new instance sees it', () => {
      const statePath = makeTempStatePath()
      const sm1 = new StateManager(statePath)
      sm1.markIssueProcessed('acme/api', 99)

      const sm2 = new StateManager(statePath)
      expect(sm2.isIssueProcessed('acme/api', 99)).toBe(true)
    })

    it('does not affect other repos', () => {
      const sm = new StateManager(makeTempStatePath())
      sm.markIssueProcessed('owner/repo-a', 1)
      expect(sm.isIssueProcessed('owner/repo-b', 1)).toBe(false)
    })
  })

  describe('getAvailableModel', () => {
    it('returns "claude" when claude quota is not exhausted', () => {
      const sm = new StateManager(makeTempStatePath())
      // Fresh state: claude.used=0, limit=100
      expect(sm.getAvailableModel()).toBe('claude')
    })

    it('returns "codex" when claude is exhausted but codex is not', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)

      // Exhaust claude by incrementing to limit (100)
      for (let i = 0; i < 100; i++) {
        sm.incrementUsage('claude')
      }

      expect(sm.getAvailableModel()).toBe('codex')
    })

    it('returns "ollama" when both claude and codex are exhausted', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)

      for (let i = 0; i < 100; i++) sm.incrementUsage('claude')
      for (let i = 0; i < 50; i++) sm.incrementUsage('codex')

      expect(sm.getAvailableModel()).toBe('ollama')
    })

    it('uses configured quota limits when provided', () => {
      const sm = new StateManager(makeTempStatePath(), { claude: 1, codex: 2 })

      sm.incrementUsage('claude')
      expect(sm.getAvailableModel()).toBe('codex')

      sm.incrementUsage('codex')
      sm.incrementUsage('codex')
      expect(sm.getAvailableModel()).toBe('ollama')
    })
  })

  describe('incrementUsage', () => {
    it('increments claude used counter and persists', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)
      sm.incrementUsage('claude')

      const raw = JSON.parse(readFileSync(statePath, 'utf-8'))
      expect(raw.quota.claude.used).toBe(1)
    })

    it('increments codex used counter and persists', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)
      sm.incrementUsage('codex')

      const raw = JSON.parse(readFileSync(statePath, 'utf-8'))
      expect(raw.quota.codex.used).toBe(1)
    })

    it('accumulates multiple increments correctly', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)
      sm.incrementUsage('claude')
      sm.incrementUsage('claude')
      sm.incrementUsage('codex')

      const raw = JSON.parse(readFileSync(statePath, 'utf-8'))
      expect(raw.quota.claude.used).toBe(2)
      expect(raw.quota.codex.used).toBe(1)
    })

    it('is a no-op for models with no quota entry (e.g. ollama)', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)

      // ollama has no quota entry — incrementUsage should be a no-op and not throw
      expect(() => sm.incrementUsage('ollama')).not.toThrow()

      // State should be unchanged (claude/codex still 0)
      const raw = JSON.parse(readFileSync(statePath, 'utf-8'))
      expect(raw.quota.claude.used).toBe(0)
      expect(raw.quota.codex.used).toBe(0)
    })
  })

  describe('monthly reset', () => {
    it('resets used counters and updates resetMonth when resetMonth is a past month', () => {
      const statePath = makeTempStatePath()

      // Write a state file with a past resetMonth and non-zero used counts
      const pastMonth = '2020-01'
      const staleState = {
        processedIssues: {},
        quota: {
          claude: { used: 50, limit: 100, resetMonth: pastMonth },
          codex: { used: 25, limit: 50, resetMonth: pastMonth },
        },
      }
      writeFileSync(statePath, JSON.stringify(staleState))

      const sm = new StateManager(statePath)
      // Any operation triggers load-with-reset
      sm.isIssueProcessed('owner/repo', 1)

      const currentMonth = new Date().toISOString().slice(0, 7)
      const raw = JSON.parse(readFileSync(statePath, 'utf-8'))
      expect(raw.quota.claude.used).toBe(0)
      expect(raw.quota.codex.used).toBe(0)
      expect(raw.quota.claude.resetMonth).toBe(currentMonth)
      expect(raw.quota.codex.resetMonth).toBe(currentMonth)
    })
  })

  describe('atomic writes', () => {
    it('state file is consistent after large state write', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)

      // Mark many issues processed to create a large state
      for (let i = 1; i <= 200; i++) {
        sm.markIssueProcessed('owner/repo', i)
      }

      const raw = JSON.parse(readFileSync(statePath, 'utf-8')) as {
        processedIssues: Record<string, Record<string, { status: string; lastAttempt: string; attemptCount: number }>>
      }
      const repoOutcomes = raw.processedIssues['owner/repo']
      expect(repoOutcomes).toBeDefined()
      const keys = Object.keys(repoOutcomes as Record<string, unknown>)
      expect(keys).toHaveLength(200)
      // Keys are stored as strings in JSON; verify all 200 issue numbers are present
      for (let i = 1; i <= 200; i++) {
        expect(repoOutcomes[String(i)]?.status).toBe('success')
      }
    })
  })

  describe('configurable state file path', () => {
    it('uses the path passed to the constructor', () => {
      const path1 = makeTempStatePath()
      const path2 = makeTempStatePath()

      const sm1 = new StateManager(path1)
      const sm2 = new StateManager(path2)

      sm1.markIssueProcessed('owner/repo', 1)

      expect(existsSync(path1)).toBe(true)
      // sm2 has not been used so no file created yet
      expect(sm2.isIssueProcessed('owner/repo', 1)).toBe(false)
    })
  })

  describe('shouldProcessIssue', () => {
    it('returns true for an issue never seen before', () => {
      const sm = new StateManager(makeTempStatePath())
      expect(sm.shouldProcessIssue('owner/repo', 1)).toBe(true)
    })

    it('returns true for a repo never seen before', () => {
      const sm = new StateManager(makeTempStatePath())
      sm.markIssueProcessed('owner/other', 1)
      expect(sm.shouldProcessIssue('owner/repo', 1)).toBe(true)
    })

    it('returns false after a successful outcome', () => {
      const sm = new StateManager(makeTempStatePath())
      sm.markIssueOutcome('owner/repo', 5, {
        status: 'success',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
      })
      expect(sm.shouldProcessIssue('owner/repo', 5)).toBe(false)
    })

    it('returns true for a failed issue under max retries with backoff elapsed', () => {
      const sm = new StateManager(makeTempStatePath(), undefined, {
        maxAttempts: 3,
        backoffMinutes: 0, // zero backoff so elapsed is always satisfied
      })
      sm.markIssueOutcome('owner/repo', 10, {
        status: 'failure',
        lastAttempt: new Date(Date.now() - 1000).toISOString(), // 1s ago
        attemptCount: 1,
        error: 'some error',
      })
      expect(sm.shouldProcessIssue('owner/repo', 10)).toBe(true)
    })

    it('returns false for a failed issue at max retries', () => {
      const sm = new StateManager(makeTempStatePath(), undefined, {
        maxAttempts: 3,
        backoffMinutes: 0,
      })
      sm.markIssueOutcome('owner/repo', 11, {
        status: 'failure',
        lastAttempt: new Date(Date.now() - 1000).toISOString(),
        attemptCount: 3, // at max
        error: 'exhausted',
      })
      expect(sm.shouldProcessIssue('owner/repo', 11)).toBe(false)
    })

    it('returns false for a failed issue within backoff period', () => {
      const sm = new StateManager(makeTempStatePath(), undefined, {
        maxAttempts: 5,
        backoffMinutes: 60, // 1 hour backoff
      })
      sm.markIssueOutcome('owner/repo', 12, {
        status: 'failure',
        lastAttempt: new Date().toISOString(), // just now — within backoff
        attemptCount: 1,
        error: 'transient',
      })
      expect(sm.shouldProcessIssue('owner/repo', 12)).toBe(false)
    })

    it('returns true for a partial outcome (draft PR) under max retries with backoff elapsed', () => {
      const sm = new StateManager(makeTempStatePath(), undefined, {
        maxAttempts: 3,
        backoffMinutes: 0,
      })
      sm.markIssueOutcome('owner/repo', 20, {
        status: 'partial',
        lastAttempt: new Date(Date.now() - 1000).toISOString(),
        attemptCount: 1,
        prUrl: 'https://github.com/owner/repo/pull/50',
      })
      expect(sm.shouldProcessIssue('owner/repo', 20)).toBe(true)
    })

    it('returns false for a partial outcome at max retries', () => {
      const sm = new StateManager(makeTempStatePath(), undefined, {
        maxAttempts: 3,
        backoffMinutes: 0,
      })
      sm.markIssueOutcome('owner/repo', 21, {
        status: 'partial',
        lastAttempt: new Date(Date.now() - 1000).toISOString(),
        attemptCount: 3,
        prUrl: 'https://github.com/owner/repo/pull/51',
      })
      expect(sm.shouldProcessIssue('owner/repo', 21)).toBe(false)
    })
  })

  describe('markIssueOutcome', () => {
    it('persists a success outcome', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)
      sm.markIssueOutcome('owner/repo', 7, {
        status: 'success',
        lastAttempt: '2024-01-01T00:00:00.000Z',
        attemptCount: 1,
        prUrl: 'https://github.com/owner/repo/pull/42',
      })

      const raw = JSON.parse(readFileSync(statePath, 'utf-8')) as {
        processedIssues: Record<string, Record<string, { status: string; prUrl?: string }>>
      }
      const outcome = raw.processedIssues['owner/repo']?.['7']
      expect(outcome?.status).toBe('success')
      expect(outcome?.prUrl).toBe('https://github.com/owner/repo/pull/42')
    })

    it('persists a failure outcome with error', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)
      sm.markIssueOutcome('acme/api', 99, {
        status: 'failure',
        lastAttempt: '2024-06-15T12:00:00.000Z',
        attemptCount: 2,
        error: 'AI invocation failed',
      })

      const raw = JSON.parse(readFileSync(statePath, 'utf-8')) as {
        processedIssues: Record<string, Record<string, { status: string; error?: string; attemptCount: number }>>
      }
      const outcome = raw.processedIssues['acme/api']?.['99']
      expect(outcome?.status).toBe('failure')
      expect(outcome?.error).toBe('AI invocation failed')
      expect(outcome?.attemptCount).toBe(2)
    })

    it('a new instance sees the persisted outcome', () => {
      const statePath = makeTempStatePath()
      const sm1 = new StateManager(statePath)
      sm1.markIssueOutcome('owner/repo', 3, {
        status: 'success',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
      })

      const sm2 = new StateManager(statePath)
      expect(sm2.shouldProcessIssue('owner/repo', 3)).toBe(false)
    })
  })

  describe('migration: old number[] format', () => {
    it('auto-converts number[] to Record<number, IssueOutcome> on load', () => {
      const statePath = makeTempStatePath()
      const month = new Date().toISOString().slice(0, 7)

      // Write state in the old format
      const oldState = {
        processedIssues: {
          'owner/repo': [1, 2, 3],
        },
        quota: {
          claude: { used: 0, limit: 100, resetMonth: month },
          codex: { used: 0, limit: 50, resetMonth: month },
        },
      }
      writeFileSync(statePath, JSON.stringify(oldState))

      const sm = new StateManager(statePath)

      // Old processed issues should be treated as successful
      expect(sm.isIssueProcessed('owner/repo', 1)).toBe(true)
      expect(sm.isIssueProcessed('owner/repo', 2)).toBe(true)
      expect(sm.isIssueProcessed('owner/repo', 3)).toBe(true)
      // Issue not in old list should be unprocessed
      expect(sm.isIssueProcessed('owner/repo', 4)).toBe(false)
    })

    it('migrated state is written back in new format', () => {
      const statePath = makeTempStatePath()
      const month = new Date().toISOString().slice(0, 7)

      const oldState = {
        processedIssues: {
          'owner/repo': [10, 20],
        },
        quota: {
          claude: { used: 0, limit: 100, resetMonth: month },
          codex: { used: 0, limit: 50, resetMonth: month },
        },
      }
      writeFileSync(statePath, JSON.stringify(oldState))

      const sm = new StateManager(statePath)
      // Trigger load+migration
      sm.isIssueProcessed('owner/repo', 10)

      // After migration a new markIssueOutcome should still work correctly
      sm.markIssueOutcome('owner/repo', 30, {
        status: 'success',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
      })

      const raw = JSON.parse(readFileSync(statePath, 'utf-8')) as {
        processedIssues: Record<string, Record<string, { status: string }>>
      }
      // Old issues are stored as objects now
      expect(raw.processedIssues['owner/repo']?.['10']?.status).toBe('success')
      expect(raw.processedIssues['owner/repo']?.['30']?.status).toBe('success')
    })
  })

  describe('shouldReviewPR', () => {
    it('returns true for a PR never seen before', () => {
      const sm = new StateManager(makeTempStatePath())
      expect(sm.shouldReviewPR('owner/repo', 1)).toBe(true)
    })

    it('returns true for a repo never seen before', () => {
      const sm = new StateManager(makeTempStatePath())
      sm.markPROutcome('owner/other', 1, {
        status: 'merged',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
      })
      expect(sm.shouldReviewPR('owner/repo', 1)).toBe(true)
    })

    it('returns false after a merged outcome', () => {
      const sm = new StateManager(makeTempStatePath())
      sm.markPROutcome('owner/repo', 5, {
        status: 'merged',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
      })
      expect(sm.shouldReviewPR('owner/repo', 5)).toBe(false)
    })

    it('returns false after a split outcome', () => {
      const sm = new StateManager(makeTempStatePath())
      sm.markPROutcome('owner/repo', 5, {
        status: 'split',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
      })
      expect(sm.shouldReviewPR('owner/repo', 5)).toBe(false)
    })

    it('returns true for a failed PR under max retries with backoff elapsed', () => {
      const sm = new StateManager(makeTempStatePath(), undefined, {
        maxAttempts: 3,
        backoffMinutes: 0,
      })
      sm.markPROutcome('owner/repo', 10, {
        status: 'failed',
        lastAttempt: new Date(Date.now() - 1000).toISOString(),
        attemptCount: 1,
        error: 'tests failed',
      })
      expect(sm.shouldReviewPR('owner/repo', 10)).toBe(true)
    })

    it('returns false for a failed PR at max retries', () => {
      const sm = new StateManager(makeTempStatePath(), undefined, {
        maxAttempts: 3,
        backoffMinutes: 0,
      })
      sm.markPROutcome('owner/repo', 11, {
        status: 'failed',
        lastAttempt: new Date(Date.now() - 1000).toISOString(),
        attemptCount: 3,
        error: 'exhausted',
      })
      expect(sm.shouldReviewPR('owner/repo', 11)).toBe(false)
    })

    it('returns false for a failed PR within backoff period', () => {
      const sm = new StateManager(makeTempStatePath(), undefined, {
        maxAttempts: 5,
        backoffMinutes: 60,
      })
      sm.markPROutcome('owner/repo', 12, {
        status: 'failed',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
        error: 'transient',
      })
      expect(sm.shouldReviewPR('owner/repo', 12)).toBe(false)
    })
  })

  describe('markPROutcome', () => {
    it('persists a merged outcome', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)
      sm.markPROutcome('owner/repo', 7, {
        status: 'merged',
        lastAttempt: '2024-01-01T00:00:00.000Z',
        attemptCount: 1,
      })

      const raw = JSON.parse(readFileSync(statePath, 'utf-8')) as {
        reviewedPRs: Record<string, Record<string, { status: string }>>
      }
      expect(raw.reviewedPRs['owner/repo']?.['7']?.status).toBe('merged')
    })

    it('persists a failed outcome with error', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)
      sm.markPROutcome('acme/api', 99, {
        status: 'failed',
        lastAttempt: '2024-06-15T12:00:00.000Z',
        attemptCount: 2,
        error: 'tests failed',
      })

      const raw = JSON.parse(readFileSync(statePath, 'utf-8')) as {
        reviewedPRs: Record<string, Record<string, { status: string; error?: string; attemptCount: number }>>
      }
      const outcome = raw.reviewedPRs['acme/api']?.['99']
      expect(outcome?.status).toBe('failed')
      expect(outcome?.error).toBe('tests failed')
      expect(outcome?.attemptCount).toBe(2)
    })

    it('a new instance sees the persisted outcome', () => {
      const statePath = makeTempStatePath()
      const sm1 = new StateManager(statePath)
      sm1.markPROutcome('owner/repo', 3, {
        status: 'merged',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
      })

      const sm2 = new StateManager(statePath)
      expect(sm2.shouldReviewPR('owner/repo', 3)).toBe(false)
    })
  })

  describe('getPRAttemptCount', () => {
    it('returns 0 for a PR never seen before', () => {
      const sm = new StateManager(makeTempStatePath())
      expect(sm.getPRAttemptCount('owner/repo', 1)).toBe(0)
    })

    it('returns the stored attempt count', () => {
      const sm = new StateManager(makeTempStatePath())
      sm.markPROutcome('owner/repo', 5, {
        status: 'failed',
        lastAttempt: new Date().toISOString(),
        attemptCount: 3,
        error: 'err',
      })
      expect(sm.getPRAttemptCount('owner/repo', 5)).toBe(3)
    })
  })
})
