import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runOnboarding } from '../../src/cli/onboarding.js'

describe('runOnboarding()', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('creates ollama-first starter config and env files in non-interactive mode', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'minion-onboard-'))
    tempDirs.push(cwd)
    const configPath = join(cwd, 'config.yaml')
    const envPath = join(cwd, '.env')

    const code = await runOnboarding({
      cwd,
      configPath,
      envPath,
      interactive: false,
      commandExists: () => false,
      output: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    })

    const config = readFileSync(configPath, 'utf-8')
    const env = readFileSync(envPath, 'utf-8')

    expect(code).toBe(0)
    expect(config).toContain('owner: my-org')
    expect(config).toContain('providerChain:')
    expect(config).toContain('  - ollama')
    expect(config).toContain('maxIssuesPerRun: 1')
    expect(env).toContain('GITHUB_TOKEN=')
  })

  it('collects at least one pasted repository and writes the wizard answers', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'minion-onboard-'))
    tempDirs.push(cwd)
    const configPath = join(cwd, 'config.yaml')
    const envPath = join(cwd, '.env')
    const answers = [
      'ghp_test',
      'https://github.com/acme/widgets',
      'develop',
      'pnpm test',
      'y',
      'acme/api',
      '',
      '',
      '',
      'llama3.1:8b',
      '2',
    ]
    const prompt = vi.fn(async () => answers.shift() ?? '')

    await runOnboarding({
      cwd,
      configPath,
      envPath,
      interactive: true,
      prompt,
      commandExists: () => true,
      output: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    })

    const config = readFileSync(configPath, 'utf-8')
    const env = readFileSync(envPath, 'utf-8')

    expect(env).toContain('GITHUB_TOKEN=ghp_test')
    expect(config).toContain('owner: acme')
    expect(config).toContain('name: widgets')
    expect(config).toContain('defaultBranch: develop')
    expect(config).toContain('testCommand: pnpm test')
    expect(config).toContain('name: api')
    expect(config).toContain('providerChain:')
    expect(config).toContain('  - ollama')
    expect(config).toContain('ollamaModel: llama3.1:8b')
    expect(config).toContain('maxIssuesPerRun: 2')
  })

  it('regenerates an existing config when force is enabled', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'minion-onboard-'))
    tempDirs.push(cwd)
    const configPath = join(cwd, 'config.yaml')
    const envPath = join(cwd, '.env')

    writeFileSync(configPath, 'repos: []\nmaxIssuesPerRun: 99\n', 'utf-8')
    writeFileSync(envPath, 'GITHUB_TOKEN=old\n', 'utf-8')

    await runOnboarding({
      cwd,
      configPath,
      envPath,
      interactive: false,
      force: true,
      commandExists: () => false,
      output: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    })

    const config = readFileSync(configPath, 'utf-8')
    expect(config).toContain('providerChain:')
    expect(config).toContain('  - ollama')
    expect(config).not.toContain('maxIssuesPerRun: 99')
  })
})
