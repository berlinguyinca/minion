import { describe, it, expect } from 'vitest'
import {
  AITimeoutError,
  AIBinaryNotFoundError,
  AIInvocationError,
  AIRateLimitError,
  detectRateLimitError,
  humanizeAIError,
} from '../../../src/ai/errors.js'

describe('AITimeoutError', () => {
  it('extends Error', () => {
    const err = new AITimeoutError('claude', 5000)
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AITimeoutError)
  })

  it('has correct name property', () => {
    const err = new AITimeoutError('claude', 5000)
    expect(err.name).toBe('AITimeoutError')
  })

  it('stores model and timeoutMs as readonly properties', () => {
    const err = new AITimeoutError('gpt-4', 30000)
    expect(err.model).toBe('gpt-4')
    expect(err.timeoutMs).toBe(30000)
  })

  it('produces expected message format', () => {
    const err = new AITimeoutError('claude', 120000)
    expect(err.message).toBe('AI invocation timed out after 120000ms (model: claude)')
  })
})

describe('AIBinaryNotFoundError', () => {
  it('extends Error', () => {
    const err = new AIBinaryNotFoundError('claude')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AIBinaryNotFoundError)
  })

  it('has correct name property', () => {
    const err = new AIBinaryNotFoundError('codex')
    expect(err.name).toBe('AIBinaryNotFoundError')
  })

  it('stores binary as readonly property', () => {
    const err = new AIBinaryNotFoundError('ollama')
    expect(err.binary).toBe('ollama')
  })

  it('produces expected message format', () => {
    const err = new AIBinaryNotFoundError('claude')
    expect(err.message).toBe('claude CLI not found \u2014 is it installed and on PATH?')
  })
})

describe('AIInvocationError', () => {
  it('extends Error', () => {
    const err = new AIInvocationError('claude', 1, 'something went wrong')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AIInvocationError)
  })

  it('has correct name property', () => {
    const err = new AIInvocationError('codex', 2, 'fail')
    expect(err.name).toBe('AIInvocationError')
  })

  it('stores model and exitCode as readonly properties', () => {
    const err = new AIInvocationError('ollama', 42, 'crash')
    expect(err.model).toBe('ollama')
    expect(err.exitCode).toBe(42)
  })

  it('produces expected message format', () => {
    const err = new AIInvocationError('claude', 1, 'out of memory')
    expect(err.message).toBe('AI invocation failed (model: claude, exit: 1): out of memory')
  })
})

describe('AIRateLimitError', () => {
  it('extends AIInvocationError', () => {
    const err = new AIRateLimitError('claude', 1, '5pm PT', 'rate limited')
    expect(err).toBeInstanceOf(AIInvocationError)
    expect(err).toBeInstanceOf(AIRateLimitError)
  })

  it('has correct name property', () => {
    const err = new AIRateLimitError('claude', 1, undefined, 'limited')
    expect(err.name).toBe('AIRateLimitError')
  })

  it('stores resetInfo', () => {
    const err = new AIRateLimitError('claude', 1, '5pm (America/Los_Angeles)', 'raw')
    expect(err.resetInfo).toBe('5pm (America/Los_Angeles)')
    expect(err.model).toBe('claude')
    expect(err.exitCode).toBe(1)
  })

  it('allows undefined resetInfo', () => {
    const err = new AIRateLimitError('codex', 1, undefined, 'raw')
    expect(err.resetInfo).toBeUndefined()
  })
})

