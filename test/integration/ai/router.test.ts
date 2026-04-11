/**
 * AI Router integration tests — real StateManager with real temp files.
 * No mocks for StateManager or filesystem I/O.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { StateManager } from '../../../src/config/state.js'
import { AIRouter } from '../../../src/ai/router.js'
import { AIBinaryNotFoundError } from '../../../src/ai/errors.js'
import type { AIProvider, AIModel, StructuredResult, AgentResult } from '../../../src/types/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'router-integration-'))
}

function makeStatePath(dir: string): string {
  return join(dir, 'state.json')
}

/**
 * Write a state file with claude quota fully exhausted so the router
 * selects codex next.
 */
function writeExhaustedClaudeState(statePath: string, resetMonth: string): void {
  const state = {
    processedIssues: {},
    quota: {
      claude: { used: 100, limit: 100, resetMonth },
      codex: { used: 0, limit: 50, resetMonth },
    },
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
}

function currentUtcMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

/** A provider that always succeeds instantly. */
function makeInstantProvider(model: AIModel): AIProvider {
  return {
    model,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async invokeStructured<T>(_prompt: string, _schema: object): Promise<StructuredResult<T>> {
      return { success: true, data: { model } as unknown as T, rawOutput: '' }
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async invokeAgent(_prompt: string, _workingDir: string): Promise<AgentResult> {
      return { success: true, filesWritten: [], stdout: '', stderr: '' }
    },
  }
}

/** A provider that always throws AIBinaryNotFoundError. */
function makeNotFoundProvider(model: AIModel): AIProvider {
  return {
    model,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async invokeStructured<T>(_prompt: string, _schema: object): Promise<StructuredResult<T>> {
      throw new AIBinaryNotFoundError(model)
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async invokeAgent(_prompt: string, _workingDir: string): Promise<AgentResult> {
      throw new AIBinaryNotFoundError(model)
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AIRouter integration — real state file I/O', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = makeTempDir()
  })

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  // -------------------------------------------------------------------------
  // 1. Quota routing with real state file
  // -------------------------------------------------------------------------

  it('returns codex when claude quota is exhausted in real state file', () => {
    const statePath = makeStatePath(tempDir)
    const month = currentUtcMonth()
    writeExhaustedClaudeState(statePath, month)

    const state = new StateManager(statePath)
    const model = state.getAvailableModel()

    expect(model).toBe('codex')
  })

  it('incrementing codex usage updates the real state file', () => {
    const statePath = makeStatePath(tempDir)
    const month = currentUtcMonth()
    writeExhaustedClaudeState(statePath, month)

    const state = new StateManager(statePath)
    state.incrementUsage('codex')

    // Read a fresh StateManager to confirm the file was updated
    const state2 = new StateManager(statePath)
    // After claude exhausted and codex used 1, next call should still return codex
    // (codex limit is 50, used is now 1)
    expect(state2.getAvailableModel()).toBe('codex')

    // Exhaust codex as well
    for (let i = 0; i < 49; i++) {
      state2.incrementUsage('codex')
    }

    const state3 = new StateManager(statePath)
    expect(state3.getAvailableModel()).toBe('ollama')
  })

  // -------------------------------------------------------------------------
  // 2. Monthly reset with past resetMonth
  // -------------------------------------------------------------------------

  it('resets counters and returns claude when resetMonth is in the past', () => {
    const statePath = makeStatePath(tempDir)
    // Write state with past month and exhausted claude quota
    writeExhaustedClaudeState(statePath, '2020-01')

    const state = new StateManager(statePath)
    // Loading should trigger reset because 2020-01 < current month
    const model = state.getAvailableModel()

    // After reset, claude.used should be 0, so claude is available
    expect(model).toBe('claude')
  })

  it('persists the new resetMonth after a monthly reset', () => {
    const statePath = makeStatePath(tempDir)
    writeExhaustedClaudeState(statePath, '2020-01')

    const state = new StateManager(statePath)
    state.getAvailableModel() // triggers load + reset

    // Read state file directly to verify resetMonth was updated
    const raw = JSON.parse(readFileSync(statePath, 'utf-8')) as {
      quota: { claude: { resetMonth: string } }
    }
    expect(raw.quota.claude.resetMonth).toBe(currentUtcMonth())
  })

  // -------------------------------------------------------------------------
  // 3. Binary fallthrough: missing provider falls through to next real provider
  // -------------------------------------------------------------------------

  it('falls through from a not-found claude to codex with real state file', async () => {
    const statePath = makeStatePath(tempDir)
    const month = currentUtcMonth()
    // Claude quota available so router will start with claude
    const state = {
      processedIssues: {},
      quota: {
        claude: { used: 0, limit: 100, resetMonth: month },
        codex: { used: 0, limit: 50, resetMonth: month },
      },
    }
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')

    const stateManager = new StateManager(statePath)

    // claudeProvider throws AIBinaryNotFoundError, codexProvider succeeds
    const notFoundClaude = makeNotFoundProvider('claude')
    const workingCodex = makeInstantProvider('codex')
    const workingOllama = makeInstantProvider('ollama')

    const router = new AIRouter(stateManager, {
      claude: notFoundClaude,
      codex: workingCodex,
      ollama: workingOllama,
    })

    const result = await router.invokeStructured('test prompt', {})

    // Should fall through to codex
    expect(result.model).toBe('codex')
  })

  it('falls through from not-found claude and codex to ollama', async () => {
    const statePath = makeStatePath(tempDir)
    const month = currentUtcMonth()
    const state = {
      processedIssues: {},
      quota: {
        claude: { used: 0, limit: 100, resetMonth: month },
        codex: { used: 0, limit: 50, resetMonth: month },
      },
    }
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')

    const stateManager = new StateManager(statePath)

    const router = new AIRouter(stateManager, {
      claude: makeNotFoundProvider('claude'),
      codex: makeNotFoundProvider('codex'),
      ollama: makeInstantProvider('ollama'),
    })

    const result = await router.invokeStructured('test prompt', {})

    expect(result.model).toBe('ollama')
  })
})
