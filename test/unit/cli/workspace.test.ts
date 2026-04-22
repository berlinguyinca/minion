import { describe, it, expect, vi } from 'vitest'
import { createIssueWorkspace } from '../../../src/cli/workspace.js'

describe('createIssueWorkspace', () => {
  it('wires GitHub issue operations, config repos, polish, and input mode state', async () => {
    const github = {
      listUserRepos: vi.fn().mockResolvedValue([{ owner: 'acme', name: 'api', pushedAt: '2026-01-01T00:00:00Z' }]),
      fetchLabels: vi.fn().mockResolvedValue(['bug']),
      fetchOpenIssues: vi.fn().mockResolvedValue([{ number: 1, title: 'Bug', labels: ['bug'] }]),
      fetchOpenIssuesPage: vi.fn().mockResolvedValue({
        issues: [{ number: 1, title: 'Bug', labels: ['bug'] }],
        hasNextPage: false,
        page: 1,
        perPage: 25,
        etag: '"etag"',
      }),
      fetchIssueDetail: vi.fn().mockResolvedValue({ number: 1, title: 'Bug', body: 'Body', url: 'u', labels: [] }),
      createIssue: vi.fn().mockResolvedValue({ number: 2, url: 'new' }),
      updateIssue: vi.fn().mockResolvedValue(undefined),
      closeIssue: vi.fn().mockResolvedValue(undefined),
      listIssueComments: vi.fn().mockResolvedValue([{ author: 'alice', body: 'hi', createdAt: '2026-01-01T00:00:00Z' }]),
      postIssueComment: vi.fn().mockResolvedValue(undefined),
    }
    const state = {
      getInputMode: vi.fn().mockReturnValue('vim'),
      setInputMode: vi.fn(),
    }
    const polishText = vi.fn().mockResolvedValue({ title: 'Polished', body: 'Body' })

    const workspace = createIssueWorkspace({
      github: github as never,
      configRepos: [{ owner: 'acme', name: 'api' }],
      state: state as never,
      polishText,
    })

    await expect(workspace.listUserRepos()).resolves.toHaveLength(1)
    await expect(workspace.fetchLabels('acme', 'api')).resolves.toEqual(['bug'])
    await expect(workspace.fetchOpenIssues('acme', 'api')).resolves.toEqual([{ number: 1, title: 'Bug', labels: ['bug'] }])
    await expect(workspace.fetchOpenIssuesPage('acme', 'api', { page: 1, perPage: 25 })).resolves.toEqual({
      issues: [{ number: 1, title: 'Bug', labels: ['bug'] }],
      hasNextPage: false,
      page: 1,
      perPage: 25,
      etag: '"etag"',
    })
    await expect(workspace.fetchIssueDetail('acme', 'api', 1)).resolves.toEqual({ number: 1, title: 'Bug', body: 'Body', url: 'u', labels: [] })
    await workspace.createIssue('acme', 'api', 'T', 'B', ['bug'])
    await workspace.updateIssue('acme', 'api', 1, 'T', 'B')
    await workspace.closeIssue('acme', 'api', 1)
    await workspace.listIssueComments('acme', 'api', 1)
    await workspace.postIssueComment('acme', 'api', 1, 'comment')
    await expect(workspace.polishText?.('T', 'B')).resolves.toEqual({ title: 'Polished', body: 'Body' })
    expect(workspace.configRepos).toEqual([{ owner: 'acme', name: 'api' }])
    expect(workspace.getInputMode()).toBe('vim')
    workspace.setInputMode('basic')
    expect(state.setInputMode).toHaveBeenCalledWith('basic')
  })

  it('optionally wires explicit issue runs', async () => {
    const explicitRunner = { runIssue: vi.fn().mockResolvedValue({ issueNumber: 7, success: true }) }
    const workspace = createIssueWorkspace({
      github: {
        listUserRepos: vi.fn(), fetchLabels: vi.fn(), fetchOpenIssues: vi.fn(), fetchIssueDetail: vi.fn(),
        createIssue: vi.fn(), updateIssue: vi.fn(), closeIssue: vi.fn(), listIssueComments: vi.fn(), postIssueComment: vi.fn(),
      } as never,
      configRepos: [],
      state: { getInputMode: vi.fn().mockReturnValue('basic'), setInputMode: vi.fn() } as never,
      explicitRunner: explicitRunner as never,
    })

    await expect(workspace.runExplicitIssue?.({ owner: 'acme', name: 'api' }, 7)).resolves.toEqual({ issueNumber: 7, success: true })
    expect(explicitRunner.runIssue).toHaveBeenCalledWith({ owner: 'acme', name: 'api' }, 7)
  })
})
