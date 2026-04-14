import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RepoConfig, PRInfo, PipelineConfig } from '../../../src/types/index.js'

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
  createTempDir: vi.fn().mockReturnValue('/tmp/review-test'),
  cleanupTempDir: vi.fn(),
}))

vi.mock('../../../src/pipeline/prompts.js', () => ({
  buildAutoReviewPrompt: vi.fn().mockReturnValue('auto-review prompt'),
  buildSplitPlanPrompt: vi.fn().mockReturnValue('split-plan prompt'),
}))

vi.mock('../../../src/pipeline/test-runner.js', () => ({
  detectTestCommand: vi.fn().mockReturnValue('pnpm test'),
  runTests: vi.fn().mockReturnValue({ passed: true, output: 'All pass' }),
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { PRReviewProcessor } from '../../../src/pipeline/pr-review-processor.js'
import { cleanupTempDir } from '../../../src/git/index.js'
import { detectTestCommand, runTests } from '../../../src/pipeline/test-runner.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SMALL_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1 +1 @@
-old
+new`

// A diff with 5+ files and 100+ lines to be splittable
function makeLargeDiff(fileCount: number): string {
  const lines: string[] = []
  for (let i = 0; i < fileCount; i++) {
    lines.push(`diff --git a/src/file${i}.ts b/src/file${i}.ts`)
    lines.push(`--- a/src/file${i}.ts`)
    lines.push(`+++ b/src/file${i}.ts`)
    lines.push('@@ -1,10 +1,10 @@')
    for (let j = 0; j < 20; j++) {
      lines.push(`-old line ${j}`)
      lines.push(`+new line ${j}`)
    }
  }
  return lines.join('\n')
}

function makeGitHubMock() {
  return {
    getPRDiff: vi.fn().mockResolvedValue(SMALL_DIFF),
    mergePullRequest: vi.fn().mockResolvedValue(undefined),
    closePullRequest: vi.fn().mockResolvedValue(undefined),
    createPullRequest: vi.fn().mockResolvedValue({ number: 200, url: 'https://github.com/acme/api/pull/200', isDraft: false }),
    addLabel: vi.fn().mockResolvedValue(undefined),
    postIssueComment: vi.fn().mockResolvedValue(undefined),
    deleteRemoteBranch: vi.fn().mockResolvedValue(undefined),
  }
}

function makeAIMock(verdict: 'merge' | 'split' = 'merge') {
  return {
    model: 'map' as const,
    handlesFullPipeline: true,
    invokeAgent: vi.fn().mockResolvedValue({
      success: true,
      filesWritten: [],
      stdout: JSON.stringify({
        verdict,
        confidence: 0.9,
        reasoning: 'test reasoning',
        concerns: [],
        // split plan fields (used when verdict is split)
        groups: [
          { name: 'core', description: 'Core logic', files: ['src/file0.ts', 'src/file1.ts', 'src/file2.ts'] },
          { name: 'tests', description: 'Test files', files: ['src/file3.ts', 'src/file4.ts'] },
        ],
        reasoning_split: 'separate concerns',
      }),
      stderr: '',
    }),
    invokeStructured: vi.fn().mockRejectedValue(new Error('not supported')),
  }
}

function makeGitMock() {
  return {
    clone: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(undefined),
    checkout: vi.fn().mockResolvedValue(undefined),
    createBranch: vi.fn().mockResolvedValue(undefined),
    checkoutFiles: vi.fn().mockResolvedValue(undefined),
    commitAll: vi.fn().mockResolvedValue(true),
    push: vi.fn().mockResolvedValue(undefined),
  }
}

const repo: RepoConfig = { owner: 'acme', name: 'api', defaultBranch: 'main' }
const pr: PRInfo = {
  number: 42,
  url: 'https://github.com/acme/api/pull/42',
  isDraft: false,
  head: 'ai/42-add-feature',
  base: 'main',
  title: '[AI] add feature',
  labels: ['ai-generated'],
}
const baseConfig: PipelineConfig = { repos: [repo], maxIssuesPerRun: 10 }

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
    // Re-set test-runner mocks (clearAllMocks removes mockReturnValue)
    vi.mocked(detectTestCommand).mockReturnValue('pnpm test')
    vi.mocked(runTests).mockReturnValue({ passed: true, output: 'All pass' })
    github = makeGitHubMock()
    ai = makeAIMock('merge')
    git = makeGitMock()
    processor = new PRReviewProcessor(github as never, ai as never, git as never, baseConfig)
  })

  // -------------------------------------------------------------------------
  // Auto-merge happy path
  // -------------------------------------------------------------------------

  it('auto-merges when AI verdict is merge and tests pass', async () => {
    const result = await processor.reviewPR(repo, pr)

    expect(result.merged).toBe(true)
    expect(result.verdict).toBe('merge')
    expect(result.splitInto).toEqual([])
    expect(github.mergePullRequest).toHaveBeenCalledWith('acme', 'api', 42, 'merge')
  })

  it('posts success comment after auto-merge', async () => {
    await processor.reviewPR(repo, pr)

    expect(github.postIssueComment).toHaveBeenCalledWith(
      'acme', 'api', 42,
      expect.stringMatching(/auto-merged/i),
    )
  })

  // -------------------------------------------------------------------------
  // Auto-merge with test failure
  // -------------------------------------------------------------------------

  it('does not merge when tests fail', async () => {
    vi.mocked(runTests).mockReturnValue({ passed: false, output: 'FAILED' })

    const result = await processor.reviewPR(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toBe('tests failed')
    expect(github.mergePullRequest).not.toHaveBeenCalled()
  })

  it('posts failure comment when tests fail', async () => {
    vi.mocked(runTests).mockReturnValue({ passed: false, output: 'FAILED' })

    await processor.reviewPR(repo, pr)

    expect(github.postIssueComment).toHaveBeenCalledWith(
      'acme', 'api', 42,
      expect.stringMatching(/tests failed/i),
    )
  })

  // -------------------------------------------------------------------------
  // Auto-merge with tests disabled
  // -------------------------------------------------------------------------

  it('skips tests when autoMergeRequireTests is false', async () => {
    const config: PipelineConfig = { repos: [repo], maxIssuesPerRun: 10, autoMergeRequireTests: false }
    processor = new PRReviewProcessor(github as never, ai as never, git as never, config)

    const result = await processor.reviewPR(repo, pr)

    expect(result.merged).toBe(true)
    expect(runTests).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Merge method from config
  // -------------------------------------------------------------------------

  it('uses configured merge method', async () => {
    const config: PipelineConfig = { repos: [repo], maxIssuesPerRun: 10, mergeMethod: 'squash' }
    processor = new PRReviewProcessor(github as never, ai as never, git as never, config)

    await processor.reviewPR(repo, pr)

    expect(github.mergePullRequest).toHaveBeenCalledWith('acme', 'api', 42, 'squash')
  })

  // -------------------------------------------------------------------------
  // Split happy path
  // -------------------------------------------------------------------------

  it('splits when AI verdict is split and PR is large enough', async () => {
    ai = makeAIMock('split')
    // First call: verdict=split, second call: split plan
    ai.invokeAgent
      .mockResolvedValueOnce({
        success: true, filesWritten: [], stderr: '',
        stdout: JSON.stringify({ verdict: 'split', confidence: 0.8, reasoning: 'mixed concerns', concerns: [] }),
      })
      .mockResolvedValueOnce({
        success: true, filesWritten: [], stderr: '',
        stdout: JSON.stringify({
          groups: [
            { name: 'core', description: 'Core logic', files: ['src/file0.ts', 'src/file1.ts', 'src/file2.ts'] },
            { name: 'tests', description: 'Test files', files: ['src/file3.ts', 'src/file4.ts'] },
          ],
          reasoning: 'separate concerns',
        }),
      })
    github.getPRDiff.mockResolvedValue(makeLargeDiff(6))
    github.createPullRequest
      .mockResolvedValueOnce({ number: 100, url: 'url1', isDraft: false })
      .mockResolvedValueOnce({ number: 101, url: 'url2', isDraft: false })
    processor = new PRReviewProcessor(github as never, ai as never, git as never, baseConfig)

    const result = await processor.reviewPR(repo, pr)

    expect(result.verdict).toBe('split')
    expect(result.merged).toBe(false)
    expect(result.splitInto).toEqual([100, 101])
    expect(github.closePullRequest).toHaveBeenCalledWith('acme', 'api', 42)
    expect(github.deleteRemoteBranch).toHaveBeenCalledWith('acme', 'api', 'ai/42-add-feature')
  })

  it('adds ai-generated and ai-split-child labels to child PRs', async () => {
    ai.invokeAgent
      .mockResolvedValueOnce({
        success: true, filesWritten: [], stderr: '',
        stdout: JSON.stringify({ verdict: 'split', confidence: 0.8, reasoning: 'mixed', concerns: [] }),
      })
      .mockResolvedValueOnce({
        success: true, filesWritten: [], stderr: '',
        stdout: JSON.stringify({
          groups: [
            { name: 'a', description: 'Group A', files: ['src/file0.ts', 'src/file1.ts', 'src/file2.ts'] },
            { name: 'b', description: 'Group B', files: ['src/file3.ts', 'src/file4.ts'] },
          ],
          reasoning: 'test',
        }),
      })
    github.getPRDiff.mockResolvedValue(makeLargeDiff(6))
    github.createPullRequest
      .mockResolvedValueOnce({ number: 200, url: 'u1', isDraft: false })
      .mockResolvedValueOnce({ number: 201, url: 'u2', isDraft: false })
    processor = new PRReviewProcessor(github as never, ai as never, git as never, baseConfig)

    await processor.reviewPR(repo, pr)

    expect(github.addLabel).toHaveBeenCalledWith('acme', 'api', 200, 'ai-generated')
    expect(github.addLabel).toHaveBeenCalledWith('acme', 'api', 200, 'ai-split-child')
    expect(github.addLabel).toHaveBeenCalledWith('acme', 'api', 201, 'ai-generated')
    expect(github.addLabel).toHaveBeenCalledWith('acme', 'api', 201, 'ai-split-child')
  })

  // -------------------------------------------------------------------------
  // Split child PRs cannot be re-split
  // -------------------------------------------------------------------------

  it('merges instead of splitting when PR has ai-split-child label', async () => {
    ai = makeAIMock('split')
    ai.invokeAgent.mockResolvedValueOnce({
      success: true,
      filesWritten: [],
      stdout: JSON.stringify({ verdict: 'split', confidence: 0.8, reasoning: 'complex', concerns: [] }),
      stderr: '',
    })
    const splitChildPR: PRInfo = { ...pr, labels: ['ai-generated', 'ai-split-child'] }
    processor = new PRReviewProcessor(github as never, ai as never, git as never, baseConfig)

    const result = await processor.reviewPR(repo, splitChildPR)

    // Should merge instead of split (anti-recursion)
    expect(result.verdict).toBe('merge')
    expect(result.merged).toBe(true)
    expect(github.closePullRequest).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Small PRs are not split even with split verdict
  // -------------------------------------------------------------------------

  it('merges small PRs even when AI says split (too few files)', async () => {
    ai.invokeAgent.mockResolvedValueOnce({
      success: true,
      filesWritten: [],
      stdout: JSON.stringify({ verdict: 'split', confidence: 0.7, reasoning: 'small but mixed', concerns: [] }),
      stderr: '',
    })
    // Default SMALL_DIFF has only 1 file — below threshold
    processor = new PRReviewProcessor(github as never, ai as never, git as never, baseConfig)

    const result = await processor.reviewPR(repo, pr)

    expect(result.verdict).toBe('merge')
    expect(result.merged).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('returns error when getPRDiff throws', async () => {
    github.getPRDiff.mockRejectedValue(new Error('diff unavailable'))

    const result = await processor.reviewPR(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toContain('diff unavailable')
  })

  it('returns error when merge API throws', async () => {
    github.mergePullRequest.mockRejectedValue(new Error('not mergeable'))

    const result = await processor.reviewPR(repo, pr)

    expect(result.merged).toBe(false)
    expect(result.error).toContain('not mergeable')
  })

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  it('always cleans up temp dir', async () => {
    github.mergePullRequest.mockRejectedValue(new Error('fail'))

    await processor.reviewPR(repo, pr)

    expect(cleanupTempDir).toHaveBeenCalledWith('/tmp/review-test')
  })

  it('cleans up temp dir on success', async () => {
    await processor.reviewPR(repo, pr)

    expect(cleanupTempDir).toHaveBeenCalledWith('/tmp/review-test')
  })

  // -------------------------------------------------------------------------
  // Invalid split plan
  // -------------------------------------------------------------------------

  it('returns error when split plan has fewer than 2 groups', async () => {
    ai.invokeAgent
      .mockResolvedValueOnce({
        success: true, filesWritten: [], stderr: '',
        stdout: JSON.stringify({ verdict: 'split', confidence: 0.8, reasoning: 'complex', concerns: [] }),
      })
      .mockResolvedValueOnce({
        success: true, filesWritten: [], stderr: '',
        stdout: JSON.stringify({ groups: [{ name: 'all', description: 'everything', files: ['a.ts'] }], reasoning: 'x' }),
      })
    github.getPRDiff.mockResolvedValue(makeLargeDiff(6))
    processor = new PRReviewProcessor(github as never, ai as never, git as never, baseConfig)

    const result = await processor.reviewPR(repo, pr)

    expect(result.splitInto).toEqual([])
    expect(result.error).toContain('fewer than 2 groups')
  })

  it('returns error when split plan has duplicate files across groups', async () => {
    ai.invokeAgent
      .mockResolvedValueOnce({
        success: true, filesWritten: [], stderr: '',
        stdout: JSON.stringify({ verdict: 'split', confidence: 0.8, reasoning: 'complex', concerns: [] }),
      })
      .mockResolvedValueOnce({
        success: true, filesWritten: [], stderr: '',
        stdout: JSON.stringify({
          groups: [
            { name: 'a', description: 'A', files: ['src/file0.ts'] },
            { name: 'b', description: 'B', files: ['src/file0.ts'] }, // duplicate!
          ],
          reasoning: 'x',
        }),
      })
    github.getPRDiff.mockResolvedValue(makeLargeDiff(6))
    processor = new PRReviewProcessor(github as never, ai as never, git as never, baseConfig)

    const result = await processor.reviewPR(repo, pr)

    expect(result.splitInto).toEqual([])
    expect(result.error).toContain('multiple groups')
  })
})
