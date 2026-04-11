import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineConfig, RepoConfig, Issue } from '../../../src/types/index.js'

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

vi.mock('../../../src/ai/router.js', () => ({
  AIRouter: vi.fn(),
}))

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
import { AIRouter } from '../../../src/ai/router.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue(n: number): Issue {
  return {
    id: n,
    number: n,
    title: `Issue ${n}`,
    body: `Body of issue ${n}`,
    url: `https://github.com/acme/api/issues/${n}`,
    repoOwner: 'acme',
    repoName: 'api',
  }
}

const repo1: RepoConfig = { owner: 'acme', name: 'api' }
const repo2: RepoConfig = { owner: 'acme', name: 'web' }

const baseConfig: PipelineConfig = {
  repos: [repo1],
  maxIssuesPerRun: 10,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PipelineRunner', () => {
  let processorMock: { processIssue: ReturnType<typeof vi.fn> }
  let githubMock: { fetchOpenIssues: ReturnType<typeof vi.fn> }
  let stateMock: Record<string, unknown>
  let aiMock: Record<string, unknown>
  let runner: PipelineRunner

  beforeEach(() => {
    vi.clearAllMocks()

    processorMock = {
      processIssue: vi.fn().mockResolvedValue({
        success: true,
        isDraft: false,
        testsPassed: true,
        issueNumber: 1,
        repoFullName: 'acme/api',
        modelUsed: 'claude',
        filesChanged: [],
      }),
    }

    githubMock = {
      fetchOpenIssues: vi.fn().mockResolvedValue([makeIssue(1)]),
    }

    stateMock = {}
    aiMock = {}

    vi.mocked(IssueProcessor).mockImplementation(() => processorMock as unknown as IssueProcessor)
    vi.mocked(GitHubClient).mockImplementation(() => githubMock as unknown as GitHubClient)
    vi.mocked(StateManager).mockImplementation(() => stateMock as unknown as StateManager)
    vi.mocked(AIRouter).mockImplementation(() => aiMock as unknown as AIRouter)

    runner = new PipelineRunner(
      baseConfig,
      githubMock as unknown as GitHubClient,
      aiMock as unknown as AIRouter,
      stateMock as unknown as StateManager,
    )
  })

  it('calls fetchOpenIssues for each repo in config', async () => {
    const config: PipelineConfig = { repos: [repo1, repo2], maxIssuesPerRun: 10 }
    githubMock.fetchOpenIssues.mockResolvedValue([])

    const multiRunner = new PipelineRunner(
      config,
      githubMock as unknown as GitHubClient,
      aiMock as unknown as AIRouter,
      stateMock as unknown as StateManager,
    )

    await multiRunner.run()

    expect(githubMock.fetchOpenIssues).toHaveBeenCalledWith('acme', 'api')
    expect(githubMock.fetchOpenIssues).toHaveBeenCalledWith('acme', 'web')
  })

  it('calls processIssue for each issue fetched', async () => {
    githubMock.fetchOpenIssues.mockResolvedValue([makeIssue(1), makeIssue(2)])

    await runner.run()

    expect(processorMock.processIssue).toHaveBeenCalledTimes(2)
    expect(processorMock.processIssue).toHaveBeenCalledWith(repo1, makeIssue(1))
    expect(processorMock.processIssue).toHaveBeenCalledWith(repo1, makeIssue(2))
  })

  it('continues processing remaining issues if one throws', async () => {
    githubMock.fetchOpenIssues.mockResolvedValue([makeIssue(1), makeIssue(2), makeIssue(3)])

    processorMock.processIssue
      .mockResolvedValueOnce({ success: true, isDraft: false, testsPassed: true, issueNumber: 1, repoFullName: 'acme/api', modelUsed: 'claude', filesChanged: [] })
      .mockRejectedValueOnce(new Error('unexpected crash'))
      .mockResolvedValueOnce({ success: true, isDraft: false, testsPassed: true, issueNumber: 3, repoFullName: 'acme/api', modelUsed: 'claude', filesChanged: [] })

    await runner.run()

    expect(processorMock.processIssue).toHaveBeenCalledTimes(3)
  })

  it('returns 0 when all issues succeed', async () => {
    githubMock.fetchOpenIssues.mockResolvedValue([makeIssue(1), makeIssue(2)])

    const code = await runner.run()

    expect(code).toBe(0)
  })

  it('returns 1 when any issue fails', async () => {
    githubMock.fetchOpenIssues.mockResolvedValue([makeIssue(1), makeIssue(2)])

    processorMock.processIssue
      .mockResolvedValueOnce({ success: true, isDraft: false, testsPassed: true, issueNumber: 1, repoFullName: 'acme/api', modelUsed: 'claude', filesChanged: [] })
      .mockResolvedValueOnce({ success: false, isDraft: true, testsPassed: false, issueNumber: 2, repoFullName: 'acme/api', modelUsed: 'claude', filesChanged: [], error: 'failed' })

    const code = await runner.run()

    expect(code).toBe(1)
  })

  it('returns 1 when any issue throws', async () => {
    githubMock.fetchOpenIssues.mockResolvedValue([makeIssue(1)])
    processorMock.processIssue.mockRejectedValue(new Error('crash'))

    const code = await runner.run()

    expect(code).toBe(1)
  })

  it('respects maxIssuesPerRun limit — stops after N issues', async () => {
    const config: PipelineConfig = { repos: [repo1], maxIssuesPerRun: 2 }
    githubMock.fetchOpenIssues.mockResolvedValue([makeIssue(1), makeIssue(2), makeIssue(3), makeIssue(4)])

    const limitedRunner = new PipelineRunner(
      config,
      githubMock as unknown as GitHubClient,
      aiMock as unknown as AIRouter,
      stateMock as unknown as StateManager,
    )

    await limitedRunner.run()

    expect(processorMock.processIssue).toHaveBeenCalledTimes(2)
  })

  it('counts issues across all repos toward the maxIssuesPerRun limit', async () => {
    const config: PipelineConfig = { repos: [repo1, repo2], maxIssuesPerRun: 3 }

    githubMock.fetchOpenIssues
      .mockResolvedValueOnce([makeIssue(1), makeIssue(2)])
      .mockResolvedValueOnce([makeIssue(3), makeIssue(4)])

    const limitedRunner = new PipelineRunner(
      config,
      githubMock as unknown as GitHubClient,
      aiMock as unknown as AIRouter,
      stateMock as unknown as StateManager,
    )

    await limitedRunner.run()

    // repo1 contributes 2, repo2 can only contribute 1 more (limit = 3)
    expect(processorMock.processIssue).toHaveBeenCalledTimes(3)
  })

  it('defaults maxIssuesPerRun to 10 when not specified', async () => {
    const config: PipelineConfig = { repos: [repo1] }
    const issues = Array.from({ length: 15 }, (_, i) => makeIssue(i + 1))
    githubMock.fetchOpenIssues.mockResolvedValue(issues)

    const defaultRunner = new PipelineRunner(
      config,
      githubMock as unknown as GitHubClient,
      aiMock as unknown as AIRouter,
      stateMock as unknown as StateManager,
    )

    await defaultRunner.run()

    expect(processorMock.processIssue).toHaveBeenCalledTimes(10)
  })
})
