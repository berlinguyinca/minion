import { describe, it, expect, vi } from 'vitest'
import type { RepoConfig } from '../../../src/types/index.js'
import { ExplicitIssueRunner } from '../../../src/pipeline/explicit-runner.js'

function makeGitHub() {
  return {
    fetchIssueDetail: vi.fn().mockResolvedValue({
      number: 42,
      title: 'Fix bug',
      body: 'Details',
      url: 'https://github.com/acme/api/issues/42',
      labels: ['bug'],
    }),
  }
}

function makeProcessor() {
  return {
    processIssue: vi.fn().mockResolvedValue({
      issueNumber: 42,
      repoFullName: 'acme/api',
      success: true,
      isDraft: false,
      testsPassed: true,
      modelUsed: 'map',
      filesChanged: ['src/a.ts'],
    }),
  }
}

const repo: RepoConfig = { owner: 'acme', name: 'api', defaultBranch: 'main' }

describe('ExplicitIssueRunner', () => {
  it('fetches full issue detail and bypasses only issue eligibility', async () => {
    const github = makeGitHub()
    const processor = makeProcessor()
    const runner = new ExplicitIssueRunner(github as never, processor as never)

    const result = await runner.runIssue(repo, 42)

    expect(github.fetchIssueDetail).toHaveBeenCalledWith('acme', 'api', 42)
    expect(processor.processIssue).toHaveBeenCalledWith(
      repo,
      expect.objectContaining({
        id: 42,
        number: 42,
        title: 'Fix bug',
        body: 'Details',
        url: 'https://github.com/acme/api/issues/42',
        repoOwner: 'acme',
        repoName: 'api',
        labels: ['bug'],
      }),
      { bypassEligibility: true },
    )
    expect(result.success).toBe(true)
  })
})
