import type { RepoConfig, PRInfo, MergeResult, PipelineConfig, AIProvider } from '../types/index.js'
import type { GitHubClient } from '../github/client.js'
import type { GitOperations } from '../git/operations.js'
import { createTempDir, cleanupTempDir } from '../git/index.js'
import { buildConflictResolutionPrompt } from './prompts.js'

const MAX_REBASE_ROUNDS = 10

export class MergeProcessor {
  constructor(
    private readonly github: GitHubClient,
    private readonly ai: AIProvider,
    private readonly git: GitOperations,
    private readonly config: PipelineConfig,
  ) {}

  async processMergeRequest(
    repo: RepoConfig,
    pr: PRInfo,
  ): Promise<MergeResult> {
    const repoFullName = `${repo.owner}/${repo.name}`
    const tempDir = createTempDir()
    let totalConflictsResolved = 0

    try {
      // 1. Full clone (needed for rebase history)
      const repoUrl = repo.cloneUrl ?? `https://github.com/${repo.owner}/${repo.name}.git`
      await this.git.cloneFull(repoUrl, tempDir, pr.base)

      // 2. Fetch and checkout PR branch
      await this.git.fetch(tempDir, 'origin', pr.head)
      await this.git.checkout(tempDir, pr.head)

      // 3. Fetch latest base
      await this.git.fetch(tempDir, 'origin', pr.base)

      // 4. Attempt rebase
      let rebaseResult = await this.git.rebase(tempDir, `origin/${pr.base}`)

      // 5/6. Handle rebase result — resolve conflicts if any
      let round = 0
      while (!rebaseResult.success && round < MAX_REBASE_ROUNDS) {
        round++

        for (const conflict of rebaseResult.conflicts) {
          const resolveResult = await this.ai.invokeAgent(buildConflictResolutionPrompt(conflict), tempDir)

          // Parse resolved content from agent output
          let resolvedContent: string | undefined
          try {
            const parsed = JSON.parse(resolveResult.stdout) as { resolvedContent?: string }
            resolvedContent = parsed.resolvedContent
          } catch {
            // Agent returned raw content — use stdout directly if non-empty
            if (resolveResult.stdout.trim()) {
              resolvedContent = resolveResult.stdout
            }
          }

          if (!resolvedContent) {
            await this.git.abortRebase(tempDir)
            await this.postMergeComment(repo, pr.number, `Unable to auto-merge: AI could not resolve conflict in \`${conflict.path}\`.`)
            return { prNumber: pr.number, repoFullName, merged: false, conflictsResolved: totalConflictsResolved, error: 'AI conflict resolution failed' }
          }

          await this.git.resolveConflict(tempDir, conflict.path, resolvedContent)
          totalConflictsResolved++
        }

        // Continue rebase (may produce more conflicts)
        rebaseResult = await this.git.continueRebase(tempDir)
      }

      if (!rebaseResult.success) {
        await this.git.abortRebase(tempDir)
        await this.postMergeComment(repo, pr.number, 'Unable to auto-merge: exceeded maximum conflict resolution rounds.')
        return { prNumber: pr.number, repoFullName, merged: false, conflictsResolved: totalConflictsResolved, error: 'max rounds exceeded' }
      }

      // 7. Force-push rebased branch
      await this.git.forcePush(tempDir, pr.head)

      // 8. Merge via API
      const mergeMethod = this.config.mergeMethod ?? 'merge'
      await this.github.mergePullRequest(repo.owner, repo.name, pr.number, mergeMethod)

      // 9. Post success comment
      const message = totalConflictsResolved > 0
        ? `Merged after rebasing onto \`${pr.base}\` with ${totalConflictsResolved} AI-resolved conflict(s).`
        : `Merged after clean rebase onto \`${pr.base}\`.`
      await this.postMergeComment(repo, pr.number, message)

      return { prNumber: pr.number, repoFullName, merged: true, conflictsResolved: totalConflictsResolved }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return { prNumber: pr.number, repoFullName, merged: false, conflictsResolved: totalConflictsResolved, error }
    } /* v8 ignore next */ finally {
      cleanupTempDir(tempDir)
    }
  }

  private async postMergeComment(repo: RepoConfig, prNumber: number, body: string): Promise<void> {
    try {
      await this.github.postIssueComment(repo.owner, repo.name, prNumber, body)
    } catch (err) {
      console.warn(`[merge] Failed to post comment on ${repo.owner}/${repo.name} PR #${prNumber}:`, err instanceof Error ? err.message : String(err))
    }
  }
}
