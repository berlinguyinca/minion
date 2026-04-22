import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

// ---------------------------------------------------------------------------
// child_process mock
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(),
}))

// Mock fs.writeFileSync so no real files are written
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
}))

import { spawn, execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { MAPWrapper } from '../../../src/ai/map-wrapper.js'
import { AITimeoutError, AIBinaryNotFoundError, AIInvocationError } from '../../../src/ai/errors.js'

const spawnMock = spawn as unknown as MockInstance
const execFileSyncMock = execFileSync as unknown as MockInstance
const writeFileSyncMock = writeFileSync as unknown as MockInstance

// ---------------------------------------------------------------------------
// Helpers — build a fake ChildProcess with controllable stdout/stderr/close
// ---------------------------------------------------------------------------

interface FakeProcessOptions {
  stdout?: string
  stderr?: string
  exitCode?: number
  enoent?: boolean
}

function makeFakeProcess(opts: FakeProcessOptions = {}): ChildProcess {
  const proc = new EventEmitter() as ChildProcess & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: () => boolean
  }
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = () => true

  if (opts.enoent) {
    setImmediate(() => {
      const err = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
      proc.emit('error', err)
    })
    return proc
  }

  setImmediate(() => {
    if (opts.stdout) proc.stdout.emit('data', Buffer.from(opts.stdout))
    if (opts.stderr) proc.stderr.emit('data', Buffer.from(opts.stderr ?? ''))
    proc.emit('close', opts.exitCode ?? 0)
  })

  return proc
}

// ---------------------------------------------------------------------------
// MAP success fixture
// ---------------------------------------------------------------------------

const mapSuccessFixture = JSON.stringify({
  version: 1,
  success: true,
  spec: 'Generated spec output',
  filesCreated: ['src/foo.ts'],
})

// ---------------------------------------------------------------------------
// MAPWrapper tests
// ---------------------------------------------------------------------------

