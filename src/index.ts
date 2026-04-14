import { parseArgs } from 'node:util'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { execFile, execSync } from 'node:child_process'
import { platform } from 'node:os'
import { GitHubClient } from './github/index.js'
import { MAPWrapper } from './ai/index.js'
import { StateManager, loadConfig } from './config/index.js'
import { PipelineRunner } from './pipeline/index.js'
import type { PipelineConfig, RepoConfig } from './types/index.js'

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
  --merge-method <method>   merge|squash|rebase (default: merge)

Config file mode:
  --config <path>           Config file path (default: config.yaml or repos.json)

Interactive mode:
  --tui                     Launch interactive issue creator (requires TTY)

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

  if (values['merge-method'] !== undefined) {
    const method = values['merge-method']
    if (method !== 'merge' && method !== 'squash' && method !== 'rebase') {
      throw new Error(`Invalid --merge-method: "${method}". Must be merge, squash, or rebase.`)
    }
    config.mergeMethod = method
  }

  return config
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
      'merge-method': { type: 'string' },
      poll: { type: 'string' },
      tui: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  })

  if (values.help) {
    printHelp()
    return 0
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

    let configRepos: RepoConfig[] = []
    const tuiConfigPath = findDefaultConfig()
    if (tuiConfigPath !== undefined && existsSync(tuiConfigPath)) {
      configRepos = loadConfig(tuiConfigPath).repos
    }

    const github = new GitHubClient(token)
    const { runTui } = await import('./cli/tui.js')
    return runTui({
      listUserRepos: () => github.listUserRepos(),
      fetchLabels: (o, n) => github.fetchLabels(o, n),
      createIssue: (o, n, t, b, l) => github.createIssue(o, n, t, b, l),
      promptSearch: (await import('@inquirer/search')).default,
      promptInput: (await import('@inquirer/input')).default,
      promptCheckbox: (await import('@inquirer/checkbox')).default,
      configRepos,
      output: console,
    })
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
  const mapProviderConfig = {
    ...(config.mapTimeoutMs !== undefined ? { timeoutMs: config.mapTimeoutMs } : {}),
    ...(config.mapModel !== undefined ? { model: config.mapModel } : {}),
  }
  const ai = new MAPWrapper(Object.keys(mapProviderConfig).length > 0 ? mapProviderConfig : undefined)

  // Auto-detect MAP binary
  const detection = MAPWrapper.detect()
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
