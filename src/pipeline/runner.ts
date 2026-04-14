import type { StateManager } from '../config/state.js'
import type { GitHubClient } from '../github/client.js'
import type { AIRouter } from '../ai/router.js'
import type { PipelineConfig } from '../types/index.js'
import { IssueProcessor } from './issue-processor.js'
import { MergeProcessor } from './merge-processor.js'
import { PRReviewProcessor } from './pr-review-processor.js'
import { SpecCache } from './spec-cache.js'
import { GitOperations } from '../git/index.js'

export class PipelineRunner {
  private readonly processor: IssueProcessor
  private readonly mergeProcessor: MergeProcessor
  private readonly prReviewProcessor: PRReviewProcessor

  constructor(
    private readonly config: PipelineConfig,
    private readonly github: GitHubClient,
    private readonly ai: AIRouter,
    private readonly state: StateManager,
  ) {
    const specCache = new SpecCache()
    const git = new GitOperations()
    this.processor = new IssueProcessor(github, ai, git, state, specCache)
    this.mergeProcessor = new MergeProcessor(github, ai, git, config)
    this.prReviewProcessor = new PRReviewProcessor(github, ai, git, config)
  }

  async run(): Promise<number> {
    // Phase 1: Check for merge-ready PRs
    await this.processMergeRequests()

    // Phase 2: Auto-review labeled PRs
    await this.processAutoReviews()

    // Phase 3: Process new issues
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

  private async processMergeRequests(): Promise<void> {
    const trigger = this.config.mergeCommentTrigger ?? '/merge'
    const allowDrafts = this.config.mergeDraftPRs ?? false

    for (const repo of this.config.repos) {
      try {
        const prs = await this.github.listOpenPRsWithLabel(repo.owner, repo.name, 'ai-generated')

        for (const pr of prs) {
          if (pr.isDraft && !allowDrafts) continue

          try {
            const comments = await this.github.listPRComments(repo.owner, repo.name, pr.number)
            const hasMergeComment = comments.some((c) => c.body.includes(trigger))

            if (hasMergeComment) {
              console.log(`[merge] Processing merge request for ${repo.owner}/${repo.name} PR #${pr.number}`)
              const result = await this.mergeProcessor.processMergeRequest(repo, pr)
              if (result.merged) {
                console.log(`[merge] Merged PR #${pr.number} for ${repo.owner}/${repo.name}`)
              } else {
                console.warn(`[merge] Failed to merge PR #${pr.number}: ${result.error ?? 'unknown'}`)
              }
            }
          } catch (err) {
            console.error(`[merge] Error checking/merging PR #${pr.number}:`, err instanceof Error ? err.message : String(err))
          }
        }
      } catch (err) {
        console.error(`[merge] Failed to list PRs for ${repo.owner}/${repo.name}:`, err instanceof Error ? err.message : String(err))
      }
    }
  }

  private async processAutoReviews(): Promise<void> {
    const label = this.config.autoReviewLabel ?? 'auto-review'

    for (const repo of this.config.repos) {
      try {
        const prs = await this.github.listOpenPRsWithLabel(repo.owner, repo.name, label)

        for (const pr of prs) {
          try {
            console.log(`[auto-review] Processing ${repo.owner}/${repo.name} PR #${pr.number}`)
            const result = await this.prReviewProcessor.processReview(repo, pr)
            if (result.merged) {
              console.log(`[auto-review] Merged PR #${pr.number} for ${repo.owner}/${repo.name}`)
            } else {
              console.warn(`[auto-review] PR #${pr.number} not merged: ${result.error ?? 'unknown'}`)
            }
          } catch (err) {
            console.error(`[auto-review] Error reviewing PR #${pr.number}:`, err instanceof Error ? err.message : String(err))
          }
        }
      } catch (err) {
        console.error(`[auto-review] Failed to list PRs for ${repo.owner}/${repo.name}:`, err instanceof Error ? err.message : String(err))
      }
    }
  }
}
