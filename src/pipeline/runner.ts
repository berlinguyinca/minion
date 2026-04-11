import type { StateManager } from '../config/state.js'
import type { GitHubClient } from '../github/client.js'
import type { AIRouter } from '../ai/router.js'
import type { PipelineConfig } from '../types/index.js'
import { IssueProcessor } from './issue-processor.js'
import { GitOperations } from '../git/index.js'

export class PipelineRunner {
  private readonly processor: IssueProcessor

  constructor(
    private readonly config: PipelineConfig,
    private readonly github: GitHubClient,
    private readonly ai: AIRouter,
    private readonly state: StateManager,
  ) {
    this.processor = new IssueProcessor(github, ai, new GitOperations(), state)
  }

  async run(): Promise<number> {
    const maxIssues = this.config.maxIssuesPerRun ?? 10
    let processed = 0
    let succeeded = 0
    let failed = 0

    outer: for (const repo of this.config.repos) {
      let issues: Awaited<ReturnType<GitHubClient['fetchOpenIssues']>>
      try {
        issues = await this.github.fetchOpenIssues(repo.owner, repo.name)
      } catch (err) {
        console.error(`Failed to fetch issues for ${repo.owner}/${repo.name}:`, err)
        failed++
        continue
      }

      for (const issue of issues) {
        if (processed >= maxIssues) break outer

        try {
          const result = await this.processor.processIssue(repo, issue)
          if (result.success) {
            succeeded++
          } else {
            failed++
          }
        } catch (err) {
          console.error(`Error processing issue #${issue.number}:`, err)
          failed++
        }

        processed++
      }
    }

    console.log(`Pipeline complete: ${processed} processed, ${succeeded} succeeded, ${failed} failed`)

    return failed > 0 ? 1 : 0
  }
}
