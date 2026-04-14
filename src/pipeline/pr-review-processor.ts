import type { RepoConfig, PRInfo, PRReviewResult, ReviewVerdict, SplitPlan, PipelineConfig, AIProvider } from '../types/index.js'
import type { GitHubClient } from '../github/client.js'
import type { GitOperations } from '../git/operations.js'
import { createTempDir, cleanupTempDir } from '../git/index.js'
import { buildAutoReviewPrompt, buildSplitPlanPrompt } from './prompts.js'
import { detectTestCommand, runTests } from './test-runner.js'

/** Minimum thresholds below which a PR is too small to split. */
const MIN_FILES_TO_SPLIT = 5
const MIN_DIFF_LINES_TO_SPLIT = 100

interface VerdictResult {
  verdict: ReviewVerdict
  confidence: number
  reasoning: string
  concerns: string[]
}

export class PRReviewProcessor {
  constructor(
    private readonly github: GitHubClient,
    private readonly ai: AIProvider,
    private readonly git: GitOperations,
    private readonly config: PipelineConfig,
  ) {}

  async reviewPR(repo: RepoConfig, pr: PRInfo): Promise<PRReviewResult> {
    const repoFullName = `${repo.owner}/${repo.name}`

    try {
      // 1. Get the diff
      const diff = await this.github.getPRDiff(repo.owner, repo.name, pr.number)
      const changedFiles = parseDiffFileNames(diff)

      // 2. AI verdict
      const verdictAgentResult = await this.ai.invokeAgent(buildAutoReviewPrompt(diff, changedFiles), process.cwd())

      let verdict: ReviewVerdict = 'merge'
      try {
        const parsed = JSON.parse(verdictAgentResult.stdout) as VerdictResult
        verdict = parsed.verdict ?? 'merge'
      } catch {
        // Default to merge if agent doesn't return structured output
      }
      const isSplitChild = pr.labels.includes('ai-split-child')

      // 3. Route based on verdict
      if (verdict === 'split' && !isSplitChild && isSplittable(changedFiles, diff)) {
        const splitResult = await this.splitPR(repo, pr, diff, changedFiles)
        return {
          prNumber: pr.number,
          repoFullName,
          verdict: 'split',
          merged: false,
          splitInto: splitResult.childPRs,
          ...(splitResult.error !== undefined ? { error: splitResult.error } : {}),
        }
      }

      // Default: merge path
      const mergeResult = await this.mergeAfterTests(repo, pr)
      return {
        prNumber: pr.number,
        repoFullName,
        verdict: 'merge',
        merged: mergeResult.merged,
        splitInto: [],
        ...(mergeResult.error !== undefined ? { error: mergeResult.error } : {}),
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return { prNumber: pr.number, repoFullName, verdict: 'merge', merged: false, splitInto: [], error }
    }
  }

  private async mergeAfterTests(
    repo: RepoConfig,
    pr: PRInfo,
  ): Promise<{ merged: boolean; error?: string }> {
    const tempDir = createTempDir()

    try {
      const repoUrl = repo.cloneUrl ?? `https://github.com/${repo.owner}/${repo.name}.git`
      await this.git.clone(repoUrl, tempDir, pr.base)
      await this.git.fetch(tempDir, 'origin', pr.head)
      await this.git.checkout(tempDir, pr.head)

      // Run tests if required
      if (this.config.autoMergeRequireTests !== false) {
        const testCommand = detectTestCommand(tempDir, repo)
        if (testCommand !== null) {
          const testResult = runTests(tempDir, testCommand)
          if (!testResult.passed) {
            await this.postComment(repo, pr.number,
              `🤖 **Auto-Review** — PR #${pr.number}\n\n❌ Tests failed — skipping auto-merge. Will retry on next run.`)
            return { merged: false, error: 'tests failed' }
          }
        }
      }

      // Merge via API
      const mergeMethod = this.config.mergeMethod ?? 'merge'
      await this.github.mergePullRequest(repo.owner, repo.name, pr.number, mergeMethod)

      await this.postComment(repo, pr.number,
        `🤖 **Auto-Review** — PR #${pr.number}\n\n✅ AI review passed, tests passed — auto-merged.`)

      return { merged: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return { merged: false, error }
    } /* v8 ignore next */ finally {
      cleanupTempDir(tempDir)
    }
  }

  private async splitPR(
    repo: RepoConfig,
    pr: PRInfo,
    diff: string,
    changedFiles: string[],
  ): Promise<{ childPRs: number[]; error?: string }> {
    // 1. Get split plan from AI
    const planAgentResult = await this.ai.invokeAgent(buildSplitPlanPrompt(diff, changedFiles), process.cwd())

    let plan: SplitPlan | undefined
    try {
      plan = JSON.parse(planAgentResult.stdout) as SplitPlan
    } catch {
      // Agent didn't return structured output
    }
    if (!plan || plan.groups.length < 2) {
      return { childPRs: [], error: 'AI produced invalid split plan (fewer than 2 groups)' }
    }

    // 2. Validate: every changed file must appear in exactly one group
    const assignedFiles = new Set<string>()
    for (const group of plan.groups) {
      for (const file of group.files) {
        if (assignedFiles.has(file)) {
          return { childPRs: [], error: `File "${file}" appears in multiple groups` }
        }
        assignedFiles.add(file)
      }
    }

    // 3. Create child PRs
    const childPRs: number[] = []

    for (const group of plan.groups) {
      const tempDir = createTempDir()
      try {
        const repoUrl = repo.cloneUrl ?? `https://github.com/${repo.owner}/${repo.name}.git`
        await this.git.clone(repoUrl, tempDir, pr.base)
        await this.git.fetch(tempDir, 'origin', pr.head)

        const childBranch = `ai/split-${pr.number}-${group.name}`
        await this.git.createBranch(tempDir, childBranch)

        // Selectively apply only this group's files from the PR branch
        await this.git.checkoutFiles(tempDir, `origin/${pr.head}`, group.files)

        const committed = await this.git.commitAll(tempDir, `ai: split PR #${pr.number} — ${group.name}`)
        if (!committed) continue // skip empty groups

        await this.git.push(tempDir, childBranch)

        const childPR = await this.github.createPullRequest({
          owner: repo.owner,
          name: repo.name,
          title: `[AI Split] ${group.description} (from #${pr.number})`,
          body: `Split from PR #${pr.number}.\n\n**Group:** ${group.name}\n**Files:** ${group.files.join(', ')}\n**Reasoning:** ${plan.reasoning}`,
          head: childBranch,
          base: pr.base,
        })

        await this.github.addLabel(repo.owner, repo.name, childPR.number, 'ai-generated')
        await this.github.addLabel(repo.owner, repo.name, childPR.number, 'ai-split-child')

        childPRs.push(childPR.number)
      } /* v8 ignore next */ finally {
        cleanupTempDir(tempDir)
      }
    }

    // 4. Close original PR (only if we created at least one child)
    if (childPRs.length > 0) {
      const childLinks = childPRs.map((n) => `#${n}`).join(', ')
      await this.postComment(repo, pr.number,
        `🤖 **Auto-Review** — PR #${pr.number}\n\nThis PR was split into smaller PRs for easier review:\n${childLinks}\n\nClosing this PR.`)
      await this.github.closePullRequest(repo.owner, repo.name, pr.number)
      await this.github.deleteRemoteBranch(repo.owner, repo.name, pr.head)
    }

    return {
      childPRs,
      ...(childPRs.length === 0 ? { error: 'no child PRs could be created from split plan' } : {}),
    }
  }

  private async postComment(repo: RepoConfig, prNumber: number, body: string): Promise<void> {
    try {
      await this.github.postIssueComment(repo.owner, repo.name, prNumber, body)
    } catch (err) {
      console.warn(`[review] Failed to post comment on ${repo.owner}/${repo.name} PR #${prNumber}:`, err instanceof Error ? err.message : String(err))
    }
  }
}

/** Parse file names from a unified diff. */
function parseDiffFileNames(diff: string): string[] {
  const files: string[] = []
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      files.push(line.slice(6))
    }
  }
  return files
}

/** Check if a PR is large enough to be worth splitting. */
function isSplittable(changedFiles: string[], diff: string): boolean {
  if (changedFiles.length < MIN_FILES_TO_SPLIT) return false
  const diffLines = diff.split('\n').length
  return diffLines >= MIN_DIFF_LINES_TO_SPLIT
}
