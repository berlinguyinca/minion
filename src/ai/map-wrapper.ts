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

interface MAPResultPayload {
  version: number
  success: boolean
  spec: string
  filesCreated: string[]
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
    throw new Error('MAPWrapper does not support invokeStructured — use invokeAgent (handlesFullPipeline=true)')
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

    args.push(prompt)

    const timeoutMs = this.config?.agentTimeoutMs
      ?? this.config?.timeoutMs
      ?? DEFAULT_AGENT_TIMEOUT_MS

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

    let result: MAPResultPayload
    try {
      result = JSON.parse(jsonLine) as MAPResultPayload
    } catch {
      throw new AIInvocationError('map', 1, 'MAP produced invalid JSON: ' + jsonLine.slice(0, 200))
    }

    // Version compatibility check
    if (result.version !== EXPECTED_HEADLESS_VERSION) {
      throw new AIInvocationError(
        'map', 1,
        `MAP headless result version mismatch: expected ${EXPECTED_HEADLESS_VERSION}, got ${result.version}. Update multi-agent-pipeline.`,
      )
    }

    if (!result.success) {
      throw new AIInvocationError('map', 1, 'MAP pipeline failed: ' + (result.error ?? '').slice(0, 200))
    }

    const filesWritten = scanModifiedFiles(workingDir, beforeMs)

    return {
      success: true,
      filesWritten,
      stdout: result.spec,
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
