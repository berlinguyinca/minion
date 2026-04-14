import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineConfig, RepoConfig, Issue, PRInfo } from '../../../src/types/index.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../src/pipeline/issue-processor.js', () => ({
  IssueProcessor: vi.fn(),
}))

vi.mock('../../../src/pipeline/merge-processor.js', () => ({
  MergeProcessor: vi.fn(),
}))

vi.mock('../../../src/pipeline/pr-review-processor.js', () => ({
  PRReviewProcessor: vi.fn(),
}))

vi.mock('../../../src/pipeline/spec-cache.js', () => ({
  SpecCache: vi.fn(),
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
  createTempDir: vi.fn(),
  cleanupTempDir: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { PipelineRunner } from '../../../src/pipeline/runner.js'
import { IssueProcessor } from '../../../src/pipeline/issue-processor.js'
import { MergeProcessor } from '../../../src/pipeline/merge-processor.js'
import { PRReviewProcessor } from '../../../src/pipeline/pr-review-processor.js'
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

function makePR(n: number): PRInfo {
  return {
    number: n,
    url: `https://github.com/acme/api/pull/${n}`,
    isDraft: false,
    head: `ai/${n}-some-issue`,
    base: 'main',
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
  let mergeProcessorMock: { processMergeRequest: ReturnType<typeof vi.fn> }
  let prReviewProcessorMock: { processReview: ReturnType<typeof vi.fn> }
  let githubMock: {
    fetchOpenIssues: ReturnType<typeof vi.fn>
    listOpenPRsWithLabel: ReturnType<typeof vi.fn>
    listPRComments: ReturnType<typeof vi.fn>
    mergePullRequest: ReturnType<typeof vi.fn>
  }
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

    mergeProcessorMock = {
      processMergeRequest: vi.fn().mockResolvedValue({
        prNumber: 1,
        repoFullName: 'acme/api',
        merged: true,
        conflictsResolved: 0,
      }),
    }

    prReviewProcessorMock = {
      processReview: vi.fn().mockResolvedValue({
        prNumber: 1,
        repoFullName: 'acme/api',
        merged: true,
        reviewRounds: 1,
      }),
    }

    githubMock = {
      fetchOpenIssues: vi.fn().mockResolvedValue([makeIssue(1)]),
      listOpenPRsWithLabel: vi.fn().mockResolvedValue([]),
      listPRComments: vi.fn().mockResolvedValue([]),
      mergePullRequest: vi.fn().mockResolvedValue(undefined),
    }

    stateMock = {}
    aiMock = {}

    vi.mocked(IssueProcessor).mockImplementation(() => processorMock as unknown as IssueProcessor)
    vi.mocked(MergeProcessor).mockImplementation(() => mergeProcessorMock as unknown as MergeProcessor)
    vi.mocked(PRReviewProcessor).mockImplementation(() => prReviewProcessorMock as unknown as PRReviewProcessor)
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

  it('continues to next repo and increments failed count when fetchOpenIssues throws', async () => {
    const config: PipelineConfig = { repos: [repo1, repo2], maxIssuesPerRun: 10 }

    githubMock.fetchOpenIssues
      .mockRejectedValueOnce(new Error('GitHub API rate limit'))
      .mockResolvedValueOnce([makeIssue(1)])

    const multiRunner = new PipelineRunner(
      config,
      githubMock as unknown as GitHubClient,
      aiMock as unknown as AIRouter,
      stateMock as unknown as StateManager,
    )

    const exitCode = await multiRunner.run()

    // repo1 failed (fetch threw), repo2 succeeded — failed > 0 → exit code 1
    expect(exitCode).toBe(1)
    // processIssue called once for repo2's issue
    expect(processorMock.processIssue).toHaveBeenCalledTimes(1)
    expect(processorMock.processIssue).toHaveBeenCalledWith(repo2, makeIssue(1))
  })

  it('merge phase runs before issue processing', async () => {
    const callOrder: string[] = []

    githubMock.listOpenPRsWithLabel.mockImplementation(() => {
      callOrder.push('listOpenPRsWithLabel')
      return Promise.resolve([])
    })

    githubMock.fetchOpenIssues.mockImplementation(() => {
      callOrder.push('fetchOpenIssues')
      return Promise.resolve([makeIssue(1)])
    })

    processorMock.processIssue.mockImplementation(() => {
      callOrder.push('processIssue')
      return Promise.resolve({
        success: true,
        isDraft: false,
        testsPassed: true,
        issueNumber: 1,
        repoFullName: 'acme/api',
        modelUsed: 'claude',
        filesChanged: [],
      })
    })

    await runner.run()

    // listOpenPRsWithLabel (merge phase) must appear before fetchOpenIssues and processIssue
    const mergeIndex = callOrder.indexOf('listOpenPRsWithLabel')
    const fetchIndex = callOrder.indexOf('fetchOpenIssues')
    const processIndex = callOrder.indexOf('processIssue')
    expect(mergeIndex).toBeGreaterThanOrEqual(0)
    expect(mergeIndex).toBeLessThan(fetchIndex)
    expect(fetchIndex).toBeLessThan(processIndex)
  })

  it('merge phase: calls processMergeRequest when PR comment contains trigger', async () => {
    const pr = makePR(10)
    githubMock.listOpenPRsWithLabel.mockResolvedValue([pr])
    githubMock.listPRComments.mockResolvedValue([
      { id: 1, body: '/merge', user: 'dev', createdAt: '2024-01-01T00:00:00Z' },
    ])

    await runner.run()

    expect(mergeProcessorMock.processMergeRequest).toHaveBeenCalledWith(repo1, pr)
  })

  it('merge phase: skips processMergeRequest when no trigger comment present', async () => {
    const pr = makePR(10)
    githubMock.listOpenPRsWithLabel.mockResolvedValue([pr])
    githubMock.listPRComments.mockResolvedValue([
      { id: 1, body: 'looks good', user: 'dev', createdAt: '2024-01-01T00:00:00Z' },
    ])

    await runner.run()

    expect(mergeProcessorMock.processMergeRequest).not.toHaveBeenCalled()
  })

  it('merge phase: skips draft PRs by default', async () => {
    const draftPR: PRInfo = { ...makePR(10), isDraft: true }
    githubMock.listOpenPRsWithLabel.mockResolvedValue([draftPR])
    githubMock.listPRComments.mockResolvedValue([
      { id: 1, body: '/merge', user: 'dev', createdAt: '2024-01-01T00:00:00Z' },
    ])

    await runner.run()

    expect(mergeProcessorMock.processMergeRequest).not.toHaveBeenCalled()
  })

  it('merge phase: processes draft PRs when mergeDraftPRs is true', async () => {
    const config: PipelineConfig = { repos: [repo1], maxIssuesPerRun: 10, mergeDraftPRs: true }
    const draftPR: PRInfo = { ...makePR(10), isDraft: true }
    githubMock.listOpenPRsWithLabel.mockResolvedValue([draftPR])
    githubMock.listPRComments.mockResolvedValue([
      { id: 1, body: '/merge', user: 'dev', createdAt: '2024-01-01T00:00:00Z' },
    ])

    const draftRunner = new PipelineRunner(
      config,
      githubMock as unknown as GitHubClient,
      aiMock as unknown as AIRouter,
      stateMock as unknown as StateManager,
    )

    await draftRunner.run()

    expect(mergeProcessorMock.processMergeRequest).toHaveBeenCalledWith(repo1, draftPR)
  })

  it('merge phase: continues issue processing when listOpenPRsWithLabel throws', async () => {
    githubMock.listOpenPRsWithLabel.mockRejectedValue(new Error('GitHub unavailable'))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const code = await runner.run()
    errorSpy.mockRestore()

    // Issue processing should still run
    expect(processorMock.processIssue).toHaveBeenCalledTimes(1)
    expect(code).toBe(0)
  })

  it('merge phase: continues when individual PR comment fetch throws', async () => {
    const pr = makePR(10)
    githubMock.listOpenPRsWithLabel.mockResolvedValue([pr])
    githubMock.listPRComments.mockRejectedValue(new Error('comments unavailable'))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await runner.run()
    errorSpy.mockRestore()

    expect(mergeProcessorMock.processMergeRequest).not.toHaveBeenCalled()
    // Issue processing continues normally
    expect(processorMock.processIssue).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Auto-review phase
  // -------------------------------------------------------------------------

  it('auto-review phase: runs between merge and issue processing', async () => {
    const callOrder: string[] = []

    githubMock.listOpenPRsWithLabel.mockImplementation((_owner: string, _name: string, label: string) => {
      if (label === 'ai-generated') {
        callOrder.push('merge-listPRs')
      } else if (label === 'auto-review') {
        callOrder.push('autoReview-listPRs')
      }
      return Promise.resolve([])
    })

    githubMock.fetchOpenIssues.mockImplementation(() => {
      callOrder.push('fetchOpenIssues')
      return Promise.resolve([makeIssue(1)])
    })

    processorMock.processIssue.mockImplementation(() => {
      callOrder.push('processIssue')
      return Promise.resolve({
        success: true,
        isDraft: false,
        testsPassed: true,
        issueNumber: 1,
        repoFullName: 'acme/api',
        modelUsed: 'claude',
        filesChanged: [],
      })
    })

    await runner.run()

    const mergeIdx = callOrder.indexOf('merge-listPRs')
    const reviewIdx = callOrder.indexOf('autoReview-listPRs')
    const fetchIdx = callOrder.indexOf('fetchOpenIssues')
    expect(mergeIdx).toBeLessThan(reviewIdx)
    expect(reviewIdx).toBeLessThan(fetchIdx)
  })

  it('auto-review phase: calls processReview for PRs with auto-review label', async () => {
    const reviewPR = makePR(20)

    githubMock.listOpenPRsWithLabel.mockImplementation((_owner: string, _name: string, label: string) => {
      if (label === 'auto-review') {
        return Promise.resolve([reviewPR])
      }
      return Promise.resolve([])
    })

    await runner.run()

    expect(prReviewProcessorMock.processReview).toHaveBeenCalledWith(repo1, reviewPR)
  })

  it('auto-review phase: uses configured autoReviewLabel', async () => {
    const config: PipelineConfig = { repos: [repo1], maxIssuesPerRun: 10, autoReviewLabel: 'ready-for-review' }
    const customRunner = new PipelineRunner(
      config,
      githubMock as unknown as GitHubClient,
      aiMock as unknown as AIRouter,
      stateMock as unknown as StateManager,
    )

    await customRunner.run()

    expect(githubMock.listOpenPRsWithLabel).toHaveBeenCalledWith('acme', 'api', 'ready-for-review')
  })

  it('auto-review phase: continues issue processing when listOpenPRsWithLabel throws', async () => {
    githubMock.listOpenPRsWithLabel.mockRejectedValue(new Error('GitHub unavailable'))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const code = await runner.run()
    errorSpy.mockRestore()

    // Issue processing should still run
    expect(processorMock.processIssue).toHaveBeenCalledTimes(1)
    expect(code).toBe(0)
  })

  it('auto-review phase: continues when individual PR review throws', async () => {
    const reviewPR = makePR(20)

    githubMock.listOpenPRsWithLabel.mockImplementation((_owner: string, _name: string, label: string) => {
      if (label === 'auto-review') {
        return Promise.resolve([reviewPR])
      }
      return Promise.resolve([])
    })

    prReviewProcessorMock.processReview.mockRejectedValue(new Error('review crashed'))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await runner.run()
    errorSpy.mockRestore()

    // Issue processing should still proceed
    expect(processorMock.processIssue).toHaveBeenCalledTimes(1)
  })

  it('auto-review phase: logs merged message when review succeeds', async () => {
    const reviewPR = makePR(20)

    githubMock.listOpenPRsWithLabel.mockImplementation((_owner: string, _name: string, label: string) => {
      if (label === 'auto-review') {
        return Promise.resolve([reviewPR])
      }
      return Promise.resolve([])
    })

    prReviewProcessorMock.processReview.mockResolvedValue({
      prNumber: 20,
      repoFullName: 'acme/api',
      merged: true,
      reviewRounds: 1,
    })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await runner.run()

    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/auto-review.*Merged PR #20/))
    logSpy.mockRestore()
  })

  it('auto-review phase: logs warning when review does not merge', async () => {
    const reviewPR = makePR(20)

    githubMock.listOpenPRsWithLabel.mockImplementation((_owner: string, _name: string, label: string) => {
      if (label === 'auto-review') {
        return Promise.resolve([reviewPR])
      }
      return Promise.resolve([])
    })

    prReviewProcessorMock.processReview.mockResolvedValue({
      prNumber: 20,
      repoFullName: 'acme/api',
      merged: false,
      reviewRounds: 3,
      error: 'max review rounds exceeded',
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await runner.run()

    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/auto-review.*PR #20 not merged/))
    warnSpy.mockRestore()
  })
})
