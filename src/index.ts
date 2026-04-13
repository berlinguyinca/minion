import { parseArgs } from 'node:util'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { exec } from 'node:child_process'
import { platform } from 'node:os'
import { GitHubClient } from './github/index.js'
import { ClaudeWrapper, CodexWrapper, OllamaWrapper, MAPWrapper, AIRouter } from './ai/index.js'
import { StateManager, loadConfig } from './config/index.js'
import { PipelineRunner } from './pipeline/index.js'
import type { AIModel, AIProvider } from './types/index.js'

const REPO_URL = 'https://github.com/berlinguyinca/autodev'
const MIN_POLL_SECONDS = 30

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function openInBrowser(url: string): void {
  const cmds: Record<string, string> = {
    darwin: 'open',
    win32: 'start',
    linux: 'xdg-open',
  }
  const cmd = cmds[platform()] ?? 'xdg-open'
  exec(`${cmd} ${url}`)
}

export async function showStarPrompt(state: StateManager): Promise<void> {
  if (state.hasSeenStarPrompt()) return
  if (!process.stdout.isTTY) {
    state.markStarPromptSeen()
    return
  }

  console.log('\n\u2B50 If you find gh-issue-pipeline useful, consider starring the repo!')
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  return new Promise<void>((resolve) => {
    rl.question(`   Star ${REPO_URL} ? [y/n] `, (answer) => {
      rl.close()
      if (answer.trim().toLowerCase() === 'y') {
        openInBrowser(REPO_URL)
        console.log('   Opening in browser — thanks for your support!')
      } else {
        console.log('   No problem! You can always star later.')
      }
      state.markStarPromptSeen()
      resolve()
    })
  })
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: 'string', default: './repos.json' },
      help: { type: 'boolean', default: false },
      poll: { type: 'string' },
    },
    allowPositionals: false,
  })

  if (values.help) {
    console.log(`Usage: gh-issue-pipeline [--config <path>] [--poll <seconds>]`)
    console.log(`  --config <path>     Config file (default: ./repos.json)`)
    console.log(`  --poll <seconds>    Continuous polling mode (min: ${MIN_POLL_SECONDS}s)`)
    return 0
  }

  const token = process.env['GITHUB_TOKEN']
  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable is required')
    return 1
  }

  // Validate --poll flag
  let pollIntervalMs: number | undefined
  if (values.poll !== undefined) {
    const seconds = Number(values.poll)
    if (Number.isNaN(seconds) || seconds < MIN_POLL_SECONDS) {
      console.error(`Error: --poll requires a number >= ${MIN_POLL_SECONDS} (seconds)`)
      return 1
    }
    pollIntervalMs = seconds * 1000
  }

  const configPath = values.config ?? './repos.json'
  if (!existsSync(configPath)) {
    console.error(`Error: config file not found: ${configPath}`)
    return 1
  }

  const config = loadConfig(configPath)
  const state = new StateManager('.pipeline-state.json', config.quotaLimits, config.retry)
  const github = new GitHubClient(token)

  const providerChain: AIModel[] = config.providerChain ?? ['claude', 'codex', 'ollama']

  // Only instantiate providers that are in the chain
  const providerFactories: Record<AIModel, () => AIProvider> = {
    claude: () => new ClaudeWrapper(),
    codex: () => new CodexWrapper(),
    ollama: () => new OllamaWrapper(config.ollamaModel ?? 'qwen2.5-coder:latest'),
    map: () => new MAPWrapper(),
  }

  const providers: Partial<Record<AIModel, AIProvider>> = {}
  for (const model of providerChain) {
    const factory = providerFactories[model]
    providers[model] = factory()
  }

  // Auto-detect MAP binary and warn if configured but missing
  if (providerChain.includes('map')) {
    const detection = MAPWrapper.detect()
    if (detection.available) {
      console.log(`[MAP] Detected: ${detection.version ?? 'unknown version'}`)
    } else {
      console.warn(`[MAP] Warning: map binary not found but 'map' is in provider chain. ${detection.hint ?? ''}`)
      console.warn(`[MAP] The pipeline will fall through to the next provider if MAP is unavailable.`)
    }
  }

  const ai = new AIRouter(state, providers, providerChain, config.taskModels)
  const runner = new PipelineRunner(config, github, ai, state)

  // Polling mode
  if (pollIntervalMs !== undefined) {
    let shutdown = false
    const onSignal = () => {
      console.log('\n[poll] Shutting down after current run...')
      shutdown = true
    }
    process.on('SIGINT', onSignal)
    process.on('SIGTERM', onSignal)

    let firstRun = true
    while (!shutdown) {
      const code = await runner.run()
      if (code !== 0) {
        console.warn(`[poll] Run finished with failures (exit code ${code})`)
      }

      // Star prompt on first run only
      if (firstRun) {
        await showStarPrompt(state)
        firstRun = false
      }

      if (shutdown) break
      console.log(`[poll] Next run in ${pollIntervalMs / 1000}s...`)
      await sleep(pollIntervalMs)
    }

    console.log('[poll] Shutdown complete.')
    return 0
  }

  // Single-run mode (default)
  const code = await runner.run()
  await showStarPrompt(state)
  return code
}

// Only run when invoked directly (not imported in tests)
if (process.argv[1]?.endsWith('index.js')) {
  run().then(code => process.exit(code)).catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
  })
}
