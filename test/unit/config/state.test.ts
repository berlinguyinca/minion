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

      const raw = JSON.parse(readFileSync(statePath, 'utf-8'))
      const issueNums: number[] = raw.processedIssues['owner/repo'] as number[]
      expect(issueNums).toHaveLength(200)
      expect(issueNums[0]).toBe(1)
      expect(issueNums[199]).toBe(200)
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
})
