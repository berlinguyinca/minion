import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RepoConfig, Issue } from '../../../src/types/index.js'

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import of the module under test
// ---------------------------------------------------------------------------

vi.mock('../../../src/github/client.js', () => ({
  GitHubClient: vi.fn(),
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
import { GitOperations } from '../../../src/git/operations.js'
import { StateManager } from '../../../src/config/state.js'
import { cleanupTempDir } from '../../../src/git/index.js'
import { runTests } from '../../../src/pipeline/test-runner.js'
import type { AIProvider } from '../../../src/types/index.js'

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

function makeAIMock() {
  return {
    model: 'map' as const,
    handlesFullPipeline: true,
    invokeAgent: vi.fn().mockResolvedValue({
      success: true,
      filesWritten: ['src/index.ts'],
      stdout: '',
      stderr: '',
    }),
    invokeStructured: vi.fn().mockRejectedValue(new Error('MAPWrapper does not support invokeStructured')),
  }
}

function makeGitMock() {
  return {
    clone: vi.fn().mockResolvedValue(undefined),
    createBranch: vi.fn().mockResolvedValue(undefined),
    commitAll: vi.fn().mockResolvedValue(true),
    push: vi.fn().mockResolvedValue(undefined),
    getChangedFiles: vi.fn().mockResolvedValue(['src/index.ts']),
  }
}

function makeStateMock() {
  return {
    shouldProcessIssue: vi.fn().mockReturnValue(true),
    markIssueOutcome: vi.fn(),
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
    ai = makeAIMock()
    git = makeGitMock()
    state = makeStateMock()

    vi.mocked(GitHubClient).mockImplementation(() => github as unknown as GitHubClient)
    vi.mocked(GitOperations).mockImplementation(() => git as unknown as GitOperations)
    vi.mocked(StateManager).mockImplementation(() => state as unknown as StateManager)

    vi.mocked(runTests).mockReturnValue({ passed: true, output: 'All tests pass' })

    processor = new IssueProcessor(
      github as unknown as GitHubClient,
      ai as unknown as AIProvider,
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
    expect(result.modelUsed).toBe('map')
  })

  it('skips already-processed issues without cloning', async () => {
    state.shouldProcessIssue.mockReturnValue(false)

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
    // Draft PRs should be marked as 'partial' in state (eligible for retry)
    expect(state.markIssueOutcome).toHaveBeenCalledWith('acme/api', 42, expect.objectContaining({ status: 'partial' }))
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

  it('posts issue comment with PR URL, test status, and model used', async () => {
    await processor.processIssue(repo, issue)

    expect(github.postIssueComment).toHaveBeenCalledWith(
      'acme',
      'api',
      42,
      expect.stringMatching(/PR|pull request/i)
    )

    const commentBody = vi.mocked(github.postIssueComment).mock.calls[0]?.[3] as string
    expect(commentBody).toContain('https://github.com/acme/api/pull/101')
    expect(commentBody).toMatch(/model|map/i)
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

    expect(state.markIssueOutcome).toHaveBeenCalledWith('acme/api', 42, expect.objectContaining({ status: 'success' }))
  })

  it('stops before PR creation when there is nothing to commit', async () => {
    git.commitAll.mockResolvedValue(false)

    const result = await processor.processIssue(repo, issue)

    expect(result.success).toBe(false)
    expect(github.createPullRequest).not.toHaveBeenCalled()
    expect(github.createDraftPullRequest).not.toHaveBeenCalled()
    expect(github.postIssueComment).toHaveBeenCalledWith(
      'acme',
      'api',
      42,
      expect.stringMatching(/no commit|no PR/i),
    )
    expect(state.markIssueOutcome).toHaveBeenCalledWith('acme/api', 42, expect.objectContaining({ status: 'failure' }))
  })

  it('fails before PR creation when push fails', async () => {
    git.push.mockRejectedValue(new Error('push failed'))

    const result = await processor.processIssue(repo, issue)

    expect(result.success).toBe(false)
    expect(github.createPullRequest).not.toHaveBeenCalled()
    expect(github.createDraftPullRequest).not.toHaveBeenCalled()
    expect(state.markIssueOutcome).toHaveBeenCalledWith('acme/api', 42, expect.objectContaining({ status: 'failure' }))
  })

  it('AI total failure: creates draft PR with ai-failed label, still cleans up', async () => {
    ai.invokeAgent.mockRejectedValue(new Error('AI completely unavailable'))

    await processor.processIssue(repo, issue)

    // Should still create a draft PR
    expect(github.createDraftPullRequest).toHaveBeenCalled()
    // Should add ai-failed label
    expect(github.addLabel).toHaveBeenCalledWith('acme', 'api', expect.any(Number), 'ai-failed')
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

  // -------------------------------------------------------------------------
  // Review/follow-up catch blocks
  // -------------------------------------------------------------------------

  it('warns and continues when review AI invokeAgent throws', async () => {
    // First invokeAgent succeeds (spec+impl), second throws (review)
    ai.invokeAgent
      .mockResolvedValueOnce({ success: true, filesWritten: ['src/index.ts'], stdout: '', stderr: '' })
      .mockRejectedValueOnce(new Error('review AI unavailable'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await processor.processIssue(repo, issue)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Review AI call failed'),
      expect.any(String),
    )
    expect(result.success).toBe(true)

    warnSpy.mockRestore()
  })

  it('warns and continues when follow-up invokeAgent throws after review comments', async () => {
    // First call: spec+impl success
    // Second call: review returns structured comments
    // Third call: follow-up throws
    ai.invokeAgent
      .mockResolvedValueOnce({ success: true, filesWritten: ['src/index.ts'], stdout: '', stderr: '' })
      .mockResolvedValueOnce({
        success: true,
        filesWritten: [],
        stdout: JSON.stringify({ comments: [{ path: 'b.ts', line: 5, body: 'needs work' }] }),
        stderr: '',
      })
      .mockRejectedValueOnce(new Error('follow-up agent failed'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await processor.processIssue(repo, issue)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Review follow-up failed'),
      expect.any(String),
    )
    expect(result.success).toBe(true)

    warnSpy.mockRestore()
  })

  it('warns and returns filesChanged as [] when getChangedFiles throws', async () => {
    git.getChangedFiles.mockRejectedValue(new Error('git diff failed'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await processor.processIssue(repo, issue)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to get changed files'),
      expect.any(String),
    )
    expect(result.filesChanged).toEqual([])
    expect(result.success).toBe(true)

    warnSpy.mockRestore()
  })

  // -------------------------------------------------------------------------
  // Branch coverage for defensive code paths
  // -------------------------------------------------------------------------

  it('uses "main" as base branch when repo.defaultBranch is undefined', async () => {
    const repoNoDefault: RepoConfig = { owner: 'acme', name: 'api' } // no defaultBranch

    const result = await processor.processIssue(repoNoDefault, issue)

    // git.clone should be called with 'main' as the base branch
    expect(git.clone).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'main',
    )
    expect(result.success).toBe(true)
  })

  it('wraps non-Error throws from AI into an Error (aiFailure branch)', async () => {
    // invokeAgent throws a non-Error value (e.g. a string)
    ai.invokeAgent.mockRejectedValue('string error value')

    const result = await processor.processIssue(repo, issue)

    // Should still create draft PR with ai-failed label
    expect(github.createDraftPullRequest).toHaveBeenCalled()
    expect(result.success).toBe(true) // PR was created, result is "success" from pipeline perspective
  })

  it('shows failing tests in status comment when no commit and tests fail', async () => {
    vi.mocked(runTests).mockReturnValue({ passed: false, output: 'FAIL: tests failed' })
    git.commitAll.mockResolvedValue(false)

    const result = await processor.processIssue(repo, issue)

    expect(result.success).toBe(false)
    // The comment should show failing tests
    const commentBody = vi.mocked(github.postIssueComment).mock.calls[0]?.[3] as string
    expect(commentBody).toContain('❌')
  })

  it('postStatusComment silently swallows errors when postIssueComment throws', async () => {
    git.push.mockRejectedValueOnce(new Error('push failed'))
    github.postIssueComment.mockRejectedValue(new Error('comment API down'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await processor.processIssue(repo, issue)
    expect(result.success).toBe(false)

    warnSpy.mockRestore()
  })

  it('postStatusComment uses String(err) for non-Error thrown by postIssueComment', async () => {
    git.push.mockRejectedValueOnce(new Error('push failed'))
    github.postIssueComment.mockRejectedValue('non-error-value')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await processor.processIssue(repo, issue)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to post status comment'),
      'non-error-value',
    )
    expect(result.success).toBe(false)

    warnSpy.mockRestore()
  })

  it('outer catch uses String(err) when a non-Error is thrown and prUrl is undefined', async () => {
    git.clone.mockRejectedValue('string clone error')

    const result = await processor.processIssue(repo, issue)

    expect(result.success).toBe(false)
    expect(result.error).toBe('string clone error')
  })

  it('outer catch includes prUrl in result when PR was created before the error', async () => {
    github.postIssueComment.mockRejectedValue(new Error('summary comment failed'))

    const result = await processor.processIssue(repo, issue)

    expect(result.success).toBe(false)
    expect(result.prUrl).toBe('https://github.com/acme/api/pull/101')
  })

  // -------------------------------------------------------------------------
  // MAP v2 headless contract
  // -------------------------------------------------------------------------

  it('v2: posts answer and data steps as issue comments before PR creation', async () => {
    const v2Stdout = JSON.stringify({
      version: 2,
      steps: [
        { id: 's1', agent: 'claude', task: 'Analyse issue', status: 'done', outputType: 'answer', output: 'The answer is 42.' },
        { id: 's2', agent: 'claude', task: 'Gather metrics', status: 'done', outputType: 'data', output: '{"count":7}' },
        { id: 's3', agent: 'claude', task: 'Write code', status: 'done', outputType: 'files', filesCreated: ['src/a.ts'] },
      ],
      dag: { nodes: [], edges: [] },
    })
    ai.invokeAgent.mockResolvedValue({
      success: true,
      filesWritten: ['src/a.ts'],
      stdout: v2Stdout,
      stderr: '',
    })

    await processor.processIssue(repo, issue)

    // Should post comments for answer and data steps only
    const issueCommentCalls = vi.mocked(github.postIssueComment).mock.calls
    const stepComments = issueCommentCalls.filter(([, , , body]) =>
      typeof body === 'string' && body.includes('MAP Agent Output'),
    )
    expect(stepComments).toHaveLength(2)
    expect(stepComments[0]?.[3]).toContain('answer')
    expect(stepComments[0]?.[3]).toContain('The answer is 42.')
    expect(stepComments[1]?.[3]).toContain('data')
    expect(stepComments[1]?.[3]).toContain('{"count":7}')
  })

  it('v2: files-only steps do not post extra comments', async () => {
    const v2FilesOnly = JSON.stringify({
      version: 2,
      steps: [
        { id: 's1', agent: 'claude', task: 'Write code', status: 'done', outputType: 'files', filesCreated: ['src/b.ts'] },
      ],
      dag: { nodes: [], edges: [] },
    })
    ai.invokeAgent.mockResolvedValue({
      success: true,
      filesWritten: ['src/b.ts'],
      stdout: v2FilesOnly,
      stderr: '',
    })

    await processor.processIssue(repo, issue)

    const issueCommentCalls = vi.mocked(github.postIssueComment).mock.calls
    const stepComments = issueCommentCalls.filter(([, , , body]) =>
      typeof body === 'string' && body.includes('MAP Agent Output'),
    )
    expect(stepComments).toHaveLength(0)
  })

  it('v2: non-JSON stdout is silently ignored', async () => {
    ai.invokeAgent.mockResolvedValue({
      success: true,
      filesWritten: [],
      stdout: 'plain text output',
      stderr: '',
    })

    const result = await processor.processIssue(repo, issue)

    // Should complete successfully without errors
    expect(result.success).toBe(true)
  })
})
