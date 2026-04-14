import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AIProvider, AIModel, StructuredResult, AgentResult } from '../../../src/types/index.js'
import { AIBinaryNotFoundError, AITimeoutError, AIInvocationError, AIRateLimitError } from '../../../src/ai/errors.js'

// ---------------------------------------------------------------------------
// StateManager mock
// ---------------------------------------------------------------------------

vi.mock('../../../src/config/state.js', () => ({
  StateManager: vi.fn().mockImplementation(() => ({
    hasQuota: vi.fn<[AIModel], boolean>().mockReturnValue(true),
    incrementUsage: vi.fn<[string], undefined>(),
    // Keep deprecated method for backward compatibility in other test files
    getAvailableModel: vi.fn<[], AIModel>().mockReturnValue('claude'),
  })),
}))

import { AIRouter } from '../../../src/ai/router.js'
import { StateManager } from '../../../src/config/state.js'

// ---------------------------------------------------------------------------
// Helpers — fake providers
// ---------------------------------------------------------------------------

function makeProvider(
  model: AIModel,
  fullPipeline = false,
): AIProvider & {
  invokeStructured: ReturnType<typeof vi.fn>
  invokeAgent: ReturnType<typeof vi.fn>
} {
  return {
    model,
    handlesFullPipeline: fullPipeline,
    invokeStructured: vi.fn<[string, object], Promise<StructuredResult<unknown>>>().mockResolvedValue({
      success: true,
      data: { result: model },
      rawOutput: `spec from ${model}`,
    }),
    invokeAgent: vi.fn<[string, string], Promise<AgentResult>>().mockResolvedValue({
      success: true,
      filesWritten: [],
      stdout: '',
      stderr: '',
    }),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AIRouter', () => {
  let claudeProvider: ReturnType<typeof makeProvider>
  let codexProvider: ReturnType<typeof makeProvider>
  let ollamaProvider: ReturnType<typeof makeProvider>
  let stateMgr: InstanceType<typeof StateManager>
  let router: AIRouter

  beforeEach(() => {
    vi.clearAllMocks()

    claudeProvider = makeProvider('claude')
    codexProvider = makeProvider('codex')
    ollamaProvider = makeProvider('ollama')

    stateMgr = new StateManager('/fake/state.json')
    vi.mocked(stateMgr.hasQuota).mockReturnValue(true)

    router = new AIRouter(stateMgr, {
      claude: claudeProvider,
      codex: codexProvider,
      ollama: ollamaProvider,
    }, ['claude', 'codex', 'ollama'])
  })

  // -------------------------------------------------------------------------
  // Model routing via provider chain + hasQuota
  // -------------------------------------------------------------------------

  it('routes to first provider in chain with quota', async () => {
    const result = await router.invokeStructured('prompt', {})

    expect(claudeProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(result.model).toBe('claude')
  })

  it('routes to codex when claude has no quota', async () => {
    vi.mocked(stateMgr.hasQuota).mockImplementation((m: AIModel) => m !== 'claude')

    const result = await router.invokeStructured('prompt', {})

    expect(claudeProvider.invokeStructured).not.toHaveBeenCalled()
    expect(codexProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(result.model).toBe('codex')
  })

  it('routes to ollama when claude and codex have no quota', async () => {
    vi.mocked(stateMgr.hasQuota).mockImplementation((m: AIModel) => m === 'ollama')

    const result = await router.invokeStructured('prompt', {})

    expect(ollamaProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(result.model).toBe('ollama')
  })

  // -------------------------------------------------------------------------
  // incrementUsage after success
  // -------------------------------------------------------------------------

  it('calls incrementUsage after successful invokeStructured', async () => {
    await router.invokeStructured('prompt', {})

    expect(stateMgr.incrementUsage).toHaveBeenCalledWith('claude')
  })

  it('calls incrementUsage after successful invokeAgent', async () => {
    vi.mocked(stateMgr.hasQuota).mockImplementation((m: AIModel) => m !== 'claude')

    await router.invokeAgent('prompt', '/tmp')

    expect(stateMgr.incrementUsage).toHaveBeenCalledWith('codex')
  })

  // -------------------------------------------------------------------------
  // Fallthrough on AIBinaryNotFoundError
  // -------------------------------------------------------------------------

  it('falls through to next provider on AIBinaryNotFoundError (claude -> codex)', async () => {
    claudeProvider.invokeStructured.mockRejectedValue(new AIBinaryNotFoundError('claude'))

    const result = await router.invokeStructured('prompt', {})

    expect(claudeProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(codexProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(result.model).toBe('codex')
  })

  it('falls through to ollama when both claude and codex are not found', async () => {
    claudeProvider.invokeStructured.mockRejectedValue(new AIBinaryNotFoundError('claude'))
    codexProvider.invokeStructured.mockRejectedValue(new AIBinaryNotFoundError('codex'))

    const result = await router.invokeStructured('prompt', {})

    expect(ollamaProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(result.model).toBe('ollama')
  })

  // -------------------------------------------------------------------------
  // Does NOT fall through on AITimeoutError / AIInvocationError
  // -------------------------------------------------------------------------

  it('does NOT fall through on AITimeoutError — re-throws immediately', async () => {
    claudeProvider.invokeStructured.mockRejectedValue(new AITimeoutError('claude', 120000))

    await expect(router.invokeStructured('prompt', {})).rejects.toThrow(AITimeoutError)
    expect(codexProvider.invokeStructured).not.toHaveBeenCalled()
  })

  it('does NOT fall through on AIInvocationError — re-throws immediately', async () => {
    claudeProvider.invokeStructured.mockRejectedValue(new AIInvocationError('claude', 1, 'fail'))

    await expect(router.invokeStructured('prompt', {})).rejects.toThrow(AIInvocationError)
    expect(codexProvider.invokeStructured).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Falls through on AIRateLimitError
  // -------------------------------------------------------------------------

  it('invokeStructured falls through on AIRateLimitError (claude -> codex)', async () => {
    claudeProvider.invokeStructured.mockRejectedValue(
      new AIRateLimitError('claude', 1, '5pm PT', 'rate limited'),
    )

    const result = await router.invokeStructured('prompt', {})

    expect(claudeProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(codexProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(result.model).toBe('codex')
  })

  it('invokeAgent falls through on AIRateLimitError (claude -> codex)', async () => {
    claudeProvider.invokeAgent.mockRejectedValue(
      new AIRateLimitError('claude', 1, '5pm PT', 'rate limited'),
    )

    const result = await router.invokeAgent('prompt', '/tmp')

    expect(claudeProvider.invokeAgent).toHaveBeenCalledOnce()
    expect(codexProvider.invokeAgent).toHaveBeenCalledOnce()
    expect(result.model).toBe('codex')
  })

  it('invokeStructuredThenAgent falls through on AIRateLimitError', async () => {
    claudeProvider.invokeStructured.mockRejectedValue(
      new AIRateLimitError('claude', 1, '5pm PT', 'rate limited'),
    )

    const result = await router.invokeStructuredThenAgent(
      'issue text',
      { type: 'object' },
      'agent prompt',
      '/work',
    )

    expect(claudeProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(codexProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(result.model).toBe('codex')
  })

  // -------------------------------------------------------------------------
  // invokeStructured routing with schema
  // -------------------------------------------------------------------------

  it('invokeStructured passes prompt and schema to selected provider', async () => {
    const schema = { type: 'object', properties: { x: { type: 'number' } } }

    await router.invokeStructured('my prompt', schema)

    expect(claudeProvider.invokeStructured).toHaveBeenCalledWith('my prompt', schema)
  })

  // -------------------------------------------------------------------------
  // invokeAgent routing with workingDir
  // -------------------------------------------------------------------------

  it('invokeAgent passes prompt and workingDir to selected provider', async () => {
    vi.mocked(stateMgr.hasQuota).mockImplementation((m: AIModel) => m !== 'claude')

    await router.invokeAgent('do it', '/work/dir')

    expect(codexProvider.invokeAgent).toHaveBeenCalledWith('do it', '/work/dir')
  })

  it('invokeAgent returns result with model field', async () => {
    const result = await router.invokeAgent('prompt', '/tmp')

    expect(result.model).toBe('claude')
    expect(result.success).toBe(true)
  })

  // -------------------------------------------------------------------------
  // incrementUsage only called for non-ollama models
  // -------------------------------------------------------------------------

  it('does not call incrementUsage for ollama (no quota)', async () => {
    vi.mocked(stateMgr.hasQuota).mockImplementation((m: AIModel) => m === 'ollama')

    await router.invokeStructured('prompt', {})

    expect(stateMgr.incrementUsage).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // invokeStructured skips full-pipeline providers
  // -------------------------------------------------------------------------

  it('invokeStructured skips full-pipeline providers', async () => {
    const mapProvider = makeProvider('map', true)
    const routerWithMap = new AIRouter(stateMgr, {
      map: mapProvider,
      claude: claudeProvider,
    }, ['map', 'claude'])

    const result = await routerWithMap.invokeStructured('prompt', {})

    expect(mapProvider.invokeStructured).not.toHaveBeenCalled()
    expect(claudeProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(result.model).toBe('claude')
  })

  // -------------------------------------------------------------------------
  // invokeAgent falls through on "does not support" AIInvocationError
  // -------------------------------------------------------------------------

  it('invokeAgent falls through on "does not support" AIInvocationError', async () => {
    claudeProvider.invokeAgent.mockRejectedValue(
      new AIInvocationError('claude', -1, 'claude does not support agent mode'),
    )

    const result = await router.invokeAgent('prompt', '/tmp')

    expect(claudeProvider.invokeAgent).toHaveBeenCalledOnce()
    expect(codexProvider.invokeAgent).toHaveBeenCalledOnce()
    expect(result.model).toBe('codex')
  })

  // -------------------------------------------------------------------------
  // getChainCandidates respects hasQuota
  // -------------------------------------------------------------------------

  it('getChainCandidates filters out models without quota', async () => {
    vi.mocked(stateMgr.hasQuota).mockImplementation((m: AIModel) => m === 'codex')

    const result = await router.invokeStructured('prompt', {})

    expect(claudeProvider.invokeStructured).not.toHaveBeenCalled()
    expect(codexProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(ollamaProvider.invokeStructured).not.toHaveBeenCalled()
    expect(result.model).toBe('codex')
  })

  // -------------------------------------------------------------------------
  // invokeStructuredThenAgent
  // -------------------------------------------------------------------------

  describe('invokeStructuredThenAgent', () => {
    it('uses full-pipeline provider: skips invokeStructured, passes raw prompt to invokeAgent', async () => {
      const mapProvider = makeProvider('map', true)
      const routerWithMap = new AIRouter(stateMgr, {
        map: mapProvider,
        claude: claudeProvider,
      }, ['map', 'claude'])

      const agentPromptFn = vi.fn((spec: string) => `implement: ${spec}`)
      const result = await routerWithMap.invokeStructuredThenAgent(
        'raw issue text',
        { type: 'object' },
        agentPromptFn,
        '/work',
      )

      expect(mapProvider.invokeStructured).not.toHaveBeenCalled()
      expect(mapProvider.invokeAgent).toHaveBeenCalledWith('raw issue text', '/work')
      expect(agentPromptFn).not.toHaveBeenCalled()
      expect(result.structured).toBeNull()
      expect(result.model).toBe('map')
    })

    it('uses standard provider: calls invokeStructured then invokeAgent with lambda', async () => {
      const agentPromptFn = vi.fn((spec: string) => `implement: ${spec}`)
      const result = await router.invokeStructuredThenAgent(
        'issue text',
        { type: 'object' },
        agentPromptFn,
        '/work',
      )

      expect(claudeProvider.invokeStructured).toHaveBeenCalledWith('issue text', { type: 'object' })
      expect(agentPromptFn).toHaveBeenCalledWith('spec from claude')
      expect(claudeProvider.invokeAgent).toHaveBeenCalledWith('implement: spec from claude', '/work')
      expect(result.structured).not.toBeNull()
      expect(result.model).toBe('claude')
    })

    it('uses standard provider: calls invokeStructured then invokeAgent with string prompt', async () => {
      const result = await router.invokeStructuredThenAgent(
        'issue text',
        { type: 'object' },
        'static agent prompt',
        '/work',
      )

      expect(claudeProvider.invokeStructured).toHaveBeenCalledOnce()
      expect(claudeProvider.invokeAgent).toHaveBeenCalledWith('static agent prompt', '/work')
      expect(result.model).toBe('claude')
    })

    it('falls back on AIBinaryNotFoundError within custom chain', async () => {
      const mapProvider = makeProvider('map', true)
      mapProvider.invokeAgent.mockRejectedValue(new AIBinaryNotFoundError('map'))
      const routerWithMap = new AIRouter(stateMgr, {
        map: mapProvider,
        claude: claudeProvider,
      }, ['map', 'claude'])

      const result = await routerWithMap.invokeStructuredThenAgent(
        'issue text',
        { type: 'object' },
        (spec) => `implement: ${spec}`,
        '/work',
      )

      // MAP failed, fell back to claude (standard provider)
      expect(mapProvider.invokeAgent).toHaveBeenCalledOnce()
      expect(claudeProvider.invokeStructured).toHaveBeenCalledOnce()
      expect(claudeProvider.invokeAgent).toHaveBeenCalledOnce()
      expect(result.model).toBe('claude')
    })

    it('falls back on "does not support" AIInvocationError', async () => {
      claudeProvider.invokeAgent.mockRejectedValue(
        new AIInvocationError('claude', -1, 'claude does not support agent mode'),
      )

      const result = await router.invokeStructuredThenAgent(
        'issue text',
        { type: 'object' },
        (spec) => `implement: ${spec}`,
        '/work',
      )

      // Claude's invokeStructured succeeded but invokeAgent failed with "does not support"
      // Falls through to codex
      expect(claudeProvider.invokeStructured).toHaveBeenCalledOnce()
      expect(claudeProvider.invokeAgent).toHaveBeenCalledOnce()
      expect(codexProvider.invokeStructured).toHaveBeenCalledOnce()
      expect(codexProvider.invokeAgent).toHaveBeenCalledOnce()
      expect(result.model).toBe('codex')
    })

    it('quota is incremented after success, not before', async () => {
      await router.invokeStructuredThenAgent(
        'issue text',
        { type: 'object' },
        'agent prompt',
        '/work',
      )

      // incrementUsage should be called exactly once (after both calls succeed)
      expect(stateMgr.incrementUsage).toHaveBeenCalledTimes(1)
      expect(stateMgr.incrementUsage).toHaveBeenCalledWith('claude')
    })

    it('does not increment quota on failure', async () => {
      claudeProvider.invokeAgent.mockRejectedValue(new AIBinaryNotFoundError('claude'))
      codexProvider.invokeAgent.mockRejectedValue(new AIBinaryNotFoundError('codex'))
      ollamaProvider.invokeAgent.mockRejectedValue(new AIBinaryNotFoundError('ollama'))

      await expect(
        router.invokeStructuredThenAgent('issue text', { type: 'object' }, 'prompt', '/work'),
      ).rejects.toThrow(AIBinaryNotFoundError)

      expect(stateMgr.incrementUsage).not.toHaveBeenCalled()
    })

    it('getChainCandidates respects hasQuota for invokeStructuredThenAgent', async () => {
      vi.mocked(stateMgr.hasQuota).mockImplementation((m: AIModel) => m === 'codex')

      const result = await router.invokeStructuredThenAgent(
        'issue text',
        { type: 'object' },
        'agent prompt',
        '/work',
      )

      expect(claudeProvider.invokeStructured).not.toHaveBeenCalled()
      expect(codexProvider.invokeStructured).toHaveBeenCalledOnce()
      expect(result.model).toBe('codex')
    })

    it('re-throws non-fallthrough errors immediately', async () => {
      claudeProvider.invokeStructured.mockRejectedValue(new AITimeoutError('claude', 120000))

      await expect(
        router.invokeStructuredThenAgent('issue text', { type: 'object' }, 'prompt', '/work'),
      ).rejects.toThrow(AITimeoutError)

      expect(codexProvider.invokeStructured).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // All providers exhausted — AIBinaryNotFoundError with "(all AI providers)"
  // -------------------------------------------------------------------------

  it('invokeStructured throws AIBinaryNotFoundError when all providers exhausted', async () => {
    claudeProvider.invokeStructured.mockRejectedValue(new AIBinaryNotFoundError('claude'))
    codexProvider.invokeStructured.mockRejectedValue(new AIBinaryNotFoundError('codex'))
    ollamaProvider.invokeStructured.mockRejectedValue(new AIBinaryNotFoundError('ollama'))

    await expect(router.invokeStructured('prompt', {})).rejects.toThrow(AIBinaryNotFoundError)
    await expect(router.invokeStructured('prompt', {})).rejects.toThrow(/all AI providers/)
  })

  it('invokeAgent throws AIBinaryNotFoundError when all providers exhausted', async () => {
    claudeProvider.invokeAgent.mockRejectedValue(new AIBinaryNotFoundError('claude'))
    codexProvider.invokeAgent.mockRejectedValue(new AIBinaryNotFoundError('codex'))
    ollamaProvider.invokeAgent.mockRejectedValue(new AIBinaryNotFoundError('ollama'))

    await expect(router.invokeAgent('prompt', '/tmp')).rejects.toThrow(AIBinaryNotFoundError)
    await expect(router.invokeAgent('prompt', '/tmp')).rejects.toThrow(/all AI providers/)
  })

  it('invokeAgent does NOT fall through on AIInvocationError without "does not support"', async () => {
    claudeProvider.invokeAgent.mockRejectedValue(
      new AIInvocationError('claude', 1, 'some other error'),
    )

    await expect(router.invokeAgent('prompt', '/tmp')).rejects.toThrow(AIInvocationError)
    expect(codexProvider.invokeAgent).not.toHaveBeenCalled()
  })

  it('invokeStructuredThenAgent throws AIBinaryNotFoundError when all providers exhausted via invokeAgent', async () => {
    claudeProvider.invokeStructured.mockRejectedValue(new AIBinaryNotFoundError('claude'))
    codexProvider.invokeStructured.mockRejectedValue(new AIBinaryNotFoundError('codex'))
    ollamaProvider.invokeStructured.mockRejectedValue(new AIBinaryNotFoundError('ollama'))

    await expect(
      router.invokeStructuredThenAgent('issue', { type: 'object' }, 'prompt', '/work'),
    ).rejects.toThrow(AIBinaryNotFoundError)
  })

  it('invokeStructured skips providers with undefined entry in providers map', async () => {
    // Router with 'map' in chain but no map provider registered
    const sparseRouter = new AIRouter(stateMgr, {
      claude: claudeProvider,
    }, ['map', 'claude'])

    const result = await sparseRouter.invokeStructured('prompt', {})
    expect(result.model).toBe('claude')
  })

  it('invokeAgent skips providers with undefined entry in providers map', async () => {
    // Router with 'map' in chain but no map provider registered
    const sparseRouter = new AIRouter(stateMgr, {
      claude: claudeProvider,
    }, ['map', 'claude'])

    const result = await sparseRouter.invokeAgent('prompt', '/tmp')
    expect(result.model).toBe('claude')
  })

  it('invokeStructuredThenAgent skips providers with undefined entry in providers map', async () => {
    // Router with 'map' in chain but no map provider registered
    const sparseRouter = new AIRouter(stateMgr, {
      claude: claudeProvider,
    }, ['map', 'claude'])

    const result = await sparseRouter.invokeStructuredThenAgent('issue', { type: 'object' }, 'prompt', '/work')
    expect(result.model).toBe('claude')
  })
})
