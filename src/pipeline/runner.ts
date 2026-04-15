import type { StateManager } from '../config/state.js'
import type { GitHubClient } from '../github/client.js'
import type { PipelineConfig, PROutcome, AIProvider } from '../types/index.js'
import { IssueProcessor } from './issue-processor.js'
import { MergeProcessor } from './merge-processor.js'
import { PRReviewProcessor } from './pr-review-processor.js'
import { SpecCache } from './spec-cache.js'
import { ConsoleProgressReporter, type ProgressReporter } from './progress.js'
import { GitOperations } from '../git/index.js'
import { classifyAIError, type AIErrorClassification } from '../ai/errors.js'

export class PipelineRunner {
  private readonly processor: IssueProcessor
  private readonly mergeProcessor: MergeProcessor
  private readonly reviewProcessor: PRReviewProcessor
  private readonly progress: ProgressReporter

  constructor(
    private readonly config: PipelineConfig,
    private readonly github: GitHubClient,
    private readonly ai: AIProvider,
    private readonly state: StateManager,
    progress: ProgressReporter = new ConsoleProgressReporter(),
  ) {
    const specCache = new SpecCache()
    const git = new GitOperations()
    this.progress = progress
    this.processor = new IssueProcessor(github, ai, git, state, specCache, progress)
    this.mergeProcessor = new MergeProcessor(github, ai, git, config, progress)
    this.reviewProcessor = new PRReviewProcessor(github, ai, git, config, progress)
  }

  async run(): Promise<number> {
    // Phase 1: Check for comment-triggered merge requests
    this.progress.beginPhase('Phase 1/3: checking merge requests')
    await this.processMergeRequests()

    // Phase 2: Auto-review open PRs (merge or split)
    if (this.config.autoMerge !== false) {
      this.progress.beginPhase('Phase 2/3: auto-reviewing open PRs')
      await this.processAutoReviews()
    }

    // Phase 3: Process new issues
    this.progress.beginPhase('Phase 3/3: processing issues')
    const maxIssues = this.config.maxIssuesPerRun ?? 10
    let processed = 0
    let succeeded = 0
    let failed = 0

    outer: for (const repo of this.config.repos) {
      const repoIndex = this.config.repos.indexOf(repo)
      let issues: Awaited<ReturnType<GitHubClient['fetchOpenIssues']>>
      try {
        issues = await this.github.fetchOpenIssues(repo.owner, repo.name)
      } catch (err) {
        const failure = classifyAIError(err instanceof Error ? err : new Error(String(err)))
        console.error(`Failed to fetch issues for ${repo.owner}/${repo.name}:`, failure.message)
        failed++
        continue
      }

      this.progress.beginRepo('issue', repoIndex + 1, this.config.repos.length, `${repo.owner}/${repo.name}`, issues.length)

      for (const issue of issues) {
        if (processed >= maxIssues) break outer

        try {
          this.progress.beginItem('issue', `${repo.owner}/${repo.name}`, repoIndex + 1, this.config.repos.length, `Issue #${issue.number}`, processed + 1, maxIssues)
          const result = await this.processor.processIssue(repo, issue)
          if (result.success) {
            succeeded++
          } else {
            failed++
          }
          this.progress.complete(result.success ? 'processed' : 'failed')
        } catch (err) {
          const failure = classifyAIError(err instanceof Error ? err : new Error(String(err)))
          console.error(`Error processing issue #${issue.number}:`, failure.message)
          failed++
          this.progress.complete('failed')
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
    const repoTotal = this.config.repos.length

    for (const [repoIndex, repo] of this.config.repos.entries()) {
      const repoFullName = `${repo.owner}/${repo.name}`
      try {
        const prs = await this.github.listOpenPRsWithLabel(repo.owner, repo.name, 'ai-generated')
        this.progress.beginRepo('merge', repoIndex + 1, repoTotal, repoFullName, prs.length)

        for (const [prIndex, pr] of prs.entries()) {
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
              this.progress.beginItem('merge', repoFullName, repoIndex + 1, repoTotal, `PR #${pr.number}`, prIndex + 1, prs.length)
              this.progress.update('processing merge request')
              const result = await this.mergeProcessor.processMergeRequest(repo, pr)
              if (result.merged) {
                this.state.markPROutcome(repoFullName, pr.number, {
                  status: 'merged',
                  lastAttempt: new Date().toISOString(),
                  attemptCount: prevCount + 1,
                })
              } else {
                const failure = result.error !== undefined ? classifyAIError(result.error) : undefined
                this.state.markPROutcome(
                  repoFullName,
                  pr.number,
                  this.buildFailedPROutcome(prevCount + 1, failure?.message ?? result.error, result.retryable ?? failure?.retryable),
                )
                if (failure !== undefined) {
                  this.logAIErrorBlock(`[merge] Failed to merge PR #${pr.number}`, failure)
                }
              }
              this.progress.complete(result.merged ? 'merged' : 'not merged')
            }
          } catch (err) {
            const failure = classifyAIError(err instanceof Error ? err : new Error(String(err)))
            console.error(`[merge] Error checking/merging PR #${pr.number}:`, failure.message)
            const prevCount = this.state.getPRAttemptCount(repoFullName, pr.number)
            this.state.markPROutcome(repoFullName, pr.number, this.buildFailedPROutcome(prevCount + 1, failure.message, failure.retryable))
            this.progress.complete('failed')
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
    const repoTotal = this.config.repos.length

    for (const [repoIndex, repo] of this.config.repos.entries()) {
      const repoFullName = `${repo.owner}/${repo.name}`
      try {
        const prs = await this.github.listOpenPRsWithLabel(repo.owner, repo.name, 'ai-generated')
        this.progress.beginRepo('review', repoIndex + 1, repoTotal, repoFullName, prs.length)

        for (const [prIndex, pr] of prs.entries()) {
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
            this.progress.beginItem('review', repoFullName, repoIndex + 1, repoTotal, `PR #${pr.number}`, prIndex + 1, prs.length)
            this.progress.update('auto-reviewing')
            const result = await this.reviewProcessor.reviewPR(repo, pr)
            if (result.merged) {
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
              this.state.markPROutcome(
                repoFullName,
                pr.number,
                this.buildFailedPROutcome(prevCount + 1, failure?.message ?? result.error, result.retryable ?? failure?.retryable),
              )
              if (failure !== undefined) {
                this.logAIErrorBlock(`[review] Failed to process PR #${pr.number}`, failure)
              }
            }
            this.progress.complete(result.merged ? 'merged' : result.splitInto.length > 0 ? 'split' : 'failed')
          } catch (err) {
            const failure = classifyAIError(err instanceof Error ? err : new Error(String(err)))
            console.error(`[review] Error reviewing PR #${pr.number}:`, failure.message)
            this.state.markPROutcome(repoFullName, pr.number, this.buildFailedPROutcome(prevCount + 1, failure.message, failure.retryable))
            this.progress.complete('failed')
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

  private logAIErrorBlock(headline: string, failure: AIErrorClassification): void {
    console.warn(headline)
    console.warn(`  ${failure.message}`)
    for (const detail of failure.details) {
      console.warn(`  ${detail}`)
    }
    if (failure.nextActionHint !== undefined) {
      console.warn(`  next: ${failure.nextActionHint}`)
    }
  }
}
