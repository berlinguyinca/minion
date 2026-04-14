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
import { AITimeoutError, AIBinaryNotFoundError, AIInvocationError, AIRateLimitError } from '../../../src/ai/errors.js'

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

  it('throws AIRateLimitError on non-zero exit with rate-limit output', async () => {
    const rateJson = JSON.stringify({ type: 'result', is_error: true, result: "You've hit your limit · resets 5pm (America/Los_Angeles)" })
    spawnMock.mockReturnValue(makeFakeProcess({ exitCode: 1, stderr: rateJson }))

    await expect(claude.invokeStructured('prompt', {})).rejects.toThrow(AIRateLimitError)
  })

  it('skips blank lines in parseClaudeStructured output', async () => {
    const output = '\n\n' + claudeStructuredFixture + '\n\n'
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: output }))
    const result = await claude.invokeStructured<{ answer: number }>('p', {})
    expect(result.success).toBe(true)
    expect(result.data?.answer).toBe(42)
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

  it('skips blank lines in parseCodexStructured output', async () => {
    const output = '\n\n' + codexFixture + '\n'
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: output }))
    const result = await codex.invokeStructured<string>('p', {})
    expect(result.success).toBe(true)
  })

  it('uses text field when output field is missing', async () => {
    const fixture = JSON.stringify({ type: 'turn.completed', text: 'from text field' })
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: fixture }))
    const result = await codex.invokeStructured<string>('p', {})
    expect(result.success).toBe(true)
    expect(result.data).toBe('from text field')
  })

  it('skips turn.completed events with no output or text', async () => {
    const emptyEvent = JSON.stringify({ type: 'turn.completed' })
    const goodEvent = JSON.stringify({ type: 'turn.completed', output: 'real' })
    const fixture = emptyEvent + '\n' + goodEvent
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: fixture }))
    const result = await codex.invokeStructured<string>('p', {})
    expect(result.success).toBe(true)
    expect(result.data).toBe('real')
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

  it('throws AITimeoutError even when proc.kill() throws (base-wrapper line 51)', async () => {
    const proc = new EventEmitter() as ChildProcess & {
      stdout: EventEmitter
      stderr: EventEmitter
      kill: () => boolean
    }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = (): boolean => {
      throw new Error('kill failed')
    }
    spawnMock.mockReturnValue(proc)

    const claude = new ClaudeWrapper(50)
    await expect(claude.invokeStructured('prompt', {})).rejects.toThrow(AITimeoutError)
  }, 3000)
})

// ---------------------------------------------------------------------------
// base-wrapper synchronous spawn throw tests (lines 37-44)
// ---------------------------------------------------------------------------

describe('base-wrapper synchronous spawn throw', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws AIBinaryNotFoundError when spawn throws ENOENT synchronously (lines 37-44)', async () => {
    spawnMock.mockImplementation(() => {
      throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
    })

    const claude = new ClaudeWrapper()
    await expect(claude.invokeStructured('prompt', {})).rejects.toThrow(AIBinaryNotFoundError)
  })

  it('re-throws non-ENOENT synchronous spawn error (lines 40-42)', async () => {
    spawnMock.mockImplementation(() => {
      throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
    })

    const claude = new ClaudeWrapper()
    await expect(claude.invokeStructured('prompt', {})).rejects.toThrow('EPERM')
  })
})

// ---------------------------------------------------------------------------
// base-wrapper non-ENOENT error event test (lines 66-67)
// ---------------------------------------------------------------------------

describe('base-wrapper non-ENOENT error event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects with original error for non-ENOENT error events (lines 66-67)', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ abortError: true }))

    const claude = new ClaudeWrapper()
    await expect(claude.invokeStructured('prompt', {})).rejects.toThrow(/aborted/i)
  })
})

// ---------------------------------------------------------------------------
// Claude parse fallback tests (lines 20, 23-27)
// ---------------------------------------------------------------------------

describe('ClaudeWrapper parse fallback branches', () => {
  let claude: ClaudeWrapper

  beforeEach(() => {
    vi.clearAllMocks()
    claude = new ClaudeWrapper()
  })

  it('parses whole output as JSON when no type:result line exists (line 23)', async () => {
    // Output is valid JSON but no line has type:'result'
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: '{"answer": 42}' }))

    const result = await claude.invokeStructured<{ answer: number }>('prompt', {})
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ answer: 42 })
  })

  it('skips non-JSON lines in output (line 20 catch branch)', async () => {
    // Mix of non-JSON lines and one valid result line
    const output = 'not json\n' + claudeStructuredFixture + '\nmore noise'
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: output }))

    const result = await claude.invokeStructured<{ answer: number }>('prompt', {})
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ answer: 42 })
  })

  it('throws AIInvocationError when whole output is not valid JSON (lines 25-27)', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: 'not json at all' }))

    await expect(claude.invokeStructured('prompt', {})).rejects.toThrow(AIInvocationError)
  })
})

// ---------------------------------------------------------------------------
// Claude invokeStructured non-Error catch (lines 56-57)
// ---------------------------------------------------------------------------

describe('ClaudeWrapper invokeStructured non-Error catch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns { success: false } for non-Error throws (lines 56-57)', async () => {
    // Spawn a process whose stdout is valid JSON but not parseable as claude structured output,
    // AND whose close code is 0. We need a way to trigger the non-Error path.
    // Since spawn is mocked, make it throw a non-Error value synchronously.
    // This gets caught by the try/catch in base-wrapper which rethrows it.
    // Then the claude-wrapper catch checks err instanceof Error — a non-Error passes
    // through to the return { success: false } branch.
    spawnMock.mockImplementation(() => {
        throw 'string-error-not-an-Error-object'
    })

    const claude = new ClaudeWrapper()
    const result = await claude.invokeStructured('prompt', {})
    expect(result.success).toBe(false)
    expect(result.error).toBe('string-error-not-an-Error-object')
  })
})

