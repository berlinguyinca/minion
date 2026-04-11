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
