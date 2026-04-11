import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

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

export class GitOperations {
  async clone(url: string, targetDir: string): Promise<void> {
    await runGit(['clone', '--depth', '1', url, targetDir])
    // Set git identity for commits in CI-like environments
    await runGit(['config', 'user.email', 'pipeline@gh-issue-pipeline'], targetDir)
    await runGit(['config', 'user.name', 'GH Issue Pipeline'], targetDir)
  }

  async createBranch(dir: string, branchName: string): Promise<void> {
    await runGit(['checkout', '-b', branchName], dir)
  }

  async commitAll(dir: string, message: string): Promise<void> {
    await runGit(['add', '-A'], dir)
    try {
      await runGit(['commit', '-m', message], dir)
    } catch (err: unknown) {
      // "nothing to commit" is not an error — treat it as success
      if (err instanceof Error) {
        const gitErr = err as { stderr?: string; stdout?: string }
        const combined = `${gitErr.stderr ?? ''} ${gitErr.stdout ?? ''}`
        if (combined.includes('nothing to commit')) {
          return
        }
      }
      throw err
    }
  }

  async push(dir: string, branchName: string): Promise<void> {
    await runGit(['push', '--set-upstream', 'origin', branchName], dir)
  }

  async getChangedFiles(dir: string): Promise<string[]> {
    try {
      const output = await runGit(['diff', '--name-only', 'HEAD~1'], dir)
      return output
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0)
    } catch {
      // No previous commit or other git error — return empty array
      return []
    }
  }
}
