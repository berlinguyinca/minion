import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'

// Mock @octokit/rest before importing GitHubClient
vi.mock('@octokit/rest', () => {
  const mockListForRepo = vi.fn()
  const mockAddLabels = vi.fn()
  const mockCreateComment = vi.fn()
  const mockCreatePR = vi.fn()
  const mockCreateReview = vi.fn()
  const mockGetPR = vi.fn()
  const mockGetRef = vi.fn()
  const mockDeleteRef = vi.fn()
  const mockListPRs = vi.fn()
  const mockCreateIssue = vi.fn()
  const mockListLabelsForRepo = vi.fn()
  const mockListForAuthenticatedUser = vi.fn()
  const mockUpdateIssue = vi.fn()
  const mockGetIssue = vi.fn()
  const mockListComments = vi.fn()

  const mockOctokit = {
    issues: {
      listForRepo: mockListForRepo,
      addLabels: mockAddLabels,
      createComment: mockCreateComment,
      create: mockCreateIssue,
      listLabelsForRepo: mockListLabelsForRepo,
      update: mockUpdateIssue,
      get: mockGetIssue,
      listComments: mockListComments,
    },
    pulls: {
      create: mockCreatePR,
      createReview: mockCreateReview,
      get: mockGetPR,
      list: mockListPRs,
    },
    git: {
      getRef: mockGetRef,
      deleteRef: mockDeleteRef,
    },
    repos: {
      listForAuthenticatedUser: mockListForAuthenticatedUser,
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
      createComment: Mock
      create: Mock
      listLabelsForRepo: Mock
      update: Mock
      get: Mock
      listComments: Mock
    }
    pulls: {
      create: Mock
      createReview: Mock
      get: Mock
      list: Mock
    }
    git: {
      getRef: Mock
      deleteRef: Mock
    }
    repos: {
      listForAuthenticatedUser: Mock
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
            labels: [{ name: 'bug' }],
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
        labels: ['bug'],
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
            labels: [],
          },
          {
            id: 2,
            number: 11,
            title: 'A PR disguised as issue',
            body: 'pr body',
            html_url: 'https://github.com/acme/api/pull/11',
            pull_request: { url: 'https://api.github.com/repos/acme/api/pulls/11' },
            labels: [],
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
              labels: [],
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
              labels: [],
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

    it('fetches a single open issues page with pagination metadata', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listForRepo.mockResolvedValueOnce({
        data: [
          {
            id: 7,
            number: 7,
            title: 'Paged issue',
            body: 'body',
            html_url: 'https://github.com/acme/api/issues/7',
            labels: [{ name: 'perf' }],
          },
        ],
        headers: {
          link: '<https://api.github.com/repos/acme/api/issues?page=2>; rel="next"',
        },
      })

      const client = new GitHubClient()
      const page = await client.fetchOpenIssuesPage('acme', 'api', { page: 1, perPage: 25 })

      expect(mocks.issues.listForRepo).toHaveBeenCalledWith(expect.objectContaining({
        owner: 'acme',
        repo: 'api',
        state: 'open',
        per_page: 25,
        page: 1,
      }))
      expect(page).toMatchObject({
        hasNextPage: true,
        page: 1,
        perPage: 25,
      })
      expect(page.issues).toHaveLength(1)
      expect(page.issues[0]).toMatchObject({ number: 7, labels: ['perf'] })
    })

    it('passes AbortSignal and ETag headers to paged issue requests', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listForRepo.mockResolvedValueOnce({
        data: [],
        headers: { etag: '"abc123"' },
      })
      const controller = new AbortController()

      const client = new GitHubClient()
      const page = await client.fetchOpenIssuesPage('acme', 'api', {
        page: 2,
        perPage: 50,
        etag: '"old"',
        signal: controller.signal,
      })

      expect(mocks.issues.listForRepo).toHaveBeenCalledWith(expect.objectContaining({
        page: 2,
        per_page: 50,
        headers: { 'If-None-Match': '"old"' },
        request: { signal: controller.signal },
      }))
      expect(page.etag).toBe('"abc123"')
    })

    it('returns notModified metadata when GitHub responds with 304', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listForRepo.mockRejectedValueOnce(Object.assign(new Error('Not modified'), { status: 304 }))

      const client = new GitHubClient()
      const page = await client.fetchOpenIssuesPage('acme', 'api', { page: 1, perPage: 50, etag: '"same"' })

      expect(page).toMatchObject({
        issues: [],
        hasNextPage: false,
        page: 1,
        perPage: 50,
        notModified: true,
        etag: '"same"',
      })
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
        data: [{ id: 1, number: 1, title: 'Issue', body: '', html_url: 'url', labels: [] }],
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
        data: [{ id: 5, number: 5, title: 'No body', body: null, html_url: 'https://github.com/acme/api/issues/5', labels: [] }],
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
  // createIssue
  // -----------------------------------------------------------------------
  describe('createIssue', () => {
    it('creates an issue and returns number + url', async () => {
      const mocks = getMockOctokit()
      mocks.issues.create.mockResolvedValueOnce({
        data: { number: 42, html_url: 'https://github.com/acme/api/issues/42' },
      })
      const client = new GitHubClient()
      const result = await client.createIssue('acme', 'api', 'Bug title', 'Bug body')
      expect(result).toEqual({ number: 42, url: 'https://github.com/acme/api/issues/42' })
      expect(mocks.issues.create).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        title: 'Bug title',
        body: 'Bug body',
      })
    })

    it('passes labels when provided', async () => {
      const mocks = getMockOctokit()
      mocks.issues.create.mockResolvedValueOnce({
        data: { number: 43, html_url: 'https://github.com/acme/api/issues/43' },
      })
      const client = new GitHubClient()
      await client.createIssue('acme', 'api', 'Title', 'Body', ['bug', 'urgent'])
      expect(mocks.issues.create).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        title: 'Title',
        body: 'Body',
        labels: ['bug', 'urgent'],
      })
    })

    it('throws on 401 auth error', async () => {
      const mocks = getMockOctokit()
      mocks.issues.create.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.createIssue('acme', 'api', 'T', 'B')).rejects.toThrow(/authentication failed/i)
    })

    it('throws on 404 not found', async () => {
      const mocks = getMockOctokit()
      mocks.issues.create.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
      const client = new GitHubClient()
      await expect(client.createIssue('acme', 'api', 'T', 'B')).rejects.toThrow(/not found|no access/i)
    })

    it('throws on 403 forbidden', async () => {
      const mocks = getMockOctokit()
      mocks.issues.create.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { status: 403 }))
      const client = new GitHubClient()
      await expect(client.createIssue('acme', 'api', 'T', 'B')).rejects.toThrow(/authentication failed/i)
    })
  })

  // -----------------------------------------------------------------------
  // fetchLabels
  // -----------------------------------------------------------------------
  describe('fetchLabels', () => {
    it('returns sorted label names', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listLabelsForRepo.mockResolvedValueOnce({
        data: [{ name: 'enhancement' }, { name: 'bug' }, { name: 'docs' }],
        headers: {},
      })
      const client = new GitHubClient()
      const labels = await client.fetchLabels('acme', 'api')
      expect(labels).toEqual(['bug', 'docs', 'enhancement'])
    })

    it('paginates when link header has next', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listLabelsForRepo
        .mockResolvedValueOnce({
          data: [{ name: 'bug' }],
          headers: { link: '<url>; rel="next"' },
        })
        .mockResolvedValueOnce({
          data: [{ name: 'enhancement' }],
          headers: {},
        })
      const client = new GitHubClient()
      const labels = await client.fetchLabels('acme', 'api')
      expect(labels).toEqual(['bug', 'enhancement'])
      expect(mocks.issues.listLabelsForRepo).toHaveBeenCalledTimes(2)
    })

    it('returns empty array for repo with no labels', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listLabelsForRepo.mockResolvedValueOnce({ data: [], headers: {} })
      const client = new GitHubClient()
      const labels = await client.fetchLabels('acme', 'api')
      expect(labels).toEqual([])
    })

    it('throws on 401 auth error', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listLabelsForRepo.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.fetchLabels('acme', 'api')).rejects.toThrow(/authentication failed/i)
    })
  })

  // -----------------------------------------------------------------------
  // listUserRepos
  // -----------------------------------------------------------------------
  describe('listUserRepos', () => {
    it('returns repos with owner, name, description, pushedAt', async () => {
      const mocks = getMockOctokit()
      mocks.repos.listForAuthenticatedUser.mockResolvedValueOnce({
        data: [
          { owner: { login: 'alice' }, name: 'app', description: 'My app', pushed_at: '2024-01-15T10:00:00Z' },
          { owner: { login: 'org' }, name: 'lib', description: null, pushed_at: null },
        ],
        headers: {},
      })
      const client = new GitHubClient()
      const repos = await client.listUserRepos()
      expect(repos).toEqual([
        { owner: 'alice', name: 'app', description: 'My app', pushedAt: '2024-01-15T10:00:00Z' },
        { owner: 'org', name: 'lib', description: '', pushedAt: '' },
      ])
    })

    it('paginates when link header has next', async () => {
      const mocks = getMockOctokit()
      mocks.repos.listForAuthenticatedUser
        .mockResolvedValueOnce({
          data: [{ owner: { login: 'alice' }, name: 'app1', description: '', pushed_at: '2024-01-10T00:00:00Z' }],
          headers: { link: '<url>; rel="next"' },
        })
        .mockResolvedValueOnce({
          data: [{ owner: { login: 'alice' }, name: 'app2', description: '', pushed_at: '2024-01-09T00:00:00Z' }],
          headers: {},
        })
      const client = new GitHubClient()
      const repos = await client.listUserRepos()
      expect(repos).toHaveLength(2)
      expect(mocks.repos.listForAuthenticatedUser).toHaveBeenCalledTimes(2)
    })

    it('returns empty array when user has no repos', async () => {
      const mocks = getMockOctokit()
      mocks.repos.listForAuthenticatedUser.mockResolvedValueOnce({ data: [], headers: {} })
      const client = new GitHubClient()
      const repos = await client.listUserRepos()
      expect(repos).toEqual([])
    })

    it('throws on 401 auth error', async () => {
      const mocks = getMockOctokit()
      mocks.repos.listForAuthenticatedUser.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.listUserRepos()).rejects.toThrow(/authentication failed/i)
    })

    it('throws on 403 forbidden', async () => {
      const mocks = getMockOctokit()
      mocks.repos.listForAuthenticatedUser.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { status: 403 }))
      const client = new GitHubClient()
      await expect(client.listUserRepos()).rejects.toThrow(/authentication failed/i)
    })

    it('re-throws non-Octokit errors', async () => {
      const mocks = getMockOctokit()
      mocks.repos.listForAuthenticatedUser.mockRejectedValueOnce(new Error('Network failure'))
      const client = new GitHubClient()
      await expect(client.listUserRepos()).rejects.toThrow('Network failure')
    })
  })

  // -----------------------------------------------------------------------
  // updateIssue
  // -----------------------------------------------------------------------
  describe('updateIssue', () => {
    it('calls PATCH on the issue with title and body', async () => {
      const mocks = getMockOctokit()
      mocks.issues.update.mockResolvedValueOnce({ data: {} })
      const client = new GitHubClient()
      await client.updateIssue('acme', 'api', 7, 'New title', 'New body')
      expect(mocks.issues.update).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        issue_number: 7,
        title: 'New title',
        body: 'New body',
      })
    })

    it('throws on 401 auth error', async () => {
      const mocks = getMockOctokit()
      mocks.issues.update.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.updateIssue('acme', 'api', 7, 'T', 'B')).rejects.toThrow(/authentication failed/i)
    })

    it('throws on 404 not found', async () => {
      const mocks = getMockOctokit()
      mocks.issues.update.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
      const client = new GitHubClient()
      await expect(client.updateIssue('acme', 'api', 7, 'T', 'B')).rejects.toThrow(/not found|no access/i)
    })
  })

  // -----------------------------------------------------------------------
  // fetchIssueDetail
  // -----------------------------------------------------------------------
  describe('fetchIssueDetail', () => {
    it('returns number, title, body, url, and labels as string array', async () => {
      const mocks = getMockOctokit()
      mocks.issues.get.mockResolvedValueOnce({
        data: {
          number: 7,
          title: 'My issue',
          body: 'Issue body',
          html_url: 'https://github.com/acme/api/issues/7',
          labels: [{ name: 'bug' }, { name: 'urgent' }],
        },
      })
      const client = new GitHubClient()
      const result = await client.fetchIssueDetail('acme', 'api', 7)
      expect(mocks.issues.get).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        issue_number: 7,
      })
      expect(result).toEqual({
        number: 7,
        title: 'My issue',
        body: 'Issue body',
        url: 'https://github.com/acme/api/issues/7',
        labels: ['bug', 'urgent'],
      })
    })

    it('handles string labels and filters empty names', async () => {
      const mocks = getMockOctokit()
      mocks.issues.get.mockResolvedValueOnce({
        data: {
          number: 8,
          title: 'Mixed labels',
          body: 'body',
          html_url: 'https://github.com/acme/api/issues/8',
          labels: ['string-label', { name: 'object-label' }, { name: undefined }],
        },
      })
      const client = new GitHubClient()
      const result = await client.fetchIssueDetail('acme', 'api', 8)
      expect(result.labels).toEqual(['string-label', 'object-label'])
    })

    it('returns empty string for null body', async () => {
      const mocks = getMockOctokit()
      mocks.issues.get.mockResolvedValueOnce({
        data: {
          number: 9,
          title: 'No body',
          body: null,
          html_url: 'https://github.com/acme/api/issues/9',
          labels: [],
        },
      })
      const client = new GitHubClient()
      const result = await client.fetchIssueDetail('acme', 'api', 9)
      expect(result.body).toBe('')
    })

    it('throws on 401 auth error', async () => {
      const mocks = getMockOctokit()
      mocks.issues.get.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.fetchIssueDetail('acme', 'api', 7)).rejects.toThrow(/authentication failed/i)
    })

    it('throws on 404 not found', async () => {
      const mocks = getMockOctokit()
      mocks.issues.get.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
      const client = new GitHubClient()
      await expect(client.fetchIssueDetail('acme', 'api', 7)).rejects.toThrow(/not found|no access/i)
    })
  })

  // -----------------------------------------------------------------------
  // closeIssue
  // -----------------------------------------------------------------------
  describe('closeIssue', () => {
    it('calls issues.update with state closed', async () => {
      const mocks = getMockOctokit()
      mocks.issues.update.mockResolvedValueOnce({ data: {} })
      const client = new GitHubClient()
      await client.closeIssue('acme', 'api', 42)
      expect(mocks.issues.update).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        issue_number: 42,
        state: 'closed',
      })
    })

    it('re-throws 401 errors with GITHUB_TOKEN message', async () => {
      const mocks = getMockOctokit()
      mocks.issues.update.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.closeIssue('acme', 'api', 42)).rejects.toThrow(/GITHUB_TOKEN/i)
    })

    it('re-throws 404 errors with repo not found message', async () => {
      const mocks = getMockOctokit()
      mocks.issues.update.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
      const client = new GitHubClient()
      await expect(client.closeIssue('acme', 'api', 42)).rejects.toThrow(/not found|no access/i)
    })
  })

  // -----------------------------------------------------------------------
  // listIssueComments
  // -----------------------------------------------------------------------
  describe('listIssueComments', () => {
    it('returns mapped comments', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listComments.mockResolvedValueOnce({
        data: [
          { id: 1, body: 'First comment', user: { login: 'alice' }, created_at: '2026-04-14T10:00:00Z' },
          { id: 2, body: 'Second', user: { login: 'bob' }, created_at: '2026-04-14T11:00:00Z' },
          { id: 3, body: 'No user', user: null, created_at: '2026-04-14T12:00:00Z' },
        ],
      })
      const client = new GitHubClient()
      const comments = await client.listIssueComments('acme', 'api', 10)
      expect(comments).toEqual([
        { author: 'alice', body: 'First comment', createdAt: '2026-04-14T10:00:00Z' },
        { author: 'bob', body: 'Second', createdAt: '2026-04-14T11:00:00Z' },
        { author: '', body: 'No user', createdAt: '2026-04-14T12:00:00Z' },
      ])
      expect(mocks.issues.listComments).toHaveBeenCalledWith({
        owner: 'acme',
        repo: 'api',
        issue_number: 10,
      })
    })

    it('re-throws 401 errors with GITHUB_TOKEN message', async () => {
      const mocks = getMockOctokit()
      mocks.issues.listComments.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))
      const client = new GitHubClient()
      await expect(client.listIssueComments('acme', 'api', 10)).rejects.toThrow(/GITHUB_TOKEN/i)
    })
  })
})
