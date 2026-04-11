import type { Issue, ReviewComment } from '../types/index.js'

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
