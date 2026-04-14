export class AITimeoutError extends Error {
  constructor(
    public readonly model: string,
    public readonly timeoutMs: number
  ) {
    super(`AI invocation timed out after ${timeoutMs}ms (model: ${model})`)
    this.name = 'AITimeoutError'
  }
}

export class AIBinaryNotFoundError extends Error {
  constructor(public readonly binary: string) {
    super(`${binary} CLI not found — is it installed and on PATH?`)
    this.name = 'AIBinaryNotFoundError'
  }
}

export class AIInvocationError extends Error {
  constructor(
    public readonly model: string,
    public readonly exitCode: number,
    message: string
  ) {
    super(`AI invocation failed (model: ${model}, exit: ${exitCode}): ${message}`)
    this.name = 'AIInvocationError'
  }
}

export class AIRateLimitError extends AIInvocationError {
  constructor(
    model: string,
    exitCode: number,
    public readonly resetInfo: string | undefined,
    rawMessage: string,
  ) {
    super(model, exitCode, rawMessage)
    this.name = 'AIRateLimitError'
  }
}

const RATE_LIMIT_PATTERNS = [
  /You['']ve hit your limit/i,
  /rate.?limit/i,
  /too many requests/i,
  /quota exceeded/i,
]

/**
 * Detect whether raw CLI output indicates a rate-limit error.
 * Returns a `AIRateLimitError` if detected, otherwise `undefined`.
 */
export function detectRateLimitError(
  model: string,
  exitCode: number,
  rawOutput: string,
): AIRateLimitError | undefined {
  const isRateLimited = RATE_LIMIT_PATTERNS.some((re) => re.test(rawOutput))
  if (!isRateLimited) return undefined

  // Try to extract reset info from JSON result field
  let resetInfo: string | undefined
  try {
    const parsed = JSON.parse(rawOutput) as { result?: string }
    if (typeof parsed.result === 'string') {
      const match = parsed.result.match(/resets?\s+(.+)/i)
      resetInfo = match?.[1]
    }
  } catch {
    // Not JSON — try regex on raw text
    const match = rawOutput.match(/resets?\s+(.+?)(?:\n|"|$)/i)
    resetInfo = match?.[1]
  }

  return new AIRateLimitError(model, exitCode, resetInfo, rawOutput)
}

/**
 * Produce a short, human-readable summary of an AI error
 * suitable for posting in GitHub issue comments.
 */
export function humanizeAIError(err: Error): string {
  if (err instanceof AIRateLimitError) {
    return err.resetInfo
      ? `Rate-limited (resets ${err.resetInfo})`
      : `Rate-limited (model: ${err.model})`
  }
  if (err instanceof AITimeoutError) {
    const seconds = Math.round(err.timeoutMs / 1000)
    return `Timed out after ${seconds}s (model: ${err.model})`
  }
  if (err instanceof AIInvocationError) {
    // Try to extract the "result" field from JSON output embedded in the message
    const jsonStart = err.message.indexOf('{')
    if (jsonStart !== -1) {
      try {
        const parsed = JSON.parse(err.message.slice(jsonStart)) as { result?: string }
        if (typeof parsed.result === 'string' && parsed.result.length > 0) {
          const summary = parsed.result.length > 200 ? `${parsed.result.slice(0, 200)}…` : parsed.result
          return `AI failed (model: ${err.model}, exit: ${err.exitCode}): ${summary}`
        }
      } catch {
        // Not parseable — fall through to truncation
      }
    }
    // Truncate long messages
    const prefix = `AI failed (model: ${err.model}, exit: ${err.exitCode}): `
    const raw = err.message.replace(/^AI invocation failed \(model: \w+, exit: -?\d+\): /, '')
    const truncated = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw
    return `${prefix}${truncated}`
  }
  return err.message.length > 300 ? `${err.message.slice(0, 300)}…` : err.message
}