describe('detectRateLimitError', () => {
  it('returns AIRateLimitError for "You\'ve hit your limit" in JSON output', () => {
    const json = JSON.stringify({
      type: 'result',
      is_error: true,
      result: "You've hit your limit · resets 5pm (America/Los_Angeles)",
    })
    const err = detectRateLimitError('claude', 1, json)
    expect(err).toBeInstanceOf(AIRateLimitError)
    expect(err?.resetInfo).toBe('5pm (America/Los_Angeles)')
  })

  it('returns AIRateLimitError for "rate limit" text', () => {
    const err = detectRateLimitError('claude', 1, 'Error: rate limit exceeded')
    expect(err).toBeInstanceOf(AIRateLimitError)
  })

  it('returns AIRateLimitError for "too many requests"', () => {
    const err = detectRateLimitError('codex', 429, 'too many requests')
    expect(err).toBeInstanceOf(AIRateLimitError)
    expect(err?.model).toBe('codex')
  })

  it('returns AIRateLimitError for "quota exceeded"', () => {
    const err = detectRateLimitError('claude', 1, 'API quota exceeded for this billing period')
    expect(err).toBeInstanceOf(AIRateLimitError)
  })

  it('returns undefined for non-rate-limit errors', () => {
    expect(detectRateLimitError('claude', 1, 'segfault')).toBeUndefined()
    expect(detectRateLimitError('claude', 1, 'out of memory')).toBeUndefined()
    expect(detectRateLimitError('claude', 1, '{}')).toBeUndefined()
  })

  it('extracts resetInfo from non-JSON text', () => {
    const err = detectRateLimitError('claude', 1, "You've hit your limit · resets 5pm PT")
    expect(err).toBeInstanceOf(AIRateLimitError)
    expect(err?.resetInfo).toBe('5pm PT')
  })
})

describe('humanizeAIError', () => {
  it('humanizes AIRateLimitError with reset info', () => {
    const err = new AIRateLimitError('claude', 1, '5pm PT', 'raw')
    expect(humanizeAIError(err)).toBe('Rate-limited (resets 5pm PT)')
  })

  it('humanizes AIRateLimitError without reset info', () => {
    const err = new AIRateLimitError('claude', 1, undefined, 'raw')
    expect(humanizeAIError(err)).toBe('Rate-limited (model: claude)')
  })

  it('humanizes AITimeoutError', () => {
    const err = new AITimeoutError('claude', 120000)
    expect(humanizeAIError(err)).toBe('Timed out after 120s (model: claude)')
  })

  it('humanizes AIInvocationError with JSON result field', () => {
    const json = JSON.stringify({ result: 'Something went wrong in the pipeline', other: 'data' })
    const err = new AIInvocationError('claude', 1, json)
    expect(humanizeAIError(err)).toContain('Something went wrong in the pipeline')
    expect(humanizeAIError(err)).not.toContain('"other"')
  })

  it('truncates long JSON result field in AIInvocationError', () => {
    const longResult = 'A'.repeat(300)
    const json = JSON.stringify({ result: longResult })
    const err = new AIInvocationError('claude', 1, json)
    const result = humanizeAIError(err)
    expect(result).toContain('…')
    expect(result).not.toContain(longResult) // should be truncated
    expect(result.length).toBeLessThan(300)
  })

  it('falls back to truncation when AIInvocationError message contains invalid JSON', () => {
    const err = new AIInvocationError('claude', 1, '{not valid json at all')
    const result = humanizeAIError(err)
    expect(result).toContain('AI failed')
    expect(result).toContain('{not valid json at all')
  })

  it('falls back to truncation when JSON has no result field', () => {
    const err = new AIInvocationError('claude', 1, JSON.stringify({ error: 'oops' }))
    const result = humanizeAIError(err)
    expect(result).toContain('AI failed')
  })

  it('truncates long AIInvocationError messages', () => {
    const longMsg = 'x'.repeat(500)
    const err = new AIInvocationError('claude', 1, longMsg)
    const result = humanizeAIError(err)
    expect(result.length).toBeLessThan(300)
    expect(result).toContain('…')
  })

  it('humanizes plain Error', () => {
    const err = new Error('something broke')
    expect(humanizeAIError(err)).toBe('something broke')
  })

  it('truncates very long plain Error messages', () => {
    const err = new Error('y'.repeat(500))
    const result = humanizeAIError(err)
    expect(result.length).toBeLessThanOrEqual(304) // 300 + "…"
    expect(result).toContain('…')
  })
})
