/**
 * Performance test: 10 issues with instant mock providers must complete in < 5s.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineConfig, Issue, ProcessingResult } from '../../../src/types/index.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../src/pipeline/issue-processor.js', () => ({
  IssueProcessor: vi.fn(),
}))

vi.mock('../../../src/github/client.js', () => ({
  GitHubClient: vi.fn(),
}))

vi.mock('../../../src/config/state.js', () => ({
  StateManager: vi.fn(),
}))

// AI provider mock (MAPWrapper implements AIProvider directly)

vi.mock('../../../src/git/index.js', () => ({
  GitOperations: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { PipelineRunner } from '../../../src/pipeline/runner.js'
import { IssueProcessor } from '../../../src/pipeline/issue-processor.js'
import { GitHubClient } from '../../../src/github/client.js'
import { StateManager } from '../../../src/config/state.js'
import type { AIProvider } from '../../../src/types/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue(n: number, repo: { owner: string; name: string }): Issue {
  return {
    id: n,
    number: n,
    title: `Issue ${n}`,
    body: `Body of issue ${n}`,
    url: `https://github.com/${repo.owner}/${repo.name}/issues/${n}`,
    repoOwner: repo.owner,
    repoName: repo.name,
  }
}

function makeSuccessResult(issueNumber: number, repoFullName: string): ProcessingResult {
  return {
    issueNumber,
    repoFullName,
    success: true,
    isDraft: false,
    testsPassed: true,
    modelUsed: 'map',
    filesChanged: [],
  }
}

// ---------------------------------------------------------------------------
// Performance test
// ---------------------------------------------------------------------------

describe('PipelineRunner performance', () => {
  let processorMock: { processIssue: ReturnType<typeof vi.fn> }
  let githubMock: { fetchOpenIssues: ReturnType<typeof vi.fn> }
  let stateMock: Record<string, unknown>
  let aiMock: Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()

    processorMock = {
      processIssue: vi.fn(),
    }

    githubMock = {
      fetchOpenIssues: vi.fn(),
    }

    stateMock = {}
    aiMock = {}

    vi.mocked(IssueProcessor).mockImplementation(() => processorMock as unknown as IssueProcessor)
    vi.mocked(GitHubClient).mockImplementation(() => githubMock as unknown as GitHubClient)
    vi.mocked(StateManager).mockImplementation(() => stateMock as unknown as StateManager)
  })

  it('processes 10 issues in under 5 seconds with instant providers', async () => {
    const repo1 = { owner: 'acme', name: 'api' }
    const repo2 = { owner: 'acme', name: 'web' }

    // 5 issues in repo1, 5 in repo2
    const issues1 = Array.from({ length: 5 }, (_, i) => makeIssue(i + 1, repo1))
    const issues2 = Array.from({ length: 5 }, (_, i) => makeIssue(i + 6, repo2))

    githubMock.fetchOpenIssues
      .mockResolvedValueOnce(issues1)
      .mockResolvedValueOnce(issues2)

    // processIssue resolves instantly (no delay)
    processorMock.processIssue.mockImplementation(
      (_repo: typeof repo1, issue: Issue): Promise<ProcessingResult> =>
        Promise.resolve(makeSuccessResult(issue.number, `${_repo.owner}/${_repo.name}`))
    )

    const config: PipelineConfig = {
      repos: [
        { owner: repo1.owner, name: repo1.name },
        { owner: repo2.owner, name: repo2.name },
      ],
      maxIssuesPerRun: 10,
    }

    const runner = new PipelineRunner(
      config,
      githubMock as unknown as GitHubClient,
      aiMock as unknown as AIProvider,
      stateMock as unknown as StateManager,
    )

    const start = Date.now()
    const code = await runner.run()
    const elapsed = Date.now() - start

    expect(code).toBe(0)
    expect(processorMock.processIssue).toHaveBeenCalledTimes(10)
    expect(elapsed).toBeLessThan(5000)
  })
})
