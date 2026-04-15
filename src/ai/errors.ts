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

const RETRYABLE_AI_PATTERNS = [
  /AI invocation failed/i,
  /unsupported/i,
  /not supported/i,
  /capability/i,
  /cannot handle/i,
  /rate.?limit/i,
  /too many requests/i,
  /quota exceeded/i,
  /timed out/i,
]

export interface AIErrorClassification {
  message: string
  retryable: boolean
}

function compactMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim()
}

function truncate(message: string, max = 220): string {
  if (message.length <= max) return message
  return `${message.slice(0, max)}…`
}

function extractRawInvocationPayload(message: string): string {
  const prefix = /^(?:AI invocation failed \(model: .+?, exit: -?\d+\):\s*)([\s\S]*)$/i
  const match = message.match(prefix)
  if (match?.[1] !== undefined) return match[1].trim()

  const jsonStart = message.indexOf('{')
  if (jsonStart !== -1) return message.slice(jsonStart).trim()

  return message.trim()
}

function parseStructuredFailurePayload(raw: string): string | undefined {
  const start = raw.indexOf('{')
  if (start === -1) return undefined

  const end = raw.lastIndexOf('}')
  const candidate = end > start ? raw.slice(start, end + 1) : raw.slice(start)

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>
    const structuredReason =
      typeof parsed['error'] === 'string' ? parsed['error'] :
      typeof parsed['result'] === 'string' ? parsed['result'] :
      typeof parsed['message'] === 'string' ? parsed['message'] :
      undefined

    if (structuredReason && structuredReason.trim().length > 0) {
      return compactMessage(structuredReason)
    }

    if (parsed['success'] === false) {
      return 'structured failure response'
    }

    return undefined
  } catch {
    return undefined
  }
}

function isRetryableMessage(message: string): boolean {
  return RETRYABLE_AI_PATTERNS.some((pattern) => pattern.test(message))
}

function parseInvocationMetadata(message: string): { model: string; exitCode: number; rawPayload: string } | undefined {
  const match = message.match(/^AI invocation failed \(model: (.+?), exit: (-?\d+)\):\s*([\s\S]*)$/i)
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return undefined
  }

  return {
    model: match[1],
    exitCode: Number(match[2]),
    rawPayload: match[3].trim(),
  }
}

export function classifyAIError(err: Error | string): AIErrorClassification {
  const error = typeof err === 'string' ? new Error(err) : err
  const sourceMessage = typeof err === 'string' ? err : error.message
  const invocationMetadata = parseInvocationMetadata(sourceMessage)

  if (error instanceof AIRateLimitError) {
    return {
      message: error.resetInfo
        ? `Rate-limited (resets ${compactMessage(error.resetInfo)})`
        : `Rate-limited (model: ${error.model})`,
      retryable: true,
    }
  }
  if (error instanceof AITimeoutError) {
    return {
      message: `Timed out after ${Math.round(error.timeoutMs / 1000)}s (model: ${error.model})`,
      retryable: true,
    }
  }
  if (error instanceof AIBinaryNotFoundError) {
    return {
      message: compactMessage(error.message),
      retryable: false,
    }
  }
  if (error instanceof AIInvocationError || invocationMetadata !== undefined) {
    const model = error instanceof AIInvocationError ? error.model : invocationMetadata?.model ?? 'unknown'
    const exitCode = error instanceof AIInvocationError ? error.exitCode : invocationMetadata?.exitCode ?? -1
    const rawPayload = error instanceof AIInvocationError
      ? extractRawInvocationPayload(error.message)
      : invocationMetadata?.rawPayload ?? extractRawInvocationPayload(sourceMessage)
    const structuredReason = parseStructuredFailurePayload(rawPayload)
    const message = structuredReason !== undefined
      ? `AI failed (model: ${model}, exit: ${exitCode}): ${truncate(structuredReason)}`
      : `AI failed (model: ${model}, exit: ${exitCode}): ${truncate(compactMessage(rawPayload))}`

    return {
      message,
      retryable: true,
    }
  }

  const message = compactMessage(error.message)
  return {
    message: truncate(message),
    retryable: isRetryableMessage(message),
  }
}

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
  const classification = classifyAIError(err)
  return classification.message
}
