/**
 * End-to-end pipeline integration test.
 *
 * Creates a fully local environment:
 * - Bare git repo as the "remote"
 * - Lightweight HTTP server simulating the GitHub API
 * - Fake AI CLI binaries from test/fixtures/
 * - Real StateManager with temp state file
 *
 * No real GitHub API calls, no real AI calls.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { PipelineRunner } from '../../../src/pipeline/index.js'
import { GitHubClient } from '../../../src/github/index.js'
import { AIRouter } from '../../../src/ai/index.js'
import { StateManager } from '../../../src/config/index.js'
import type { PipelineConfig, AIProvider, AIModel, StructuredResult, AgentResult } from '../../../src/types/index.js'

// Git identity env vars needed in CI-like environments
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test User',
  GIT_AUTHOR_EMAIL: 'test@test.com',
  GIT_COMMITTER_NAME: 'Test User',
  GIT_COMMITTER_EMAIL: 'test@test.com',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'e2e-pipeline-'))
}

function createBareRepo(parentDir: string): string {
  const bareDir = join(parentDir, 'bare-remote')
  mkdirSync(bareDir)
  exec(`git init --bare "${bareDir}"`)
  return bareDir
}

function seedBareRepo(bareDir: string, workDir: string): void {
  // Clone the bare repo, add an initial commit, push it
  const cloneDir = join(workDir, 'seed-clone')
  exec(`git clone "${bareDir}" "${cloneDir}"`)
  exec('git config user.email test@test.com', cloneDir)
  exec('git config user.name "Test User"', cloneDir)
  writeFileSync(join(cloneDir, 'README.md'), '# test-repo\n')
  exec('git add -A', cloneDir)
  exec('git commit -m "initial commit"', cloneDir)
  exec('git push origin main', cloneDir)
}

type HttpHandler = (req: IncomingMessage, res: ServerResponse) => void

interface FakeServer {
  port: number
  baseUrl: string
  calls: Array<{ method: string; url: string }>
  close: () => Promise<void>
}

function startFakeGitHubServer(): Promise<FakeServer> {
  const calls: Array<{ method: string; url: string }> = []

  const handler: HttpHandler = (req, res) => {
    const method = req.method ?? 'GET'
    const url = req.url ?? '/'
    calls.push({ method, url })

    // Helper to send JSON response
    function json(status: number, body: unknown): void {
      const payload = JSON.stringify(body)
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      })
      res.end(payload)
    }

    function text(status: number, body: string): void {
      res.writeHead(status, {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(body),
      })
      res.end(body)
    }

    // Route matching
    const path = url.split('?')[0] ?? '/'

    // GET /repos/local/test-repo/issues
    if (method === 'GET' && path === '/repos/local/test-repo/issues') {
      json(200, [
        {
          id: 1,
          number: 1,
          title: 'Fix the widget',
          body: 'Widget is broken',
          html_url: 'https://github.com/local/test-repo/issues/1',
          pull_request: undefined,
        },
      ])
      return
    }

    // GET /repos/local/test-repo/git/ref/heads%2Fai%2F... → 404 (no existing branch)
    // Octokit git.getRef uses singular "ref" with encoded slash: /git/ref/heads%2Fbranch-name
    if (method === 'GET' && path.startsWith('/repos/local/test-repo/git/ref/')) {
      json(404, { message: 'Not Found' })
      return
    }

    // POST /repos/local/test-repo/pulls
    if (method === 'POST' && path === '/repos/local/test-repo/pulls') {
      json(201, {
        number: 42,
        html_url: 'http://localhost/pr/42',
        draft: true,
      })
      return
    }

    // POST /repos/local/test-repo/issues/{number}/labels
    // Note: GitHub labels endpoint uses the PR number (42), not the original issue number
    if (method === 'POST' && /^\/repos\/local\/test-repo\/issues\/\d+\/labels$/.test(path)) {
      json(200, [])
      return
    }

    // POST /repos/local/test-repo/issues/{number}/comments
    if (method === 'POST' && /^\/repos\/local\/test-repo\/issues\/\d+\/comments$/.test(path)) {
      json(201, { id: 1, body: '' })
      return
    }

    // GET /repos/local/test-repo/pulls/42 (with diff accept header)
    if (method === 'GET' && path === '/repos/local/test-repo/pulls/42') {
      const accept = req.headers['accept'] ?? ''
      if (accept.includes('diff')) {
        text(200, '--- a/widget.ts\n+++ b/widget.ts\n@@ -1 +1 @@\n-broken\n+fixed')
      } else {
        json(200, {
          number: 42,
          html_url: 'http://localhost/pr/42',
          draft: true,
          head: { ref: 'ai/1-fix-the-widget' },
          base: { ref: 'main' },
        })
      }
      return
    }

    // POST /repos/local/test-repo/pulls/42/reviews
    if (method === 'POST' && path === '/repos/local/test-repo/pulls/42/reviews') {
      json(200, { id: 1 })
      return
    }

    // Fallthrough → 404
    json(404, { message: 'Not Found' })
  }

  return new Promise((resolve) => {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0
      resolve({
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        calls,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()))
          }),
      })
    })
  })
}

// ---------------------------------------------------------------------------
// Fake AI providers using test/fixtures/ binaries
// ---------------------------------------------------------------------------

/**
 * A fake AIProvider that invokes the fixture fake-claude.sh script.
 * Structured calls return a hardcoded spec; agent calls return success.
 */
