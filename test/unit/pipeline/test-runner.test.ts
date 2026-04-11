import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectTestCommand, runTests } from '../../../src/pipeline/test-runner.js'
import type { RepoConfig } from '../../../src/types/index.js'

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'test-runner-test-'))
}

const baseRepo: RepoConfig = { owner: 'acme', name: 'repo' }

describe('detectTestCommand', () => {
  it('uses repoConfig.testCommand when provided', () => {
    const dir = makeTempDir()
    const repo: RepoConfig = { ...baseRepo, testCommand: 'jest --ci' }
    expect(detectTestCommand(dir, repo)).toBe('jest --ci')
  })

  it('detects pnpm test when pnpm-lock.yaml present', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '')
    expect(detectTestCommand(dir, baseRepo)).toBe('pnpm test')
  })

  it('detects npm test when package-lock.json present', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'package-lock.json'), '{}')
    expect(detectTestCommand(dir, baseRepo)).toBe('npm test')
  })

  it('detects yarn test when yarn.lock present', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'yarn.lock'), '')
    expect(detectTestCommand(dir, baseRepo)).toBe('yarn test')
  })

  it('detects make test when Makefile with test: target present', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'Makefile'), 'test:\n\tgo test ./...\n')
    expect(detectTestCommand(dir, baseRepo)).toBe('make test')
  })

  it('does not detect make test when Makefile has no test: target', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'Makefile'), 'build:\n\tgo build ./...\n')
    expect(detectTestCommand(dir, baseRepo)).toBeNull()
  })

  it('detects go test ./... when go.mod present', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'go.mod'), 'module example.com/app\n\ngo 1.21\n')
    expect(detectTestCommand(dir, baseRepo)).toBe('go test ./...')
  })

  it('detects cargo test when Cargo.toml present', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "myapp"\n')
    expect(detectTestCommand(dir, baseRepo)).toBe('cargo test')
  })

  it('detects mvn test when pom.xml present', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'pom.xml'), '<project/>')
    expect(detectTestCommand(dir, baseRepo)).toBe('mvn test')
  })

  it('returns null when no known test files are found', () => {
    const dir = makeTempDir()
    expect(detectTestCommand(dir, baseRepo)).toBeNull()
  })
})

describe('runTests', () => {
  it('returns { passed: true } when command succeeds', () => {
    const dir = makeTempDir()
    const result = runTests(dir, 'echo ok')
    expect(result.passed).toBe(true)
    expect(result.output).toContain('ok')
  })

  it('returns { passed: false } when command fails', () => {
    const dir = makeTempDir()
    const result = runTests(dir, 'false')
    expect(result.passed).toBe(false)
  })

  it('output field is a string on success', () => {
    const dir = makeTempDir()
    const result = runTests(dir, 'echo hello')
    expect(typeof result.output).toBe('string')
  })

  it('output field is a string on failure', () => {
    const dir = makeTempDir()
    const result = runTests(dir, 'false')
    expect(typeof result.output).toBe('string')
  })
})
