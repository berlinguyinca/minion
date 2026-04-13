import { invokeProcess } from './base-wrapper.js'
import { scanModifiedFiles } from './file-scanner.js'
import { AIInvocationError } from './errors.js'
import type { AIProvider, AIModel, AgentResult, StructuredResult, ProviderConfig } from '../types/index.js'

const DEFAULT_STRUCTURED_TIMEOUT_MS = 2 * 60 * 1000   // 2 minutes
const DEFAULT_AGENT_TIMEOUT_MS     = 20 * 60 * 1000   // 20 minutes

function parseCodexStructured<T>(stdout: string): T {
  const parts: string[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as { type?: string; output?: string; text?: string }
      if (parsed.type === 'item.completed' || parsed.type === 'turn.completed') {
        const text = parsed.output ?? parsed.text ?? ''
        if (text) parts.push(text)
      }
    } catch {
      // skip non-JSON lines
    }
  }

  const combined = parts.join('\n').trim()
  if (combined) {
    try {
      return JSON.parse(combined) as T
    } catch {
      // return as raw string cast
      return combined as unknown as T
    }
  }

  // Fallback: try parsing the whole output
  try {
    return JSON.parse(stdout) as T
  } catch {
    throw new AIInvocationError('codex', 0, `Could not parse codex output: ${stdout.slice(0, 200)}`)
  }
}

export class CodexWrapper implements AIProvider {
  readonly model: AIModel = 'codex'
  readonly handlesFullPipeline = false
  private readonly structuredTimeoutMs: number
  private readonly agentTimeoutMs: number

  constructor(config?: ProviderConfig) {
    this.structuredTimeoutMs = config?.structuredTimeoutMs ?? config?.timeoutMs ?? DEFAULT_STRUCTURED_TIMEOUT_MS
    this.agentTimeoutMs = config?.agentTimeoutMs ?? config?.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async invokeStructured<T>(prompt: string, schema: object, _modelOverride?: string): Promise<StructuredResult<T>> {
    const args = ['exec', '--json', JSON.stringify(schema), prompt]

    try {
      const { stdout } = await invokeProcess({
        command: 'codex',
        args,
        timeoutMs: this.structuredTimeoutMs,
        model: 'codex',
      })

      const data = parseCodexStructured<T>(stdout)
      return { success: true, data, rawOutput: stdout }
    } catch (err) {
      if (err instanceof AIInvocationError || err instanceof Error) {
        throw err
      }
      return { success: false, rawOutput: '', error: String(err) }
    }
  }

  async invokeAgent(prompt: string, workingDir: string): Promise<AgentResult> {
    const args = ['exec', '--json', '--full-auto', prompt]
    const beforeMs = Date.now()

    const { stdout, stderr } = await invokeProcess({
      command: 'codex',
      args,
      cwd: workingDir,
      timeoutMs: this.agentTimeoutMs,
      model: 'codex',
    })

    const filesWritten = scanModifiedFiles(workingDir, beforeMs)
    return { success: true, filesWritten, stdout, stderr }
  }
}
