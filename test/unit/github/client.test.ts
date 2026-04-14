import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'

// Mock @octokit/rest before importing GitHubClient
vi.mock('@octokit/rest', () => {
  const mockListForRepo = vi.fn()
  const mockAddLabels = vi.fn()
  const mockRemoveLabel = vi.fn()
  const mockCreateComment = vi.fn()
  const mockCreatePR = vi.fn()
  const mockCreateReview = vi.fn()
  const mockGetPR = vi.fn()
  const mockGetRef = vi.fn()
  const mockDeleteRef = vi.fn()
  const mockListPRs = vi.fn()
  const mockListComments = vi.fn()
  const mockMergePR = vi.fn()

  const mockOctokit = {
    issues: {
      listForRepo: mockListForRepo,
      addLabels: mockAddLabels,
      removeLabel: mockRemoveLabel,
      createComment: mockCreateComment,
      listComments: mockListComments,
    },
    pulls: {
      create: mockCreatePR,
      createReview: mockCreateReview,
      get: mockGetPR,
      list: mockListPRs,
      merge: mockMergePR,
    },
    git: {
      getRef: mockGetRef,
      deleteRef: mockDeleteRef,
    },
  }

  return {
    Octokit: vi.fn(() => mockOctokit),
    __mockOctokit: mockOctokit,
  }
})

import { GitHubClient } from '../../../src/github/client.js'
import * as OctokitModule from '@octokit/rest'

// Helper to extract the underlying mock octokit instance
function getMockOctokit() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (OctokitModule as any).__mockOctokit as {
    issues: {
      listForRepo: Mock
      addLabels: Mock
      removeLabel: Mock
      createComment: Mock
      listComments: Mock
    }
    pulls: {
      create: Mock
      createReview: Mock
      get: Mock
      list: Mock
      merge: Mock
    }
    git: {
      getRef: Mock
      deleteRef: Mock
    }
  }
}

