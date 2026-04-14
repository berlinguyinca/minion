import { describe, it, expect } from 'vitest'
import { tmpdir } from 'node:os'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadConfig } from '../../../src/config/index.js'

function makeTempPath(filename: string): string {
  const dir = join(tmpdir(), `gh-pipeline-test-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  return join(dir, filename)
}

describe('loadConfig', () => {
  it('loads valid repos.json and returns typed PipelineConfig', () => {
    const configPath = makeTempPath('repos.json')
    const content = {
      repos: [
        { owner: 'acme', name: 'api', defaultBranch: 'main', testCommand: 'npm test' },
      ],
      ollamaModel: 'qwen2.5-coder:latest',
      maxIssuesPerRun: 5,
    }
    writeFileSync(configPath, JSON.stringify(content))

    const config = loadConfig(configPath)

    expect(config.repos).toHaveLength(1)
    expect(config.repos[0]).toMatchObject({
      owner: 'acme',
      name: 'api',
      defaultBranch: 'main',
      testCommand: 'npm test',
    })
    expect(config.ollamaModel).toBe('qwen2.5-coder:latest')
    expect(config.maxIssuesPerRun).toBe(5)
  })

  it('defaults defaultBranch to "main" when not specified', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [{ owner: 'acme', name: 'api' }] }))

    const config = loadConfig(configPath)

    expect(config.repos[0]?.defaultBranch).toBe('main')
  })

  it('preserves testCommand when specified', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(
      configPath,
      JSON.stringify({ repos: [{ owner: 'acme', name: 'api', testCommand: 'pnpm test' }] })
    )

    const config = loadConfig(configPath)

    expect(config.repos[0]?.testCommand).toBe('pnpm test')
  })

  it('preserves cloneUrl when specified', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(
      configPath,
      JSON.stringify({ repos: [{ owner: 'acme', name: 'api', cloneUrl: '/tmp/acme-api.git' }] })
    )

    const config = loadConfig(configPath)

    expect(config.repos[0]?.cloneUrl).toBe('/tmp/acme-api.git')
  })

  it('defaults ollamaModel to "qwen2.5-coder:latest" when not specified', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [] }))

    const config = loadConfig(configPath)

    expect(config.ollamaModel).toBe('qwen2.5-coder:latest')
  })

  it('defaults maxIssuesPerRun to 10 when not specified', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [] }))

    const config = loadConfig(configPath)

    expect(config.maxIssuesPerRun).toBe(10)
  })

  it('throws descriptive error when config file is missing', () => {
    const configPath = join(tmpdir(), `nonexistent-${randomUUID()}.json`)

    expect(() => loadConfig(configPath)).toThrow(/not found|no such file|ENOENT/i)
  })

  it('throws descriptive error on malformed JSON', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, '{ invalid json !!!')

    expect(() => loadConfig(configPath)).toThrow(/invalid json|parse|JSON/i)
  })

  it('throws descriptive error on invalid schema — missing owner', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [{ name: 'api' }] }))

    expect(() => loadConfig(configPath)).toThrow(/owner/i)
  })

  it('throws descriptive error on invalid schema — missing name', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [{ owner: 'acme' }] }))

    expect(() => loadConfig(configPath)).toThrow(/name/i)
  })

  it('accepts an empty repos array as valid', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [] }))

    const config = loadConfig(configPath)

    expect(config.repos).toEqual([])
  })

  it('maps quotaLimits.claude and quotaLimits.codex when provided', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(
      configPath,
      JSON.stringify({ repos: [], quotaLimits: { claude: 200, codex: 75 } })
    )

    const config = loadConfig(configPath)

    expect(config.quotaLimits?.claude).toBe(200)
    expect(config.quotaLimits?.codex).toBe(75)
  })

  it('maps quotaLimits when only claude is provided', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [], quotaLimits: { claude: 50 } }))

    const config = loadConfig(configPath)

    expect(config.quotaLimits?.claude).toBe(50)
    expect(config.quotaLimits?.codex).toBeUndefined()
  })

  it('maps quotaLimits when only codex is provided', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [], quotaLimits: { codex: 30 } }))

    const config = loadConfig(configPath)

    expect(config.quotaLimits?.claude).toBeUndefined()
    expect(config.quotaLimits?.codex).toBe(30)
  })

  // -------------------------------------------------------------------------
  // providers schema validation
  // -------------------------------------------------------------------------

  it('parses providers block with all timeout fields', () => {
    const configPath = makeTempPath('config.json')
    writeFileSync(configPath, JSON.stringify({
      repos: [],
      providers: {
        claude: { timeoutMs: 90000, structuredTimeoutMs: 300000, agentTimeoutMs: 1200000, quota: 200 },
        codex: { timeoutMs: 60000 },
        ollama: { structuredTimeoutMs: 120000, model: 'gemma3:latest' },
      },
    }))

    const config = loadConfig(configPath)

    expect(config.providers?.['claude']?.timeoutMs).toBe(90000)
    expect(config.providers?.['claude']?.structuredTimeoutMs).toBe(300000)
    expect(config.providers?.['claude']?.agentTimeoutMs).toBe(1200000)
    expect(config.providers?.['claude']?.quota).toBe(200)
    expect(config.providers?.['codex']?.timeoutMs).toBe(60000)
    expect(config.providers?.['ollama']?.structuredTimeoutMs).toBe(120000)
    expect(config.providers?.['ollama']?.model).toBe('gemma3:latest')
  })

  it('parses YAML providers block correctly', () => {
    const configPath = makeTempPath('config.yaml')
    const yaml = `
repos: []
providers:
  claude:
    timeoutMs: 90000
    structuredTimeoutMs: 300000
    agentTimeoutMs: 1200000
`
    writeFileSync(configPath, yaml)

    const config = loadConfig(configPath)

    expect(config.providers?.['claude']?.timeoutMs).toBe(90000)
    expect(config.providers?.['claude']?.structuredTimeoutMs).toBe(300000)
    expect(config.providers?.['claude']?.agentTimeoutMs).toBe(1200000)
  })

  it('works without providers block (existing behavior preserved)', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [] }))

    const config = loadConfig(configPath)

    expect(config.providers).toBeUndefined()
  })

  it('rejects negative timeoutMs values', () => {
    const configPath = makeTempPath('config.json')
    writeFileSync(configPath, JSON.stringify({
      repos: [],
      providers: { claude: { timeoutMs: -100 } },
    }))

    expect(() => loadConfig(configPath)).toThrow(/timeoutMs/)
  })

  it('rejects zero timeoutMs values', () => {
    const configPath = makeTempPath('config.json')
    writeFileSync(configPath, JSON.stringify({
      repos: [],
      providers: { claude: { timeoutMs: 0 } },
    }))

    expect(() => loadConfig(configPath)).toThrow(/timeoutMs/)
  })

  it('rejects negative structuredTimeoutMs values', () => {
    const configPath = makeTempPath('config.json')
    writeFileSync(configPath, JSON.stringify({
      repos: [],
      providers: { claude: { structuredTimeoutMs: -50 } },
    }))

    expect(() => loadConfig(configPath)).toThrow(/structuredTimeoutMs/)
  })

  it('rejects negative agentTimeoutMs values', () => {
    const configPath = makeTempPath('config.json')
    writeFileSync(configPath, JSON.stringify({
      repos: [],
      providers: { codex: { agentTimeoutMs: -1 } },
    }))

    expect(() => loadConfig(configPath)).toThrow(/agentTimeoutMs/)
  })

  it('parses providers with agents config', () => {
    const configPath = makeTempPath('config.json')
    writeFileSync(configPath, JSON.stringify({
      repos: [],
      providers: {
        map: {
          timeoutMs: 120000,
          agents: {
            spec: { adapter: 'claude' },
            review: { adapter: 'codex' },
            execute: { adapter: 'claude' },
          },
        },
      },
    }))

    const config = loadConfig(configPath)

    expect(config.providers?.['map']?.agents?.spec?.adapter).toBe('claude')
    expect(config.providers?.['map']?.agents?.review?.adapter).toBe('codex')
    expect(config.providers?.['map']?.agents?.execute?.adapter).toBe('claude')
  })

  it('omits undefined optional fields in providers mapping', () => {
    const configPath = makeTempPath('config.json')
    writeFileSync(configPath, JSON.stringify({
      repos: [],
      providers: {
        claude: { quota: 100 },
      },
    }))

    const config = loadConfig(configPath)

    expect(config.providers?.['claude']?.quota).toBe(100)
    expect(config.providers?.['claude']?.timeoutMs).toBeUndefined()
    expect(config.providers?.['claude']?.structuredTimeoutMs).toBeUndefined()
    expect(config.providers?.['claude']?.agentTimeoutMs).toBeUndefined()
    expect(config.providers?.['claude']?.model).toBeUndefined()
    expect(config.providers?.['claude']?.agents).toBeUndefined()
  })

})
