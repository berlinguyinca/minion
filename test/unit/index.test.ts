import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any import of the module under test
// ---------------------------------------------------------------------------

vi.mock('../../src/pipeline/index.js', () => ({
  PipelineRunner: vi.fn(),
}))

vi.mock('../../src/github/index.js', () => ({
  GitHubClient: vi.fn(),
}))

vi.mock('../../src/ai/index.js', () => ({
  AIRouter: vi.fn(),
  ClaudeWrapper: vi.fn(),
  CodexWrapper: vi.fn(),
  OllamaWrapper: vi.fn(),
  MAPWrapper: vi.fn(),
}))

vi.mock('../../src/config/index.js', () => ({
  StateManager: vi.fn(),
  loadConfig: vi.fn(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { run } from '../../src/index.js'
import { PipelineRunner } from '../../src/pipeline/index.js'
import { GitHubClient } from '../../src/github/index.js'
import { AIRouter, ClaudeWrapper, CodexWrapper, OllamaWrapper, MAPWrapper } from '../../src/ai/index.js'
import { StateManager, loadConfig } from '../../src/config/index.js'
import { existsSync } from 'node:fs'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI run()', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    vi.clearAllMocks()
    originalEnv = { ...process.env }

    // Default: token present, config file exists, pipeline returns 0
    process.env['GITHUB_TOKEN'] = 'ghp_test_token'
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(loadConfig).mockReturnValue({
      repos: [{ owner: 'acme', name: 'api' }],
      ollamaModel: 'qwen2.5-coder:latest',
      maxIssuesPerRun: 10,
    })

    const runnerInstance = { run: vi.fn().mockResolvedValue(0) }
    vi.mocked(PipelineRunner).mockImplementation(() => runnerInstance as unknown as PipelineRunner)
    vi.mocked(GitHubClient).mockImplementation(() => ({}) as unknown as GitHubClient)
    vi.mocked(StateManager).mockImplementation(() => ({
      hasSeenStarPrompt: vi.fn().mockReturnValue(true),
      markStarPromptSeen: vi.fn(),
    }) as unknown as StateManager)
    vi.mocked(ClaudeWrapper).mockImplementation(() => ({}) as unknown as ClaudeWrapper)
    vi.mocked(CodexWrapper).mockImplementation(() => ({}) as unknown as CodexWrapper)
    vi.mocked(OllamaWrapper).mockImplementation(() => ({}) as unknown as OllamaWrapper)
    vi.mocked(MAPWrapper).mockImplementation(() => ({}) as unknown as MAPWrapper)
    vi.mocked(AIRouter).mockImplementation(() => ({}) as unknown as AIRouter)
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // -------------------------------------------------------------------------
  // 1. Missing GITHUB_TOKEN
  // -------------------------------------------------------------------------

  it('returns exit code 1 when GITHUB_TOKEN env var is missing', async () => {
    delete process.env['GITHUB_TOKEN']

    const code = await run([])

    expect(code).toBe(1)
  })

  it('logs an error mentioning GITHUB_TOKEN when token is missing', async () => {
    delete process.env['GITHUB_TOKEN']
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await run([])

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('GITHUB_TOKEN'))
    spy.mockRestore()
  })

  // -------------------------------------------------------------------------
  // 2. repos.json not found at default path
  // -------------------------------------------------------------------------

  it('returns exit code 1 when config file not found at default path', async () => {
    vi.mocked(existsSync).mockReturnValue(false)

    const code = await run([])

    expect(code).toBe(1)
  })

  it('logs an error mentioning the config file path when not found', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await run([])

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('./repos.json'))
    spy.mockRestore()
  })

  // -------------------------------------------------------------------------
  // 3. --config arg changes the path used
  // -------------------------------------------------------------------------

  it('uses custom config path when --config arg is passed', async () => {
    vi.mocked(existsSync).mockReturnValue(true)

    await run(['--config', 'path/to/custom.json'])

    expect(existsSync).toHaveBeenCalledWith('path/to/custom.json')
    expect(loadConfig).toHaveBeenCalledWith('path/to/custom.json')
  })

  // -------------------------------------------------------------------------
  // 4. Successful pipeline run → exit code 0
  // -------------------------------------------------------------------------

  it('returns exit code 0 when pipeline runs successfully', async () => {
    const runnerInstance = { run: vi.fn().mockResolvedValue(0) }
    vi.mocked(PipelineRunner).mockImplementation(() => runnerInstance as unknown as PipelineRunner)

    const code = await run([])

    expect(code).toBe(0)
  })

  it('constructs PipelineRunner and calls run()', async () => {
    const runnerInstance = { run: vi.fn().mockResolvedValue(0) }
    vi.mocked(PipelineRunner).mockImplementation(() => runnerInstance as unknown as PipelineRunner)

    await run([])

    expect(PipelineRunner).toHaveBeenCalledOnce()
    expect(runnerInstance.run).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // 5. Pipeline returns exit code 1 → propagated
  // -------------------------------------------------------------------------

  it('returns exit code 1 when pipeline returns 1', async () => {
    const runnerInstance = { run: vi.fn().mockResolvedValue(1) }
    vi.mocked(PipelineRunner).mockImplementation(() => runnerInstance as unknown as PipelineRunner)

    const code = await run([])

    expect(code).toBe(1)
  })

  // -------------------------------------------------------------------------
  // 6. --help flag
  // -------------------------------------------------------------------------

  it('prints usage and returns 0 when --help is passed', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const code = await run(['--help'])

    expect(code).toBe(0)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Usage'))
    spy.mockRestore()
  })

  // -------------------------------------------------------------------------
  // 7. --poll flag validation
  // -------------------------------------------------------------------------

  it('returns exit code 1 when --poll value is below minimum (30s)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const code = await run(['--poll', '10'])

    expect(code).toBe(1)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('--poll'))
    spy.mockRestore()
  })

  it('returns exit code 1 when --poll value is not a number', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const code = await run(['--poll', 'abc'])

    expect(code).toBe(1)
    spy.mockRestore()
  })

  it('prints --poll in help output', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await run(['--help'])

    const allOutput = spy.mock.calls.map(c => c[0]).join('\n')
    expect(allOutput).toContain('--poll')
    spy.mockRestore()
  })
})
