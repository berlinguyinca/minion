import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runTui } from '../../../src/cli/tui.js'
import type { TuiDeps } from '../../../src/cli/tui.js'

function makeDeps(overrides?: Partial<TuiDeps>): TuiDeps {
  return {
    listUserRepos: vi.fn().mockResolvedValue([
      { owner: 'org', name: 'api', description: 'API service' },
    ]),
    fetchLabels: vi.fn().mockResolvedValue(['bug', 'enhancement', 'docs']),
    createIssue: vi.fn().mockResolvedValue({
      number: 42,
      url: 'https://github.com/org/api/issues/42',
    }),
    promptSearch: vi.fn(),
    promptInput: vi.fn(),
    promptCheckbox: vi.fn().mockResolvedValue([]),
    configRepos: [{ owner: 'org', name: 'api' }],
    output: { log: vi.fn(), error: vi.fn() },
    ...overrides,
  }
}

/** Simulate ExitPromptError thrown by @inquirer/core on Ctrl+C */
function exitPromptError(): Error {
  const err = new Error('User force closed the prompt')
  err.name = 'ExitPromptError'
  return err
}

describe('runTui', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // 1. Happy path
  // promptSearch: repo → draft-review('submit') → post-submit('quit')
  // -----------------------------------------------------------------------
  it('creates an issue and quits on user choice', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' }) // repo
        .mockResolvedValueOnce('submit')                       // draft review
        .mockResolvedValueOnce('quit'),                        // post-submit
      promptInput: vi.fn()
        .mockResolvedValueOnce('Bug: login fails')   // title
        .mockResolvedValueOnce('Steps to reproduce'), // body
      promptCheckbox: vi.fn().mockResolvedValueOnce(['bug']),
    })

    const code = await runTui(deps)

    expect(code).toBe(0)
    expect(deps.createIssue).toHaveBeenCalledWith(
      'org', 'api', 'Bug: login fails', 'Steps to reproduce', ['bug'],
    )
    expect(deps.output.log).toHaveBeenCalledWith(
      expect.stringContaining('Issue #42 created'),
    )
  })

  // -----------------------------------------------------------------------
  // 2. No config repos — uses API repos
  // -----------------------------------------------------------------------
  it('works with no config repos, showing API repos', async () => {
    const deps = makeDeps({
      configRepos: [],
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' }) // repo
        .mockResolvedValueOnce('submit')                       // draft review
        .mockResolvedValueOnce('quit'),                        // post-submit
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
    })

    const code = await runTui(deps)

    expect(code).toBe(0)
    expect(deps.listUserRepos).toHaveBeenCalledOnce()
    expect(deps.createIssue).toHaveBeenCalledOnce()
  })

  // -----------------------------------------------------------------------
  // 3. Cancel at repo selection (Ctrl+C)
  // -----------------------------------------------------------------------
  it('exits cleanly on Ctrl+C at repo selection', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn().mockRejectedValueOnce(exitPromptError()),
    })

    const code = await runTui(deps)

    expect(code).toBe(0)
    expect(deps.createIssue).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 4. Cancel at title prompt
  // -----------------------------------------------------------------------
  it('exits cleanly on Ctrl+C at title prompt', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn().mockResolvedValueOnce({ owner: 'org', name: 'api' }),
      promptInput: vi.fn().mockRejectedValueOnce(exitPromptError()),
    })

    const code = await runTui(deps)

    expect(code).toBe(0)
    expect(deps.createIssue).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 5. Cancel at body prompt
  // -----------------------------------------------------------------------
  it('exits cleanly on Ctrl+C at body prompt', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn().mockResolvedValueOnce({ owner: 'org', name: 'api' }),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockRejectedValueOnce(exitPromptError()),
    })

    const code = await runTui(deps)

    expect(code).toBe(0)
    expect(deps.createIssue).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 6. Submit failure (API error)
  // -----------------------------------------------------------------------
  it('shows error on submit failure and continues loop', async () => {
    const deps = makeDeps({
      createIssue: vi.fn().mockRejectedValueOnce(new Error('rate limited')),
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' }) // repo
        .mockResolvedValueOnce('submit')                       // draft review
        .mockResolvedValueOnce('quit'),                        // post-submit
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
    })

    const code = await runTui(deps)

    expect(code).toBe(0)
    expect(deps.output.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create issue'),
    )
    expect(deps.output.error).toHaveBeenCalledWith(
      expect.stringContaining('rate limited'),
    )
  })

  // -----------------------------------------------------------------------
  // 7. Empty title rejected (validation)
  // -----------------------------------------------------------------------
  it('validates title is non-empty', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('submit')
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Valid title')
        .mockResolvedValueOnce('Valid body'),
    })

    await runTui(deps)

    // Extract the validate function from the title prompt call
    const titleCall = (deps.promptInput as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { validate?: (v: string) => boolean | string }
    expect(titleCall.validate?.('')).toBe('This field is required')
    expect(titleCall.validate?.('  ')).toBe('This field is required')
    expect(titleCall.validate?.('Valid')).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 8. Empty body rejected (validation)
  // -----------------------------------------------------------------------
  it('validates body is non-empty', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('submit')
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
    })

    await runTui(deps)

    const bodyCall = (deps.promptInput as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as { validate?: (v: string) => boolean | string }
    expect(bodyCall.validate?.('')).toBe('This field is required')
    expect(bodyCall.validate?.('Valid')).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 9. No labels selected (skip)
  // -----------------------------------------------------------------------
  it('submits with empty labels when none selected', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('submit')
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
      promptCheckbox: vi.fn().mockResolvedValueOnce([]),
    })

    await runTui(deps)

    expect(deps.createIssue).toHaveBeenCalledWith(
      'org', 'api', 'Title', 'Body', [],
    )
  })

  // -----------------------------------------------------------------------
  // 10. Label fetch failure
  // -----------------------------------------------------------------------
  it('continues with empty labels when fetchLabels fails', async () => {
    const deps = makeDeps({
      fetchLabels: vi.fn().mockRejectedValueOnce(new Error('API error')),
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('submit')
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
    })

    await runTui(deps)

    expect(deps.output.error).toHaveBeenCalledWith(
      expect.stringContaining('Could not fetch labels'),
    )
    // promptCheckbox should NOT be called since labels are empty
    expect(deps.promptCheckbox).not.toHaveBeenCalled()
    expect(deps.createIssue).toHaveBeenCalledWith(
      'org', 'api', 'Title', 'Body', [],
    )
  })

  // -----------------------------------------------------------------------
  // 11. Multiple issues in same repo (loop)
  // promptSearch: repo → submit → new-issue → submit → quit
  // -----------------------------------------------------------------------
  it('loops for multiple issues in same repo', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' }) // repo
        .mockResolvedValueOnce('submit')                       // draft review #1
        .mockResolvedValueOnce('new-issue')                    // post-submit #1
        .mockResolvedValueOnce('submit')                       // draft review #2
        .mockResolvedValueOnce('quit'),                        // post-submit #2
      promptInput: vi.fn()
        .mockResolvedValueOnce('First title')
        .mockResolvedValueOnce('First body')
        .mockResolvedValueOnce('Second title')
        .mockResolvedValueOnce('Second body'),
      promptCheckbox: vi.fn()
        .mockResolvedValueOnce(['bug'])
        .mockResolvedValueOnce([]),
      createIssue: vi.fn()
        .mockResolvedValueOnce({ number: 1, url: 'https://github.com/org/api/issues/1' })
        .mockResolvedValueOnce({ number: 2, url: 'https://github.com/org/api/issues/2' }),
    })

    const code = await runTui(deps)

    expect(code).toBe(0)
    expect(deps.createIssue).toHaveBeenCalledTimes(2)
    // Labels only fetched once (cached)
    expect(deps.fetchLabels).toHaveBeenCalledTimes(1)
  })

  // -----------------------------------------------------------------------
  // 12. Repo switch via menu
  // promptSearch: repo1 → submit → switch-repo → repo2 → submit → quit
  // -----------------------------------------------------------------------
  it('switches repo when user selects switch-repo', async () => {
    const deps = makeDeps({
      fetchLabels: vi.fn()
        .mockResolvedValueOnce(['bug'])
        .mockResolvedValueOnce(['feature']),
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })  // repo 1
        .mockResolvedValueOnce('submit')                         // draft review #1
        .mockResolvedValueOnce('switch-repo')                    // post-submit #1
        .mockResolvedValueOnce({ owner: 'other', name: 'lib' }) // repo 2
        .mockResolvedValueOnce('submit')                         // draft review #2
        .mockResolvedValueOnce('quit'),                          // post-submit #2
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title 1')
        .mockResolvedValueOnce('Body 1')
        .mockResolvedValueOnce('Title 2')
        .mockResolvedValueOnce('Body 2'),
      promptCheckbox: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      createIssue: vi.fn()
        .mockResolvedValueOnce({ number: 1, url: 'url1' })
        .mockResolvedValueOnce({ number: 2, url: 'url2' }),
    })

    const code = await runTui(deps)

    expect(code).toBe(0)
    // Labels re-fetched for second repo
    expect(deps.fetchLabels).toHaveBeenCalledTimes(2)
    expect(deps.fetchLabels).toHaveBeenCalledWith('org', 'api')
    expect(deps.fetchLabels).toHaveBeenCalledWith('other', 'lib')
  })

  // -----------------------------------------------------------------------
  // listUserRepos failure
  // -----------------------------------------------------------------------
  it('continues with config repos only when listUserRepos fails', async () => {
    const deps = makeDeps({
      listUserRepos: vi.fn().mockRejectedValueOnce(new Error('Network error')),
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('submit')
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
    })

    const code = await runTui(deps)

    expect(code).toBe(0)
    expect(deps.output.error).toHaveBeenCalledWith(
      expect.stringContaining('Could not fetch repos from GitHub API'),
    )
  })

  // -----------------------------------------------------------------------
  // Post-submit menu source function
  // promptSearch: repo → submit → intercept post-submit source
  // -----------------------------------------------------------------------
  it('post-submit menu source returns 3 action choices', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' }) // repo
        .mockResolvedValueOnce('submit')                       // draft review
        // Intercept the post-submit menu to test its source callback
        .mockImplementationOnce(async (config: { source: (term: string | undefined) => Promise<Array<{ name: string; value: string }>> }) => {
          const choices = await config.source(undefined)
          expect(choices).toHaveLength(3)
          expect(choices[0]?.value).toBe('new-issue')
          expect(choices[1]?.value).toBe('switch-repo')
          expect(choices[2]?.value).toBe('quit')
          return 'quit'
        }),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
    })

    await runTui(deps)
  })

  // -----------------------------------------------------------------------
  // Submit failure with non-Error thrown
  // -----------------------------------------------------------------------
  it('handles non-Error throw from createIssue', async () => {
    const deps = makeDeps({
      createIssue: vi.fn().mockRejectedValueOnce('string error'),
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('submit')
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
    })

    await runTui(deps)

    expect(deps.output.error).toHaveBeenCalledWith(
      expect.stringContaining('string error'),
    )
  })

  // -----------------------------------------------------------------------
  // Non-ExitPromptError re-thrown
  // -----------------------------------------------------------------------
  it('re-throws non-ExitPromptError exceptions', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn().mockRejectedValueOnce(new Error('Unexpected error')),
    })

    await expect(runTui(deps)).rejects.toThrow('Unexpected error')
  })

  // -----------------------------------------------------------------------
  // Repo selection source function
  // -----------------------------------------------------------------------
  it('repo search source filters by term', async () => {
    const deps = makeDeps({
      configRepos: [
        { owner: 'org', name: 'api' },
        { owner: 'org', name: 'web' },
      ],
      listUserRepos: vi.fn().mockResolvedValue([
        { owner: 'other', name: 'lib', description: 'A library' },
      ]),
      promptSearch: vi.fn()
        .mockImplementationOnce(async (config: { source: (term: string | undefined) => Promise<Array<{ name: string; value: unknown }>> }) => {
          // Test the source function
          const allResults = await config.source(undefined)
          expect(allResults).toHaveLength(3) // 2 config + 1 API (no duplicates)

          const filtered = await config.source('web')
          expect(filtered).toHaveLength(1)
          expect(filtered[0]?.name).toBe('org/web')

          return { owner: 'org', name: 'api' }
        })
        .mockResolvedValueOnce('submit')  // draft review
        .mockResolvedValueOnce('quit'),    // post-submit
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
      promptCheckbox: vi.fn().mockResolvedValueOnce([]),
    })

    await runTui(deps)

    expect(deps.listUserRepos).toHaveBeenCalledOnce()
  })

  // -----------------------------------------------------------------------
  // Duplicate repos filtered
  // -----------------------------------------------------------------------
  it('deduplicates API repos already in config', async () => {
    const deps = makeDeps({
      configRepos: [{ owner: 'org', name: 'api' }],
      listUserRepos: vi.fn().mockResolvedValue([
        { owner: 'org', name: 'api', description: 'same repo' }, // duplicate
        { owner: 'org', name: 'web', description: 'different' },
      ]),
      promptSearch: vi.fn()
        .mockImplementationOnce(async (config: { source: (term: string | undefined) => Promise<Array<{ name: string; value: unknown }>> }) => {
          const results = await config.source(undefined)
          // Should have 2: org/api (from config) + org/web (from API, deduplicated)
          expect(results).toHaveLength(2)
          return { owner: 'org', name: 'api' }
        })
        .mockResolvedValueOnce('submit')  // draft review
        .mockResolvedValueOnce('quit'),    // post-submit
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
      promptCheckbox: vi.fn().mockResolvedValueOnce([]),
    })

    await runTui(deps)
  })

  // -----------------------------------------------------------------------
  // Draft review: displays draft before submit
  // -----------------------------------------------------------------------
  it('displays draft title and body before review menu', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('submit')
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('My Title')
        .mockResolvedValueOnce('My Body'),
    })

    await runTui(deps)

    expect(deps.output.log).toHaveBeenCalledWith(expect.stringContaining('My Title'))
    expect(deps.output.log).toHaveBeenCalledWith(expect.stringContaining('My Body'))
  })

  // -----------------------------------------------------------------------
  // Draft review: truncates long body
  // -----------------------------------------------------------------------
  it('truncates long body in draft preview', async () => {
    const longBody = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n')
    const deps = makeDeps({
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('submit')
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce(longBody),
    })

    await runTui(deps)

    expect(deps.output.log).toHaveBeenCalledWith(expect.stringContaining('truncated'))
    // Full body still submitted
    expect(deps.createIssue).toHaveBeenCalledWith('org', 'api', 'Title', longBody, [])
  })

  // -----------------------------------------------------------------------
  // Draft review: polish option hidden when polishText undefined
  // -----------------------------------------------------------------------
  it('draft review menu has no polish option when polishText is undefined', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockImplementationOnce(async (config: { source: (term: string | undefined) => Promise<Array<{ name: string; value: string }>> }) => {
          const choices = await config.source(undefined)
          const values = choices.map((c) => c.value)
          expect(values).toContain('submit')
          expect(values).not.toContain('polish')
          expect(values).toContain('edit-title')
          expect(values).toContain('edit-body')
          return 'submit'
        })
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
    })

    await runTui(deps)
  })

  // -----------------------------------------------------------------------
  // Draft review: polish option visible when polishText provided
  // -----------------------------------------------------------------------
  it('draft review menu includes polish option when polishText is provided', async () => {
    const deps = makeDeps({
      polishText: vi.fn().mockResolvedValueOnce({ title: 'Polished', body: 'Better' }),
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockImplementationOnce(async (config: { source: (term: string | undefined) => Promise<Array<{ name: string; value: string }>> }) => {
          const choices = await config.source(undefined)
          const values = choices.map((c) => c.value)
          expect(values).toContain('polish')
          return 'submit'
        })
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
    })

    await runTui(deps)
  })

  // -----------------------------------------------------------------------
  // Draft review: polish updates title and body
  // promptSearch: repo → polish → submit → quit
  // -----------------------------------------------------------------------
  it('polish updates title and body before submission', async () => {
    const polishFn = vi.fn().mockResolvedValueOnce({ title: 'Polished Title', body: 'Polished Body' })
    const deps = makeDeps({
      polishText: polishFn,
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' }) // repo
        .mockResolvedValueOnce('polish')                       // draft review: polish
        .mockResolvedValueOnce('submit')                       // draft review: submit (after polish)
        .mockResolvedValueOnce('quit'),                        // post-submit
      promptInput: vi.fn()
        .mockResolvedValueOnce('Raw Title')
        .mockResolvedValueOnce('Raw Body'),
    })

    await runTui(deps)

    expect(polishFn).toHaveBeenCalledWith('Raw Title', 'Raw Body')
    expect(deps.createIssue).toHaveBeenCalledWith(
      'org', 'api', 'Polished Title', 'Polished Body', [],
    )
    expect(deps.output.log).toHaveBeenCalledWith('Polished successfully.')
  })

  // -----------------------------------------------------------------------
  // Draft review: polish returns undefined (no changes)
  // -----------------------------------------------------------------------
  it('shows no-changes message when polish returns undefined', async () => {
    const deps = makeDeps({
      polishText: vi.fn().mockResolvedValueOnce(undefined),
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('polish')
        .mockResolvedValueOnce('submit')
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
    })

    await runTui(deps)

    expect(deps.output.log).toHaveBeenCalledWith('No changes suggested.')
    // Original text submitted
    expect(deps.createIssue).toHaveBeenCalledWith('org', 'api', 'Title', 'Body', [])
  })

  // -----------------------------------------------------------------------
  // Draft review: polish failure is graceful
  // -----------------------------------------------------------------------
  it('continues with original text when polish fails', async () => {
    const deps = makeDeps({
      polishText: vi.fn().mockRejectedValueOnce(new Error('MAP crashed')),
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('polish')
        .mockResolvedValueOnce('submit')
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Original Title')
        .mockResolvedValueOnce('Original Body'),
    })

    await runTui(deps)

    expect(deps.output.error).toHaveBeenCalledWith(
      expect.stringContaining('Polish failed: MAP crashed'),
    )
    // Original text submitted unchanged
    expect(deps.createIssue).toHaveBeenCalledWith(
      'org', 'api', 'Original Title', 'Original Body', [],
    )
  })

  // -----------------------------------------------------------------------
  // Draft review: polish failure with non-Error value
  // -----------------------------------------------------------------------
  it('handles non-Error throw from polishText', async () => {
    const deps = makeDeps({
      polishText: vi.fn().mockRejectedValueOnce('string failure'),
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('polish')
        .mockResolvedValueOnce('submit')
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
    })

    await runTui(deps)

    expect(deps.output.error).toHaveBeenCalledWith(
      expect.stringContaining('Polish failed: string failure'),
    )
    expect(deps.createIssue).toHaveBeenCalledWith(
      'org', 'api', 'Title', 'Body', [],
    )
  })

  // -----------------------------------------------------------------------
  // Draft review: edit title
  // promptSearch: repo → edit-title → submit → quit
  // promptInput: title → body → new-title
  // -----------------------------------------------------------------------
  it('allows editing title in draft review loop', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('edit-title')
        .mockResolvedValueOnce('submit')
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Old Title')    // initial title
        .mockResolvedValueOnce('Body')          // initial body
        .mockResolvedValueOnce('New Title'),    // edited title
    })

    await runTui(deps)

    expect(deps.createIssue).toHaveBeenCalledWith(
      'org', 'api', 'New Title', 'Body', [],
    )
  })

  // -----------------------------------------------------------------------
  // Draft review: edit body
  // promptSearch: repo → edit-body → submit → quit
  // promptInput: title → body → new-body
  // -----------------------------------------------------------------------
  it('allows editing body in draft review loop', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('edit-body')
        .mockResolvedValueOnce('submit')
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')          // initial title
        .mockResolvedValueOnce('Old Body')        // initial body
        .mockResolvedValueOnce('New Body'),       // edited body
    })

    await runTui(deps)

    expect(deps.createIssue).toHaveBeenCalledWith(
      'org', 'api', 'Title', 'New Body', [],
    )
  })
})
