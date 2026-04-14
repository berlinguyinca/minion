import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { RebaseResult, ConflictFile } from '../types/index.js'

export function buildBranchName(issueNumber: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // remove special chars
    .replace(/\s+/g, '-') // spaces to hyphens
    .replace(/-+/g, '-') // collapse multiple hyphens
    .replace(/^-|-$/g, '') // trim leading/trailing hyphens
    .slice(0, 50) // max length
  return `ai/${issueNumber}-${slug}`
}

export function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'gh-pipeline-'))
}

export function cleanupTempDir(dirPath: string): void {
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true })
  }
}

function runGit(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: process.env,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('close', (code: number) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        const err = new Error(`git ${args.join(' ')} exited with code ${code}: ${stderr}`)
        Object.assign(err, { code, stderr, stdout })
        reject(err)
      }
    })
  })
}

function isLocalGitUrl(url: string): boolean {
  return url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || url.startsWith('file://')
}

export class GitOperations {
  async clone(url: string, targetDir: string, branch = 'main'): Promise<void> {
    try {
      await runGit(['clone', '--depth', '1', '--branch', branch, url, targetDir])
    } catch (err) {
      /* v8 ignore next */
      const message = err instanceof Error ? err.message : String(err)
      if (!isLocalGitUrl(url) || !message.includes('Remote branch')) {
        throw err
      }
      await runGit(['clone', '--depth', '1', url, targetDir])
    }
    // Set git identity for commits in CI-like environments
    await runGit(['config', 'user.email', 'pipeline@minion'], targetDir)
    await runGit(['config', 'user.name', 'Minion Pipeline'], targetDir)
  }

  async createBranch(dir: string, branchName: string): Promise<void> {
    await runGit(['checkout', '-b', branchName], dir)
  }

  async commitAll(dir: string, message: string): Promise<boolean> {
    await runGit(['add', '-A'], dir)
    try {
      await runGit(['commit', '-m', message], dir)
      return true
    } catch (err: unknown) {
      // "nothing to commit" is not an error — treat it as success
      if (err instanceof Error) {
        const gitErr = err as { stderr?: string; stdout?: string }
        /* v8 ignore next */
        const combined = `${gitErr.stderr ?? ''} ${gitErr.stdout ?? ''}`
        if (combined.includes('nothing to commit')) {
          return false
        }
      }
      throw err
    }
  }

  async push(dir: string, branchName: string): Promise<void> {
    await runGit(['push', '--set-upstream', 'origin', branchName], dir)
  }

  async getChangedFiles(dir: string, baseRef = 'HEAD~1'): Promise<string[]> {
    try {
      const output = await runGit(['diff', '--name-only', `${baseRef}...HEAD`], dir)
      return output
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0)
    } catch {
      // No previous commit or other git error — return empty array
      return []
    }
  }

  /** Full clone (not shallow) — required for rebase operations. */
  async cloneFull(url: string, targetDir: string, branch = 'main'): Promise<void> {
    await runGit(['clone', '--branch', branch, url, targetDir])
    await runGit(['config', 'user.email', 'pipeline@minion'], targetDir)
    await runGit(['config', 'user.name', 'Minion Pipeline'], targetDir)
  }

  async fetch(dir: string, remote = 'origin', branch?: string): Promise<void> {
    const args = branch !== undefined ? ['fetch', remote, branch] : ['fetch', remote]
    await runGit(args, dir)
  }

  async checkout(dir: string, ref: string): Promise<void> {
    await runGit(['checkout', ref], dir)
  }

  /** Attempt rebase onto target ref. Returns success or conflict info. */
  async rebase(dir: string, onto: string): Promise<RebaseResult> {
    try {
      await runGit(['rebase', onto], dir)
      return { success: true, conflicts: [] }
    } catch (err) {
      const conflicts = await this.detectConflicts(dir)
      if (conflicts.length > 0) {
        return { success: false, conflicts }
      }
      throw err
    }
  }

  /** Detect conflicted files during a rebase and extract their content. */
  async detectConflicts(dir: string): Promise<ConflictFile[]> {
    try {
      const output = await runGit(['diff', '--name-only', '--diff-filter=U'], dir)
      const files = output.split('\n').map((f) => f.trim()).filter((f) => f.length > 0)
      const conflicts: ConflictFile[] = []

      for (const filePath of files) {
        const fullPath = join(dir, filePath)
        const content = existsSync(fullPath) ? readFileSync(fullPath, 'utf-8') : ''

        let baseContent = ''
        try {
          baseContent = await runGit(['show', `:1:${filePath}`], dir)
        } catch {
          // Base version may not exist for new files
        }

        conflicts.push({ path: filePath, content, baseContent })
      }

      return conflicts
    } catch {
      return []
    }
  }

  /** Write resolved content for a conflicted file and stage it. */
  async resolveConflict(dir: string, filePath: string, resolvedContent: string): Promise<void> {
    writeFileSync(join(dir, filePath), resolvedContent)
    await runGit(['add', filePath], dir)
  }

  async continueRebase(dir: string): Promise<RebaseResult> {
    try {
      await runGit(['-c', 'core.editor=true', 'rebase', '--continue'], dir)
      return { success: true, conflicts: [] }
    } catch (err) {
      const conflicts = await this.detectConflicts(dir)
      if (conflicts.length > 0) {
        return { success: false, conflicts }
      }
      throw err
    }
  }

  async abortRebase(dir: string): Promise<void> {
    await runGit(['rebase', '--abort'], dir)
  }

  async forcePush(dir: string, branchName: string): Promise<void> {
    await runGit(['push', '--force-with-lease', 'origin', branchName], dir)
  }
}
