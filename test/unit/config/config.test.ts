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

  it('defaults maxIssuesPerRun to 10 when not specified', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [] }))

    const config = loadConfig(configPath)

    expect(config.maxIssuesPerRun).toBe(10)
  })

  it('maps mapModel when provided', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [], mapModel: 'claude-opus-4-6' }))

    const config = loadConfig(configPath)

    expect(config.mapModel).toBe('claude-opus-4-6')
  })

  it('maps mapTimeoutMs when provided', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({ repos: [], mapTimeoutMs: 60000 }))

    const config = loadConfig(configPath)

    expect(config.mapTimeoutMs).toBe(60000)
  })

  it('maps custom MAP command and default args when provided', () => {
    const configPath = makeTempPath('repos.json')
    writeFileSync(configPath, JSON.stringify({
      repos: [],
      mapCommand: 'npm',
      mapArgs: ['run', 'map:dev', '--'],
    }))

    const config = loadConfig(configPath)

    expect(config.mapCommand).toBe('npm')
    expect(config.mapArgs).toEqual(['run', 'map:dev', '--'])
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
})
