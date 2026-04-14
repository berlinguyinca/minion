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

  it('defaults autoReviewLabel to undefined (uses default "auto-review")', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [] }))

    const config = loadConfig(configPath)

    expect(config.autoReviewLabel).toBeUndefined()
  })

  it('maps autoReviewLabel when non-default value provided', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [], autoReviewLabel: 'ready-for-review' }))

    const config = loadConfig(configPath)

    expect(config.autoReviewLabel).toBe('ready-for-review')
  })

  it('defaults maxReviewRounds to undefined (uses default 3)', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [] }))

    const config = loadConfig(configPath)

    expect(config.maxReviewRounds).toBeUndefined()
  })

  it('maps maxReviewRounds when non-default value provided', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [], maxReviewRounds: 5 }))

    const config = loadConfig(configPath)

    expect(config.maxReviewRounds).toBe(5)
  })

})
