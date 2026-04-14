import type { StateManager } from '../config/state.js'
import type { AIProvider, AIModel, StructuredResult, AgentResult, PipelineTask, TaskModelConfig } from '../types/index.js'
import { AIBinaryNotFoundError, AIInvocationError, AIRateLimitError } from './errors.js'

type ProvidersMap = Partial<Record<AIModel, AIProvider>>

const DEFAULT_CHAIN: AIModel[] = ['claude', 'codex', 'ollama']

export class AIRouter {
  private readonly providerChain: AIModel[]

  constructor(
    private readonly state: StateManager,
    private readonly providers: ProvidersMap,
    providerChain?: AIModel[],
    private readonly taskModels?: Partial<Record<PipelineTask, TaskModelConfig>>,
  ) {
    this.providerChain = providerChain ?? DEFAULT_CHAIN
  }

  async invokeStructured<T>(
    prompt: string,
    schema: object,
  ): Promise<StructuredResult<T> & { model: AIModel }> {
    const candidates = this.getChainCandidates()

    for (const model of candidates) {
      const provider = this.providers[model]
      if (provider === undefined) continue
      // Skip full-pipeline providers — they don't support invokeStructured
      if (provider.handlesFullPipeline) continue
      try {
        const result = await provider.invokeStructured<T>(prompt, schema)
        this.trackUsage(model)
        return { ...result, model }
      } catch (err) {
        if (err instanceof AIBinaryNotFoundError) {
          continue
        }
        if (err instanceof AIRateLimitError) {
          console.warn(`[ai-router] ${model} rate-limited, trying next provider`)
          continue
        }
        throw err
      }
    }

    // All candidates exhausted
    throw new AIBinaryNotFoundError('(all AI providers)')
  }

  async invokeAgent(
    prompt: string,
    workingDir: string,
  ): Promise<AgentResult & { model: AIModel }> {
    const candidates = this.getChainCandidates()

    for (const model of candidates) {
      const provider = this.providers[model]
      if (provider === undefined) continue
      try {
        const result = await provider.invokeAgent(prompt, workingDir)
        this.trackUsage(model)
        return { ...result, model }
      } catch (err) {
        if (err instanceof AIBinaryNotFoundError) {
          continue
        }
        if (err instanceof AIRateLimitError) {
          console.warn(`[ai-router] ${model} rate-limited, trying next provider`)
          continue
        }
        // Fall through on "does not support" errors (e.g. OllamaWrapper agent mode)
        if (err instanceof AIInvocationError && err.message.includes('does not support')) {
          continue
        }
        throw err
      }
    }

    throw new AIBinaryNotFoundError('(all AI providers)')
  }

  async invokeStructuredThenAgent<T>(
    structuredPrompt: string,
    schema: object,
    agentPrompt: string | ((spec: string) => string),
    workingDir: string,
  ): Promise<{ structured: StructuredResult<T> | null; agent: AgentResult; model: AIModel }> {
    const candidates = this.getChainCandidates()

    for (const model of candidates) {
      const provider = this.providers[model]
      if (provider === undefined) continue

      try {
        if (provider.handlesFullPipeline) {
          // Full-pipeline provider: skip invokeStructured, pass raw prompt to invokeAgent
          const agentResult = await provider.invokeAgent(structuredPrompt, workingDir)
          this.trackUsage(model)
          return { structured: null, agent: agentResult, model }
        }

        // Standard provider: invokeStructured first, then invokeAgent
        const structuredResult = await provider.invokeStructured<T>(structuredPrompt, schema)
        const specText = structuredResult.rawOutput
        const resolvedAgentPrompt = typeof agentPrompt === 'function'
          ? agentPrompt(specText)
          : agentPrompt

        const agentResult = await provider.invokeAgent(resolvedAgentPrompt, workingDir)
        this.trackUsage(model)
        return { structured: structuredResult, agent: agentResult, model }
      } catch (err) {
        if (err instanceof AIBinaryNotFoundError) {
          continue
        }
        if (err instanceof AIRateLimitError) {
          console.warn(`[ai-router] ${model} rate-limited, trying next provider`)
          continue
        }
        // Fall through on "does not support" errors
        if (err instanceof AIInvocationError && err.message.includes('does not support')) {
          continue
        }
        throw err
      }
    }

    throw new AIBinaryNotFoundError('(all AI providers)')
  }

  /**
   * Invoke structured with a task-specific provider if configured,
   * otherwise fall back to the normal chain.
   */
  async invokeStructuredForTask<T>(
    task: PipelineTask,
    prompt: string,
    schema: object,
  ): Promise<StructuredResult<T> & { model: AIModel }> {
    const taskConfig = this.taskModels?.[task]
    if (taskConfig !== undefined) {
      const provider = this.providers[taskConfig.provider]
      if (provider !== undefined) {
        const result = await provider.invokeStructured<T>(prompt, schema, taskConfig.model)
        this.trackUsage(taskConfig.provider)
        return { ...result, model: taskConfig.provider }
      }
    }
    // Fall back to normal chain
    return this.invokeStructured<T>(prompt, schema)
  }

  /** Build ordered list of candidates from providerChain, filtered by quota availability. */
  private getChainCandidates(): AIModel[] {
    return this.providerChain.filter((model) => this.state.hasQuota(model))
  }

  /** Increment quota only for models that have quota tracking. */
  private trackUsage(model: AIModel): void {
    if (model === 'claude' || model === 'codex') {
      this.state.incrementUsage(model)
    }
  }
}
