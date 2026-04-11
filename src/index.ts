import { parseArgs } from 'node:util'
import { existsSync } from 'node:fs'
import { GitHubClient } from './github/index.js'
import { ClaudeWrapper, CodexWrapper, OllamaWrapper, AIRouter } from './ai/index.js'
import { StateManager, loadConfig } from './config/index.js'
import { PipelineRunner } from './pipeline/index.js'

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: 'string', default: './repos.json' },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  })

  if (values.help) {
    console.log(`Usage: gh-issue-pipeline [--config <path>]`)
    return 0
  }

  const token = process.env['GITHUB_TOKEN']
  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable is required')
    return 1
  }

  const configPath = values.config ?? './repos.json'
  if (!existsSync(configPath)) {
    console.error(`Error: config file not found: ${configPath}`)
    return 1
  }

  const config = loadConfig(configPath)
  const state = new StateManager('.pipeline-state.json')
  const github = new GitHubClient(token)
  const ai = new AIRouter(state, {
    claude: new ClaudeWrapper(),
    codex: new CodexWrapper(),
    ollama: new OllamaWrapper(config.ollamaModel ?? 'qwen2.5-coder:latest'),
  })

  const runner = new PipelineRunner(config, github, ai, state)
  return runner.run()
}

// Only run when invoked directly (not imported in tests)
if (process.argv[1]?.endsWith('index.js')) {
  run().then(code => process.exit(code)).catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
  })
}
