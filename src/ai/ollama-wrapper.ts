import { invokeProcess } from './base-wrapper.js'
import { AIInvocationError } from './errors.js'
import type { AIProvider, AIModel, AgentResult, StructuredResult, ProviderConfig } from '../types/index.js'

const DEFAULT_STRUCTURED_TIMEOUT_MS = 2 * 60 * 1000  // 2 minutes

function parseOllamaStructured<T>(stdout: string): T {
  try {
    const parsed = JSON.parse(stdout) as { response?: string }
    const response = parsed.response
    if (response !== undefined) {
      try {
        return JSON.parse(response) as T
      } catch {
        return response as unknown as T
      }
    }
    return parsed as unknown as T
  } catch {
    throw new AIInvocationError('ollama', 0, `Could not parse ollama output: ${stdout.slice(0, 200)}`)
  }
}

export class OllamaWrapper implements AIProvider {
  readonly model: AIModel = 'ollama'
  readonly handlesFullPipeline = false
  private readonly ollamaModel: string
  private readonly structuredTimeoutMs: number

  constructor(model?: string, config?: ProviderConfig) {
    this.ollamaModel = model ?? config?.model ?? 'qwen2.5-coder:latest'
    this.structuredTimeoutMs = config?.structuredTimeoutMs ?? config?.timeoutMs ?? DEFAULT_STRUCTURED_TIMEOUT_MS
  }

  async invokeStructured<T>(prompt: string, _schema: object, modelOverride?: string): Promise<StructuredResult<T>> {
    const model = modelOverride ?? this.ollamaModel
    const args = ['run', model, '--format', 'json', prompt]

    try {
      const { stdout } = await invokeProcess({
        command: 'ollama',
        args,
        timeoutMs: this.structuredTimeoutMs,
        model: 'ollama',
      })

      const data = parseOllamaStructured<T>(stdout)
      return { success: true, data, rawOutput: stdout }
    } catch (err) {
      if (err instanceof AIInvocationError || err instanceof Error) {
        throw err
      }
      return { success: false, rawOutput: '', error: String(err) }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async invokeAgent(_prompt: string, _workingDir: string): Promise<AgentResult> {
    throw new AIInvocationError(
      'ollama',
      -1,
      'Ollama does not support agent mode — use invokeStructured instead'
    )
  }
}