describe('GitHubClient', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, GITHUB_TOKEN: 'test-token-123' }
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('throws Error when GITHUB_TOKEN env var is not set', () => {
      delete process.env['GITHUB_TOKEN']
      expect(() => new GitHubClient()).toThrow(/GITHUB_TOKEN/i)
    })

    it('does not throw when GITHUB_TOKEN is set', () => {
      expect(() => new GitHubClient()).not.toThrow()
    })

    it('accepts an explicit token and does not require env var', () => {
      delete process.env['GITHUB_TOKEN']
      expect(() => new GitHubClient('explicit-token')).not.toThrow()
    })
  })

  // -----------------------------------------------------------------------
  // fetchOpenIssues
  // -----------------------------------------------------------------------
  describe('fetchOpenIssues', () => {
    it('calls issues.listForRepo and returns typed Issue[]', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listForRepo.mockResolvedValueOnce({
        data: [
          {
            id: 1,
            number: 10,
            title: 'Bug: crash on startup',
            body: 'The app crashes',
            html_url: 'https://github.com/acme/api/issues/10',
          },
        ],
        headers: {},
      })

      const client = new GitHubClient()
      const issues = await client.fetchOpenIssues('acme', 'api')

      expect(mocks.issues.listForRepo).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'acme',
          repo: 'api',
          state: 'open',
          per_page: 100,
        })
      )
      expect(issues).toHaveLength(1)
      expect(issues[0]).toMatchObject({
        id: 1,
        number: 10,
        title: 'Bug: crash on startup',
        body: 'The app crashes',
        url: 'https://github.com/acme/api/issues/10',
        repoOwner: 'acme',
        repoName: 'api',
      })
    })

    it('filters out pull requests (items with pull_request field set)', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listForRepo.mockResolvedValueOnce({
        data: [
          {
            id: 1,
            number: 10,
            title: 'Real issue',
            body: 'issue body',
            html_url: 'https://github.com/acme/api/issues/10',
          },
          {
            id: 2,
            number: 11,
            title: 'A PR disguised as issue',
            body: 'pr body',
            html_url: 'https://github.com/acme/api/pull/11',
            pull_request: { url: 'https://api.github.com/repos/acme/api/pulls/11' },
          },
        ],
        headers: {},
      })

      const client = new GitHubClient()
      const issues = await client.fetchOpenIssues('acme', 'api')

      expect(issues).toHaveLength(1)
      expect(issues[0]?.number).toBe(10)
    })

    it('handles pagination by fetching all pages', async () => {
      const mocks = getMockOctokit()

      // First page returns link header with next
      mocks.issues.listForRepo
        .mockResolvedValueOnce({
          data: [
            {
              id: 1,
              number: 1,
              title: 'Issue 1',
              body: 'body',
              html_url: 'https://github.com/acme/api/issues/1',
            },
          ],
          headers: {
            link: '<https://api.github.com/repos/acme/api/issues?page=2>; rel="next"',
          },
        })
        .mockResolvedValueOnce({
          data: [
            {
              id: 2,
              number: 2,
              title: 'Issue 2',
              body: 'body',
              html_url: 'https://github.com/acme/api/issues/2',
            },
          ],
          headers: {},
        })

      const client = new GitHubClient()
      const issues = await client.fetchOpenIssues('acme', 'api')

      expect(mocks.issues.listForRepo).toHaveBeenCalledTimes(2)
      expect(issues).toHaveLength(2)
      expect(issues.map((i) => i.number)).toEqual([1, 2])
    })
  })

  // -----------------------------------------------------------------------
  // createPullRequest
  // -----------------------------------------------------------------------
  describe('createPullRequest', () => {
    it('creates a regular PR and returns PR number and URL', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.create.mockResolvedValueOnce({
        data: {
          number: 42,
          html_url: 'https://github.com/acme/api/pull/42',
          draft: false,
        },
      })

      const client = new GitHubClient()
      const result = await client.createPullRequest({
        owner: 'acme',
        name: 'api',
        title: 'Fix: crash on startup',
        body: 'Fixes #10',
        head: 'fix/crash',
        base: 'main',
      })

      expect(mocks.pulls.create).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'acme',
          repo: 'api',
          title: 'Fix: crash on startup',
          body: 'Fixes #10',
          head: 'fix/crash',
          base: 'main',
          draft: false,
        })
      )
      expect(result).toMatchObject({
        number: 42,
        url: 'https://github.com/acme/api/pull/42',
        isDraft: false,
      })
    })

    it('creates a draft PR when draft: true is passed', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.create.mockResolvedValueOnce({
        data: {
          number: 43,
          html_url: 'https://github.com/acme/api/pull/43',
          draft: true,
        },
      })

      const client = new GitHubClient()
      const result = await client.createDraftPullRequest({
        owner: 'acme',
        name: 'api',
        title: 'WIP: fix crash',
        body: 'Work in progress',
        head: 'fix/crash-draft',
        base: 'main',
      })

      expect(mocks.pulls.create).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: true,
        })
      )
      expect(result.isDraft).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // createPullRequest — error handling
  // -----------------------------------------------------------------------
  describe('createPullRequest error handling', () => {
    it('re-throws 401 errors with GITHUB_TOKEN message', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.create.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.createPullRequest({ owner: 'acme', name: 'api', title: 't', body: 'b', head: 'h', base: 'main' })).rejects.toThrow(/GITHUB_TOKEN/i)
    })

    it('re-throws 404 errors with repo not found message', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.create.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
      const client = new GitHubClient()
      await expect(client.createPullRequest({ owner: 'acme', name: 'api', title: 't', body: 'b', head: 'h', base: 'main' })).rejects.toThrow(/not found|no access/i)
    })
  })

  // -----------------------------------------------------------------------
  // addLabel
  // -----------------------------------------------------------------------
  describe('addLabel', () => {
    it('calls issues.addLabels with correct params', async () => {
      const mocks = getMockOctokit()
      mocks.issues.addLabels.mockResolvedValueOnce({ data: [] })

      const client = new GitHubClient()
      await client.addLabel('acme', 'api', 42, 'ai-generated')

      expect(mocks.issues.addLabels).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        issue_number: 42,
        labels: ['ai-generated'],
      })
    })
  })

  // -----------------------------------------------------------------------
  // addLabel — error handling
  // -----------------------------------------------------------------------
  describe('addLabel error handling', () => {
    it('re-throws 401 errors with GITHUB_TOKEN message', async () => {
      const mocks = getMockOctokit()
      mocks.issues.addLabels.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.addLabel('acme', 'api', 42, 'ai-generated')).rejects.toThrow(/GITHUB_TOKEN/i)
    })

    it('re-throws 404 errors with repo not found message', async () => {
      const mocks = getMockOctokit()
      mocks.issues.addLabels.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
      const client = new GitHubClient()
      await expect(client.addLabel('acme', 'api', 42, 'ai-generated')).rejects.toThrow(/not found|no access/i)
    })
  })

  // -----------------------------------------------------------------------
  // postIssueComment
  // -----------------------------------------------------------------------
  describe('postIssueComment', () => {
    it('calls issues.createComment with correct params', async () => {
      const mocks = getMockOctokit()
      mocks.issues.createComment.mockResolvedValueOnce({ data: { id: 1 } })

      const client = new GitHubClient()
      await client.postIssueComment('acme', 'api', 10, 'Hello from bot')

      expect(mocks.issues.createComment).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        issue_number: 10,
        body: 'Hello from bot',
      })
    })
  })

  // -----------------------------------------------------------------------
  // postReviewComments
  // -----------------------------------------------------------------------
  describe('postReviewComments', () => {
    it('calls pulls.createReview with COMMENT event and comment array', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.createReview.mockResolvedValueOnce({ data: { id: 5 } })

      const client = new GitHubClient()
      const comments = [
        { path: 'src/index.ts', line: 10, body: 'Consider null check' },
        { path: 'src/utils.ts', line: 5, body: 'Missing semicolon' },
      ]
      await client.postReviewComments('acme', 'api', 42, comments)

      expect(mocks.pulls.createReview).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        pull_number: 42,
        event: 'COMMENT',
        comments: [
          { path: 'src/index.ts', line: 10, body: 'Consider null check' },
          { path: 'src/utils.ts', line: 5, body: 'Missing semicolon' },
        ],
      })
    })
  })

  // -----------------------------------------------------------------------
  // getPRDiff
  // -----------------------------------------------------------------------
  describe('getPRDiff', () => {
    it('calls pulls.get with diff Accept header and returns diff string', async () => {
      const mocks = getMockOctokit()
      const diffContent = 'diff --git a/src/index.ts b/src/index.ts\n+++ added line'
      mocks.pulls.get.mockResolvedValueOnce({ data: diffContent })

      const client = new GitHubClient()
      const diff = await client.getPRDiff('acme', 'api', 42)

      expect(mocks.pulls.get).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        pull_number: 42,
        mediaType: { format: 'diff' },
      })
      expect(diff).toBe(diffContent)
    })
  })

  // -----------------------------------------------------------------------
  // branchExists
  // -----------------------------------------------------------------------
  describe('branchExists', () => {
    it('returns true when branch is found', async () => {
      const mocks = getMockOctokit()
      mocks.git.getRef.mockResolvedValueOnce({ data: { ref: 'refs/heads/main' } })

      const client = new GitHubClient()
      const result = await client.branchExists('acme', 'api', 'main')

      expect(result).toBe(true)
      expect(mocks.git.getRef).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        ref: 'heads/main',
      })
    })

    it('returns false on 404', async () => {
      const mocks = getMockOctokit()
      const notFoundError = Object.assign(new Error('Not Found'), { status: 404 })
      mocks.git.getRef.mockRejectedValueOnce(notFoundError)

      const client = new GitHubClient()
      const result = await client.branchExists('acme', 'api', 'nonexistent-branch')

      expect(result).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // deleteRemoteBranch
  // -----------------------------------------------------------------------
  describe('deleteRemoteBranch', () => {
    it('calls git.deleteRef with correct ref', async () => {
      const mocks = getMockOctokit()
      mocks.git.deleteRef.mockResolvedValueOnce({})

      const client = new GitHubClient()
      await client.deleteRemoteBranch('acme', 'api', 'fix/old-branch')

      expect(mocks.git.deleteRef).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        ref: 'heads/fix/old-branch',
      })
    })
  })

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    it('re-throws 401 errors with message mentioning GITHUB_TOKEN', async () => {
      const mocks = getMockOctokit()
      const authError = Object.assign(new Error('Bad credentials'), { status: 401 })
      mocks.issues.listForRepo.mockRejectedValueOnce(authError)

      const client = new GitHubClient()
      await expect(client.fetchOpenIssues('acme', 'api')).rejects.toThrow(/GITHUB_TOKEN/i)
    })

    it('re-throws 403 errors with message mentioning GITHUB_TOKEN', async () => {
      const mocks = getMockOctokit()
      const forbiddenError = Object.assign(new Error('Forbidden'), { status: 403 })
      mocks.issues.listForRepo.mockRejectedValueOnce(forbiddenError)

      const client = new GitHubClient()
      await expect(client.fetchOpenIssues('acme', 'api')).rejects.toThrow(/GITHUB_TOKEN/i)
    })

    it('re-throws 404 errors with descriptive message about repo not found or no access', async () => {
      const mocks = getMockOctokit()
      const notFoundError = Object.assign(new Error('Not Found'), { status: 404 })
      mocks.issues.listForRepo.mockRejectedValueOnce(notFoundError)

      const client = new GitHubClient()
      await expect(client.fetchOpenIssues('acme', 'api')).rejects.toThrow(
        /not found|no access|repository/i
      )
    })

    it('re-throws plain Error objects without modification', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listForRepo.mockRejectedValueOnce(new Error('Network timeout'))
      const client = new GitHubClient()
      await expect(client.fetchOpenIssues('acme', 'api')).rejects.toThrow('Network timeout')
    })
  })

  // -----------------------------------------------------------------------
  // fetchOpenPRForBranch
  // -----------------------------------------------------------------------
  describe('fetchOpenPRForBranch', () => {
    it('returns PRResult when an open PR exists for the branch', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.list.mockResolvedValueOnce({
        data: [{ number: 99, html_url: 'https://github.com/acme/api/pull/99', draft: false }],
      })
      const client = new GitHubClient()
      const result = await client.fetchOpenPRForBranch('acme', 'api', 'fix/branch')
      expect(result).toMatchObject({ number: 99, url: 'https://github.com/acme/api/pull/99', isDraft: false })
    })

    it('returns null when no open PR exists', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.list.mockResolvedValueOnce({ data: [] })
      const client = new GitHubClient()
      const result = await client.fetchOpenPRForBranch('acme', 'api', 'fix/branch')
      expect(result).toBeNull()
    })

    it('returns isDraft true for draft PRs', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.list.mockResolvedValueOnce({
        data: [{ number: 100, html_url: 'https://github.com/acme/api/pull/100', draft: true }],
      })
      const client = new GitHubClient()
      const result = await client.fetchOpenPRForBranch('acme', 'api', 'fix/branch')
      expect(result?.isDraft).toBe(true)
    })

    it('defaults isDraft to false when draft is undefined', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.list.mockResolvedValueOnce({
        data: [{ number: 101, html_url: 'https://github.com/acme/api/pull/101', draft: undefined }],
      })
      const client = new GitHubClient()
      const result = await client.fetchOpenPRForBranch('acme', 'api', 'fix/branch')
      expect(result?.isDraft).toBe(false)
    })

    it('re-throws 401 errors with GITHUB_TOKEN message', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.list.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.fetchOpenPRForBranch('acme', 'api', 'fix/branch')).rejects.toThrow(/GITHUB_TOKEN/i)
    })
  })

  // -----------------------------------------------------------------------
  // branchExists — additional branch coverage
  // -----------------------------------------------------------------------
  describe('branchExists non-404 error', () => {
    it('re-throws non-404 errors', async () => {
      const mocks = getMockOctokit()
      const serverError = Object.assign(new Error('Internal Server Error'), { status: 500 })
      mocks.git.getRef.mockRejectedValueOnce(serverError)
      const client = new GitHubClient()
      await expect(client.branchExists('acme', 'api', 'main')).rejects.toThrow('Internal Server Error')
    })
  })

  // -----------------------------------------------------------------------
  // Constructor with baseUrl
  // -----------------------------------------------------------------------
  describe('constructor with baseUrl', () => {
    it('passes baseUrl to Octokit constructor', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const OctokitConstructor = vi.mocked((OctokitModule as any).Octokit)
      new GitHubClient('token', 'https://custom.github.com/api/v3')
      expect(OctokitConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: 'https://custom.github.com/api/v3' })
      )
    })
  })

  // -----------------------------------------------------------------------
  // createPullRequest with draft undefined in response
  // -----------------------------------------------------------------------
  describe('createPullRequest draft undefined', () => {
    it('defaults isDraft to false when response.draft is undefined', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.create.mockResolvedValueOnce({
        data: { number: 44, html_url: 'https://github.com/acme/api/pull/44', draft: undefined },
      })
      const client = new GitHubClient()
      const result = await client.createPullRequest({
        owner: 'acme',
        name: 'api',
        title: 't',
        body: 'b',
        head: 'h',
        base: 'main',
      })
      expect(result.isDraft).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // fetchOpenIssues — pagination stops when link header is missing
  // -----------------------------------------------------------------------
  describe('fetchOpenIssues pagination', () => {
    it('stops pagination when link header is missing', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listForRepo.mockResolvedValueOnce({
        data: [{ id: 1, number: 1, title: 'Issue', body: '', html_url: 'url' }],
        headers: {},
      })
      const client = new GitHubClient()
      const issues = await client.fetchOpenIssues('acme', 'api')
      expect(mocks.issues.listForRepo).toHaveBeenCalledTimes(1)
      expect(issues).toHaveLength(1)
    })
  })

  // -----------------------------------------------------------------------
  // fetchOpenIssues — null body defaults to empty string
  // -----------------------------------------------------------------------
  describe('fetchOpenIssues null body', () => {
    it('maps null body to empty string', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listForRepo.mockResolvedValueOnce({
        data: [{ id: 5, number: 5, title: 'No body', body: null, html_url: 'https://github.com/acme/api/issues/5' }],
        headers: {},
      })
      const client = new GitHubClient()
      const issues = await client.fetchOpenIssues('acme', 'api')
      expect(issues[0]?.body).toBe('')
    })
  })

  // -----------------------------------------------------------------------
  // getPRDiff — error handling
  // -----------------------------------------------------------------------
  describe('getPRDiff error handling', () => {
    it('re-throws 401 errors with GITHUB_TOKEN message', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.get.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.getPRDiff('acme', 'api', 42)).rejects.toThrow(/GITHUB_TOKEN/i)
    })

    it('re-throws 404 errors with repo not found message', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.get.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
      const client = new GitHubClient()
      await expect(client.getPRDiff('acme', 'api', 42)).rejects.toThrow(/not found|no access/i)
    })
  })

  // -----------------------------------------------------------------------
  // deleteRemoteBranch — error handling
  // -----------------------------------------------------------------------
  describe('deleteRemoteBranch error handling', () => {
    it('re-throws 401 errors with GITHUB_TOKEN message', async () => {
      const mocks = getMockOctokit()
      mocks.git.deleteRef.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.deleteRemoteBranch('acme', 'api', 'fix/branch')).rejects.toThrow(/GITHUB_TOKEN/i)
    })

    it('re-throws 404 errors with repo not found message', async () => {
      const mocks = getMockOctokit()
      mocks.git.deleteRef.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
      const client = new GitHubClient()
      await expect(client.deleteRemoteBranch('acme', 'api', 'fix/branch')).rejects.toThrow(/not found|no access/i)
    })
  })

  // -----------------------------------------------------------------------
  // postIssueComment — error handling
  // -----------------------------------------------------------------------
  describe('postIssueComment error handling', () => {
    it('re-throws 401 errors with GITHUB_TOKEN message', async () => {
      const mocks = getMockOctokit()
      mocks.issues.createComment.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.postIssueComment('acme', 'api', 10, 'body')).rejects.toThrow(/GITHUB_TOKEN/i)
    })

    it('re-throws 404 errors with repo not found message', async () => {
      const mocks = getMockOctokit()
      mocks.issues.createComment.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
      const client = new GitHubClient()
      await expect(client.postIssueComment('acme', 'api', 10, 'body')).rejects.toThrow(/not found|no access/i)
    })
  })

  // -----------------------------------------------------------------------
  // postReviewComments — error handling
  // -----------------------------------------------------------------------
  describe('postReviewComments error handling', () => {
    it('re-throws 401 errors with GITHUB_TOKEN message', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.createReview.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.postReviewComments('acme', 'api', 42, [])).rejects.toThrow(/GITHUB_TOKEN/i)
    })

    it('re-throws 404 errors with repo not found message', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.createReview.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
      const client = new GitHubClient()
      await expect(client.postReviewComments('acme', 'api', 42, [])).rejects.toThrow(/not found|no access/i)
    })
  })

  // -----------------------------------------------------------------------
  // removeLabel
  // -----------------------------------------------------------------------
  describe('removeLabel', () => {
    it('calls issues.removeLabel with correct params', async () => {
      const mocks = getMockOctokit()
      mocks.issues.removeLabel.mockResolvedValueOnce({ data: {} })

      const client = new GitHubClient()
      await client.removeLabel('acme', 'api', 42, 'auto-review')

      expect(mocks.issues.removeLabel).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        issue_number: 42,
        name: 'auto-review',
      })
    })

    it('silently succeeds when label is already removed (404)', async () => {
      const mocks = getMockOctokit()
      mocks.issues.removeLabel.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))

      const client = new GitHubClient()
      // Should not throw
      await expect(client.removeLabel('acme', 'api', 42, 'auto-review')).resolves.toBeUndefined()
    })

    it('re-throws 401 errors with GITHUB_TOKEN message', async () => {
      const mocks = getMockOctokit()
      mocks.issues.removeLabel.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))

      const client = new GitHubClient()
      await expect(client.removeLabel('acme', 'api', 42, 'auto-review')).rejects.toThrow(/GITHUB_TOKEN/i)
    })

    it('re-throws non-Octokit errors', async () => {
      const mocks = getMockOctokit()
      mocks.issues.removeLabel.mockRejectedValueOnce(new Error('network error'))

      const client = new GitHubClient()
      await expect(client.removeLabel('acme', 'api', 42, 'auto-review')).rejects.toThrow('network error')
    })
  })

  // -----------------------------------------------------------------------
  // mergePullRequest
  // -----------------------------------------------------------------------
  describe('mergePullRequest', () => {
    it('calls pulls.merge with correct params and default method', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.merge.mockResolvedValueOnce({ data: {} })

      const client = new GitHubClient()
      await client.mergePullRequest('acme', 'api', 42)

      expect(mocks.pulls.merge).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        pull_number: 42,
        merge_method: 'merge',
      })
    })

    it('calls pulls.merge with specified method', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.merge.mockResolvedValueOnce({ data: {} })

      const client = new GitHubClient()
      await client.mergePullRequest('acme', 'api', 42, 'squash')

      expect(mocks.pulls.merge).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        pull_number: 42,
        merge_method: 'squash',
      })
    })

    it('re-throws 401 errors with GITHUB_TOKEN message', async () => {
      const mocks = getMockOctokit()
      mocks.pulls.merge.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))

      const client = new GitHubClient()
      await expect(client.mergePullRequest('acme', 'api', 42)).rejects.toThrow(/GITHUB_TOKEN/i)
    })
  })

  // -----------------------------------------------------------------------
  // listPRComments
  // -----------------------------------------------------------------------
  describe('listPRComments', () => {
    it('returns mapped comment objects', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listComments.mockResolvedValueOnce({
        data: [
          { id: 1, body: 'looks good', user: { login: 'dev' }, created_at: '2024-01-01T00:00:00Z' },
          { id: 2, body: null, user: null, created_at: '2024-01-02T00:00:00Z' },
        ],
      })

      const client = new GitHubClient()
      const comments = await client.listPRComments('acme', 'api', 42)

      expect(comments).toHaveLength(2)
      expect(comments[0]).toEqual({
        id: 1,
        body: 'looks good',
        user: 'dev',
        createdAt: '2024-01-01T00:00:00Z',
      })
      expect(comments[1]).toEqual({
        id: 2,
        body: '',
        user: '',
        createdAt: '2024-01-02T00:00:00Z',
      })
    })
  })
})
