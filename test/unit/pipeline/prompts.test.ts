import { describe, it, expect } from 'vitest'
import {
  buildSpecPrompt,
  buildReviewPrompt,
  buildFollowUpPrompt,
  buildAutoReviewPrompt,
  buildSplitPlanPrompt,
} from '../../../src/pipeline/prompts.js'
import type { Issue, ReviewComment } from '../../../src/types/index.js'

const issue: Issue = {
  id: 1,
  number: 42,
  title: 'Add rate limiting to API endpoints',
  body: 'We need to add rate limiting to prevent abuse. Use a token bucket algorithm.',
  url: 'https://github.com/acme/api/issues/42',
  repoOwner: 'acme',
  repoName: 'api',
}

describe('buildSpecPrompt', () => {
  it('contains issue title', () => {
    expect(buildSpecPrompt(issue)).toContain(issue.title)
  })

  it('contains issue body', () => {
    expect(buildSpecPrompt(issue)).toContain(issue.body)
  })

  it('contains repo name', () => {
    expect(buildSpecPrompt(issue)).toContain(issue.repoName)
  })

  it('contains instruction to output structured markdown spec', () => {
    const prompt = buildSpecPrompt(issue)
    expect(prompt.toLowerCase()).toMatch(/structured markdown|markdown.*spec|output.*spec/i)
  })

  it('does not return empty string', () => {
    expect(buildSpecPrompt(issue).length).toBeGreaterThan(0)
  })

  it('does not contain ${undefined} or [object Object]', () => {
    const prompt = buildSpecPrompt(issue)
    expect(prompt).not.toContain('${undefined}')
    expect(prompt).not.toContain('[object Object]')
  })
})

describe('buildReviewPrompt', () => {
  const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,5 @@
+import { rateLimiter } from './middleware/rate-limit'
+
 export function main() {
   console.log('hello')
 }`

  it('contains the diff text', () => {
    expect(buildReviewPrompt(diff)).toContain(diff)
  })

  it('contains instruction to look for bugs, missing tests, code style issues', () => {
    const prompt = buildReviewPrompt(diff)
    expect(prompt.toLowerCase()).toMatch(/bug|test|style|issue/i)
  })

  it('does not return empty string', () => {
    expect(buildReviewPrompt(diff).length).toBeGreaterThan(0)
  })

  it('does not contain ${undefined} or [object Object]', () => {
    const prompt = buildReviewPrompt(diff)
    expect(prompt).not.toContain('${undefined}')
    expect(prompt).not.toContain('[object Object]')
  })
})

describe('buildFollowUpPrompt', () => {
  const comments: ReviewComment[] = [
    { path: 'src/middleware/rate-limit.ts', line: 10, body: 'Missing error handling here' },
    { path: 'src/index.ts', line: 5, body: 'This import is unused' },
  ]

  it('contains each comment body', () => {
    const prompt = buildFollowUpPrompt(comments)
    for (const comment of comments) {
      expect(prompt).toContain(comment.body)
    }
  })

  it('contains instruction to fix the issues in-place', () => {
    const prompt = buildFollowUpPrompt(comments)
    expect(prompt.toLowerCase()).toMatch(/fix|address|resolve/i)
  })

  it('does not return empty string', () => {
    expect(buildFollowUpPrompt(comments).length).toBeGreaterThan(0)
  })

  it('does not contain ${undefined} or [object Object]', () => {
    const prompt = buildFollowUpPrompt(comments)
    expect(prompt).not.toContain('${undefined}')
    expect(prompt).not.toContain('[object Object]')
  })
})

describe('buildAutoReviewPrompt', () => {
  const diff = '--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-old\n+new'
  const files = ['src/foo.ts', 'src/bar.ts']

  it('contains the diff and file names', () => {
    const prompt = buildAutoReviewPrompt(diff, files)
    expect(prompt).toContain(diff)
    expect(prompt).toContain('src/foo.ts')
    expect(prompt).toContain('src/bar.ts')
  })

  it('mentions both merge and split verdicts', () => {
    const prompt = buildAutoReviewPrompt(diff, files)
    expect(prompt).toContain('"merge"')
    expect(prompt).toContain('"split"')
  })

  it('biases toward merging', () => {
    const prompt = buildAutoReviewPrompt(diff, files).toLowerCase()
    expect(prompt).toMatch(/prefer.*merg|most.*prs.*should.*be.*merged/i)
  })
})

describe('buildSplitPlanPrompt', () => {
  const diff = '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+y'
  const files = ['src/a.ts', 'test/a.test.ts']

  it('contains the diff and file names', () => {
    const prompt = buildSplitPlanPrompt(diff, files)
    expect(prompt).toContain(diff)
    expect(prompt).toContain('src/a.ts')
    expect(prompt).toContain('test/a.test.ts')
  })

  it('instructs to return groups with name, description, and files', () => {
    const prompt = buildSplitPlanPrompt(diff, files)
    expect(prompt).toContain('"groups"')
    expect(prompt).toContain('"name"')
    expect(prompt).toContain('"files"')
  })

  it('requires every file in exactly one group', () => {
    const prompt = buildSplitPlanPrompt(diff, files).toLowerCase()
    expect(prompt).toMatch(/every file.*exactly one group/i)
  })
})
