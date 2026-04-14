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

export function buildImplementationPrompt(spec: string, repoName: string): string {
  return `You are an expert software engineer implementing a GitHub issue for the repository: ${repoName}.

Your task is to implement the following specification:

${spec}

Instructions:
- Create or modify all files described in the spec in the current working directory.
- Write tests alongside the implementation — unit tests for all new logic, integration tests where applicable.
- Follow existing code conventions in the repository.
- Make sure all new code is properly typed and lint-clean.
- Do not skip the tests; they are required for the implementation to be considered complete.`
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

export function buildAutoReviewPrompt(diff: string): string {
  return `You are an automated code reviewer evaluating a pull request for merge readiness.

Review the following pull request diff and determine if it is safe to merge:

\`\`\`diff
${diff}
\`\`\`

Evaluate the diff for:
- Bugs, logic errors, or incorrect behavior
- Missing tests or inadequate test coverage
- Security vulnerabilities
- Breaking changes that are not backward compatible
- Code style issues or deviations from best practices

If the code is ready to merge with no issues, return an empty comments array.
If there are issues, return each issue with the file path, line number, and a clear description of the problem with a suggested fix.

Return your review as JSON: { "approved": true/false, "comments": [{ "path": "...", "line": N, "body": "..." }] }`
}

export function buildAutoReviewFixPrompt(comments: ReviewComment[]): string {
  const commentList = comments
    .map((c) => `File: ${c.path} (line ${c.line})\n${c.body}`)
    .join('\n\n')

  return `You are an expert software engineer fixing issues found during an automated code review.

The following issues were found in the pull request. Fix all of them in-place by modifying the relevant files in the current working directory:

${commentList}

Instructions:
- Address every issue by updating the relevant file(s).
- Resolve each issue directly — do not add TODO comments or workarounds.
- After fixing, ensure the code still compiles and tests pass.
- Do not introduce new issues while fixing existing ones.`
}

export function buildHumanClarificationPrompt(comments: ReviewComment[], round: number): string {
  const commentList = comments
    .map((c) => `- **${c.path}** (line ${c.line}): ${c.body}`)
    .join('\n')

  return [
    `🤖 **Automated Review — Requesting Human Clarification**`,
    '',
    `After ${round} automated review round(s), the following issues could not be resolved automatically:`,
    '',
    commentList,
    '',
    'Please review these issues and either:',
    '1. Fix them manually and push an update',
    '2. Comment with guidance so the bot can try again',
    '',
    'Add the `auto-review` label again to trigger another review cycle after making changes.',
  ].join('\n')
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
