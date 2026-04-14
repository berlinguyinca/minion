import { describe, it, expect } from 'vitest'
import {
  buildSpecPrompt,
  buildImplementationPrompt,
  buildReviewPrompt,
  buildFollowUpPrompt,
  buildAutoReviewPrompt,
  buildAutoReviewFixPrompt,
  buildHumanClarificationPrompt,
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

describe('buildImplementationPrompt', () => {
  const spec = '## Goal\nAdd rate limiting\n\n## Files\n- src/middleware/rate-limit.ts'

  it('contains the spec text', () => {
    expect(buildImplementationPrompt(spec, 'acme/api')).toContain(spec)
  })

  it('contains instruction to write tests alongside implementation', () => {
    const prompt = buildImplementationPrompt(spec, 'acme/api')
    expect(prompt.toLowerCase()).toMatch(/test|tests/i)
  })

  it('contains instruction to create files in the working directory', () => {
    const prompt = buildImplementationPrompt(spec, 'acme/api')
    expect(prompt.toLowerCase()).toMatch(/working directory|files|create/i)
  })

  it('does not return empty string', () => {
    expect(buildImplementationPrompt(spec, 'acme/api').length).toBeGreaterThan(0)
  })

  it('does not contain ${undefined} or [object Object]', () => {
    const prompt = buildImplementationPrompt(spec, 'acme/api')
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
    expect(buildAutoReviewPrompt(diff)).toContain(diff)
  })

  it('contains instruction to evaluate for merge readiness', () => {
    const prompt = buildAutoReviewPrompt(diff)
    expect(prompt.toLowerCase()).toMatch(/merge/i)
  })

  it('mentions returning JSON with approved and comments fields', () => {
    const prompt = buildAutoReviewPrompt(diff)
    expect(prompt).toContain('approved')
    expect(prompt).toContain('comments')
  })

  it('does not return empty string', () => {
    expect(buildAutoReviewPrompt(diff).length).toBeGreaterThan(0)
  })

  it('does not contain ${undefined} or [object Object]', () => {
    const prompt = buildAutoReviewPrompt(diff)
    expect(prompt).not.toContain('${undefined}')
    expect(prompt).not.toContain('[object Object]')
  })
})

describe('buildAutoReviewFixPrompt', () => {
  const comments: ReviewComment[] = [
    { path: 'src/middleware/rate-limit.ts', line: 10, body: 'Missing error handling here' },
    { path: 'src/index.ts', line: 5, body: 'This import is unused' },
  ]

  it('contains each comment body', () => {
    const prompt = buildAutoReviewFixPrompt(comments)
    for (const comment of comments) {
      expect(prompt).toContain(comment.body)
    }
  })

  it('contains each file path', () => {
    const prompt = buildAutoReviewFixPrompt(comments)
    for (const comment of comments) {
      expect(prompt).toContain(comment.path)
    }
  })

  it('contains instruction to fix the issues', () => {
    const prompt = buildAutoReviewFixPrompt(comments)
    expect(prompt.toLowerCase()).toMatch(/fix|address|resolve/i)
  })

  it('does not return empty string', () => {
    expect(buildAutoReviewFixPrompt(comments).length).toBeGreaterThan(0)
  })

  it('does not contain ${undefined} or [object Object]', () => {
    const prompt = buildAutoReviewFixPrompt(comments)
    expect(prompt).not.toContain('${undefined}')
    expect(prompt).not.toContain('[object Object]')
  })
})

describe('buildHumanClarificationPrompt', () => {
  const comments: ReviewComment[] = [
    { path: 'src/index.ts', line: 5, body: 'Potential null dereference' },
  ]

  it('contains the round count', () => {
    const prompt = buildHumanClarificationPrompt(comments, 3)
    expect(prompt).toContain('3')
  })

  it('contains the comment body', () => {
    const prompt = buildHumanClarificationPrompt(comments, 2)
    expect(prompt).toContain('Potential null dereference')
  })

  it('contains the file path', () => {
    const prompt = buildHumanClarificationPrompt(comments, 1)
    expect(prompt).toContain('src/index.ts')
  })

  it('asks for human action', () => {
    const prompt = buildHumanClarificationPrompt(comments, 1)
    expect(prompt.toLowerCase()).toMatch(/review|fix|guidance/i)
  })

  it('does not return empty string', () => {
    expect(buildHumanClarificationPrompt(comments, 1).length).toBeGreaterThan(0)
  })

  it('does not contain ${undefined} or [object Object]', () => {
    const prompt = buildHumanClarificationPrompt(comments, 1)
    expect(prompt).not.toContain('${undefined}')
    expect(prompt).not.toContain('[object Object]')
  })
})
