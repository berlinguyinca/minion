import type { RepoConfig, Issue, ProcessingResult, ReviewComment, AIModel } from '../types/index.js'
import type { GitHubClient } from '../github/client.js'
import type { AIRouter } from '../ai/router.js'
import type { GitOperations } from '../git/operations.js'
import type { StateManager } from '../config/state.js'
import { createTempDir, cleanupTempDir, buildBranchName } from '../git/index.js'
import { buildSpecPrompt, buildImplementationPrompt, buildReviewPrompt, buildFollowUpPrompt } from './prompts.js'
import { detectTestCommand, runTests } from './test-runner.js'

export class IssueProcessor {
  constructor(
    private readonly github: GitHubClient,
    private readonly ai: AIRouter,
    private readonly git: GitOperations,
    private readonly state: StateManager,
  ) {}

  async processIssue(repo: RepoConfig, issue: Issue): Promise<ProcessingResult> {
    const repoFullName = `${repo.owner}/${repo.name}`
    const base = repo.defaultBranch ?? 'main'

    // 1. Skip if already processed
    if (this.state.isIssueProcessed(repoFullName, issue.number)) {
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
      await this.git.clone(repoUrl, tempDir)

      // 4. Create branch
      await this.git.createBranch(tempDir, branchName)

      // 5. AI Call 1: generate spec
      let specText = ''
      try {
        const specPrompt = buildSpecPrompt(issue)
        const specResult = await this.ai.invokeStructured<{ spec: string }>(specPrompt, {
          type: 'object',
          properties: { spec: { type: 'string' } },
        })
        modelUsed = specResult.model
        specText = specResult.data?.spec ?? specResult.rawOutput
      } catch (err) {
        aiFailure = err instanceof Error ? err : new Error(String(err))
      }

      // 6. AI Call 2: implement (invokeAgent with workingDir)
      if (aiFailure === null) {
        try {
          const implPrompt = buildImplementationPrompt(specText, `${repo.owner}/${repo.name}`)
          const implResult = await this.ai.invokeAgent(implPrompt, tempDir)
          modelUsed = implResult.model
        } catch (err) {
          aiFailure = err instanceof Error ? err : new Error(String(err))
        }
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
      try {
        await this.git.commitAll(tempDir, `ai: implement issue #${issue.number} — ${issue.title}`)
      } catch {
        // non-fatal if nothing to commit
      }

      // 9. Push branch
      try {
        await this.git.push(tempDir, branchName)
      } catch {
        // non-fatal push error — we'll still create the PR
      }

      // 10. Create PR (regular or draft based on test result and AI failure)
      const prTitle = `[AI] ${issue.title}`
      const prBody = aiFailure !== null
        ? `Automated implementation attempt for issue #${issue.number}.\n\n⚠️ AI invocation failed: ${aiFailure.message}`
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
        } catch {
          // Review failure is non-fatal
        }

        // 13. Post review comments
        if (reviewComments.length > 0) {
          try {
            await this.github.postReviewComments(repo.owner, repo.name, prNumber, reviewComments)
          } catch {
            // non-fatal
          }

          // 14. AI Call 4: address review (invokeAgent with workingDir)
          try {
            const followUpPrompt = buildFollowUpPrompt(reviewComments)
            const followUpResult = await this.ai.invokeAgent(followUpPrompt, tempDir)
            modelUsed = followUpResult.model

            // 15. Commit and push follow-up
            await this.git.commitAll(tempDir, `ai: address review comments for #${issue.number}`)
            await this.git.push(tempDir, branchName)
          } catch {
            // non-fatal follow-up failure
          }
        }
      }

      // 16. Get changed files list
      try {
        filesChanged = await this.git.getChangedFiles(tempDir)
      } catch {
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
        aiFailure !== null ? `\n⚠️ **AI Error:** ${aiFailure.message}` : '',
      ].join('\n').trim()

      await this.github.postIssueComment(repo.owner, repo.name, issue.number, commentBody)

      // 18. Mark issue as processed in state
      this.state.markIssueProcessed(repoFullName, issue.number)

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
    } finally {
      cleanupTempDir(tempDir)
    }
  }
}
