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
      sm.shouldProcessIssue('owner/repo', 1)

      expect(existsSync(statePath)).toBe(true)
    })

    it('initializes with empty processedIssues', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)
      sm.shouldProcessIssue('owner/repo', 1)

      const raw = JSON.parse(readFileSync(statePath, 'utf-8'))
      expect(raw.processedIssues).toEqual({})
    })

    it('loads existing state file correctly', () => {
      const statePath = makeTempStatePath()

      const sm1 = new StateManager(statePath)
      sm1.markIssueOutcome('owner/repo', 7, {
        status: 'success',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
      })

      const sm2 = new StateManager(statePath)
      expect(sm2.shouldProcessIssue('owner/repo', 7)).toBe(false)
    })
  })

  describe('shouldProcessIssue', () => {
    it('returns true for an issue never seen before', () => {
      const sm = new StateManager(makeTempStatePath())
      expect(sm.shouldProcessIssue('owner/repo', 1)).toBe(true)
    })

    it('returns true for a repo never seen before', () => {
      const sm = new StateManager(makeTempStatePath())
      sm.markIssueOutcome('owner/other', 1, {
        status: 'success',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
      })
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
      const sm = new StateManager(makeTempStatePath(), {
        maxAttempts: 3,
        backoffMinutes: 0,
      })
      sm.markIssueOutcome('owner/repo', 10, {
        status: 'failure',
        lastAttempt: new Date(Date.now() - 1000).toISOString(),
        attemptCount: 1,
        error: 'some error',
      })
      expect(sm.shouldProcessIssue('owner/repo', 10)).toBe(true)
    })

    it('returns false for a failed issue at max retries', () => {
      const sm = new StateManager(makeTempStatePath(), {
        maxAttempts: 3,
        backoffMinutes: 0,
      })
      sm.markIssueOutcome('owner/repo', 11, {
        status: 'failure',
        lastAttempt: new Date(Date.now() - 1000).toISOString(),
        attemptCount: 3,
        error: 'exhausted',
      })
      expect(sm.shouldProcessIssue('owner/repo', 11)).toBe(false)
    })

    it('returns false for a failed issue within backoff period', () => {
      const sm = new StateManager(makeTempStatePath(), {
        maxAttempts: 5,
        backoffMinutes: 60,
      })
      sm.markIssueOutcome('owner/repo', 12, {
        status: 'failure',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
        error: 'transient',
      })
      expect(sm.shouldProcessIssue('owner/repo', 12)).toBe(false)
    })

    it('returns true for a partial outcome (draft PR) under max retries with backoff elapsed', () => {
      const sm = new StateManager(makeTempStatePath(), {
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
      const sm = new StateManager(makeTempStatePath(), {
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

      const oldState = {
        processedIssues: {
          'owner/repo': [1, 2, 3],
        },
      }
      writeFileSync(statePath, JSON.stringify(oldState))

      const sm = new StateManager(statePath)

      // Old processed issues should be treated as successful (not eligible for reprocessing)
      expect(sm.shouldProcessIssue('owner/repo', 1)).toBe(false)
      expect(sm.shouldProcessIssue('owner/repo', 2)).toBe(false)
      expect(sm.shouldProcessIssue('owner/repo', 3)).toBe(false)
      // Issue not in old list should be unprocessed
      expect(sm.shouldProcessIssue('owner/repo', 4)).toBe(true)
    })

    it('migrated state is written back in new format', () => {
      const statePath = makeTempStatePath()

      const oldState = {
        processedIssues: {
          'owner/repo': [10, 20],
        },
      }
      writeFileSync(statePath, JSON.stringify(oldState))

      const sm = new StateManager(statePath)
      // Trigger load+migration
      sm.shouldProcessIssue('owner/repo', 10)

      // After migration a new markIssueOutcome should still work correctly
      sm.markIssueOutcome('owner/repo', 30, {
        status: 'success',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
      })

      const raw = JSON.parse(readFileSync(statePath, 'utf-8')) as {
        processedIssues: Record<string, Record<string, { status: string }>>
      }
      expect(raw.processedIssues['owner/repo']?.['10']?.status).toBe('success')
      expect(raw.processedIssues['owner/repo']?.['30']?.status).toBe('success')
    })
  })

  describe('atomic writes', () => {
    it('state file is consistent after large state write', () => {
      const statePath = makeTempStatePath()
      const sm = new StateManager(statePath)

      for (let i = 1; i <= 200; i++) {
        sm.markIssueOutcome('owner/repo', i, {
          status: 'success',
          lastAttempt: new Date().toISOString(),
          attemptCount: 1,
        })
      }

      const raw = JSON.parse(readFileSync(statePath, 'utf-8')) as {
        processedIssues: Record<string, Record<string, { status: string }>>
      }
      const repoOutcomes = raw.processedIssues['owner/repo']
      expect(repoOutcomes).toBeDefined()
      const keys = Object.keys(repoOutcomes as Record<string, unknown>)
      expect(keys).toHaveLength(200)
      for (let i = 1; i <= 200; i++) {
        expect(repoOutcomes?.[String(i)]?.status).toBe('success')
      }
    })
  })

  describe('configurable state file path', () => {
    it('uses the path passed to the constructor', () => {
      const path1 = makeTempStatePath()
      const path2 = makeTempStatePath()

      const sm1 = new StateManager(path1)
      const sm2 = new StateManager(path2)

      sm1.markIssueOutcome('owner/repo', 1, {
        status: 'success',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
      })

      expect(existsSync(path1)).toBe(true)
      expect(sm2.shouldProcessIssue('owner/repo', 1)).toBe(true)
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
      const sm = new StateManager(makeTempStatePath(), {
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
      const sm = new StateManager(makeTempStatePath(), {
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
      const sm = new StateManager(makeTempStatePath(), {
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
