import { parseArgs } from 'node:util'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { execFile, execSync } from 'node:child_process'
import { platform } from 'node:os'
import { GitHubClient } from './github/index.js'
import { MAPWrapper, polishIssueText } from './ai/index.js'
import { StateManager, loadConfig } from './config/index.js'
import { GitOperations } from './git/index.js'
import { ExplicitIssueRunner, IssueProcessor, PipelineRunner, SpecCache } from './pipeline/index.js'
import { createIssueWorkspace } from './cli/workspace.js'
import type { PipelineConfig, ProviderConfig } from './types/index.js'

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
  execFile(cmd, [url], () => {})
}

export async function showStarPrompt(state: StateManager): Promise<void> {
  if (state.hasSeenStarPrompt()) return
  if (!process.stdout.isTTY) {
    state.markStarPromptSeen()
    return
  }

  console.log('\n\u2B50 If you find minion useful, consider starring the repo!')
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

function printHelp(): void {
  console.log(`Usage: minion --repo <owner/name> [options]
       minion --config <path> [options]

Repository (CLI mode):
  --repo <owner/name>       Target repository (mutually exclusive with --config)
  --branch <name>           Default branch (default: main)
  --max-issues <n>          Max issues per run (default: 10)
  --test-command <cmd>      Test command for the repo
  --model <model>           Model for MAP to use internally
  --timeout <ms>            MAP timeout in milliseconds (default: 120000)
  --map-command <cmd>       MAP executable to run (default: map)
  --map-arg <arg>           Default MAP command arg; repeatable (use --map-arg=-- for separator)
  --merge-method <method>   merge|squash|rebase (default: merge)

Config file mode:
  --config <path>           Config file path (default: config.yaml or repos.json)

Interactive mode:
  --tui                     Launch interactive issue creator (requires TTY)
  --gui                     Launch Electron issue manager GUI

General:
  --poll <seconds>          Continuous polling mode (min: ${MIN_POLL_SECONDS}s)
  --help                    Show this help`)
}

/** Parse owner/name from a repo slug. Returns undefined on invalid input. */
function parseRepoSlug(slug: string): { owner: string; name: string } | undefined {
  const match = slug.match(/^([^/\s]+)\/([^/\s]+)$/u)
  if (match?.[1] && match[2]) {
    return { owner: match[1], name: match[2] }
  }
  return undefined
}

/** Build a PipelineConfig from CLI flags (--repo mode). */
function buildConfigFromFlags(values: {
  repo: string
  branch?: string
  'max-issues'?: string
  'test-command'?: string
  model?: string
  timeout?: string
  'map-command'?: string
  'map-arg'?: string[]
  'merge-method'?: string
}): PipelineConfig {
  const parsed = parseRepoSlug(values.repo)
  if (!parsed) {
    throw new Error(`Invalid --repo format: "${values.repo}". Expected owner/name.`)
  }

  const repo: PipelineConfig['repos'][number] = {
    owner: parsed.owner,
    name: parsed.name,
    defaultBranch: values.branch ?? 'main',
  }

  if (values['test-command'] !== undefined) {
    repo.testCommand = values['test-command']
  }

  const config: PipelineConfig = {
    repos: [repo],
  }

  if (values['max-issues'] !== undefined) {
    const n = Number(values['max-issues'])
    if (Number.isNaN(n) || n < 1) {
      throw new Error(`Invalid --max-issues: "${values['max-issues']}". Must be a positive integer.`)
    }
    config.maxIssuesPerRun = n
  }

  if (values.model !== undefined) {
    config.mapModel = values.model
  }

  if (values.timeout !== undefined) {
    const ms = Number(values.timeout)
    if (Number.isNaN(ms) || ms < 1) {
      throw new Error(`Invalid --timeout: "${values.timeout}". Must be a positive number (milliseconds).`)
    }
    config.mapTimeoutMs = ms
  }

  if (values['map-command'] !== undefined) {
    config.mapCommand = values['map-command']
  }

  if (values['map-arg'] !== undefined) {
    config.mapArgs = values['map-arg']
  }

  if (values['merge-method'] !== undefined) {
    const method = values['merge-method']
    if (method !== 'merge' && method !== 'squash' && method !== 'rebase') {
      throw new Error(`Invalid --merge-method: "${method}". Must be merge, squash, or rebase.`)
    }
    config.mergeMethod = method
  }

  return config
}

function buildMapProviderConfig(config: Pick<PipelineConfig, 'mapTimeoutMs' | 'mapModel' | 'mapCommand' | 'mapArgs'>): ProviderConfig | undefined {
  const providerConfig: ProviderConfig = {}
  if (config.mapTimeoutMs !== undefined) providerConfig.timeoutMs = config.mapTimeoutMs
  if (config.mapModel !== undefined) providerConfig.model = config.mapModel
  if (config.mapCommand !== undefined) providerConfig.command = config.mapCommand
  if (config.mapArgs !== undefined) providerConfig.args = config.mapArgs
  return Object.keys(providerConfig).length > 0 ? providerConfig : undefined
}

/** Find the default config file (config.yaml > repos.json). */
function findDefaultConfig(): string | undefined {
  if (existsSync('./config.yaml')) return './config.yaml'
  if (existsSync('./config.yml')) return './config.yml'
  if (existsSync('./repos.json')) return './repos.json'
  return undefined
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: 'string' },
      repo: { type: 'string' },
      branch: { type: 'string' },
      'max-issues': { type: 'string' },
      'test-command': { type: 'string' },
      model: { type: 'string' },
      timeout: { type: 'string' },
      'map-command': { type: 'string' },
      'map-arg': { type: 'string', multiple: true },
      'merge-method': { type: 'string' },
      poll: { type: 'string' },
      tui: { type: 'boolean', default: false },
      gui: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  })

  if (values.help) {
    printHelp()
    return 0
  }

  // --gui mode
  if (values.gui) {
    const blockedFlags = [
      'tui',
      'repo',
      'config',
      'poll',
      'branch',
      'max-issues',
      'test-command',
      'model',
      'timeout',
      'map-command',
      'map-arg',
      'merge-method',
    ] as const
    const combined = blockedFlags.filter((flag) => values[flag] !== undefined && values[flag] !== false)
    if (combined.length > 0) {
      console.error(`Error: --gui cannot be combined with ${combined.map((flag) => `--${flag}`).join(', ')}`)
      return 1
    }

    let token = process.env['GITHUB_TOKEN']
    if (!token) {
      try {
        token = execSync('gh auth token', { encoding: 'utf-8' }).trim()
      } catch {
        // gh CLI not available or not authenticated
      }
    }
    if (!token) {
      console.error('Error: GITHUB_TOKEN environment variable is required (or authenticate via `gh auth login`)')
      return 1
    }

    const guiConfigPath = findDefaultConfig()
    const guiConfig: PipelineConfig = guiConfigPath !== undefined && existsSync(guiConfigPath)
      ? loadConfig(guiConfigPath)
      : { repos: [] }
    const github = new GitHubClient(token)
    const state = new StateManager('.pipeline-state.json', guiConfig.retry)
    const mapProviderConfig = buildMapProviderConfig(guiConfig)
    const ai = new MAPWrapper(mapProviderConfig)
    const processor = new IssueProcessor(github, ai, new GitOperations(), state, new SpecCache())
    const explicitRunner = new ExplicitIssueRunner(github, processor)
    const mapAvailable = MAPWrapper.detect(mapProviderConfig).available
    const workspace = createIssueWorkspace({
      github,
      configRepos: guiConfig.repos,
      state,
      ...(mapAvailable ? { polishText: (title: string, body: string, options) => polishIssueText(title, body, options, mapProviderConfig) } : {}),
      explicitRunner,
    })
    const { runGui } = await import('./gui/main.js')
    return runGui(workspace)
  }

  // --tui mode
  if (values.tui) {
    if (values.repo !== undefined || values.config !== undefined) {
      console.error('Error: --tui cannot be combined with --repo or --config')
      return 1
    }
    if (!process.stdout.isTTY) {
      console.error('Error: --tui requires an interactive terminal')
      return 1
    }

    let token = process.env['GITHUB_TOKEN']
    if (!token) {
      try {
        token = execSync('gh auth token', { encoding: 'utf-8' }).trim()
      } catch {
        // gh CLI not available or not authenticated
      }
    }
    if (!token) {
      console.error('Error: GITHUB_TOKEN environment variable is required (or authenticate via `gh auth login`)')
      return 1
    }

    let tuiConfig: PipelineConfig = { repos: [] }
    const tuiConfigPath = findDefaultConfig()
    if (tuiConfigPath !== undefined && existsSync(tuiConfigPath)) {
      tuiConfig = loadConfig(tuiConfigPath)
    }

    const github = new GitHubClient(token)
    const mapProviderConfig = buildMapProviderConfig(tuiConfig)
    const mapAvailable = MAPWrapper.detect(mapProviderConfig).available
    const tuiState = new StateManager('.pipeline-state.json')
    const { runTui } = await import('./cli/tui.js')
    return runTui(createIssueWorkspace({
      github,
      configRepos: tuiConfig.repos,
      state: tuiState,
      ...(mapAvailable ? { polishText: (t: string, b: string, options) => polishIssueText(t, b, options, mapProviderConfig) } : {}),
    }))
  }

  // Mutual exclusion check
  if (values.repo !== undefined && values.config !== undefined) {
    console.error('Error: --repo and --config are mutually exclusive')
    return 1
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

  // Build config from CLI flags or config file
  let config: PipelineConfig
  if (values.repo !== undefined) {
    try {
      config = buildConfigFromFlags(values as Parameters<typeof buildConfigFromFlags>[0])
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
      return 1
    }
  } else {
    const configPath = values.config ?? findDefaultConfig()
    if (configPath === undefined) {
      console.error('Error: no config file found. Use --repo <owner/name> or --config <path>.')
      printHelp()
      return 1
    }
    if (!existsSync(configPath)) {
      console.error(`Error: config file not found: ${configPath}`)
      return 1
    }
    config = loadConfig(configPath)
  }

  const state = new StateManager('.pipeline-state.json', config.retry)
  const github = new GitHubClient(token)

  // Build MAP provider with config overrides
  const mapProviderConfig = buildMapProviderConfig(config)
  const ai = new MAPWrapper(mapProviderConfig)

  // Auto-detect MAP binary
  const detection = MAPWrapper.detect(mapProviderConfig)
  if (detection.available) {
    console.log(`[MAP] Detected: ${detection.version ?? 'unknown version'}`)
  } else {
    console.warn(`[MAP] Warning: map binary not found. ${detection.hint ?? ''}`)
    console.warn(`[MAP] The pipeline requires MAP to be installed.`)
  }

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

    const maxRuns = config.maxPollRuns ?? Infinity
    const maxConsecFail = config.maxConsecutiveFailures ?? 5
    let totalRuns = 0
    let consecutiveFailures = 0
    let firstRun = true

    let lastExitCode = 0
    while (!shutdown) {
      lastExitCode = await runner.run()
      totalRuns++

      if (lastExitCode !== 0) {
        consecutiveFailures++
        console.warn(`[poll] Run finished with failures (exit code ${lastExitCode}) — consecutive failures: ${consecutiveFailures}/${maxConsecFail}`)
      } else {
        consecutiveFailures = 0
      }

      // Star prompt on first run only
      if (firstRun) {
        await showStarPrompt(state)
        firstRun = false
      }

      // Circuit breaker: too many consecutive failures
      if (consecutiveFailures >= maxConsecFail) {
        console.error(`[poll] Circuit breaker: ${consecutiveFailures} consecutive failures — stopping poll loop.`)
        return 1
      }

      // Max runs cap
      if (totalRuns >= maxRuns) {
        console.log(`[poll] Reached max poll runs (${maxRuns}) — stopping.`)
        break
      }

      if (shutdown) break
      console.log(`[poll] Next run in ${pollIntervalMs / 1000}s... (run ${totalRuns}${maxRuns < Infinity ? `/${maxRuns}` : ''})`)
      await sleep(pollIntervalMs)
    }

    console.log('[poll] Shutdown complete.')
    return lastExitCode
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
