import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { GitOperations, createTempDir, cleanupTempDir } from '../../../src/git/operations.js'

// Git identity env vars needed in CI-like environments
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test User',
  GIT_AUTHOR_EMAIL: 'test@test.com',
  GIT_COMMITTER_NAME: 'Test User',
  GIT_COMMITTER_EMAIL: 'test@test.com',
}

function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function createBareRepo(): string {
  const bareDir = mkdtempSync(join(tmpdir(), 'gh-pipeline-bare-'))
  exec(`git init --bare "${bareDir}"`)
  return bareDir
}

function createCloneDir(): string {
  return mkdtempSync(join(tmpdir(), 'gh-pipeline-clone-'))
}

describe('GitOperations integration', () => {
  let git: GitOperations
  let bareRepoDir: string
  let cloneDir: string
  let tempDirs: string[]

  beforeEach(() => {
    git = new GitOperations()
    tempDirs = []
    bareRepoDir = createBareRepo()
    tempDirs.push(bareRepoDir)
    cloneDir = createCloneDir()
    tempDirs.push(cloneDir)
  })

  afterEach(() => {
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  describe('clone', () => {
    it('clones a local bare repo and the target has a .git folder', async () => {
      const targetDir = join(cloneDir, 'repo')

      await git.clone(bareRepoDir, targetDir)

      const gitDir = join(targetDir, '.git')
      expect(existsSync(gitDir)).toBe(true)
    })
  })

  describe('createBranch', () => {
    it('creates a branch in the cloned repo and git branch lists it', async () => {
      const targetDir = join(cloneDir, 'repo')
      await git.clone(bareRepoDir, targetDir)

      // Need at least one commit before creating branches (git requires it)
      writeFileSync(join(targetDir, 'README.md'), 'hello')
      exec(`git add -A && git commit -m "initial commit"`, targetDir)

      await git.createBranch(targetDir, 'ai/42-new-feature')

      const branches = exec('git branch', targetDir)
      expect(branches).toContain('ai/42-new-feature')
    })
  })

  describe('commitAll', () => {
    it('creates a commit and git log shows it', async () => {
      const targetDir = join(cloneDir, 'repo')
      await git.clone(bareRepoDir, targetDir)

      // Write a file and commit
      writeFileSync(join(targetDir, 'hello.ts'), 'export const hello = "world"')
      await git.commitAll(targetDir, 'feat: add hello module')

      const log = exec('git log --oneline', targetDir)
      expect(log).toContain('feat: add hello module')
    })
  })

  describe('push', () => {
    it('pushes to the bare remote and the ref exists on the remote', async () => {
      const targetDir = join(cloneDir, 'repo')
      await git.clone(bareRepoDir, targetDir)

      // Make a commit first
      writeFileSync(join(targetDir, 'file.ts'), 'const x = 1')
      await git.commitAll(targetDir, 'initial commit')

      // Create a branch and push it
      await git.createBranch(targetDir, 'ai/1-test-push')
      writeFileSync(join(targetDir, 'feature.ts'), 'const y = 2')
      await git.commitAll(targetDir, 'feat: add feature')
      await git.push(targetDir, 'ai/1-test-push')

      const refs = exec(`git ls-remote "${bareRepoDir}" refs/heads/ai/1-test-push`)
      expect(refs).toContain('ai/1-test-push')
    })
  })

  describe('commitAll with nothing to commit', () => {
    it('handles empty commit gracefully (nothing was staged)', async () => {
      const targetDir = join(cloneDir, 'repo')
      await git.clone(bareRepoDir, targetDir)

      // Make one commit to have a HEAD
      writeFileSync(join(targetDir, 'init.ts'), 'const a = 1')
      await git.commitAll(targetDir, 'initial commit')

      // Now call commitAll with nothing staged — should not throw
      await expect(git.commitAll(targetDir, 'empty commit')).resolves.toBeUndefined()
    })
  })

  describe('createTempDir / cleanupTempDir', () => {
    it('createTempDir returns a path inside os.tmpdir()', () => {
      const dir = createTempDir()
      tempDirs.push(dir)
      expect(dir).toContain(tmpdir())
      expect(existsSync(dir)).toBe(true)
    })

    it('cleanupTempDir removes the directory', () => {
      const dir = createTempDir()
      expect(existsSync(dir)).toBe(true)
      cleanupTempDir(dir)
      expect(existsSync(dir)).toBe(false)
    })
  })
})
