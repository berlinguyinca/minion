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
  // -----------------------------------------------------------------------
  it('creates an issue and quits on user choice', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn()
        // repo selection
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        // post-submit menu
        .mockResolvedValueOnce('quit'),
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
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        .mockResolvedValueOnce('quit'),
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
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        // post-submit menu after failure
        .mockResolvedValueOnce('quit'),
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
  // -----------------------------------------------------------------------
  it('loops for multiple issues in same repo', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        // first post-submit: new issue
        .mockResolvedValueOnce('new-issue')
        // second post-submit: quit
        .mockResolvedValueOnce('quit'),
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
  // -----------------------------------------------------------------------
  it('switches repo when user selects switch-repo', async () => {
    const deps = makeDeps({
      fetchLabels: vi.fn()
        .mockResolvedValueOnce(['bug'])
        .mockResolvedValueOnce(['feature']),
      promptSearch: vi.fn()
        // first repo selection
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
        // post-submit: switch repo
        .mockResolvedValueOnce('switch-repo')
        // second repo selection
        .mockResolvedValueOnce({ owner: 'other', name: 'lib' })
        // post-submit: quit
        .mockResolvedValueOnce('quit'),
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
  // Additional: listUserRepos failure
  // -----------------------------------------------------------------------
  it('continues with config repos only when listUserRepos fails', async () => {
    const deps = makeDeps({
      listUserRepos: vi.fn().mockRejectedValueOnce(new Error('Network error')),
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
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
  // -----------------------------------------------------------------------
  it('post-submit menu source returns 3 action choices', async () => {
    const deps = makeDeps({
      promptSearch: vi.fn()
        .mockResolvedValueOnce({ owner: 'org', name: 'api' })
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
  // Additional: Non-ExitPromptError re-thrown
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
        // post-submit menu
        .mockResolvedValueOnce('quit'),
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
        // post-submit menu
        .mockResolvedValueOnce('quit'),
      promptInput: vi.fn()
        .mockResolvedValueOnce('Title')
        .mockResolvedValueOnce('Body'),
      promptCheckbox: vi.fn().mockResolvedValueOnce([]),
    })

    await runTui(deps)
  })
})
