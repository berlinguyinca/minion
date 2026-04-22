import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any import of the module under test
// ---------------------------------------------------------------------------

vi.mock('../../src/pipeline/index.js', () => ({
  PipelineRunner: vi.fn(),
  IssueProcessor: vi.fn(),
  ExplicitIssueRunner: vi.fn(),
  SpecCache: vi.fn(),
}))

vi.mock('../../src/git/index.js', () => ({
  GitOperations: vi.fn(),
}))

vi.mock('../../src/gui/main.js', () => ({
  runGui: vi.fn().mockResolvedValue(0),
}))

vi.mock('../../src/github/index.js', () => ({
  GitHubClient: vi.fn(),
}))

vi.mock('../../src/ai/index.js', () => ({
  MAPWrapper: vi.fn().mockImplementation(() => ({
    model: 'map',
    handlesFullPipeline: true,
    invokeAgent: vi.fn(),
    invokeStructured: vi.fn(),
  })),
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
import { runGui } from '../../src/gui/main.js'
import { GitHubClient } from '../../src/github/index.js'
import { MAPWrapper } from '../../src/ai/index.js'
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
      maxIssuesPerRun: 10,
    })

    const runnerInstance = { run: vi.fn().mockResolvedValue(0) }
    vi.mocked(PipelineRunner).mockImplementation(() => runnerInstance as unknown as PipelineRunner)
    vi.mocked(GitHubClient).mockImplementation(() => ({}) as unknown as GitHubClient)
    vi.mocked(StateManager).mockImplementation(() => ({
      hasSeenStarPrompt: vi.fn().mockReturnValue(true),
      markStarPromptSeen: vi.fn(),
    }) as unknown as StateManager)
    vi.mocked(MAPWrapper).mockImplementation(() => ({
      model: 'map',
      handlesFullPipeline: true,
      invokeAgent: vi.fn(),
      invokeStructured: vi.fn(),
      detect: vi.fn(),
    }) as unknown as MAPWrapper)
    // Static detect method
    ;(MAPWrapper as unknown as { detect: ReturnType<typeof vi.fn> }).detect = vi.fn().mockReturnValue({ available: true, version: '1.0.0' })
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
  // 2. No config file found
  // -------------------------------------------------------------------------

  it('returns exit code 1 when no config file found and no --repo', async () => {
    vi.mocked(existsSync).mockReturnValue(false)

    const code = await run([])

    expect(code).toBe(1)
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

  it('prints --gui in help output', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await run(['--help'])

    const allOutput = spy.mock.calls.map(c => c[0]).join('\n')
    expect(allOutput).toContain('--gui')
    spy.mockRestore()
  })

  it('launches GUI mode with a workspace', async () => {
    const code = await run(['--gui'])

    expect(code).toBe(0)
    expect(runGui).toHaveBeenCalledWith(expect.objectContaining({
      listUserRepos: expect.any(Function),
      runExplicitIssue: expect.any(Function),
    }))
  })

  it.each([
    ['--tui'],
    ['--repo', 'acme/api'],
    ['--config', 'config.yaml'],
    ['--poll', '30'],
    ['--branch', 'dev'],
    ['--max-issues', '1'],
    ['--test-command', 'pnpm test'],
    ['--model', 'map'],
    ['--timeout', '1000'],
    ['--map-command', 'npm'],
    ['--map-arg', 'run'],
    ['--merge-method', 'squash'],
  ])('rejects --gui with %s', async (...args) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const code = await run(['--gui', ...args])

    expect(code).toBe(1)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('--gui cannot be combined'))
    spy.mockRestore()
  })

  // -------------------------------------------------------------------------
  // --repo CLI mode
  // -------------------------------------------------------------------------

  it('runs pipeline when --repo is provided without config file', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const runnerInstance = { run: vi.fn().mockResolvedValue(0) }
    vi.mocked(PipelineRunner).mockImplementation(() => runnerInstance as unknown as PipelineRunner)

    const code = await run(['--repo', 'acme/api'])

    expect(code).toBe(0)
    expect(PipelineRunner).toHaveBeenCalledOnce()
    expect(loadConfig).not.toHaveBeenCalled()
  })

  it('returns exit code 1 when --repo and --config are both provided', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const code = await run(['--repo', 'acme/api', '--config', 'config.yaml'])

    expect(code).toBe(1)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('mutually exclusive'))
    spy.mockRestore()
  })

  it('returns exit code 1 when --repo has invalid format', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const code = await run(['--repo', 'invalid-no-slash'])

    expect(code).toBe(1)
    spy.mockRestore()
  })

  it('passes --branch to config when provided', async () => {
    const runnerInstance = { run: vi.fn().mockResolvedValue(0) }
    vi.mocked(PipelineRunner).mockImplementation(() => runnerInstance as unknown as PipelineRunner)

    await run(['--repo', 'acme/api', '--branch', 'develop'])

    const configArg = vi.mocked(PipelineRunner).mock.calls[0]?.[0]
    expect(configArg?.repos[0]?.defaultBranch).toBe('develop')
  })

  it('passes --max-issues to config when provided', async () => {
    const runnerInstance = { run: vi.fn().mockResolvedValue(0) }
    vi.mocked(PipelineRunner).mockImplementation(() => runnerInstance as unknown as PipelineRunner)

    await run(['--repo', 'acme/api', '--max-issues', '5'])

    const configArg = vi.mocked(PipelineRunner).mock.calls[0]?.[0]
    expect(configArg?.maxIssuesPerRun).toBe(5)
  })

  it('returns exit code 1 when --max-issues is not a valid number', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const code = await run(['--repo', 'acme/api', '--max-issues', 'abc'])

    expect(code).toBe(1)
    spy.mockRestore()
  })

  it('passes --merge-method to config when provided', async () => {
    const runnerInstance = { run: vi.fn().mockResolvedValue(0) }
    vi.mocked(PipelineRunner).mockImplementation(() => runnerInstance as unknown as PipelineRunner)

    await run(['--repo', 'acme/api', '--merge-method', 'squash'])

    const configArg = vi.mocked(PipelineRunner).mock.calls[0]?.[0]
    expect(configArg?.mergeMethod).toBe('squash')
  })

  it('passes --map-command and repeatable --map-arg to the MAP provider in --repo mode', async () => {
    const runnerInstance = { run: vi.fn().mockResolvedValue(0) }
    vi.mocked(PipelineRunner).mockImplementation(() => runnerInstance as unknown as PipelineRunner)

    await run(['--repo', 'acme/api', '--map-command', 'npm', '--map-arg', 'run', '--map-arg', 'map:dev', '--map-arg=--'])

    expect(MAPWrapper).toHaveBeenCalledWith(expect.objectContaining({
      command: 'npm',
      args: ['run', 'map:dev', '--'],
    }))
    expect((MAPWrapper as unknown as { detect: ReturnType<typeof vi.fn> }).detect).toHaveBeenCalledWith(expect.objectContaining({
      command: 'npm',
      args: ['run', 'map:dev', '--'],
    }))
  })

  it('returns exit code 1 when --merge-method is invalid', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const code = await run(['--repo', 'acme/api', '--merge-method', 'invalid'])

    expect(code).toBe(1)
    spy.mockRestore()
  })

  // -------------------------------------------------------------------------
  // Poll loop failsafes
  // -------------------------------------------------------------------------

  it('poll loop stops after maxPollRuns', async () => {
    vi.useFakeTimers()

    vi.mocked(loadConfig).mockReturnValue({
      repos: [{ owner: 'acme', name: 'api' }],
      maxIssuesPerRun: 10,
      maxPollRuns: 2,
    })

    let runCount = 0
    const runnerInstance = { run: vi.fn().mockImplementation(() => { runCount++; return Promise.resolve(0) }) }
    vi.mocked(PipelineRunner).mockImplementation(() => runnerInstance as unknown as PipelineRunner)

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const runPromise = run(['--poll', '30'])

    // Advance past the sleep between run 1 and run 2
    await vi.advanceTimersByTimeAsync(31_000)
    const code = await runPromise
    logSpy.mockRestore()

    expect(code).toBe(0)
    expect(runCount).toBe(2)

    vi.useRealTimers()
  })

  it('poll loop circuit breaker stops after consecutive failures', async () => {
    vi.useFakeTimers()

    vi.mocked(loadConfig).mockReturnValue({
      repos: [{ owner: 'acme', name: 'api' }],
      maxIssuesPerRun: 10,
      maxConsecutiveFailures: 3,
    })

    let runCount = 0
    const runnerInstance = { run: vi.fn().mockImplementation(() => { runCount++; return Promise.resolve(1) }) }
    vi.mocked(PipelineRunner).mockImplementation(() => runnerInstance as unknown as PipelineRunner)

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const runPromise = run(['--poll', '30'])

    // Advance past sleeps between runs
    await vi.advanceTimersByTimeAsync(120_000)
    const code = await runPromise
    errorSpy.mockRestore()
    warnSpy.mockRestore()

    expect(code).toBe(1)
    expect(runCount).toBe(3)

    vi.useRealTimers()
  })

  it('poll loop resets consecutive failure count on success', async () => {
    vi.useFakeTimers()

    vi.mocked(loadConfig).mockReturnValue({
      repos: [{ owner: 'acme', name: 'api' }],
      maxIssuesPerRun: 10,
      maxPollRuns: 4,
      maxConsecutiveFailures: 3,
    })

    let runCount = 0
    // Pattern: fail, fail, success, fail → should NOT trigger circuit breaker
    const runnerInstance = {
      run: vi.fn().mockImplementation(() => {
        runCount++
        const exitCode = runCount === 3 ? 0 : 1
        return Promise.resolve(exitCode)
      }),
    }
    vi.mocked(PipelineRunner).mockImplementation(() => runnerInstance as unknown as PipelineRunner)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const runPromise = run(['--poll', '30'])

    // Advance past all sleeps
    await vi.advanceTimersByTimeAsync(150_000)
    const code = await runPromise
    warnSpy.mockRestore()
    logSpy.mockRestore()

    // Should run all 4 times (maxPollRuns) since consecutive failures never hit 3
    // Last run (run 4) failed, so exit code propagates as 1
    expect(code).toBe(1)
    expect(runCount).toBe(4)

    vi.useRealTimers()
  })
})
