import { Octokit } from '@octokit/rest'
import type { Issue, ReviewComment, PRComment, PRInfo } from '../types/index.js'

export interface CreatePRParams {
  owner: string
  name: string
  title: string
  body: string
  head: string
  base: string
  draft?: boolean
}

export interface PRResult {
  number: number
  url: string
  isDraft: boolean
}

interface OctokitError extends Error {
  status?: number
}

function isOctokitError(err: unknown): err is OctokitError {
  return err instanceof Error && 'status' in err
}

function wrapError(err: unknown, owner: string, repo: string): never {
  if (isOctokitError(err)) {
    if (err.status === 401 || err.status === 403) {
      throw new Error(
        `GitHub authentication failed (HTTP ${err.status}). Check that GITHUB_TOKEN is valid and has the required scopes.`
      )
    }
    if (err.status === 404) {
      throw new Error(
        `Repository ${owner}/${repo} not found or no access. Verify it exists and your GITHUB_TOKEN has permission.`
      )
    }
  }
  throw err
}

export class GitHubClient {
  private readonly octokit: Octokit

  constructor(token?: string, baseUrl?: string) {
    const t = token ?? process.env['GITHUB_TOKEN']
    if (!t) throw new Error('GITHUB_TOKEN environment variable is required')
    this.octokit = new Octokit({ auth: t, ...(baseUrl !== undefined ? { baseUrl } : {}) })
  }

  async fetchOpenIssues(owner: string, name: string): Promise<Issue[]> {
    const allItems: Array<{
      id: number
      number: number
      title: string
      body?: string | null
      html_url: string
      pull_request?: unknown
    }> = []

    let page = 1
    let hasNextPage = true

    while (hasNextPage) {
      try {
        const response = await this.octokit.issues.listForRepo({
          owner,
          repo: name,
          state: 'open',
          per_page: 100,
          page,
        })

        allItems.push(...response.data)

        const linkHeader = (response.headers as Record<string, string | undefined>)['link']
        hasNextPage = typeof linkHeader === 'string' && linkHeader.includes('rel="next"')
        page++
      } catch (err) {
        wrapError(err, owner, name)
      }
    }

    return allItems
      .filter((item) => item.pull_request === undefined || item.pull_request === null)
      .map((item) => ({
        id: item.id,
        number: item.number,
        title: item.title,
        body: item.body ?? '',
        url: item.html_url,
        repoOwner: owner,
        repoName: name,
      }))
  }

  async createPullRequest(params: CreatePRParams): Promise<PRResult> {
    const { owner, name, title, body, head, base, draft = false } = params
    try {
      const response = await this.octokit.pulls.create({
        owner,
        repo: name,
        title,
        body,
        head,
        base,
        draft,
      })
      return {
        number: response.data.number,
        url: response.data.html_url,
        isDraft: response.data.draft ?? false,
      }
    } catch (err) {
      wrapError(err, owner, name)
    }
  }

  async createDraftPullRequest(params: Omit<CreatePRParams, 'draft'>): Promise<PRResult> {
    return this.createPullRequest({ ...params, draft: true })
  }

  async addLabel(owner: string, name: string, prNumber: number, label: string): Promise<void> {
    try {
      await this.octokit.issues.addLabels({
        owner,
        repo: name,
        issue_number: prNumber,
        labels: [label],
      })
    } catch (err) {
      wrapError(err, owner, name)
    }
  }

  async removeLabel(owner: string, name: string, prNumber: number, label: string): Promise<void> {
    try {
      await this.octokit.issues.removeLabel({
        owner,
        repo: name,
        issue_number: prNumber,
        name: label,
      })
    } catch (err) {
      if (isOctokitError(err) && err.status === 404) {
        return // Label was already removed
      }
      wrapError(err, owner, name)
    }
  }

  async postIssueComment(
    owner: string,
    name: string,
    issueNumber: number,
    body: string
  ): Promise<void> {
    try {
      await this.octokit.issues.createComment({
        owner,
        repo: name,
        issue_number: issueNumber,
        body,
      })
    } catch (err) {
      wrapError(err, owner, name)
    }
  }

  async postReviewComments(
    owner: string,
    name: string,
    prNumber: number,
    comments: ReviewComment[]
  ): Promise<void> {
    try {
      await this.octokit.pulls.createReview({
        owner,
        repo: name,
        pull_number: prNumber,
        event: 'COMMENT',
        comments,
      })
    } catch (err) {
      wrapError(err, owner, name)
    }
  }

  async getPRDiff(owner: string, name: string, prNumber: number): Promise<string> {
    try {
      const response = await this.octokit.pulls.get({
        owner,
        repo: name,
        pull_number: prNumber,
        mediaType: { format: 'diff' },
      })
      return response.data as unknown as string
    } catch (err) {
      wrapError(err, owner, name)
    }
  }

  async branchExists(owner: string, name: string, branchName: string): Promise<boolean> {
    try {
      await this.octokit.git.getRef({
        owner,
        repo: name,
        ref: `heads/${branchName}`,
      })
      return true
    } catch (err) {
      if (isOctokitError(err) && err.status === 404) {
        return false
      }
      throw err
    }
  }

  async deleteRemoteBranch(owner: string, name: string, branchName: string): Promise<void> {
    try {
      await this.octokit.git.deleteRef({
        owner,
        repo: name,
        ref: `heads/${branchName}`,
      })
    } catch (err) {
      wrapError(err, owner, name)
    }
  }

  async fetchOpenPRForBranch(owner: string, name: string, branchName: string): Promise<PRResult | null> {
    try {
      const response = await this.octokit.pulls.list({
        owner,
        repo: name,
        state: 'open',
        head: `${owner}:${branchName}`,
      })
      const pr = response.data[0]
      if (!pr) return null
      return {
        number: pr.number,
        url: pr.html_url,
        isDraft: pr.draft ?? false,
      }
    } catch (err) {
      wrapError(err, owner, name)
    }
  }

  async listPRComments(owner: string, name: string, prNumber: number): Promise<PRComment[]> {
    try {
      const response = await this.octokit.issues.listComments({
        owner,
        repo: name,
        issue_number: prNumber,
      })
      return response.data.map((c) => ({
        id: c.id,
        body: c.body ?? '',
        user: c.user?.login ?? '',
        createdAt: c.created_at,
      }))
    } catch (err) {
      wrapError(err, owner, name)
    }
  }

  async listOpenPRsWithLabel(owner: string, name: string, label: string): Promise<PRInfo[]> {
    try {
      const response = await this.octokit.pulls.list({
        owner,
        repo: name,
        state: 'open',
      })
      return response.data
        .filter((pr) => pr.labels.some((l) => l.name === label))
        .map((pr) => ({
          number: pr.number,
          url: pr.html_url,
          isDraft: pr.draft ?? false,
          head: pr.head.ref,
          base: pr.base.ref,
        }))
    } catch (err) {
      wrapError(err, owner, name)
    }
  }

  async mergePullRequest(
    owner: string,
    name: string,
    prNumber: number,
    method: 'merge' | 'squash' | 'rebase' = 'merge',
  ): Promise<void> {
    try {
      await this.octokit.pulls.merge({
        owner,
        repo: name,
        pull_number: prNumber,
        merge_method: method,
      })
    } catch (err) {
      wrapError(err, owner, name)
    }
  }
}
