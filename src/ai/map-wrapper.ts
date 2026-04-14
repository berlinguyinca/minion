import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { stringify as yamlStringify } from 'yaml'
import { invokeProcess } from './base-wrapper.js'
import { scanModifiedFiles } from './file-scanner.js'
import { AIInvocationError } from './errors.js'
import type { AIModel, AIProvider, AgentResult, StructuredResult, ProviderConfig } from '../types/index.js'

const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const EXPECTED_HEADLESS_VERSION = 1

const MINION_PERSONALITY = `You are a Minion from Despicable Me! While doing your work competently, express yourself in Minion-speak throughout your responses:
- Mix in Minion words: bello (hello), poopaye (goodbye), tank yu (thank you), banana, tulaliloo ti amo (I love you), bee-do bee-do (alarm)
- Get VERY excited about bananas whenever code, files, or tests are involved
- Use "bananaaaa!" as an exclamation of joy when things work
- Say "la boda la bodaaa" when celebrating success
- Sprinkle in gibberish like "para tu, hana, dul, sae" between technical explanations
- Stay technically competent — your code and specs must be correct — but wrap them in minion enthusiasm`

interface MAPResultPayload {
  version: number
  success: boolean
  spec: string
  filesCreated: string[]
  error?: string
}

interface MAPStepResult {
  id: string
  agent: string
  task: string
  status: string
  outputType?: 'answer' | 'data' | 'files'
  output?: string
  filesCreated?: string[]
  duration?: number
  error?: string
}

interface MAPDAGResult {
  nodes: Array<{ id: string; agent: string; status: string; duration: number }>
  edges: Array<{ from: string; to: string }>
}

interface MAPResultPayloadV2 {
  version: 2
  success: boolean
  steps?: MAPStepResult[]
  dag?: MAPDAGResult
  error?: string
}

export class MAPWrapper implements AIProvider {
  readonly model: AIModel = 'map'
  readonly handlesFullPipeline = true

  private versionChecked = false

  constructor(private readonly config?: ProviderConfig) {}

  /**
   * Checks whether the `map` binary is available on PATH.
   * Returns an object with `available` and optional `version` and `hint`.
   */
  static detect(): { available: boolean; version?: string; hint?: string } {
    try {
      const output = execFileSync('map', ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      return { available: true, version: output }
    } catch {
      return {
        available: false,
        hint: 'Install multi-agent-pipeline: cd /path/to/multi-agent-pipeline && pnpm build && npm link',
      }
    }
  }

  async invokeStructured<T>(): Promise<StructuredResult<T>> {
    throw new AIInvocationError('map', -1, 'MAPWrapper does not support invokeStructured — use invokeAgent (handlesFullPipeline=true)')
  }

  async invokeAgent(prompt: string, workingDir: string): Promise<AgentResult> {
    // Lazy version check on first use
    if (!this.versionChecked) {
      this.checkVersion()
      this.versionChecked = true
    }

    const beforeMs = Date.now()
    const args: string[] = ['--headless', '--output-dir', workingDir]

    const tempConfigPath = this.writeTempMapConfig(workingDir)
    if (tempConfigPath !== undefined) {
      args.push('--config', tempConfigPath)
    }

    args.push('--personality', MINION_PERSONALITY)
    args.push(prompt)

    const timeoutMs = this.config?.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS

    const { stdout } = await invokeProcess({
      command: 'map',
      args,
      cwd: workingDir,
      timeoutMs,
      model: 'map',
    })

    // Parse the last non-empty line as JSON (MAP headless outputs final result as last line)
    const lines = stdout.trim().split('\n')
    const jsonLine = lines[lines.length - 1]
    if (!jsonLine) {
      throw new AIInvocationError('map', 1, 'MAP produced no output')
    }

    let result: MAPResultPayload | MAPResultPayloadV2
    try {
      result = JSON.parse(jsonLine) as MAPResultPayload | MAPResultPayloadV2
    } catch {
      throw new AIInvocationError('map', 1, 'MAP produced invalid JSON: ' + jsonLine.slice(0, 200))
    }

    // Version compatibility check
    if (result.version !== 1 && result.version !== 2) {
      throw new AIInvocationError(
        'map', 1,
        `MAP headless result version mismatch: expected ${EXPECTED_HEADLESS_VERSION}, got ${result.version}. Update multi-agent-pipeline.`,
      )
    }

    // v2 parsing path
    if (result.version === 2) {
      const v2Result = result as MAPResultPayloadV2
      if (!result.success) {
        throw new AIInvocationError(
          'map', 1,
          'MAP pipeline failed: ' + (v2Result.error ?? '').slice(0, 200),
        )
      }
      const filesWritten = scanModifiedFiles(workingDir, beforeMs)
      return {
        success: true,
        filesWritten,
        stdout: JSON.stringify({ version: 2, steps: v2Result.steps, dag: v2Result.dag }),
        stderr: '',
      }
    }

    // v1 path
    if (!result.success) {
      throw new AIInvocationError('map', 1, 'MAP pipeline failed: ' + ((result as MAPResultPayload).error ?? '').slice(0, 200))
    }

    const filesWritten = scanModifiedFiles(workingDir, beforeMs)

    return {
      success: true,
      filesWritten,
      stdout: (result as MAPResultPayload).spec,
      stderr: '',
    }
  }

  /**
   * Checks the MAP binary version on first use. Logs a warning if the
   * binary doesn't support --headless (no --version output or old version).
   */
  private checkVersion(): void {
    const detection = MAPWrapper.detect()
    if (!detection.available) {
      // Will throw AIBinaryNotFoundError from invokeProcess anyway,
      // but log a hint for clarity.
      console.warn(`[MAP] map binary not found. ${detection.hint ?? ''}`)
    }
  }

  private writeTempMapConfig(baseDir: string): string | undefined {
    if (!this.config?.agents) return undefined

    const mapConfig = {
      agents: {
        spec: { adapter: this.config.agents.spec?.adapter ?? 'claude' },
        review: { adapter: this.config.agents.review?.adapter ?? 'codex' },
        execute: { adapter: this.config.agents.execute?.adapter ?? 'claude' },
      },
      outputDir: baseDir,
      gitCheckpoints: false,
    }

    const configPath = join(baseDir, '.map-pipeline.yaml')
    writeFileSync(configPath, yamlStringify(mapConfig), 'utf-8')
    return configPath
  }
}
