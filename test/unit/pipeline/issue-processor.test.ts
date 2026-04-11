import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RepoConfig, Issue, AIModel } from '../../../src/types/index.js'

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import of the module under test
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

vi.mock('../../../src/pipeline/test-runner.js', () => ({
  detectTestCommand: vi.fn(),
  runTests: vi.fn(),
}))

vi.mock('../../../src/pipeline/prompts.js', () => ({
  buildSpecPrompt: vi.fn().mockReturnValue('spec prompt'),
  buildImplementationPrompt: vi.fn().mockReturnValue('impl prompt'),
  buildReviewPrompt: vi.fn().mockReturnValue('review prompt'),
  buildFollowUpPrompt: vi.fn().mockReturnValue('followup prompt'),
}))

vi.mock('../../../src/config/state.js', () => ({
  StateManager: vi.fn(),
}))

vi.mock('../../../src/git/index.js', () => ({
  createTempDir: vi.fn().mockReturnValue('/tmp/test-dir'),
  cleanupTempDir: vi.fn(),
  buildBranchName: vi.fn().mockReturnValue('ai/42-add-rate-limiting'),
  GitOperations: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { IssueProcessor } from '../../../src/pipeline/issue-processor.js'
import { GitHubClient } from '../../../src/github/client.js'
import { AIRouter } from '../../../src/ai/router.js'
import { GitOperations } from '../../../src/git/operations.js'
import { StateManager } from '../../../src/config/state.js'
import { createTempDir, cleanupTempDir } from '../../../src/git/index.js'
import { detectTestCommand, runTests } from '../../../src/pipeline/test-runner.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGitHubMock() {
  return {
    fetchOpenIssues: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ number: 101, url: 'https://github.com/acme/api/pull/101', isDraft: false }),
    createDraftPullRequest: vi.fn().mockResolvedValue({ number: 102, url: 'https://github.com/acme/api/pull/102', isDraft: true }),
    addLabel: vi.fn().mockResolvedValue(undefined),
    postIssueComment: vi.fn().mockResolvedValue(undefined),
    postReviewComments: vi.fn().mockResolvedValue(undefined),
    getPRDiff: vi.fn().mockResolvedValue('diff content'),
    branchExists: vi.fn().mockResolvedValue(false),
    deleteRemoteBranch: vi.fn().mockResolvedValue(undefined),
    fetchOpenPRForBranch: vi.fn().mockResolvedValue(null),
  }
}

function makeAIMock(model: AIModel = 'claude') {
  return {
    invokeStructured: vi.fn().mockResolvedValue({
      success: true,
      data: { spec: 'Generated spec text', filesToCreate: [], testStrategy: 'unit tests' },
      rawOutput: 'raw',
      model,
    }),
    invokeAgent: vi.fn().mockResolvedValue({
      success: true,
      filesWritten: ['src/index.ts'],
      stdout: '',
      stderr: '',
      model,
    }),
  }
}

function makeGitMock() {
  return {
    clone: vi.fn().mockResolvedValue(undefined),
    createBranch: vi.fn().mockResolvedValue(undefined),
    commitAll: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
    getChangedFiles: vi.fn().mockResolvedValue(['src/index.ts']),
  }
}

function makeStateMock() {
  return {
    isIssueProcessed: vi.fn().mockReturnValue(false),
    markIssueProcessed: vi.fn(),
    getAvailableModel: vi.fn().mockReturnValue('claude' as AIModel),
    incrementUsage: vi.fn(),
  }
}

const repo: RepoConfig = {
  owner: 'acme',
  name: 'api',
  defaultBranch: 'main',
}

