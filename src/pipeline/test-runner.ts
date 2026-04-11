import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import type { RepoConfig } from '../types/index.js'

export interface TestResult {
  passed: boolean
  output: string
}

export function detectTestCommand(dir: string, repoConfig: RepoConfig): string | null {
  // 1. Explicit config override
  if (repoConfig.testCommand) {
    return repoConfig.testCommand
  }

  // 2. pnpm-lock.yaml → pnpm test
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) {
    return 'pnpm test'
  }

  // 3. package-lock.json → npm test
  if (existsSync(join(dir, 'package-lock.json'))) {
    return 'npm test'
  }

  // 4. yarn.lock → yarn test
  if (existsSync(join(dir, 'yarn.lock'))) {
    return 'yarn test'
  }

  // 5. Makefile with test: target → make test
  const makefilePath = join(dir, 'Makefile')
  if (existsSync(makefilePath)) {
    const content = readFileSync(makefilePath, 'utf-8')
    if (/^test:/m.test(content)) {
      return 'make test'
    }
  }

  // 6. go.mod → go test ./...
  if (existsSync(join(dir, 'go.mod'))) {
    return 'go test ./...'
  }

  // 7. Cargo.toml → cargo test
  if (existsSync(join(dir, 'Cargo.toml'))) {
    return 'cargo test'
  }

  // 8. pom.xml → mvn test
  if (existsSync(join(dir, 'pom.xml'))) {
    return 'mvn test'
  }

  return null
}

export function runTests(dir: string, command: string): TestResult {
  try {
    const stdout = execSync(command, { cwd: dir, stdio: 'pipe' })
    return { passed: true, output: stdout.toString() }
  } catch (err: unknown) {
    const execError = err as { stderr?: Buffer; stdout?: Buffer; message?: string }
    const stderr = execError.stderr ? execError.stderr.toString() : ''
    const stdout = execError.stdout ? execError.stdout.toString() : ''
    return { passed: false, output: `${stderr}${stdout}`.trim() }
  }
}
