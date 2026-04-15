import type { StateManager } from '../config/state.js'
import type { GitHubClient } from '../github/client.js'
import type { PipelineConfig, PROutcome, AIProvider } from '../types/index.js'
import { IssueProcessor } from './issue-processor.js'
import { MergeProcessor } from './merge-processor.js'
import { PRReviewProcessor } from './pr-review-processor.js'
import { SpecCache } from './spec-cache.js'
import { GitOperations } from '../git/index.js'
import { classifyAIError } from '../ai/errors.js'

export class PipelineRunner {
  private readonly processor: IssueProcessor
  private readonly mergeProcessor: MergeProcessor
  private readonly reviewProcessor: PRReviewProcessor

  constructor(
    private readonly config: PipelineConfig,
    private readonly github: GitHubClient,
    private readonly ai: AIProvider,
    private readonly state: StateManager,
  ) {
    const specCache = new SpecCache()
    const git = new GitOperations()
    this.processor = new IssueProcessor(github, ai, git, state, specCache)
    this.mergeProcessor = new MergeProcessor(github, ai, git, config)
    this.reviewProcessor = new PRReviewProcessor(github, ai, git, config)
  }

  async run(): Promise<number> {
    // Phase 1: Check for comment-triggered merge requests
    await this.processMergeRequests()

    // Phase 2: Auto-review open PRs (merge or split)
    if (this.config.autoMerge !== false) {
      await this.processAutoReviews()
    }

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
        const failure = classifyAIError(err instanceof Error ? err : new Error(String(err)))
        console.error(`Failed to fetch issues for ${repo.owner}/${repo.name}:`, failure.message)
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
          const failure = classifyAIError(err instanceof Error ? err : new Error(String(err)))
          console.error(`Error processing issue #${issue.number}:`, failure.message)
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
      const repoFullName = `${repo.owner}/${repo.name}`
      try {
        const prs = await this.github.listOpenPRsWithLabel(repo.owner, repo.name, 'ai-generated')

        for (const pr of prs) {
          if (pr.isDraft && !allowDrafts) continue

          try {
            const comments = await this.github.listPRComments(repo.owner, repo.name, pr.number)
            const hasMergeComment = comments.some((c) => c.body.includes(trigger))

            if (hasMergeComment) {
              if (!this.state.shouldReviewPR(repoFullName, pr.number)) {
                console.log(`[merge] Skipping PR #${pr.number} — max attempts reached or backoff pending`)
                continue
              }

              const prevCount = this.state.getPRAttemptCount(repoFullName, pr.number)
              console.log(`[merge] Processing merge request for ${repo.owner}/${repo.name} PR #${pr.number}`)
              const result = await this.mergeProcessor.processMergeRequest(repo, pr)
              if (result.merged) {
                console.log(`[merge] Merged PR #${pr.number} for ${repo.owner}/${repo.name}`)
                this.state.markPROutcome(repoFullName, pr.number, {
                  status: 'merged',
                  lastAttempt: new Date().toISOString(),
                  attemptCount: prevCount + 1,
                })
              } else {
                const failure = result.error !== undefined ? classifyAIError(result.error) : undefined
                if (failure !== undefined) {
                  console.warn(`[merge] Failed to merge PR #${pr.number}: ${failure.message}`)
                }
                this.state.markPROutcome(
                  repoFullName,
                  pr.number,
                  this.buildFailedPROutcome(prevCount + 1, failure?.message ?? result.error, result.retryable ?? failure?.retryable),
                )
              }
            }
          } catch (err) {
            const failure = classifyAIError(err instanceof Error ? err : new Error(String(err)))
            console.error(`[merge] Error checking/merging PR #${pr.number}:`, failure.message)
            const prevCount = this.state.getPRAttemptCount(repoFullName, pr.number)
            this.state.markPROutcome(repoFullName, pr.number, this.buildFailedPROutcome(prevCount + 1, failure.message, failure.retryable))
          }
        }
      } catch (err) {
        const failure = classifyAIError(err instanceof Error ? err : new Error(String(err)))
        console.error(`[merge] Failed to list PRs for ${repo.owner}/${repo.name}:`, failure.message)
      }
    }
  }

  private async processAutoReviews(): Promise<void> {
    const allowDrafts = this.config.mergeDraftPRs ?? false
    const trigger = this.config.mergeCommentTrigger ?? '/merge'

    for (const repo of this.config.repos) {
      const repoFullName = `${repo.owner}/${repo.name}`
      try {
        const prs = await this.github.listOpenPRsWithLabel(repo.owner, repo.name, 'ai-generated')

        for (const pr of prs) {
          if (pr.isDraft && !allowDrafts) continue

          // Skip PRs that have a /merge comment — handled by Phase 1
          try {
            const comments = await this.github.listPRComments(repo.owner, repo.name, pr.number)
            if (comments.some((c) => c.body.includes(trigger))) continue
          } catch {
            continue
          }

          if (!this.state.shouldReviewPR(repoFullName, pr.number)) {
            console.log(`[review] Skipping PR #${pr.number} — max attempts reached or backoff pending`)
            continue
          }

          const prevCount = this.state.getPRAttemptCount(repoFullName, pr.number)
          try {
            console.log(`[review] Auto-reviewing ${repo.owner}/${repo.name} PR #${pr.number}`)
            const result = await this.reviewProcessor.reviewPR(repo, pr)
            if (result.merged) {
              console.log(`[review] Auto-merged PR #${pr.number}`)
              this.state.markPROutcome(repoFullName, pr.number, {
                status: 'merged',
                lastAttempt: new Date().toISOString(),
                attemptCount: prevCount + 1,
              })
            } else if (result.splitInto.length > 0) {
              console.log(`[review] Split PR #${pr.number} into ${result.splitInto.length} child PRs: ${result.splitInto.join(', ')}`)
              this.state.markPROutcome(repoFullName, pr.number, {
                status: 'split',
                lastAttempt: new Date().toISOString(),
                attemptCount: prevCount + 1,
              })
            } else {
              const failure = result.error !== undefined ? classifyAIError(result.error) : undefined
              if (failure !== undefined) {
                console.warn(`[review] Failed to process PR #${pr.number}: ${failure.message}`)
              }
              this.state.markPROutcome(
                repoFullName,
                pr.number,
                this.buildFailedPROutcome(prevCount + 1, failure?.message ?? result.error, result.retryable ?? failure?.retryable),
              )
            }
          } catch (err) {
            const failure = classifyAIError(err instanceof Error ? err : new Error(String(err)))
            console.error(`[review] Error reviewing PR #${pr.number}:`, failure.message)
            this.state.markPROutcome(repoFullName, pr.number, this.buildFailedPROutcome(prevCount + 1, failure.message, failure.retryable))
          }
        }
      } catch (err) {
        const failure = classifyAIError(err instanceof Error ? err : new Error(String(err)))
        console.error(`[review] Failed to list PRs for ${repo.owner}/${repo.name}:`, failure.message)
      }
    }
  }

  private buildFailedPROutcome(attemptCount: number, error?: string, retryable?: boolean): PROutcome {
    const outcome: PROutcome = {
      status: 'failed',
      lastAttempt: new Date().toISOString(),
      attemptCount,
    }
    if (error !== undefined) {
      outcome.error = error
    }
    if (retryable !== undefined) {
      outcome.retryable = retryable
    }
    return outcome
  }
}
