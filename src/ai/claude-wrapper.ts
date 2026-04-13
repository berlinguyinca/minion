import { invokeProcess } from './base-wrapper.js'
import { scanModifiedFiles } from './file-scanner.js'
import { AIInvocationError } from './errors.js'
import type { AIProvider, AIModel, AgentResult, StructuredResult, ProviderConfig } from '../types/index.js'

const DEFAULT_STRUCTURED_TIMEOUT_MS = 5 * 60 * 1000   // 5 minutes
const DEFAULT_AGENT_TIMEOUT_MS     = 20 * 60 * 1000   // 20 minutes

function parseClaudeStructured<T>(stdout: string): T {
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as { type?: string; result?: T }
      if (parsed.type === 'result') {
        return parsed.result as T
      }
    } catch {
      // skip non-JSON lines
    }
  }
  // Fallback: try parsing the whole output as the result
  try {
    return JSON.parse(stdout) as T
  } catch {
    throw new AIInvocationError('claude', 0, `Could not parse claude output: ${stdout.slice(0, 200)}`)
  }
}

export class ClaudeWrapper implements AIProvider {
  readonly model: AIModel = 'claude'
  readonly handlesFullPipeline = false
  private readonly structuredTimeoutMs: number
  private readonly agentTimeoutMs: number

  constructor(config?: ProviderConfig) {
    this.structuredTimeoutMs = config?.structuredTimeoutMs ?? config?.timeoutMs ?? DEFAULT_STRUCTURED_TIMEOUT_MS
    this.agentTimeoutMs = config?.agentTimeoutMs ?? config?.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async invokeStructured<T>(prompt: string, schema: object, _modelOverride?: string): Promise<StructuredResult<T>> {
    const args = ['--print', prompt, '--output-format', 'json', '--json-schema', JSON.stringify(schema)]

    try {
      const { stdout } = await invokeProcess({
        command: 'claude',
        args,
        timeoutMs: this.structuredTimeoutMs,
        model: 'claude',
      })

      const data = parseClaudeStructured<T>(stdout)
      return { success: true, data, rawOutput: stdout }
    } catch (err) {
      if (err instanceof AIInvocationError || err instanceof Error) {
        throw err
      }
      return { success: false, rawOutput: '', error: String(err) }
    }
  }

  async invokeAgent(prompt: string, workingDir: string): Promise<AgentResult> {
    const args = ['--print', prompt, '--output-format', 'json', '--dangerously-skip-permissions']
    const beforeMs = Date.now()

    const { stdout, stderr } = await invokeProcess({
      command: 'claude',
      args,
      cwd: workingDir,
      timeoutMs: this.agentTimeoutMs,
      model: 'claude',
    })

    const filesWritten = scanModifiedFiles(workingDir, beforeMs)
    return { success: true, filesWritten, stdout, stderr }
  }
}
