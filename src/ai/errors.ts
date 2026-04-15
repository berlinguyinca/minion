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
  details: string[]
  nextActionHint?: string
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

function formatStructuredFailureDetails(parsed: Record<string, unknown>): string[] {
  const details: string[] = []

  const testsPassing = parsed['testsPassing']
  const testsTotal = parsed['testsTotal']
  const testsFailing = parsed['testsFailing']
  if (typeof testsPassing === 'number' && typeof testsTotal === 'number') {
    const tail = typeof testsFailing === 'number' ? `, ${testsFailing} failing` : ''
    details.push(`tests ${testsPassing}/${testsTotal} passing${tail}`)
  }

  if (typeof parsed['outputDir'] === 'string' && parsed['outputDir'].length > 0) {
    details.push(`artifacts: ${parsed['outputDir']}`)
  }

  if (Array.isArray(parsed['filesCreated']) && parsed['filesCreated'].length > 0) {
    const files = parsed['filesCreated'].filter((item): item is string => typeof item === 'string')
    if (files.length > 0) {
      const sample = files.slice(0, 3).join(', ')
      details.push(files.length > 3 ? `files: ${sample}, …` : `files: ${sample}`)
    }
  }

  const failingTests = extractFailingTests(parsed)
  if (failingTests.length > 0) {
    details.push(failingTests.length > 3 ? `failing tests: ${failingTests.slice(0, 3).join(', ')}, …` : `failing tests: ${failingTests.join(', ')}`)
  }

  const failingStep = extractFailingStep(parsed)
  if (failingStep !== undefined) {
    details.push(`failing step: ${failingStep}`)
  }

  return details
}

function extractFailingTests(parsed: Record<string, unknown>): string[] {
  const values = new Set<string>()

  const addCandidate = (value: unknown): void => {
    if (typeof value === 'string' && value.trim().length > 0) {
      values.add(compactMessage(value))
    }
  }

  const collectFromEntries = (entries: unknown[]): void => {
    for (const entry of entries) {
      if (typeof entry === 'string') {
        addCandidate(entry)
        continue
      }
      if (typeof entry !== 'object' || entry === null) continue
      const record = entry as Record<string, unknown>
      if (record['passed'] === false || record['success'] === false) {
        addCandidate(record['name'])
        addCandidate(record['title'])
        addCandidate(record['test'])
        addCandidate(record['target'])
        addCandidate(record['summary'])
        addCandidate(record['message'])
        const findings = record['findings']
        if (Array.isArray(findings)) {
          for (const finding of findings) {
            addCandidate(finding)
          }
        }
      }
    }
  }

  const direct = parsed['failingTests']
  if (Array.isArray(direct)) collectFromEntries(direct)

  const assessments = parsed['qaAssessments']
  if (Array.isArray(assessments)) collectFromEntries(assessments)

  return Array.from(values).slice(0, 3)
}

function extractFailingStep(parsed: Record<string, unknown>): string | undefined {
  const steps = parsed['steps']
  if (!Array.isArray(steps)) return undefined

  for (const step of steps) {
    if (typeof step !== 'object' || step === null) continue
    const record = step as Record<string, unknown>
    if (record['status'] === 'failed' || record['status'] === 'error') {
      const label =
        typeof record['task'] === 'string' && record['task'].trim().length > 0 ? record['task'] :
        typeof record['id'] === 'string' && record['id'].trim().length > 0 ? record['id'] :
        typeof record['agent'] === 'string' && record['agent'].trim().length > 0 ? record['agent'] :
        undefined
      if (label !== undefined) {
        return compactMessage(label)
      }
    }
  }

  return undefined
}

function buildNextActionHint(details: string[], summary: string): string | undefined {
  const failingTestsDetail = details.find((detail) => detail.startsWith('failing tests: '))
  const failingStepDetail = details.find((detail) => detail.startsWith('failing step: '))
  const artifactDetail = details.find((detail) => detail.startsWith('artifacts: '))

  if (failingStepDetail !== undefined && failingTestsDetail !== undefined) {
    return `Inspect ${failingStepDetail.slice('failing step: '.length)} and rerun the failing tests`
  }
  if (failingTestsDetail !== undefined) {
    return `Rerun the failing tests after fixing: ${failingTestsDetail.slice('failing tests: '.length)}`
  }
  if (failingStepDetail !== undefined) {
    return `Inspect ${failingStepDetail.slice('failing step: '.length)} and rerun MAP`
  }
  if (artifactDetail !== undefined) {
    return `Inspect ${artifactDetail.slice('artifacts: '.length)} for logs and rerun MAP`
  }
  if (summary.includes('failing tests')) {
    return 'Open the failing test output and rerun MAP after fixing the regression'
  }
  return undefined
}

function buildStructuredFailure(
  summary: string,
  details: string[],
): { summary: string; details: string[]; nextActionHint?: string } {
  const failure: { summary: string; details: string[]; nextActionHint?: string } = {
    summary,
    details,
  }
  const nextActionHint = buildNextActionHint(details, summary)
  if (nextActionHint !== undefined) {
    failure.nextActionHint = nextActionHint
  }
  return failure
}

function parseStructuredFailurePayload(raw: string): { summary?: string; details: string[]; nextActionHint?: string } | undefined {
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

    const details = formatStructuredFailureDetails(parsed)
    if (structuredReason && structuredReason.trim().length > 0) {
      return buildStructuredFailure(compactMessage(structuredReason), details)
    }

    if (parsed['success'] === false) {
      return buildStructuredFailure('structured failure response', details)
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
      details: [],
    }
  }
  if (error instanceof AITimeoutError) {
    return {
      message: `Timed out after ${Math.round(error.timeoutMs / 1000)}s (model: ${error.model})`,
      retryable: true,
      details: [],
    }
  }
  if (error instanceof AIBinaryNotFoundError) {
    return {
      message: compactMessage(error.message),
      retryable: false,
      details: [],
    }
  }
  if (error instanceof AIInvocationError || invocationMetadata !== undefined) {
    const model = error instanceof AIInvocationError ? error.model : invocationMetadata?.model ?? 'unknown'
    const exitCode = error instanceof AIInvocationError ? error.exitCode : invocationMetadata?.exitCode ?? -1
    const rawPayload = error instanceof AIInvocationError
      ? extractRawInvocationPayload(error.message)
      : invocationMetadata?.rawPayload ?? extractRawInvocationPayload(sourceMessage)
    const structuredReason = parseStructuredFailurePayload(rawPayload)
    const summary = structuredReason?.summary ?? compactMessage(rawPayload)
    const message = `AI failed (model: ${model}, exit: ${exitCode}): ${truncate(summary)}`
    const classification: AIErrorClassification = {
      message,
      retryable: true,
      details: structuredReason?.details ?? [],
    }
    if (structuredReason?.nextActionHint !== undefined) {
      classification.nextActionHint = structuredReason.nextActionHint
    }
    return classification
  }

  const message = compactMessage(error.message)
  return {
    message: truncate(message),
    retryable: isRetryableMessage(message),
    details: [],
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