const issue: Issue = {
  id: 1,
  number: 42,
  title: 'Add rate limiting to API endpoints',
  body: 'We need rate limiting.',
  url: 'https://github.com/acme/api/issues/42',
  repoOwner: 'acme',
  repoName: 'api',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IssueProcessor', () => {
  let github: ReturnType<typeof makeGitHubMock>
  let ai: ReturnType<typeof makeAIMock>
  let git: ReturnType<typeof makeGitMock>
  let state: ReturnType<typeof makeStateMock>
  let processor: IssueProcessor

  beforeEach(() => {
    vi.clearAllMocks()

    github = makeGitHubMock()
    ai = makeAIMock('claude')
    git = makeGitMock()
    state = makeStateMock()

    vi.mocked(GitHubClient).mockImplementation(() => github as unknown as GitHubClient)
    vi.mocked(AIRouter).mockImplementation(() => ai as unknown as AIRouter)
    vi.mocked(GitOperations).mockImplementation(() => git as unknown as GitOperations)
    vi.mocked(StateManager).mockImplementation(() => state as unknown as StateManager)

    vi.mocked(createTempDir).mockReturnValue('/tmp/test-dir')
    vi.mocked(cleanupTempDir).mockReturnValue(undefined)
    vi.mocked(detectTestCommand).mockReturnValue('pnpm test')
    vi.mocked(runTests).mockReturnValue({ passed: true, output: 'All tests pass' })

    processor = new IssueProcessor(
      github as unknown as GitHubClient,
      ai as unknown as AIRouter,
      git as unknown as GitOperations,
      state as unknown as StateManager,
    )
  })

  it('happy path: returns ProcessingResult with success: true, isDraft: false, testsPassed: true', async () => {
    const result = await processor.processIssue(repo, issue)

    expect(result.success).toBe(true)
    expect(result.isDraft).toBe(false)
    expect(result.testsPassed).toBe(true)
    expect(result.issueNumber).toBe(42)
    expect(result.repoFullName).toBe('acme/api')
  })

  it('skips already-processed issues without cloning', async () => {
    state.isIssueProcessed.mockReturnValue(true)

    const result = await processor.processIssue(repo, issue)

    expect(result.success).toBe(true)
    expect(git.clone).not.toHaveBeenCalled()
  })

  it('creates draft PR when tests fail, result has isDraft: true and testsPassed: false', async () => {
    vi.mocked(runTests).mockReturnValue({ passed: false, output: 'FAILED: 2 tests' })

    const result = await processor.processIssue(repo, issue)

    expect(github.createDraftPullRequest).toHaveBeenCalled()
    expect(github.createPullRequest).not.toHaveBeenCalled()
    expect(result.isDraft).toBe(true)
    expect(result.testsPassed).toBe(false)
  })

  it('creates regular PR when tests pass, result has isDraft: false and testsPassed: true', async () => {
    vi.mocked(runTests).mockReturnValue({ passed: true, output: 'All pass' })

    const result = await processor.processIssue(repo, issue)

    expect(github.createPullRequest).toHaveBeenCalled()
    expect(github.createDraftPullRequest).not.toHaveBeenCalled()
    expect(result.isDraft).toBe(false)
    expect(result.testsPassed).toBe(true)
  })

  it('always adds ai-generated label to PR after creation', async () => {
    await processor.processIssue(repo, issue)

    expect(github.addLabel).toHaveBeenCalledWith('acme', 'api', expect.any(Number), 'ai-generated')
  })

  it('posts issue comment with PR URL, scope, test status, and model used', async () => {
    await processor.processIssue(repo, issue)

    expect(github.postIssueComment).toHaveBeenCalledWith(
      'acme',
      'api',
      42,
      expect.stringMatching(/PR|pull request/i)
    )

    const commentBody = vi.mocked(github.postIssueComment).mock.calls[0]?.[3] as string
    expect(commentBody).toContain('https://github.com/acme/api/pull/101')
    expect(commentBody).toMatch(/model|claude/i)
    expect(commentBody).toMatch(/test|pass|fail/i)
    expect(commentBody).toMatch(/file|changed/i)
  })

  it('calls cleanupTempDir with the temp dir path on success', async () => {
    await processor.processIssue(repo, issue)

    expect(cleanupTempDir).toHaveBeenCalledWith('/tmp/test-dir')
  })

  it('calls cleanupTempDir even if an intermediate step throws', async () => {
    git.commitAll.mockRejectedValueOnce(new Error('commit failed'))

    await processor.processIssue(repo, issue)

    expect(cleanupTempDir).toHaveBeenCalledWith('/tmp/test-dir')
  })

  it('marks issue as processed in state after successful run', async () => {
    await processor.processIssue(repo, issue)

    expect(state.markIssueProcessed).toHaveBeenCalledWith('acme/api', 42)
  })

  it('AI total failure: creates draft PR with ai-failed label and posts error comment, still cleans up', async () => {
    ai.invokeStructured.mockRejectedValue(new Error('AI completely unavailable'))
    ai.invokeAgent.mockRejectedValue(new Error('AI completely unavailable'))

    await processor.processIssue(repo, issue)

    // Should still create a draft PR
    expect(github.createDraftPullRequest).toHaveBeenCalled()
    // Should add ai-failed label
    expect(github.addLabel).toHaveBeenCalledWith('acme', 'api', expect.any(Number), 'ai-failed')
    // Should post a comment explaining failure
    expect(github.postIssueComment).toHaveBeenCalled()
    // Must clean up
    expect(cleanupTempDir).toHaveBeenCalledWith('/tmp/test-dir')
  })

  it('branch conflict with open PR: skips issue when branch exists and open PR found', async () => {
    github.branchExists.mockResolvedValue(true)
    github.fetchOpenPRForBranch.mockResolvedValue({ number: 99, url: 'https://github.com/acme/api/pull/99', isDraft: false })

    await processor.processIssue(repo, issue)

    expect(git.clone).not.toHaveBeenCalled()
    expect(github.deleteRemoteBranch).not.toHaveBeenCalled()
  })

  it('branch conflict orphan: deletes remote branch then proceeds when branch exists but no open PR', async () => {
    github.branchExists.mockResolvedValue(true)
    github.fetchOpenPRForBranch.mockResolvedValue(null)

    await processor.processIssue(repo, issue)

    expect(github.deleteRemoteBranch).toHaveBeenCalledWith('acme', 'api', 'ai/42-add-rate-limiting')
    expect(git.clone).toHaveBeenCalled()
  })

  it('model used in result matches the model returned by AIRouter', async () => {
    const aiWithCodex = makeAIMock('codex')
    const processorWithCodex = new IssueProcessor(
      github as unknown as GitHubClient,
      aiWithCodex as unknown as AIRouter,
      git as unknown as GitOperations,
      state as unknown as StateManager,
    )

    const result = await processorWithCodex.processIssue(repo, issue)

    expect(result.modelUsed).toBe('codex')
  })
})
