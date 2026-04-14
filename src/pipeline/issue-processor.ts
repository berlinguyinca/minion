import type { RepoConfig, Issue, ProcessingResult, ReviewComment, AIModel } from '../types/index.js'
import type { GitHubClient } from '../github/client.js'
import type { AIRouter } from '../ai/router.js'
import type { GitOperations } from '../git/operations.js'
import type { StateManager } from '../config/state.js'
import type { SpecCache } from './spec-cache.js'
import { createTempDir, cleanupTempDir, buildBranchName } from '../git/index.js'
import { buildSpecPrompt, buildImplementationPrompt, buildReviewPrompt, buildFollowUpPrompt } from './prompts.js'
import { detectTestCommand, runTests } from './test-runner.js'
import { humanizeAIError } from '../ai/errors.js'

export class IssueProcessor {
  constructor(
    private readonly github: GitHubClient,
    private readonly ai: AIRouter,
    private readonly git: GitOperations,
    private readonly state: StateManager,
    private readonly specCache?: SpecCache,
  ) {}

  private async postStatusComment(
    repo: RepoConfig,
    issue: Issue,
    lines: string[],
  ): Promise<void> {
    try {
      await this.github.postIssueComment(repo.owner, repo.name, issue.number, lines.join('\n').trim())
    } catch (err) {
      console.warn(`[pipeline] Failed to post status comment on ${repo.owner}/${repo.name}#${issue.number}:`, err instanceof Error ? err.message : String(err))
    }
  }

