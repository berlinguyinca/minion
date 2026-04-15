import { describe, it, expect } from 'vitest'
import { ConsoleProgressReporter } from '../../../src/pipeline/progress.js'

describe('ConsoleProgressReporter', () => {
  it('writes in-place progress updates with elapsed time and ETA', () => {
    let now = 0
    const writes: string[] = []
    const output = {
      write: (chunk: string) => {
        writes.push(chunk)
      },
      isTTY: true,
    }

    const reporter = new ConsoleProgressReporter(output, () => now)

    reporter.beginRepo('merge', 1, 2, 'acme/api', 3)
    reporter.beginItem('merge', 'acme/api', 1, 2, 'PR #9', 1, 3)
    reporter.update('cloning repo')
    now = 10_000
    reporter.complete('merged')

    now = 10_000
    reporter.beginItem('merge', 'acme/api', 1, 2, 'PR #10', 2, 3)
    now = 12_000
    reporter.update('rebasing onto main')

    expect(writes[0]).toContain('Repo 1/2: acme/api (3 items)')
    expect(writes.some((chunk) => chunk.includes('\r\x1b[2K[merge] 1/2 1/3 acme/api PR #9: cloning repo'))).toBe(true)
    expect(writes.some((chunk) => chunk.includes('merged') && chunk.includes('elapsed 10s'))).toBe(true)
    expect(writes.some((chunk) => chunk.includes('eta 10s'))).toBe(true)
  })
})