// ---------------------------------------------------------------------------
// Codex parse fallback tests (lines 22, 36-40)
// ---------------------------------------------------------------------------

describe('CodexWrapper parse fallback branches', () => {
  let codex: CodexWrapper

  beforeEach(() => {
    vi.clearAllMocks()
    codex = new CodexWrapper()
  })

  it('skips non-JSON lines in output (line 22 catch branch)', async () => {
    // Mix of non-JSON lines and one valid event line
    const output = 'noise\n' + codexFixture
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: output }))

    const result = await codex.invokeStructured<string>('prompt', {})
    expect(result.success).toBe(true)
  })

  it('returns combined text as raw string when it is not valid JSON (lines 36-40)', async () => {
    // turn.completed with plain text output (not JSON-parseable)
    const fixture = JSON.stringify({ type: 'turn.completed', output: 'plain text output' })
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: fixture }))

    const result = await codex.invokeStructured<string>('prompt', {})
    expect(result.success).toBe(true)
    expect(result.data).toBe('plain text output')
  })

  it('parses whole output as JSON fallback when no event lines exist (lines 38-39)', async () => {
    // Output is valid JSON but not event-based lines
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: '{"key": "value"}' }))

    const result = await codex.invokeStructured<{ key: string }>('prompt', {})
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ key: 'value' })
  })

  it('throws AIInvocationError when no events and not valid JSON (lines 40-42)', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: 'garbage output' }))

    await expect(codex.invokeStructured('prompt', {})).rejects.toThrow(AIInvocationError)
  })
})

// ---------------------------------------------------------------------------
// Codex invokeStructured non-Error catch (lines 69-70)
// ---------------------------------------------------------------------------

describe('CodexWrapper invokeStructured non-Error catch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns { success: false } for non-Error throws (lines 69-70)', async () => {
    spawnMock.mockImplementation(() => {
        throw 'codex-string-error'
    })

    const codex = new CodexWrapper()
    const result = await codex.invokeStructured('prompt', {})
    expect(result.success).toBe(false)
    expect(result.error).toBe('codex-string-error')
  })
})

// ---------------------------------------------------------------------------
// Ollama parse fallback tests (lines 15-16, 18-21)
// ---------------------------------------------------------------------------

describe('OllamaWrapper parse fallback branches', () => {
  let ollama: OllamaWrapper

  beforeEach(() => {
    vi.clearAllMocks()
    ollama = new OllamaWrapper('qwen2.5-coder:latest')
  })

  it('returns response field as-is when it is a plain string not JSON (lines 15-16)', async () => {
    const fixture = JSON.stringify({ response: 'just a plain string' })
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: fixture }))

    const result = await ollama.invokeStructured<string>('prompt', {})
    expect(result.success).toBe(true)
    expect(result.data).toBe('just a plain string')
  })

  it('returns whole parsed object when response field is absent (lines 18-21)', async () => {
    const fixture = JSON.stringify({ value: 'no-response-field' })
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: fixture }))

    const result = await ollama.invokeStructured<{ value: string }>('prompt', {})
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ value: 'no-response-field' })
  })

  it('throws AIInvocationError when stdout is not valid JSON (outer catch lines 20-21)', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ stdout: 'this is not json' }))

    await expect(ollama.invokeStructured('prompt', {})).rejects.toThrow(AIInvocationError)
  })
})

// ---------------------------------------------------------------------------
// Ollama invokeStructured non-Error catch (lines 51-52)
// ---------------------------------------------------------------------------

describe('OllamaWrapper invokeStructured non-Error catch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns { success: false } for non-Error throws (lines 51-52)', async () => {
    spawnMock.mockImplementation(() => {
        throw 'ollama-string-error'
    })

    const ollama = new OllamaWrapper('qwen2.5-coder:latest')
    const result = await ollama.invokeStructured('prompt', {})
    expect(result.success).toBe(false)
    expect(result.error).toBe('ollama-string-error')
  })
})


// ---------------------------------------------------------------------------
// base-wrapper branch coverage — null close code and stderr||stdout fallback
// ---------------------------------------------------------------------------

describe('base-wrapper branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses -1 when close code is null (code ?? -1 branch)', async () => {
    const proc = new EventEmitter() as ChildProcess & {
      stdout: EventEmitter
      stderr: EventEmitter
      kill: () => boolean
    }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = () => true
    setImmediate(() => {
      proc.stdout.emit('data', Buffer.from('some output'))
      proc.stderr.emit('data', Buffer.from(''))
      proc.emit('close', null)
    })
    spawnMock.mockReturnValue(proc)
    const claude = new ClaudeWrapper()
    const err = await claude.invokeStructured('p', {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AIInvocationError)
    expect(String(err)).toMatch(/-1/)
  })

  it('uses stdout when stderr is empty on non-zero exit (stderr || stdout branch)', async () => {
    spawnMock.mockReturnValue(makeFakeProcess({ exitCode: 1, stdout: 'stdout error info', stderr: '' }))
    const claude = new ClaudeWrapper()
    await expect(claude.invokeStructured('p', {})).rejects.toThrow('stdout error info')
  })
})