function makeFakeAIProvider(model: AIModel): AIProvider {
  return {
    model,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async invokeStructured<T>(_prompt: string, _schema: object): Promise<StructuredResult<T>> {
      // Return a minimal spec so IssueProcessor can proceed
      const data = { spec: 'Implement fix for widget issue', comments: [] } as unknown as T
      return { success: true, data, rawOutput: JSON.stringify(data) }
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async invokeAgent(_prompt: string, _workingDir: string): Promise<AgentResult> {
      return { success: true, filesWritten: [], stdout: 'Done', stderr: '' }
    },
  }
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe('PipelineRunner E2E — fully local environment', () => {
  let tempDir: string
  let bareRepoDir: string
  let statePath: string
  let fakeServer: FakeServer

  beforeEach(async () => {
    tempDir = makeTempDir()
    bareRepoDir = createBareRepo(tempDir)
    seedBareRepo(bareRepoDir, tempDir)
    statePath = join(tempDir, 'state.json')

    fakeServer = await startFakeGitHubServer()
  })

  afterEach(async () => {
    await fakeServer.close()
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('processes issue #1: marks as processed, POSTs PR, POSTs comment, returns exit code 0', async () => {
    const state = new StateManager(statePath)
    const github = new GitHubClient('fake-token', fakeServer.baseUrl)

    const fakeProvider = makeFakeAIProvider('claude')
    const ai = new AIRouter(state, {
      claude: fakeProvider,
      codex: makeFakeAIProvider('codex'),
      ollama: makeFakeAIProvider('ollama'),
    })

    const config: PipelineConfig = {
      repos: [
        {
          owner: 'local',
          name: 'test-repo',
          defaultBranch: 'main',
          cloneUrl: bareRepoDir,
        },
      ],
      maxIssuesPerRun: 5,
    }

    const runner = new PipelineRunner(config, github, ai, state)
    const exitCode = await runner.run()

    // 1. runner.run() returns exit code 0
    expect(exitCode).toBe(0)

    // 2. State file marks issue #1 as processed for "local/test-repo"
    const state2 = new StateManager(statePath)
    expect(state2.isIssueProcessed('local/test-repo', 1)).toBe(true)

    // 3. Fake HTTP server received POST to /repos/local/test-repo/pulls
    const pullsCalls = fakeServer.calls.filter(
      (c) => c.method === 'POST' && c.url === '/repos/local/test-repo/pulls'
    )
    expect(pullsCalls.length).toBeGreaterThanOrEqual(1)

    // 4. Fake HTTP server received POST to /repos/local/test-repo/issues/1/comments
    const commentCalls = fakeServer.calls.filter(
      (c) => c.method === 'POST' && c.url === '/repos/local/test-repo/issues/1/comments'
    )
    expect(commentCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('does not re-process an already-processed issue', async () => {
    const state = new StateManager(statePath)
    // Pre-mark the issue as processed
    state.markIssueProcessed('local/test-repo', 1)

    const github = new GitHubClient('fake-token', fakeServer.baseUrl)
    const ai = new AIRouter(state, {
      claude: makeFakeAIProvider('claude'),
      codex: makeFakeAIProvider('codex'),
      ollama: makeFakeAIProvider('ollama'),
    })

    const config: PipelineConfig = {
      repos: [
        {
          owner: 'local',
          name: 'test-repo',
          defaultBranch: 'main',
          cloneUrl: bareRepoDir,
        },
      ],
      maxIssuesPerRun: 5,
    }

    const runner = new PipelineRunner(config, github, ai, state)
    await runner.run()

    // No PR should have been created because the issue was already processed
    const pullsCalls = fakeServer.calls.filter(
      (c) => c.method === 'POST' && c.url === '/repos/local/test-repo/pulls'
    )
    expect(pullsCalls.length).toBe(0)
  })
})