describe('MAPWrapper', () => {
  let map: MAPWrapper

  beforeEach(() => {
    vi.clearAllMocks()
    map = new MAPWrapper()
  })

  it('handlesFullPipeline is true', () => {
    expect(map.handlesFullPipeline).toBe(true)
  })

  it('model is "map"', () => {
    expect(map.model).toBe('map')
  })

  it('invokeStructured throws Error', async () => {
    await expect(map.invokeStructured('prompt', {})).rejects.toThrow(
      'MAPWrapper does not support invokeStructured'
    )
  })

  it('invokeAgent spawns map with --headless --output-dir and prompt', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: mapSuccessFixture }))

    await map.invokeAgent('fix the bug', '/tmp/workdir')

    expect(spawnMock).toHaveBeenCalledOnce()
    const [cmd, args, opts] = spawnMock.mock.calls[0] as [string, string[], { cwd?: string }]
    expect(cmd).toBe('map')
    expect(args).toContain('--headless')
    expect(args).toContain('--output-dir')
    expect(args).toContain('/tmp/workdir')
    expect(args).toContain('fix the bug')
    expect(opts?.cwd).toBe('/tmp/workdir')
  })

  it('invokeAgent prepends configured command args before generated MAP args', async () => {
    const customMap = new MAPWrapper({ command: 'npm', args: ['run', 'map:dev', '--'] })
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: mapSuccessFixture }))

    await customMap.invokeAgent('fix the bug', '/tmp/workdir')

    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(cmd).toBe('npm')
    expect(args.slice(0, 3)).toEqual(['run', 'map:dev', '--'])
    expect(args).toContain('--headless')
    expect(args).toContain('fix the bug')
  })

  it('detect uses configured command args before --version', () => {
    execFileSyncMock.mockReturnValue('map-dev 2.0.0')

    const result = MAPWrapper.detect({ command: 'pnpm', args: ['--dir', '../map', 'start', '--'] })

    expect(result).toEqual({ available: true, version: 'map-dev 2.0.0' })
    expect(execFileSyncMock).toHaveBeenCalledWith('pnpm', ['--dir', '../map', 'start', '--', '--version'], expect.any(Object))
  })

  it('invokeAgent does NOT pass --config when no agents config', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: mapSuccessFixture }))

    await map.invokeAgent('prompt', '/tmp/workdir')

    const [, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(args).not.toContain('--config')
  })

  it('invokeAgent with config.agents writes temp .map-pipeline.yaml and passes --config', async () => {
    const mapWithAgents = new MAPWrapper({
      agents: {
        spec: { adapter: 'claude' },
        review: { adapter: 'codex' },
        execute: { adapter: 'claude' },
      },
    })
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: mapSuccessFixture }))

    await mapWithAgents.invokeAgent('prompt', '/tmp/workdir')

    expect(writeFileSyncMock).toHaveBeenCalledOnce()
    const [configFilePath] = writeFileSyncMock.mock.calls[0] as [string]
    expect(configFilePath).toContain('.map-pipeline.yaml')

    const [, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(args).toContain('--config')
    expect(args).toContain(configFilePath)
  })

  it('invokeAgent parses JSON stdout into AgentResult', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: mapSuccessFixture }))

    const result = await map.invokeAgent('prompt', '/tmp/workdir')

    expect(result.success).toBe(true)
    expect(result.stdout).toBe('Generated spec output')
    expect(result.stderr).toBe('')
  })

  it('invokeAgent throws AIBinaryNotFoundError when map not on PATH', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ enoent: true }))

    await expect(map.invokeAgent('prompt', '/tmp/workdir')).rejects.toThrow(AIBinaryNotFoundError)
  })

  it('AIBinaryNotFoundError includes binary name "map"', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ enoent: true }))

    await expect(map.invokeAgent('prompt', '/tmp/workdir')).rejects.toThrow(/map/i)
  })

  it('invokeAgent throws AITimeoutError on timeout', async () => {
    const proc = new EventEmitter() as ChildProcess & {
      stdout: EventEmitter
      stderr: EventEmitter
      kill: () => boolean
    }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = () => true
    spawnMock.mockReturnValue(proc)

    const mapShortTimeout = new MAPWrapper({ timeoutMs: 50 })
    await expect(mapShortTimeout.invokeAgent('prompt', '/tmp/workdir')).rejects.toThrow(AITimeoutError)
  }, 3000)

  it('invokeAgent throws AIInvocationError on non-zero exit code', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ exitCode: 1, stderr: 'map crashed' }))

    await expect(map.invokeAgent('prompt', '/tmp/workdir')).rejects.toThrow(AIInvocationError)
  })

  it('invokeAgent throws AIInvocationError when success is false in JSON', async () => {
    const failFixture = JSON.stringify({
      version: 1,
      success: false,
      spec: '',
      filesCreated: [],
      error: 'spec generation failed',
    })
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: failFixture }))

    await expect(map.invokeAgent('prompt', '/tmp/workdir')).rejects.toThrow(AIInvocationError)
  })

  it('invokeAgent uses empty string when MAP result has no error field (line 103 ?? branch)', async () => {
    // result.error is undefined → uses the ?? '' fallback
    const failNoError = JSON.stringify({
      version: 1,
      success: false,
      spec: '',
      filesCreated: [],
      // no "error" property
    })
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: failNoError }))

    const rejection = expect(map.invokeAgent('prompt', '/tmp/workdir')).rejects
    await rejection.toThrow(AIInvocationError)
    await rejection.toThrow(/MAP pipeline failed/)
  })

  it('invokeAgent throws AIInvocationError on invalid JSON output', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: 'not valid json\n' }))

    await expect(map.invokeAgent('prompt', '/tmp/workdir')).rejects.toThrow(AIInvocationError)
  })

  it('invokeAgent throws AIInvocationError on empty output', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: '' }))

    await expect(map.invokeAgent('prompt', '/tmp/workdir')).rejects.toThrow(AIInvocationError)
  })

  it('default timeout is 1_800_000 ms (30 min)', () => {
    const wrapper = new MAPWrapper()
    const config = (wrapper as unknown as { config?: { timeoutMs?: number } }).config
    expect(config).toBeUndefined()
  })

  it('invokeAgent rejects version mismatch in HeadlessResult', async () => {
    const wrongVersion = JSON.stringify({
      version: 99,
      success: true,
      spec: 'some spec',
      filesCreated: [],
    })
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: wrongVersion }))
    execFileSyncMock.mockReturnValue('0.1.0')

    await expect(map.invokeAgent('prompt', '/tmp/workdir')).rejects.toThrow(
      /version mismatch/
    )
  })

  it('checkVersion warns without hint when detect returns available=false with no hint (line 125 ?? branch)', async () => {
    // Spy on MAPWrapper.detect to return available=false without hint
    const detectSpy = vi.spyOn(MAPWrapper, 'detect').mockReturnValue({ available: false })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    spawnMock.mockReturnValue(makeFakeProcess({ stdout: mapSuccessFixture }))

    await map.invokeAgent('prompt', '/tmp/workdir')

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[MAP] map binary not found. '),
    )

    detectSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('invokeAgent with agents config using default adapters (lines 134-136 ?? branches)', async () => {
    // Provide agents config but WITHOUT adapter properties — triggers ?? fallbacks
    const mapWithDefaultAdapters = new MAPWrapper({
      agents: {
        spec: {},   // no adapter → defaults to 'claude'
        review: {}, // no adapter → defaults to 'codex'
        execute: {}, // no adapter → defaults to 'claude'
      },
    })
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: mapSuccessFixture }))

    await mapWithDefaultAdapters.invokeAgent('prompt', '/tmp/workdir')

    // The config file should have been written with default adapters
    expect(writeFileSyncMock).toHaveBeenCalledOnce()
    const writtenContent = writeFileSyncMock.mock.calls[0]?.[1] as string
    expect(writtenContent).toContain('claude')
    expect(writtenContent).toContain('codex')
  })

  describe('v2 headless contract', () => {
    it('accepts version 2 and returns success with steps/dag in stdout', async () => {
      const v2Fixture = JSON.stringify({
        version: 2,
        success: true,
        steps: [
          { id: 'step-1', agent: 'claude', task: 'Implement feature', status: 'done', outputType: 'files', filesCreated: ['src/foo.ts'] },
        ],
        dag: {
          nodes: [{ id: 'step-1', agent: 'claude', status: 'done', duration: 1000 }],
          edges: [],
        },
      })
      spawnMock.mockReturnValue(makeFakeProcess({ stdout: v2Fixture }))

      const result = await map.invokeAgent('prompt', '/tmp/workdir')

      expect(result.success).toBe(true)
      expect(result.stderr).toBe('')
      const parsed = JSON.parse(result.stdout) as { version: number; steps: unknown[]; dag: unknown }
      expect(parsed.version).toBe(2)
      expect(Array.isArray(parsed.steps)).toBe(true)
    })

    it('throws AIInvocationError when version 2 result has success: false', async () => {
      const v2FailFixture = JSON.stringify({
        version: 2,
        success: false,
        error: 'agent timeout',
      })
      spawnMock.mockReturnValue(makeFakeProcess({ stdout: v2FailFixture }))

      const rejection = await map.invokeAgent('prompt', '/tmp/workdir').catch((e: unknown) => e)
      expect(rejection).toBeInstanceOf(AIInvocationError)
      expect((rejection as AIInvocationError).message).toMatch(/MAP pipeline failed/)
    })

    it('throws AIInvocationError with empty error message when v2 result has no error field', async () => {
      const v2FailNoError = JSON.stringify({
        version: 2,
        success: false,
        // no error field
      })
      spawnMock.mockReturnValue(makeFakeProcess({ stdout: v2FailNoError }))

      await expect(map.invokeAgent('prompt', '/tmp/workdir')).rejects.toThrow(AIInvocationError)
    })

    it('v2 result stdout is valid JSON with version=2, steps, and dag keys', async () => {
      const v2Fixture = JSON.stringify({
        version: 2,
        success: true,
        steps: [
          { id: 's1', agent: 'claude', task: 'spec', status: 'done', outputType: 'answer', output: 'Answer text' },
          { id: 's2', agent: 'claude', task: 'impl', status: 'done', outputType: 'files', filesCreated: ['src/a.ts'] },
        ],
        dag: { nodes: [], edges: [] },
      })
      spawnMock.mockReturnValue(makeFakeProcess({ stdout: v2Fixture }))

      const result = await map.invokeAgent('prompt', '/tmp/workdir')

      const parsed = JSON.parse(result.stdout) as { version: number; steps: Array<{ outputType?: string }>; dag: object }
      expect(parsed.version).toBe(2)
      expect(parsed.steps).toHaveLength(2)
      expect(parsed.dag).toBeDefined()
    })

    it('parses pretty-printed MAP headless JSON from stdout', async () => {
      const prettyFixture = JSON.stringify({
        version: 2,
        success: true,
        steps: [
          { id: 's1', agent: 'claude', task: 'spec', status: 'done', outputType: 'answer', output: 'Answer text' },
        ],
        dag: { nodes: [], edges: [] },
      }, null, 2)
      spawnMock.mockReturnValue(makeFakeProcess({ stdout: `progress line\n${prettyFixture}\n` }))

      const result = await map.invokeAgent('prompt', '/tmp/workdir')

      const parsed = JSON.parse(result.stdout) as { version: number; steps: unknown[] }
      expect(parsed.version).toBe(2)
      expect(parsed.steps).toHaveLength(1)
    })
  })

  describe('detect', () => {
    it('returns available=true with version when map binary exists', () => {
      execFileSyncMock.mockReturnValue('0.1.0\n')
      const result = MAPWrapper.detect()
      expect(result.available).toBe(true)
      expect(result.version).toBe('0.1.0')
    })

    it('returns available=false with hint when map binary not found', () => {
      execFileSyncMock.mockImplementation(() => { throw new Error('ENOENT') })
      const result = MAPWrapper.detect()
      expect(result.available).toBe(false)
      expect(result.hint).toBeDefined()
      expect(result.hint).toContain('multi-agent-pipeline')
    })
  })
})
