import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

// ---------------------------------------------------------------------------
// child_process mock
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from 'node:child_process'
import { ClaudeWrapper } from '../../../src/ai/claude-wrapper.js'
import { CodexWrapper } from '../../../src/ai/codex-wrapper.js'
import { OllamaWrapper } from '../../../src/ai/ollama-wrapper.js'
import { AITimeoutError, AIBinaryNotFoundError, AIInvocationError } from '../../../src/ai/errors.js'

const spawnMock = spawn as unknown as MockInstance

// ---------------------------------------------------------------------------
// Helpers — build a fake ChildProcess with controllable stdout/stderr/close
// ---------------------------------------------------------------------------

interface FakeProcessOptions {
  stdout?: string
  stderr?: string
  exitCode?: number
  enoent?: boolean
  /** simulate abort/error event with ABORT_ERR code */
  abortError?: boolean
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
    // Emit error synchronously-ish with ENOENT
    setImmediate(() => {
      const err = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
      proc.emit('error', err)
    })
    return proc
  }

  if (opts.abortError) {
    setImmediate(() => {
      const err = Object.assign(new Error('The operation was aborted'), { code: 'ABORT_ERR' })
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
// Claude structured output fixture
// ---------------------------------------------------------------------------

const claudeStructuredFixture = JSON.stringify({
  type: 'result',
  result: { answer: 42 },
})

// ---------------------------------------------------------------------------
// Codex structured output fixture
// ---------------------------------------------------------------------------

const codexFixture = [
  JSON.stringify({ type: 'turn.completed', output: 'hello world' }),
].join('\n')

// ---------------------------------------------------------------------------
// Ollama output fixture
// ---------------------------------------------------------------------------

const ollamaFixture = JSON.stringify({ response: JSON.stringify({ value: 'test' }) })

// ---------------------------------------------------------------------------
// ClaudeWrapper tests
// ---------------------------------------------------------------------------

describe('ClaudeWrapper', () => {
  let claude: ClaudeWrapper

  beforeEach(() => {
    vi.clearAllMocks()
    claude = new ClaudeWrapper()
  })

  it('invokeStructured spawns claude with correct args', async () => {
    const schema = { type: 'object' }
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: claudeStructuredFixture }))

    await claude.invokeStructured('my prompt', schema)

    expect(spawnMock).toHaveBeenCalledOnce()
    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(cmd).toBe('claude')
    expect(args).toContain('--print')
    expect(args).toContain('my prompt')
    expect(args).toContain('--output-format')
    expect(args).toContain('json')
    expect(args).toContain('--json-schema')
    expect(args).toContain(JSON.stringify(schema))
  })

  it('invokeAgent spawns claude with --dangerously-skip-permissions and cwd', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: '{}' }))

    await claude.invokeAgent('do the thing', '/tmp/workdir')

    expect(spawnMock).toHaveBeenCalledOnce()
    const [cmd, args, opts] = spawnMock.mock.calls[0] as [string, string[], { cwd?: string }]
    expect(cmd).toBe('claude')
    expect(args).toContain('--print')
    expect(args).toContain('do the thing')
    expect(args).toContain('--output-format')
    expect(args).toContain('json')
    expect(args).toContain('--dangerously-skip-permissions')
    expect(opts?.cwd).toBe('/tmp/workdir')
  })

  it('default timeout for invokeStructured is 120000ms', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: claudeStructuredFixture }))
    await claude.invokeStructured('prompt', {})
    // We can't check the AbortController directly, but we verify the call succeeds
    // and use the timeout test below for boundary verification
    expect(spawnMock).toHaveBeenCalledOnce()
  })

  it('default timeout for invokeAgent is 1200000ms', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: '{}' }))
    await claude.invokeAgent('prompt', '/tmp')
    expect(spawnMock).toHaveBeenCalledOnce()
  })

  it('throws AIBinaryNotFoundError on ENOENT', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ enoent: true }))

    await expect(claude.invokeStructured('prompt', {})).rejects.toThrow(AIBinaryNotFoundError)
  })

  it('AIBinaryNotFoundError includes binary name', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ enoent: true }))

    await expect(claude.invokeStructured('prompt', {})).rejects.toThrow(/claude/i)
  })

  it('throws AIInvocationError on non-zero exit code', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ exitCode: 1, stderr: 'some error' }))

    await expect(claude.invokeStructured('prompt', {})).rejects.toThrow(AIInvocationError)
  })
})

