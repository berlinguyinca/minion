import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RepoConfig, PRInfo, PipelineConfig } from '../../../src/types/index.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../src/github/client.js', () => ({
  GitHubClient: vi.fn(),
}))

vi.mock('../../../src/ai/router.js', () => ({
  AIRouter: vi.fn(),
}))

vi.mock('../../../src/git/operations.js', () => ({
  GitOperations: vi.fn(),
}))

vi.mock('../../../src/git/index.js', () => ({
  GitOperations: vi.fn(),
  createTempDir: vi.fn().mockReturnValue('/tmp/review-test'),
  cleanupTempDir: vi.fn(),
}))

vi.mock('../../../src/pipeline/prompts.js', () => ({
  buildAutoReviewPrompt: vi.fn().mockReturnValue('auto review prompt'),
  buildAutoReviewFixPrompt: vi.fn().mockReturnValue('fix prompt'),
  buildHumanClarificationPrompt: vi.fn().mockReturnValue('human help prompt'),
}))

vi.mock('../../../src/pipeline/test-runner.js', () => ({
  detectTestCommand: vi.fn().mockReturnValue(null),
  runTests: vi.fn().mockReturnValue({ passed: true, output: '' }),
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { PRReviewProcessor } from '../../../src/pipeline/pr-review-processor.js'
import { GitHubClient } from '../../../src/github/client.js'
import { AIRouter } from '../../../src/ai/router.js'
import { GitOperations } from '../../../src/git/operations.js'
import { createTempDir, cleanupTempDir } from '../../../src/git/index.js'
import { detectTestCommand, runTests } from '../../../src/pipeline/test-runner.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGitHubMock() {
  return {
    getPRDiff: vi.fn().mockResolvedValue('diff content'),
    mergePullRequest: vi.fn().mockResolvedValue(undefined),
    postIssueComment: vi.fn().mockResolvedValue(undefined),
    postReviewComments: vi.fn().mockResolvedValue(undefined),
    removeLabel: vi.fn().mockResolvedValue(undefined),
  }
}

function makeAIMock() {
  return {
    invokeStructured: vi.fn().mockResolvedValue({
      success: true,
      data: { approved: true, comments: [] },
      rawOutput: '{"approved":true,"comments":[]}',
      model: 'claude' as const,
    }),
    invokeAgent: vi.fn().mockResolvedValue({
      success: true,
      filesWritten: ['src/index.ts'],
      stdout: '',
      stderr: '',
      model: 'claude' as const,
    }),
  }
}

function makeGitMock() {
  return {
    cloneFull: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(undefined),
    checkout: vi.fn().mockResolvedValue(undefined),
    commitAll: vi.fn().mockResolvedValue(true),
    push: vi.fn().mockResolvedValue(undefined),
  }
}

const repo: RepoConfig = {
  owner: 'acme',
  name: 'api',
  defaultBranch: 'main',
}

const pr: PRInfo = {
  number: 42,
  url: 'https://github.com/acme/api/pull/42',
  isDraft: false,
  head: 'feature/add-thing',
  base: 'main',
}

const baseConfig: PipelineConfig = {
  repos: [repo],
  maxIssuesPerRun: 10,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PRReviewProcessor', () => {
  let github: ReturnType<typeof makeGitHubMock>
  let ai: ReturnType<typeof makeAIMock>
  let git: ReturnType<typeof makeGitMock>
  let processor: PRReviewProcessor

  beforeEach(() => {
    vi.clearAllMocks()

    github = makeGitHubMock()
    ai = makeAIMock()
    git = makeGitMock()

    vi.mocked(GitHubClient).mockImplementation(() => github as unknown as GitHubClient)
    vi.mocked(AIRouter).mockImplementation(() => ai as unknown as AIRouter)
    vi.mocked(GitOperations).mockImplementation(() => git as unknown as GitOperations)

    vi.mocked(createTempDir).mockReturnValue('/tmp/review-test')
    vi.mocked(cleanupTempDir).mockReturnValue(undefined)
    vi.mocked(detectTestCommand).mockReturnValue(null)

    processor = new PRReviewProcessor(
      github as unknown as GitHubClient,
      ai as unknown as AIRouter,
      git as unknown as GitOperations,
      baseConfig,
    )
  })

  // -------------------------------------------------------------------------
  // Happy path: approved on first round, no tests configured
  // -------------------------------------------------------------------------

  it('happy path: approves and merges when AI finds no issues', async () => {
    const result = await processor.processReview(repo, pr)

    expect(result.merged).toBe(true)
    expect(result.prNumber).toBe(42)
    expect(result.repoFullName).toBe('acme/api')
    expect(result.reviewRounds).toBe(1)
    expect(result.error).toBeUndefined()
  })

  it('happy path: clones, fetches, and checks out the PR branch', async () => {
    await processor.processReview(repo, pr)

    expect(git.cloneFull).toHaveBeenCalledWith(
      'https://github.com/acme/api.git',
      '/tmp/review-test',
      'main',
    )
    expect(git.fetch).toHaveBeenCalledWith('/tmp/review-test', 'origin', 'feature/add-thing')
    expect(git.checkout).toHaveBeenCalledWith('/tmp/review-test', 'feature/add-thing')
  })

  it('happy path: calls mergePullRequest with default method', async () => {
    await processor.processReview(repo, pr)

    expect(github.mergePullRequest).toHaveBeenCalledWith('acme', 'api', 42, 'merge')
  })

  it('happy path: posts approval comment', async () => {
    await processor.processReview(repo, pr)

    expect(github.postIssueComment).toHaveBeenCalledWith(
      'acme',
      'api',
      42,
      expect.stringMatching(/Approved and merged after 1 review round/),
    )
  })

  it('uses configured mergeMethod from config', async () => {
    const config: PipelineConfig = { ...baseConfig, mergeMethod: 'squash' }
    const squashProcessor = new PRReviewProcessor(
      github as unknown as GitHubClient,
      ai as unknown as AIRouter,
      git as unknown as GitOperations,
      config,
    )

    await squashProcessor.processReview(repo, pr)

    expect(github.mergePullRequest).toHaveBeenCalledWith('acme', 'api', 42, 'squash')
  })

  it('uses repo.cloneUrl when provided', async () => {
    const repoWithUrl: RepoConfig = { ...repo, cloneUrl: 'git@github.com:acme/api.git' }

    await processor.processReview(repoWithUrl, pr)

    expect(git.cloneFull).toHaveBeenCalledWith(
      'git@github.com:acme/api.git',
      '/tmp/review-test',
      'main',
    )
  })

  it('always calls cleanupTempDir in finally block', async () => {
    await processor.processReview(repo, pr)

    expect(cleanupTempDir).toHaveBeenCalledWith('/tmp/review-test')
  })

  // -------------------------------------------------------------------------
  // Approved with tests
  // -------------------------------------------------------------------------

  it('runs tests before merging when test command is detected', async () => {
    vi.mocked(detectTestCommand).mockReturnValue('pnpm test')
    vi.mocked(runTests).mockReturnValue({ passed: true, output: 'all passed' })

    const result = await processor.processReview(repo, pr)

    expect(result.merged).toBe(true)
    expect(detectTestCommand).toHaveBeenCalledWith('/tmp/review-test', repo)
    expect(runTests).toHaveBeenCalledWith('/tmp/review-test', 'pnpm test')
  })

  it('does not merge when tests fail', async () => {
    vi.mocked(detectTestCommand).mockReturnValue('pnpm test')
    vi.mocked(runTests).mockReturnValue({ passed: false, output: 'FAIL src/index.test.ts' })

    const result = await processor.processReview(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('tests failing')
    expect(github.mergePullRequest).not.toHaveBeenCalled()
    expect(github.postIssueComment).toHaveBeenCalledWith(
      'acme',
      'api',
      42,
      expect.stringMatching(/tests are failing/),
    )
  })

  // -------------------------------------------------------------------------
  // Review-fix loop
  // -------------------------------------------------------------------------

  it('fixes issues and re-reviews in a loop', async () => {
    const comments = [{ path: 'src/index.ts', line: 5, body: 'bug here' }]

    // Round 1: issues found
    ai.invokeStructured
      .mockResolvedValueOnce({
        success: true,
        data: { approved: false, comments },
        rawOutput: '',
        model: 'claude' as const,
      })
      // Round 2: approved
      .mockResolvedValueOnce({
        success: true,
        data: { approved: true, comments: [] },
        rawOutput: '',
        model: 'claude' as const,
      })

    const result = await processor.processReview(repo, pr)

    expect(result.merged).toBe(true)
    expect(result.reviewRounds).toBe(2)

    // Should have posted review comments for round 1
    expect(github.postReviewComments).toHaveBeenCalledWith('acme', 'api', 42, comments)

    // Should have invoked the AI agent to fix issues
    expect(ai.invokeAgent).toHaveBeenCalledWith('fix prompt', '/tmp/review-test')

    // Should have committed and pushed the fix
    expect(git.commitAll).toHaveBeenCalledWith(
      '/tmp/review-test',
      'ai: address auto-review comments (round 1)',
    )
    expect(git.push).toHaveBeenCalledWith('/tmp/review-test', 'feature/add-thing')
  })

  it('handles multiple rounds of fixes before approval', async () => {
    const comments1 = [{ path: 'src/a.ts', line: 1, body: 'issue 1' }]
    const comments2 = [{ path: 'src/b.ts', line: 2, body: 'issue 2' }]

    ai.invokeStructured
      .mockResolvedValueOnce({
        success: true,
        data: { approved: false, comments: comments1 },
        rawOutput: '',
        model: 'claude' as const,
      })
      .mockResolvedValueOnce({
        success: true,
        data: { approved: false, comments: comments2 },
        rawOutput: '',
        model: 'claude' as const,
      })
      .mockResolvedValueOnce({
        success: true,
        data: { approved: true, comments: [] },
        rawOutput: '',
        model: 'claude' as const,
      })

    const result = await processor.processReview(repo, pr)

    expect(result.merged).toBe(true)
    expect(result.reviewRounds).toBe(3)
    expect(ai.invokeAgent).toHaveBeenCalledTimes(2)
    expect(git.commitAll).toHaveBeenCalledTimes(2)
  })

  // -------------------------------------------------------------------------
  // Max rounds exceeded → human clarification
  // -------------------------------------------------------------------------

  it('asks for human help when max review rounds exceeded', async () => {
    const comments = [{ path: 'src/index.ts', line: 5, body: 'persistent issue' }]

    // All rounds find issues
    ai.invokeStructured.mockResolvedValue({
      success: true,
      data: { approved: false, comments },
      rawOutput: '',
      model: 'claude' as const,
    })

    const result = await processor.processReview(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('max review rounds exceeded')
    // Default maxReviewRounds is 3
    expect(result.reviewRounds).toBe(3)

    // Should post human clarification comment
    expect(github.postIssueComment).toHaveBeenCalledWith(
      'acme',
      'api',
      42,
      'human help prompt',
    )

    // Should remove the auto-review label
    expect(github.removeLabel).toHaveBeenCalledWith('acme', 'api', 42, 'auto-review')
  })

  it('respects configured maxReviewRounds', async () => {
    const config: PipelineConfig = { ...baseConfig, maxReviewRounds: 1 }
    const limitedProcessor = new PRReviewProcessor(
      github as unknown as GitHubClient,
      ai as unknown as AIRouter,
      git as unknown as GitOperations,
      config,
    )

    const comments = [{ path: 'src/index.ts', line: 5, body: 'issue' }]
    ai.invokeStructured.mockResolvedValue({
      success: true,
      data: { approved: false, comments },
      rawOutput: '',
      model: 'claude' as const,
    })

    const result = await limitedProcessor.processReview(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.reviewRounds).toBe(1)
    // With maxRounds=1, no fix is attempted (last round exits early)
    expect(ai.invokeAgent).not.toHaveBeenCalled()
  })

  it('uses configured autoReviewLabel when removing label', async () => {
    const config: PipelineConfig = { ...baseConfig, autoReviewLabel: 'ready-for-review' }
    const customProcessor = new PRReviewProcessor(
      github as unknown as GitHubClient,
      ai as unknown as AIRouter,
      git as unknown as GitOperations,
      config,
    )

    const comments = [{ path: 'src/index.ts', line: 5, body: 'issue' }]
    ai.invokeStructured.mockResolvedValue({
      success: true,
      data: { approved: false, comments },
      rawOutput: '',
      model: 'claude' as const,
    })

    await customProcessor.processReview(repo, pr)

    expect(github.removeLabel).toHaveBeenCalledWith('acme', 'api', 42, 'ready-for-review')
  })

  // -------------------------------------------------------------------------
  // AI fix failure → breaks out of loop
  // -------------------------------------------------------------------------

  it('breaks out of loop when AI fix fails and asks for human help', async () => {
    const comments = [{ path: 'src/index.ts', line: 5, body: 'bug' }]

    ai.invokeStructured
      .mockResolvedValueOnce({
        success: true,
        data: { approved: false, comments },
        rawOutput: '',
        model: 'claude' as const,
      })
      // Final review for clarification prompt
      .mockResolvedValueOnce({
        success: true,
        data: { approved: false, comments },
        rawOutput: '',
        model: 'claude' as const,
      })

    ai.invokeAgent.mockRejectedValueOnce(new Error('AI agent crashed'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = await processor.processReview(repo, pr)
    warnSpy.mockRestore()

    expect(result.merged).toBe(false)
    expect(result.error).toBe('max review rounds exceeded')
  })

  it('breaks out of loop when commitAll returns false (no changes from AI)', async () => {
    const comments = [{ path: 'src/index.ts', line: 5, body: 'bug' }]

    ai.invokeStructured
      .mockResolvedValueOnce({
        success: true,
        data: { approved: false, comments },
        rawOutput: '',
        model: 'claude' as const,
      })
      // Final review for clarification prompt
      .mockResolvedValueOnce({
        success: true,
        data: { approved: false, comments: [] },
        rawOutput: '',
        model: 'claude' as const,
      })

    git.commitAll.mockResolvedValueOnce(false)

    const result = await processor.processReview(repo, pr)

    expect(result.merged).toBe(false)
    // Should not try to push if no commit
    expect(git.push).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Review comments posting failure (non-fatal)
  // -------------------------------------------------------------------------

  it('continues when posting review comments fails', async () => {
    const comments = [{ path: 'src/index.ts', line: 5, body: 'bug' }]

    ai.invokeStructured
      .mockResolvedValueOnce({
        success: true,
        data: { approved: false, comments },
        rawOutput: '',
        model: 'claude' as const,
      })
      .mockResolvedValueOnce({
        success: true,
        data: { approved: true, comments: [] },
        rawOutput: '',
        model: 'claude' as const,
      })

    github.postReviewComments.mockRejectedValueOnce(new Error('GitHub API error'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = await processor.processReview(repo, pr)
    warnSpy.mockRestore()

    // Should still continue to fix and re-review
    expect(result.merged).toBe(true)
    expect(ai.invokeAgent).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Exception handling
  // -------------------------------------------------------------------------

  it('returns error when clone fails', async () => {
    git.cloneFull.mockRejectedValue(new Error('clone failed'))

    const result = await processor.processReview(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('clone failed')
    expect(result.reviewRounds).toBe(0)
  })

  it('returns error when getPRDiff fails', async () => {
    github.getPRDiff.mockRejectedValue(new Error('diff not available'))

    const result = await processor.processReview(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('diff not available')
  })

  it('returns error when merge fails', async () => {
    github.mergePullRequest.mockRejectedValue(new Error('merge conflict'))

    const result = await processor.processReview(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('merge conflict')
  })

  it('handles non-Error thrown values', async () => {
    git.cloneFull.mockRejectedValue('string error')

    const result = await processor.processReview(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('string error')
  })

  it('always calls cleanupTempDir on exception', async () => {
    git.cloneFull.mockRejectedValue(new Error('clone failed'))

    await processor.processReview(repo, pr)

    expect(cleanupTempDir).toHaveBeenCalledWith('/tmp/review-test')
  })

  it('swallows comment posting failure silently', async () => {
    github.postIssueComment.mockRejectedValue(new Error('GitHub API down'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = await processor.processReview(repo, pr)
    warnSpy.mockRestore()

    // Should still have merged (comment failure is non-fatal)
    expect(result.merged).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Label removal failure (best effort)
  // -------------------------------------------------------------------------

  it('does not fail when label removal throws', async () => {
    const comments = [{ path: 'src/index.ts', line: 5, body: 'issue' }]
    ai.invokeStructured.mockResolvedValue({
      success: true,
      data: { approved: false, comments },
      rawOutput: '',
      model: 'claude' as const,
    })
    github.removeLabel.mockRejectedValue(new Error('not found'))

    const result = await processor.processReview(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('max review rounds exceeded')
  })

  // -------------------------------------------------------------------------
  // AI review returns null/undefined data
  // -------------------------------------------------------------------------

  it('handles AI review returning null data as not approved', async () => {
    ai.invokeStructured
      .mockResolvedValueOnce({
        success: false,
        data: undefined,
        rawOutput: '',
        model: 'claude' as const,
      })
      // The fix attempt will fail since there are no comments to build a fix from
      // but the empty comments array means we still enter the fix path
      .mockResolvedValueOnce({
        success: true,
        data: { approved: true, comments: [] },
        rawOutput: '',
        model: 'claude' as const,
      })

    const result = await processor.processReview(repo, pr)

    // First round: data undefined → approved=false, comments=[]
    // Since comments is empty but approved is false, it enters fix path with empty fix prompt
    // Then round 2 approves
    expect(result.merged).toBe(true)
  })
})
