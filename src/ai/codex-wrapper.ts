import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { invokeProcess } from './base-wrapper.js'
import { AIInvocationError } from './errors.js'
import type { AIProvider, AIModel, AgentResult, StructuredResult } from '../types/index.js'

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

function scanModifiedFiles(workingDir: string, beforeMs: number): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(workingDir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue
      const dir = 'path' in entry && typeof entry.path === 'string' ? entry.path : workingDir
      const fullPath = join(dir, entry.name)
      try {
        const st = statSync(fullPath)
        if (st.mtimeMs >= beforeMs) {
          results.push(fullPath)
        }
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // workingDir not readable — return empty
  }
  return results
}

export class CodexWrapper implements AIProvider {
  readonly model: AIModel = 'codex'

  constructor(
    private readonly structuredTimeoutMs = DEFAULT_STRUCTURED_TIMEOUT_MS,
    private readonly agentTimeoutMs = DEFAULT_AGENT_TIMEOUT_MS
  ) {}

  async invokeStructured<T>(prompt: string, schema: object): Promise<StructuredResult<T>> {
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
