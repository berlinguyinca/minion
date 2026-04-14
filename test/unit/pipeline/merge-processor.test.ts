import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RepoConfig, PRInfo, ConflictFile, PipelineConfig } from '../../../src/types/index.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../src/github/client.js', () => ({
  GitHubClient: vi.fn(),
}))

// AI provider mock (MAPWrapper implements AIProvider directly)

vi.mock('../../../src/git/operations.js', () => ({
  GitOperations: vi.fn(),
}))

vi.mock('../../../src/git/index.js', () => ({
  GitOperations: vi.fn(),
  createTempDir: vi.fn().mockReturnValue('/tmp/merge-test'),
  cleanupTempDir: vi.fn(),
}))

vi.mock('../../../src/pipeline/prompts.js', () => ({
  buildConflictResolutionPrompt: vi.fn().mockReturnValue('resolve this conflict'),
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { MergeProcessor } from '../../../src/pipeline/merge-processor.js'
import { GitHubClient } from '../../../src/github/client.js'
import { GitOperations } from '../../../src/git/operations.js'
import { createTempDir, cleanupTempDir } from '../../../src/git/index.js'
import type { AIProvider } from '../../../src/types/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGitHubMock() {
  return {
    postIssueComment: vi.fn().mockResolvedValue(undefined),
    mergePullRequest: vi.fn().mockResolvedValue(undefined),
    listOpenPRsWithLabel: vi.fn().mockResolvedValue([]),
    listPRComments: vi.fn().mockResolvedValue([]),
  }
}

function makeAIMock() {
  return {
    model: 'map' as const,
    handlesFullPipeline: true,
    invokeAgent: vi.fn().mockResolvedValue({
      success: true,
      filesWritten: [],
      stdout: JSON.stringify({ resolvedContent: 'resolved file content' }),
      stderr: '',
    }),
    invokeStructured: vi.fn().mockRejectedValue(new Error('not supported')),
  }
}

function makeGitMock() {
  return {
    cloneFull: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(undefined),
    checkout: vi.fn().mockResolvedValue(undefined),
    rebase: vi.fn().mockResolvedValue({ success: true, conflicts: [] }),
    continueRebase: vi.fn().mockResolvedValue({ success: true, conflicts: [] }),
    abortRebase: vi.fn().mockResolvedValue(undefined),
    resolveConflict: vi.fn().mockResolvedValue(undefined),
    forcePush: vi.fn().mockResolvedValue(undefined),
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
  head: 'ai/42-add-feature',
  base: 'main',
  title: '[AI] add feature',
  labels: ['ai-generated'],
}

const baseConfig: PipelineConfig = {
  repos: [repo],
  maxIssuesPerRun: 10,
}

const conflictFile: ConflictFile = {
  path: 'src/index.ts',
  content: '<<<<<<< HEAD\nfoo\n=======\nbar\n>>>>>>> origin/main',
  baseContent: 'original content',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MergeProcessor', () => {
  let github: ReturnType<typeof makeGitHubMock>
  let ai: ReturnType<typeof makeAIMock>
  let git: ReturnType<typeof makeGitMock>
  let processor: MergeProcessor

  beforeEach(() => {
    vi.clearAllMocks()

    github = makeGitHubMock()
    ai = makeAIMock()
    git = makeGitMock()

    vi.mocked(GitHubClient).mockImplementation(() => github as unknown as GitHubClient)
    vi.mocked(GitOperations).mockImplementation(() => git as unknown as GitOperations)

    vi.mocked(createTempDir).mockReturnValue('/tmp/merge-test')
    vi.mocked(cleanupTempDir).mockReturnValue(undefined)

    processor = new MergeProcessor(
      github as unknown as GitHubClient,
      ai as unknown as AIProvider,
      git as unknown as GitOperations,
      baseConfig,
    )
  })

  // -------------------------------------------------------------------------
  // Happy path: clean rebase
  // -------------------------------------------------------------------------

  it('happy path (clean rebase): clones, rebases, force-pushes, merges, posts success comment', async () => {
    git.rebase.mockResolvedValue({ success: true, conflicts: [] })

    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(true)
    expect(result.prNumber).toBe(42)
    expect(result.repoFullName).toBe('acme/api')
    expect(result.conflictsResolved).toBe(0)
    expect(result.error).toBeUndefined()

    // Verify the git operations sequence
    expect(git.cloneFull).toHaveBeenCalledWith(
      'https://github.com/acme/api.git',
      '/tmp/merge-test',
      'main',
    )
    expect(git.fetch).toHaveBeenCalledWith('/tmp/merge-test', 'origin', 'ai/42-add-feature')
    expect(git.checkout).toHaveBeenCalledWith('/tmp/merge-test', 'ai/42-add-feature')
    expect(git.fetch).toHaveBeenCalledWith('/tmp/merge-test', 'origin', 'main')
    expect(git.rebase).toHaveBeenCalledWith('/tmp/merge-test', 'origin/main')
    expect(git.forcePush).toHaveBeenCalledWith('/tmp/merge-test', 'ai/42-add-feature')
    expect(github.mergePullRequest).toHaveBeenCalledWith('acme', 'api', 42, 'merge')
  })

  it('happy path: posts success comment with clean rebase message', async () => {
    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(true)
    expect(github.postIssueComment).toHaveBeenCalledWith(
      'acme',
      'api',
      42,
      expect.stringMatching(/clean rebase onto.*main/),
    )
  })

  it('uses configured mergeMethod from config', async () => {
    const config: PipelineConfig = { ...baseConfig, mergeMethod: 'squash' }
    const squashProcessor = new MergeProcessor(
      github as unknown as GitHubClient,
      ai as unknown as AIProvider,
      git as unknown as GitOperations,
      config,
    )

    await squashProcessor.processMergeRequest(repo, pr)

    expect(github.mergePullRequest).toHaveBeenCalledWith('acme', 'api', 42, 'squash')
  })

  it('uses repo.cloneUrl when provided instead of github URL', async () => {
    const repoWithCloneUrl: RepoConfig = { ...repo, cloneUrl: 'git@github.com:acme/api.git' }

    await processor.processMergeRequest(repoWithCloneUrl, pr)

    expect(git.cloneFull).toHaveBeenCalledWith(
      'git@github.com:acme/api.git',
      '/tmp/merge-test',
      'main',
    )
  })

  it('always calls cleanupTempDir in finally block on success', async () => {
    await processor.processMergeRequest(repo, pr)

    expect(cleanupTempDir).toHaveBeenCalledWith('/tmp/merge-test')
  })

  // -------------------------------------------------------------------------
  // Conflict resolution
  // -------------------------------------------------------------------------

  it('conflict resolution: resolves conflict, continues rebase, force-pushes and merges', async () => {
    git.rebase.mockResolvedValueOnce({ success: false, conflicts: [conflictFile] })
    git.continueRebase.mockResolvedValueOnce({ success: true, conflicts: [] })

    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(true)
    expect(result.conflictsResolved).toBe(1)

    expect(ai.invokeAgent).toHaveBeenCalledWith(
      'resolve this conflict',
      '/tmp/merge-test',
    )
    expect(git.resolveConflict).toHaveBeenCalledWith(
      '/tmp/merge-test',
      'src/index.ts',
      'resolved file content',
    )
    expect(git.continueRebase).toHaveBeenCalledWith('/tmp/merge-test')
    expect(git.forcePush).toHaveBeenCalledWith('/tmp/merge-test', 'ai/42-add-feature')
    expect(github.mergePullRequest).toHaveBeenCalledWith('acme', 'api', 42, 'merge')
  })

  it('conflict resolution: posts success comment mentioning AI-resolved conflicts', async () => {
    git.rebase.mockResolvedValueOnce({ success: false, conflicts: [conflictFile] })
    git.continueRebase.mockResolvedValueOnce({ success: true, conflicts: [] })

    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(true)
    expect(github.postIssueComment).toHaveBeenCalledWith(
      'acme',
      'api',
      42,
      expect.stringMatching(/1 AI-resolved conflict/),
    )
  })

  it('conflict resolution: handles multiple conflict files in one round', async () => {
    const conflict2: ConflictFile = { path: 'src/utils.ts', content: 'conflict', baseContent: '' }
    git.rebase.mockResolvedValueOnce({ success: false, conflicts: [conflictFile, conflict2] })
    git.continueRebase.mockResolvedValueOnce({ success: true, conflicts: [] })

    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(true)
    expect(result.conflictsResolved).toBe(2)
    expect(ai.invokeAgent).toHaveBeenCalledTimes(2)
    expect(git.resolveConflict).toHaveBeenCalledTimes(2)
  })

  // -------------------------------------------------------------------------
  // AI resolution failure
  // -------------------------------------------------------------------------

  it('AI resolution failure: aborts rebase and posts failure comment when AI returns no resolvedContent', async () => {
    git.rebase.mockResolvedValueOnce({ success: false, conflicts: [conflictFile] })
    ai.invokeAgent.mockResolvedValueOnce({
      success: true,
      filesWritten: [],
      stdout: '',
      stderr: '',
    })

    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('AI conflict resolution failed')
    expect(git.abortRebase).toHaveBeenCalledWith('/tmp/merge-test')
    expect(github.postIssueComment).toHaveBeenCalledWith(
      'acme',
      'api',
      42,
      expect.stringMatching(/Unable to auto-merge.*AI could not resolve conflict.*src\/index\.ts/),
    )
    expect(git.forcePush).not.toHaveBeenCalled()
    expect(github.mergePullRequest).not.toHaveBeenCalled()
  })

  it('AI resolution failure: still calls cleanupTempDir', async () => {
    git.rebase.mockResolvedValueOnce({ success: false, conflicts: [conflictFile] })
    ai.invokeAgent.mockResolvedValueOnce({
      success: true,
      filesWritten: [],
      stdout: '',
      stderr: '',
    })

    await processor.processMergeRequest(repo, pr)

    expect(cleanupTempDir).toHaveBeenCalledWith('/tmp/merge-test')
  })

  it('AI resolution failure: when agent returns empty resolvedContent, treats as failure', async () => {
    git.rebase.mockResolvedValueOnce({ success: false, conflicts: [conflictFile] })
    ai.invokeAgent.mockResolvedValueOnce({
      success: true,
      filesWritten: [],
      stdout: JSON.stringify({ resolvedContent: '' }),
      stderr: '',
    })

    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('AI conflict resolution failed')
    expect(git.abortRebase).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Max rounds exceeded
  // -------------------------------------------------------------------------

  it('max rounds exceeded: aborts rebase after 10 rounds and posts failure comment', async () => {
    // Every rebase attempt produces a conflict (success=false)
    git.rebase.mockResolvedValue({ success: false, conflicts: [conflictFile] })
    git.continueRebase.mockResolvedValue({ success: false, conflicts: [conflictFile] })

    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('max rounds exceeded')
    expect(git.abortRebase).toHaveBeenCalledWith('/tmp/merge-test')
    expect(github.postIssueComment).toHaveBeenCalledWith(
      'acme',
      'api',
      42,
      expect.stringMatching(/exceeded maximum conflict resolution rounds/),
    )
    expect(git.forcePush).not.toHaveBeenCalled()
    expect(github.mergePullRequest).not.toHaveBeenCalled()
  })

  it('max rounds exceeded: still calls cleanupTempDir', async () => {
    git.rebase.mockResolvedValue({ success: false, conflicts: [conflictFile] })
    git.continueRebase.mockResolvedValue({ success: false, conflicts: [conflictFile] })

    await processor.processMergeRequest(repo, pr)

    expect(cleanupTempDir).toHaveBeenCalledWith('/tmp/merge-test')
  })

  it('max rounds exceeded: conflictsResolved reflects partial resolutions before abort', async () => {
    // First round resolves 1 conflict but continues to produce more
    git.rebase.mockResolvedValueOnce({ success: false, conflicts: [conflictFile] })
    // continueRebase always returns new conflicts (10 rounds total)
    git.continueRebase.mockResolvedValue({ success: false, conflicts: [conflictFile] })

    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(false)
    // 10 rounds × 1 conflict per round resolved before abort
    expect(result.conflictsResolved).toBe(10)
  })

  // -------------------------------------------------------------------------
  // Exception handling
  // -------------------------------------------------------------------------

  it('exception handling: git.cloneFull throws → returns merged:false with error message', async () => {
    git.cloneFull.mockRejectedValue(new Error('clone failed: network error'))

    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.prNumber).toBe(42)
    expect(result.repoFullName).toBe('acme/api')
    expect(result.error).toBe('clone failed: network error')
    expect(result.conflictsResolved).toBe(0)
  })

  it('exception handling: git.forcePush throws → returns merged:false with error', async () => {
    git.forcePush.mockRejectedValue(new Error('force push rejected'))

    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('force push rejected')
    expect(github.mergePullRequest).not.toHaveBeenCalled()
  })

  it('exception handling: github.mergePullRequest throws → returns merged:false with error', async () => {
    github.mergePullRequest.mockRejectedValue(new Error('merge conflict on GitHub'))

    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('merge conflict on GitHub')
  })

  it('exception handling: non-Error thrown → error is String(err)', async () => {
    git.cloneFull.mockRejectedValue('string error value')

    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('string error value')
  })

  it('exception handling: cleanupTempDir always called even when exception occurs', async () => {
    git.cloneFull.mockRejectedValue(new Error('clone failed'))

    await processor.processMergeRequest(repo, pr)

    expect(cleanupTempDir).toHaveBeenCalledWith('/tmp/merge-test')
  })

  it('exception handling: postMergeComment failure is silently swallowed', async () => {
    github.postIssueComment.mockRejectedValue(new Error('GitHub API down'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    // Should not throw even if comment posting fails
    const result = await processor.processMergeRequest(repo, pr)

    expect(result.merged).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to post comment'),
      expect.any(String),
    )

    warnSpy.mockRestore()
  })
})
