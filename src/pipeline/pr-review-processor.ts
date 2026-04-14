import type { RepoConfig, PRInfo, PRReviewResult, ReviewComment, PipelineConfig } from '../types/index.js'
import type { GitHubClient } from '../github/client.js'
import type { AIRouter } from '../ai/router.js'
import type { GitOperations } from '../git/operations.js'
import { createTempDir, cleanupTempDir } from '../git/index.js'
import { buildAutoReviewPrompt, buildAutoReviewFixPrompt, buildHumanClarificationPrompt } from './prompts.js'
import { detectTestCommand, runTests } from './test-runner.js'

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    comments: { type: 'array' },
  },
  required: ['approved', 'comments'],
}

export class PRReviewProcessor {
  private readonly maxRounds: number
  private readonly mergeMethod: 'merge' | 'squash' | 'rebase'

  constructor(
    private readonly github: GitHubClient,
    private readonly ai: AIRouter,
    private readonly git: GitOperations,
    private readonly config: PipelineConfig,
  ) {
    this.maxRounds = config.maxReviewRounds ?? 3
    this.mergeMethod = config.mergeMethod ?? 'merge'
  }

  async processReview(
    repo: RepoConfig,
    pr: PRInfo,
  ): Promise<PRReviewResult> {
    const repoFullName = `${repo.owner}/${repo.name}`
    const tempDir = createTempDir()
    let round = 0

    try {
      // 1. Full clone (need push ability)
      const repoUrl = repo.cloneUrl ?? `https://github.com/${repo.owner}/${repo.name}.git`
      await this.git.cloneFull(repoUrl, tempDir, pr.base)

      // 2. Fetch and checkout PR branch
      await this.git.fetch(tempDir, 'origin', pr.head)
      await this.git.checkout(tempDir, pr.head)

      // 3. Review loop
      while (round < this.maxRounds) {
        round++

        // 3a. Get PR diff
        const diff = await this.github.getPRDiff(repo.owner, repo.name, pr.number)

        // 3b. AI review
        const reviewResult = await this.ai.invokeStructured<{ approved: boolean; comments: ReviewComment[] }>(
          buildAutoReviewPrompt(diff),
          REVIEW_SCHEMA,
        )

        const approved = reviewResult.data?.approved ?? false
        const comments = reviewResult.data?.comments ?? []

        // 3c. If approved with no issues, run tests and merge
        if (approved && comments.length === 0) {
          // Run tests before merging
          const testCommand = detectTestCommand(tempDir, repo)
          if (testCommand !== null) {
            const testResult = runTests(tempDir, testCommand)
            if (!testResult.passed) {
              await this.postComment(repo, pr.number, `🤖 **Auto-Review:** Code looks good but tests are failing. Please fix tests before merging.\n\n\`\`\`\n${testResult.output.slice(0, 2000)}\n\`\`\``)
              return { prNumber: pr.number, repoFullName, merged: false, reviewRounds: round, error: 'tests failing' }
            }
          }

          // Merge
          await this.github.mergePullRequest(repo.owner, repo.name, pr.number, this.mergeMethod)
          await this.postComment(repo, pr.number, `🤖 **Auto-Review:** Approved and merged after ${round} review round(s).`)

          return { prNumber: pr.number, repoFullName, merged: true, reviewRounds: round }
        }

        // 3d. Post review comments on the PR
        if (comments.length > 0) {
          try {
            await this.github.postReviewComments(repo.owner, repo.name, pr.number, comments)
          } catch (err) {
            console.warn(`[auto-review] Failed to post review comments on ${repoFullName} PR #${pr.number}:`, err instanceof Error ? err.message : String(err))
          }
        }

        // 3e. If this is the last round, don't attempt a fix — ask for human help
        if (round >= this.maxRounds) {
          break
        }

        // 3f. AI fix the issues
        try {
          const fixPrompt = buildAutoReviewFixPrompt(comments)
          await this.ai.invokeAgent(fixPrompt, tempDir)

          // 3g. Commit and push fixes
          const committed = await this.git.commitAll(tempDir, `ai: address auto-review comments (round ${round})`)
          if (committed) {
            await this.git.push(tempDir, pr.head)
          } else {
            // AI didn't produce changes — can't fix, ask for human help
            break
          }
        } catch (err) {
          console.warn(`[auto-review] AI fix failed for ${repoFullName} PR #${pr.number} round ${round}:`, err instanceof Error ? err.message : String(err))
          break
        }
      }

      // 4. Max rounds exceeded or AI couldn't fix — ask for human clarification
      const diff = await this.github.getPRDiff(repo.owner, repo.name, pr.number)
      const finalReview = await this.ai.invokeStructured<{ approved: boolean; comments: ReviewComment[] }>(
        buildAutoReviewPrompt(diff),
        REVIEW_SCHEMA,
      )
      const remainingComments = finalReview.data?.comments ?? []

      const clarificationBody = buildHumanClarificationPrompt(
        remainingComments.length > 0 ? remainingComments : [{ path: 'unknown', line: 0, body: 'Automated review could not resolve all issues.' }],
        round,
      )
      await this.postComment(repo, pr.number, clarificationBody)

      // Remove the auto-review label so the bot doesn't re-process until re-added
      try {
        await this.github.removeLabel(repo.owner, repo.name, pr.number, this.config.autoReviewLabel ?? 'auto-review')
      } catch {
        // Label removal is best-effort
      }

      return { prNumber: pr.number, repoFullName, merged: false, reviewRounds: round, error: 'max review rounds exceeded' }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return { prNumber: pr.number, repoFullName, merged: false, reviewRounds: round, error }
    } /* v8 ignore next */ finally {
      cleanupTempDir(tempDir)
    }
  }

  private async postComment(repo: RepoConfig, prNumber: number, body: string): Promise<void> {
    try {
      await this.github.postIssueComment(repo.owner, repo.name, prNumber, body)
    } catch (err) {
      console.warn(`[auto-review] Failed to post comment on ${repo.owner}/${repo.name} PR #${prNumber}:`, err instanceof Error ? err.message : String(err))
    }
  }
}