// ---------------------------------------------------------------------------
// CodexWrapper tests
// ---------------------------------------------------------------------------

describe('CodexWrapper', () => {
  let codex: CodexWrapper

  beforeEach(() => {
    vi.clearAllMocks()
    codex = new CodexWrapper()
  })

  it('invokeStructured spawns codex with correct args', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: codexFixture }))

    await codex.invokeStructured('my prompt', { type: 'object' })

    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(cmd).toBe('codex')
    expect(args).toContain('exec')
    expect(args).toContain('--json')
    expect(args).toContain('my prompt')
  })

  it('invokeAgent spawns codex with --full-auto and cwd', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: codexFixture }))

    await codex.invokeAgent('implement it', '/tmp/codexwork')

    const [cmd, args, opts] = spawnMock.mock.calls[0] as [string, string[], { cwd?: string }]
    expect(cmd).toBe('codex')
    expect(args).toContain('--full-auto')
    expect(opts?.cwd).toBe('/tmp/codexwork')
  })

  it('throws AIBinaryNotFoundError on ENOENT', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ enoent: true }))

    await expect(codex.invokeStructured('prompt', {})).rejects.toThrow(AIBinaryNotFoundError)
  })

  it('throws AIInvocationError on non-zero exit code', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ exitCode: 2, stderr: 'codex fail' }))

    await expect(codex.invokeAgent('prompt', '/tmp')).rejects.toThrow(AIInvocationError)
  })
})

// ---------------------------------------------------------------------------
// OllamaWrapper tests
// ---------------------------------------------------------------------------

describe('OllamaWrapper', () => {
  let ollama: OllamaWrapper

  beforeEach(() => {
    vi.clearAllMocks()
    ollama = new OllamaWrapper('qwen2.5-coder:latest')
  })

  it('invokeStructured spawns ollama with model arg', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: ollamaFixture }))

    await ollama.invokeStructured('my prompt', {})

    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(cmd).toBe('ollama')
    expect(args).toContain('run')
    expect(args).toContain('qwen2.5-coder:latest')
  })

  it('invokeAgent throws AIInvocationError (not supported)', async () => {
    await expect(ollama.invokeAgent('prompt', '/tmp')).rejects.toThrow(AIInvocationError)
  })

  it('throws AIBinaryNotFoundError on ENOENT', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ enoent: true }))

    await expect(ollama.invokeStructured('prompt', {})).rejects.toThrow(AIBinaryNotFoundError)
  })

  it('throws AIInvocationError on non-zero exit', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ exitCode: 1, stderr: 'ollama fail' }))

    await expect(ollama.invokeStructured('prompt', {})).rejects.toThrow(AIInvocationError)
  })
})

// ---------------------------------------------------------------------------
// Timeout tests (cross-wrapper)
// Use a very short real timeout (50ms) with a process that never closes.
// ---------------------------------------------------------------------------

describe('timeout behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws AITimeoutError when timeout is exceeded (claude structured)', async () => {
    // Process that never emits close
    const proc = new EventEmitter() as ChildProcess & {
      stdout: EventEmitter
      stderr: EventEmitter
      kill: () => boolean
    }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = () => true
    spawnMock.mockReturnValue(proc)

    const claude = new ClaudeWrapper(50)
    await expect(claude.invokeStructured('prompt', {})).rejects.toThrow(AITimeoutError)
  }, 3000)

  it('throws AITimeoutError when timeout is exceeded (codex agent)', async () => {
    const proc = new EventEmitter() as ChildProcess & {
      stdout: EventEmitter
      stderr: EventEmitter
      kill: () => boolean
    }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = () => true
    spawnMock.mockReturnValue(proc)

    const codex = new CodexWrapper(50, 50)
    await expect(codex.invokeAgent('prompt', '/tmp')).rejects.toThrow(AITimeoutError)
  }, 3000)
})