  async processIssue(repo: RepoConfig, issue: Issue): Promise<ProcessingResult> {
    const repoFullName = `${repo.owner}/${repo.name}`
    const base = repo.defaultBranch ?? 'main'

    // 1. Skip if already processed or not eligible for retry
    if (!this.state.shouldProcessIssue(repoFullName, issue.number)) {
      return {
        issueNumber: issue.number,
        repoFullName,
        success: true,
        isDraft: false,
        testsPassed: false,
        modelUsed: 'ollama',
        filesChanged: [],
      }
    }

    // 2. Check branch conflict
    const branchName = buildBranchName(issue.number, issue.title)
    const branchAlreadyExists = await this.github.branchExists(repo.owner, repo.name, branchName)

    if (branchAlreadyExists) {
      const existingPR = await this.github.fetchOpenPRForBranch(repo.owner, repo.name, branchName)
      if (existingPR !== null) {
        // Open PR exists — skip this issue
        return {
          issueNumber: issue.number,
          repoFullName,
          success: true,
          prUrl: existingPR.url,
          isDraft: existingPR.isDraft,
          testsPassed: false,
          modelUsed: 'ollama',
          filesChanged: [],
        }
      }
      // Orphan branch — delete it and proceed
      await this.github.deleteRemoteBranch(repo.owner, repo.name, branchName)
    }

    // 3. Clone repo to temp dir (try/finally for cleanup)
    const tempDir = createTempDir()
    let aiFailure: Error | null = null
    let modelUsed: AIModel = 'ollama'
    let prUrl: string | undefined
    let prNumber: number | undefined
    let isDraft = false
    let testsPassed = false
    let filesChanged: string[] = []

    try {
      const repoUrl = repo.cloneUrl ?? `https://github.com/${repo.owner}/${repo.name}.git`
      await this.git.clone(repoUrl, tempDir, base)

      // 4. Create branch
      await this.git.createBranch(tempDir, branchName)

      // 5+6. AI Calls: generate spec then implement (combined for full-pipeline providers)
      try {
        const { model, agent: agentResult } =
          await this.ai.invokeStructuredThenAgent<{ spec: string }>(
            buildSpecPrompt(issue),
            { type: 'object', properties: { spec: { type: 'string' } }, required: ['spec'] },
            (spec) => buildImplementationPrompt(spec, `${repo.owner}/${repo.name}`),
            tempDir,
          )
        modelUsed = model

        // Cache the model used for observability on re-runs
        this.specCache?.set(repoFullName, issue.number, issue.title, { success: true, filesWritten: [], stdout: '', stderr: '' }, modelUsed)

        // v2: if the agent returned a v2 payload, post answer/data steps as issue comments
        if (agentResult?.stdout) {
          try {
            const parsed = JSON.parse(agentResult.stdout) as {
              version?: number
              steps?: Array<{ outputType?: string; output?: string; task?: string }>
            }
            if (parsed.version === 2 && Array.isArray(parsed.steps)) {
              for (const step of parsed.steps) {
                if ((step.outputType === 'answer' || step.outputType === 'data') && step.output) {
                  const stepComment = [
                    `🤖 **MAP Agent Output** (${step.outputType})`,
                    step.task ? `**Task:** ${step.task}` : '',
                    '',
                    step.output,
                  ].filter(Boolean).join('\n')
                  await this.github.postIssueComment(repo.owner, repo.name, issue.number, stepComment)
                }
              }
            }
          } catch {
            // stdout is not JSON or not a v2 payload — continue normally
          }
        }
      } catch (err) {
        aiFailure = err instanceof Error ? err : new Error(String(err))
        console.error(`[pipeline] AI call failed for ${repoFullName}#${issue.number}:`, aiFailure.message)
      }

      // 7. Detect and run tests
      if (aiFailure === null) {
        const testCommand = detectTestCommand(tempDir, repo)
        if (testCommand !== null) {
          const testResult = runTests(tempDir, testCommand)
          testsPassed = testResult.passed
        }
      }

      // 8. Commit all changes
      const committed = await this.git.commitAll(tempDir, `ai: implement issue #${issue.number} — ${issue.title}`)
      if (!committed) {
        const error = 'AI run produced no commit; skipping PR creation.'
        this.state.markIssueOutcome(repoFullName, issue.number, {
          status: 'failure',
          lastAttempt: new Date().toISOString(),
          attemptCount: 1,
          error,
        })
        await this.postStatusComment(repo, issue, [
          `🤖 **AI Implementation Attempt** — Issue #${issue.number}`,
          '',
          '⚠️ No commit was created, so no PR was opened.',
          `**Model used:** ${modelUsed}`,
          `**Tests:** ${testsPassed ? '✅ Passing' : '❌ Failing'}`,
          aiFailure !== null ? `**AI Error:** ${humanizeAIError(aiFailure)}` : '',
        ])
        return {
          issueNumber: issue.number,
          repoFullName,
          success: false,
          isDraft: false,
          testsPassed,
          modelUsed,
          filesChanged: [],
          error,
        }
      }

      // 9. Push branch
      await this.git.push(tempDir, branchName)

      // 10. Create PR (regular or draft based on test result and AI failure)
      const prTitle = `[AI] ${issue.title}`
      const prBody = aiFailure !== null
        ? `Automated implementation attempt for issue #${issue.number}.\n\n⚠️ ${humanizeAIError(aiFailure)}`
        : `Automated implementation for issue #${issue.number}.\n\n${issue.body}`

      const prParams = {
        owner: repo.owner,
        name: repo.name,
        title: prTitle,
        body: prBody,
        head: branchName,
        base,
      }

      let prResult: { number: number; url: string; isDraft: boolean }
      if (aiFailure !== null || !testsPassed) {
        isDraft = true
        prResult = await this.github.createDraftPullRequest(prParams)
      } else {
        prResult = await this.github.createPullRequest(prParams)
        isDraft = prResult.isDraft
      }

      prUrl = prResult.url
      prNumber = prResult.number

      // 11. Add ai-generated label
      await this.github.addLabel(repo.owner, repo.name, prNumber, 'ai-generated')

      // If AI failed, also add ai-failed label
      if (aiFailure !== null) {
        await this.github.addLabel(repo.owner, repo.name, prNumber, 'ai-failed')
      }

      // 12. AI Call 3: review PR diff (only if AI didn't fail)
      let reviewComments: ReviewComment[] = []
      if (aiFailure === null) {
        try {
          const diff = await this.github.getPRDiff(repo.owner, repo.name, prNumber)
          const reviewPrompt = buildReviewPrompt(diff)
          const reviewResult = await this.ai.invokeStructured<{ comments: ReviewComment[] }>(
            reviewPrompt,
            { type: 'object', properties: { comments: { type: 'array' } } },
          )
          modelUsed = reviewResult.model
          reviewComments = reviewResult.data?.comments ?? []
        } catch (err) {
          console.warn(`[pipeline] Review AI call failed for ${repoFullName}#${issue.number}:`, err instanceof Error ? err.message : String(err))
        }

        // 13. Post review comments
        if (reviewComments.length > 0) {
          try {
            await this.github.postReviewComments(repo.owner, repo.name, prNumber, reviewComments)
          } catch (err) {
            console.warn(`[pipeline] Failed to post review comments on ${repoFullName} PR #${prNumber}:`, err instanceof Error ? err.message : String(err))
          }

          // 14. AI Call 4: address review (invokeAgent with workingDir)
          try {
            const followUpPrompt = buildFollowUpPrompt(reviewComments)
            const followUpResult = await this.ai.invokeAgent(followUpPrompt, tempDir)
            modelUsed = followUpResult.model

            // 15. Commit and push follow-up
            const committedFollowUp = await this.git.commitAll(tempDir, `ai: address review comments for #${issue.number}`)
            if (committedFollowUp) {
              await this.git.push(tempDir, branchName)
            }
          } catch (err) {
            console.warn(`[pipeline] Review follow-up failed for ${repoFullName}#${issue.number}:`, err instanceof Error ? err.message : String(err))
          }
        }
      }

      // 16. Get changed files list
      try {
        filesChanged = await this.git.getChangedFiles(tempDir, `origin/${base}`)
      } catch (err) {
        console.warn(`[pipeline] Failed to get changed files for ${repoFullName}#${issue.number}:`, err instanceof Error ? err.message : String(err))
        filesChanged = []
      }

      // 17. Post summary comment on issue
      const commentBody = [
        `🤖 **AI Implementation Attempt** — Issue #${issue.number}`,
        '',
        `**PR:** ${prUrl}`,
        `**Model used:** ${modelUsed}`,
        `**Tests:** ${testsPassed ? '✅ Passing' : '❌ Failing'}`,
        `**Files changed:** ${filesChanged.join(', ') || 'none'}`,
        aiFailure !== null ? `\n⚠️ **AI Error:** ${humanizeAIError(aiFailure)}` : '',
      ].join('\n').trim()

      await this.github.postIssueComment(repo.owner, repo.name, issue.number, commentBody)

      // 18. Mark issue as processed in state
      this.state.markIssueOutcome(repoFullName, issue.number, {
        status: isDraft ? 'partial' : 'success',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
        prUrl,
      })

      return {
        issueNumber: issue.number,
        repoFullName,
        success: true,
        prUrl,
        isDraft,
        testsPassed,
        modelUsed,
        filesChanged,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      this.state.markIssueOutcome(repoFullName, issue.number, {
        status: 'failure',
        lastAttempt: new Date().toISOString(),
        attemptCount: 1,
        error: error.slice(0, 500),
      })
      if (prUrl === undefined) {
        await this.postStatusComment(repo, issue, [
          `🤖 **AI Implementation Attempt** — Issue #${issue.number}`,
          '',
          '⚠️ The pipeline failed before opening a PR.',
          `**Model used:** ${modelUsed}`,
          `**Tests:** ${testsPassed ? '✅ Passing' : '❌ Failing'}`,
          `**Error:** ${error}`,
        ])
      }
      const failResult: ProcessingResult = {
        issueNumber: issue.number,
        repoFullName,
        success: false,
        isDraft,
        testsPassed,
        modelUsed,
        filesChanged,
        error,
      }
      if (prUrl !== undefined) failResult.prUrl = prUrl
      return failResult
    } /* v8 ignore next */ finally {
      cleanupTempDir(tempDir)
    }
  }
}
