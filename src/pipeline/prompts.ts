import type { Issue, ReviewComment, ConflictFile } from '../types/index.js'

export function buildSpecPrompt(issue: Issue): string {
  return `You are a software architect. Analyze this GitHub issue and produce a clear implementation spec.

Repository: ${issue.repoOwner}/${issue.repoName}
Issue #${issue.number}: ${issue.title}

Description:
${issue.body}

Produce a spec with these sections:
- Goal: one sentence describing what to implement
- Files to create or modify: list of file paths
- Implementation approach: step-by-step technical plan
- Test strategy: what tests to write
- Acceptance criteria: testable conditions for done

Output as structured markdown.`
}

export function buildReviewPrompt(diff: string): string {
  return `You are a senior software engineer performing a code review.

Review the following pull request diff and identify issues:

\`\`\`diff
${diff}
\`\`\`

Look for:
- Bugs or logic errors
- Missing tests or inadequate test coverage
- Code style issues and deviations from best practices
- Security vulnerabilities
- Performance concerns
- Missing error handling

For each issue found, provide:
- The file path and line number
- A clear explanation of the problem
- A suggested fix

Be constructive and specific. If no issues are found, say so explicitly.`
}

export function buildFollowUpPrompt(comments: ReviewComment[]): string {
  const commentList = comments
    .map((c) => `File: ${c.path} (line ${c.line})\n${c.body}`)
    .join('\n\n')

  return `You are an expert software engineer addressing code review feedback.

The following review comments were left on your pull request. Fix all the issues in-place by modifying the relevant files in the current working directory:

${commentList}

Instructions:
- Address every comment by updating the relevant file(s).
- Resolve each issue directly — do not add workaround comments.
- After fixing, ensure the code still compiles and tests pass.`
}

export function buildAutoReviewPrompt(diff: string, changedFiles: string[]): string {
  return `You are a senior engineer deciding whether a pull request is safe to auto-merge or needs to be split into smaller PRs.

Changed files: ${changedFiles.join(', ')}

\`\`\`diff
${diff}
\`\`\`

Evaluate the PR and decide:
- **"merge"** if the change is focused (single concern), well-structured, and safe. Most PRs should be merged. Prefer merging unless there is a clear reason to split.
- **"split"** only if the PR mixes genuinely unrelated concerns (e.g., a feature + an unrelated refactor + config changes that could each stand alone). Do NOT split just because a PR is large — large single-concern changes are fine to merge.

Return JSON: { "verdict": "merge" | "split", "confidence": 0.0-1.0, "reasoning": "brief explanation", "concerns": ["list of any concerns, empty if none"] }`
}

export function buildSplitPlanPrompt(diff: string, changedFiles: string[]): string {
  return `You are a senior engineer splitting a complex pull request into smaller, independently mergeable PRs.

Changed files: ${changedFiles.join(', ')}

\`\`\`diff
${diff}
\`\`\`

Group the changed files into logical sets where each set:
- Has a single clear purpose (e.g., "tests", "core logic", "configuration", "documentation")
- Can be merged independently without breaking the build
- Contains ALL files needed for that concern (don't split tightly-coupled files across groups)

Every file must appear in exactly one group. Aim for 2-4 groups.

Return JSON: { "groups": [{ "name": "short-kebab-name", "description": "one line summary", "files": ["path/to/file.ts"] }], "reasoning": "why this split makes sense" }`
}

export function buildConflictResolutionPrompt(conflict: ConflictFile): string {
  return `You are resolving a git merge conflict in the file "${conflict.path}".

The file has conflict markers from rebasing a feature branch onto the latest base branch.

File content with conflict markers:
\`\`\`
${conflict.content}
\`\`\`

Base version (common ancestor):
\`\`\`
${conflict.baseContent}
\`\`\`

Resolve this conflict by producing the final merged file content.
Keep both the feature branch changes and the upstream changes, resolving overlapping edits intelligently.
Do NOT include conflict markers (<<<, ===, >>>) in the output.

Return the resolved file content as JSON: { "resolvedContent": "<the full resolved file>" }`
}
