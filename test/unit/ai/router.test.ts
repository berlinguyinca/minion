import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AIProvider, AIModel, StructuredResult, AgentResult } from '../../../src/types/index.js'
import { AIBinaryNotFoundError, AITimeoutError, AIInvocationError } from '../../../src/ai/errors.js'

// ---------------------------------------------------------------------------
// StateManager mock
// ---------------------------------------------------------------------------

vi.mock('../../../src/config/state.js', () => ({
  StateManager: vi.fn().mockImplementation(() => ({
    getAvailableModel: vi.fn<[], AIModel>().mockReturnValue('claude'),
    incrementUsage: vi.fn<[string], undefined>(),
  })),
}))

import { AIRouter } from '../../../src/ai/router.js'
import { StateManager } from '../../../src/config/state.js'

// ---------------------------------------------------------------------------
// Helpers — fake providers
// ---------------------------------------------------------------------------

function makeProvider(model: AIModel): AIProvider & {
  invokeStructured: ReturnType<typeof vi.fn>
  invokeAgent: ReturnType<typeof vi.fn>
} {
  return {
    model,
    invokeStructured: vi.fn<[string, object], Promise<StructuredResult<unknown>>>().mockResolvedValue({
      success: true,
      data: { result: model },
      rawOutput: '',
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
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('claude')

    router = new AIRouter(stateMgr, {
      claude: claudeProvider,
      codex: codexProvider,
      ollama: ollamaProvider,
    })
  })

  // -------------------------------------------------------------------------
  // Model routing via getAvailableModel
  // -------------------------------------------------------------------------

  it('calls getAvailableModel to select provider', async () => {
    await router.invokeStructured('prompt', {})
    expect(stateMgr.getAvailableModel).toHaveBeenCalledOnce()
  })

  it('routes to ClaudeWrapper when model is "claude"', async () => {
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('claude')

    const result = await router.invokeStructured('prompt', {})

    expect(claudeProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(result.model).toBe('claude')
  })

  it('routes to CodexWrapper when model is "codex"', async () => {
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('codex')

    const result = await router.invokeStructured('prompt', {})

    expect(codexProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(result.model).toBe('codex')
  })

  it('routes to OllamaWrapper when model is "ollama"', async () => {
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('ollama')

    const result = await router.invokeStructured('prompt', {})

    expect(ollamaProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(result.model).toBe('ollama')
  })

  // -------------------------------------------------------------------------
  // incrementUsage after success
  // -------------------------------------------------------------------------

  it('calls incrementUsage after successful invokeStructured', async () => {
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('claude')

    await router.invokeStructured('prompt', {})

    expect(stateMgr.incrementUsage).toHaveBeenCalledWith('claude')
  })

  it('calls incrementUsage after successful invokeAgent', async () => {
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('codex')

    await router.invokeAgent('prompt', '/tmp')

    expect(stateMgr.incrementUsage).toHaveBeenCalledWith('codex')
  })

  // -------------------------------------------------------------------------
  // Fallthrough on AIBinaryNotFoundError
  // -------------------------------------------------------------------------

  it('falls through to next provider on AIBinaryNotFoundError (claude → codex)', async () => {
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('claude')
    claudeProvider.invokeStructured.mockRejectedValue(new AIBinaryNotFoundError('claude'))

    const result = await router.invokeStructured('prompt', {})

    expect(claudeProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(codexProvider.invokeStructured).toHaveBeenCalledOnce()
    expect(result.model).toBe('codex')
  })

  it('falls through to ollama when both claude and codex are not found', async () => {
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('claude')
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
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('claude')
    claudeProvider.invokeStructured.mockRejectedValue(new AITimeoutError('claude', 120000))

    await expect(router.invokeStructured('prompt', {})).rejects.toThrow(AITimeoutError)
    expect(codexProvider.invokeStructured).not.toHaveBeenCalled()
  })

  it('does NOT fall through on AIInvocationError — re-throws immediately', async () => {
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('claude')
    claudeProvider.invokeStructured.mockRejectedValue(new AIInvocationError('claude', 1, 'fail'))

    await expect(router.invokeStructured('prompt', {})).rejects.toThrow(AIInvocationError)
    expect(codexProvider.invokeStructured).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // invokeStructured routing with schema
  // -------------------------------------------------------------------------

  it('invokeStructured passes prompt and schema to selected provider', async () => {
    const schema = { type: 'object', properties: { x: { type: 'number' } } }
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('claude')

    await router.invokeStructured('my prompt', schema)

    expect(claudeProvider.invokeStructured).toHaveBeenCalledWith('my prompt', schema)
  })

  // -------------------------------------------------------------------------
  // invokeAgent routing with workingDir
  // -------------------------------------------------------------------------

  it('invokeAgent passes prompt and workingDir to selected provider', async () => {
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('codex')

    await router.invokeAgent('do it', '/work/dir')

    expect(codexProvider.invokeAgent).toHaveBeenCalledWith('do it', '/work/dir')
  })

  it('invokeAgent returns result with model field', async () => {
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('claude')

    const result = await router.invokeAgent('prompt', '/tmp')

    expect(result.model).toBe('claude')
    expect(result.success).toBe(true)
  })

  // -------------------------------------------------------------------------
  // incrementUsage only called for non-ollama models
  // -------------------------------------------------------------------------

  it('does not call incrementUsage for ollama (no quota)', async () => {
    vi.mocked(stateMgr.getAvailableModel).mockReturnValue('ollama')

    await router.invokeStructured('prompt', {})

    expect(stateMgr.incrementUsage).not.toHaveBeenCalled()
  })
})
