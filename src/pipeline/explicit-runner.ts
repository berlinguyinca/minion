import type { GitHubClient } from '../github/client.js'
import type { Issue, ProcessingResult, RepoConfig } from '../types/index.js'
import type { IssueProcessor } from './issue-processor.js'

export class ExplicitIssueRunner {
  constructor(
    private readonly github: Pick<GitHubClient, 'fetchIssueDetail'>,
    private readonly processor: Pick<IssueProcessor, 'processIssue'>,
  ) {}

  async runIssue(repo: RepoConfig, issueNumber: number): Promise<ProcessingResult> {
    const detail = await this.github.fetchIssueDetail(repo.owner, repo.name, issueNumber)
    const issue: Issue = {
      id: detail.number,
      number: detail.number,
      title: detail.title,
      body: detail.body,
      url: detail.url,
      repoOwner: repo.owner,
      repoName: repo.name,
      labels: detail.labels,
    }
    return this.processor.processIssue(repo, issue, { bypassEligibility: true })
  }
}
