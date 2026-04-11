import type { StateManager } from '../config/state.js'
import type { AIProvider, AIModel, StructuredResult, AgentResult } from '../types/index.js'
import { AIBinaryNotFoundError } from './errors.js'

type ProvidersMap = Record<AIModel, AIProvider>

// Ordered fallback chain for binary-not-found errors
const FALLBACK_ORDER: AIModel[] = ['claude', 'codex', 'ollama']

export class AIRouter {
  constructor(
    private readonly state: StateManager,
    private readonly providers: ProvidersMap
  ) {}

  async invokeStructured<T>(
    prompt: string,
    schema: object
  ): Promise<StructuredResult<T> & { model: AIModel }> {
    const selected = this.state.getAvailableModel()
    const candidates = this.buildCandidates(selected)

    for (const model of candidates) {
      const provider = this.providers[model]
      try {
        const result = await provider.invokeStructured<T>(prompt, schema)
        this.trackUsage(model)
        return { ...result, model }
      } catch (err) {
        if (err instanceof AIBinaryNotFoundError) {
          // Try next in chain
          continue
        }
        // AITimeoutError, AIInvocationError, or unknown — re-throw immediately
        throw err
      }
    }

    // All candidates exhausted
    throw new AIBinaryNotFoundError('(all AI providers)')
  }

  async invokeAgent(
    prompt: string,
    workingDir: string
  ): Promise<AgentResult & { model: AIModel }> {
    const selected = this.state.getAvailableModel()
    const candidates = this.buildCandidates(selected)

    for (const model of candidates) {
      const provider = this.providers[model]
      try {
        const result = await provider.invokeAgent(prompt, workingDir)
        this.trackUsage(model)
        return { ...result, model }
      } catch (err) {
        if (err instanceof AIBinaryNotFoundError) {
          continue
        }
        throw err
      }
    }

    throw new AIBinaryNotFoundError('(all AI providers)')
  }

  /** Build ordered list of candidates starting from selected model and falling through. */
  private buildCandidates(selected: AIModel): AIModel[] {
    const startIndex = FALLBACK_ORDER.indexOf(selected)
    if (startIndex === -1) return FALLBACK_ORDER
    return FALLBACK_ORDER.slice(startIndex)
  }

  /** Increment quota only for models that have quota (not ollama). */
  private trackUsage(model: AIModel): void {
    if (model === 'claude' || model === 'codex') {
      this.state.incrementUsage(model)
    }
  }
}
