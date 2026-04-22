import { describe, it, expect, vi } from 'vitest'
import { GUI_IPC_CHANNELS, registerGuiIpcHandlers } from '../../../src/gui/ipc.js'

describe('registerGuiIpcHandlers', () => {
  it('registers typed workspace handlers including explicit run forwarding', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = { handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler)) }
    const workspace = {
      configRepos: [{ owner: 'cfg', name: 'repo' }],
      listUserRepos: vi.fn().mockResolvedValue([{ owner: 'api', name: 'repo', pushedAt: '2026-01-01T00:00:00Z' }]),
      fetchLabels: vi.fn().mockResolvedValue(['bug']),
      fetchOpenIssues: vi.fn().mockResolvedValue([{ number: 1, title: 'Bug', labels: [] }]),
      fetchOpenIssuesPage: vi.fn().mockResolvedValue({ issues: [{ number: 1, title: 'Bug', labels: [] }], hasNextPage: true, page: 1, perPage: 25, etag: '"etag"' }),
      fetchIssueDetail: vi.fn().mockResolvedValue({ number: 1, title: 'Bug', body: 'Body', url: 'u', labels: [] }),
      listIssueComments: vi.fn().mockResolvedValue([]),
      createIssue: vi.fn().mockResolvedValue({ number: 2, url: 'new' }),
      updateIssue: vi.fn().mockResolvedValue(undefined),
      closeIssue: vi.fn().mockResolvedValue(undefined),
      postIssueComment: vi.fn().mockResolvedValue(undefined),
      polishText: vi.fn().mockResolvedValue({ title: 'T', body: 'B' }),
      runExplicitIssue: vi.fn().mockResolvedValue({ issueNumber: 1, success: true }),
      getInputMode: vi.fn(),
      setInputMode: vi.fn(),
    }

    registerGuiIpcHandlers(ipcMain as never, workspace as never)

    expect(ipcMain.handle).toHaveBeenCalledTimes(Object.keys(GUI_IPC_CHANNELS).length)
    await expect(handlers.get(GUI_IPC_CHANNELS.listRepos)?.({})).resolves.toEqual([
      { owner: 'cfg', name: 'repo' },
      { owner: 'api', name: 'repo' },
    ])
    await expect(handlers.get(GUI_IPC_CHANNELS.runIssue)?.({}, { owner: 'api', name: 'repo' }, 1)).resolves.toEqual({ issueNumber: 1, success: true })
    expect(workspace.runExplicitIssue).toHaveBeenCalledWith({ owner: 'api', name: 'repo' }, 1)
    await expect(handlers.get(GUI_IPC_CHANNELS.listOpenIssuesPage)?.({}, 'api', 'repo', { page: 1, perPage: 25 })).resolves.toMatchObject({
      issues: [{ number: 1, title: 'Bug', labels: [] }],
      hasNextPage: true,
      page: 1,
      perPage: 25,
      etag: '"etag"',
      durationMs: expect.any(Number),
    })
    expect(workspace.fetchOpenIssuesPage).toHaveBeenCalledWith('api', 'repo', expect.objectContaining({ page: 1, perPage: 25, signal: expect.any(AbortSignal) }))
    await expect(handlers.get(GUI_IPC_CHANNELS.polish)?.({}, 'Title', 'Body', { target: 'comment', comment: 'Draft' })).resolves.toEqual({ title: 'T', body: 'B' })
    expect(workspace.polishText).toHaveBeenCalledWith('Title', 'Body', { target: 'comment', comment: 'Draft' })
  })

  it('falls back to configured repos when API repo listing fails', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = { handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler)) }
    const workspace = {
      configRepos: [{ owner: 'cfg', name: 'repo' }],
      listUserRepos: vi.fn().mockRejectedValue(new Error('api unavailable')),
      fetchLabels: vi.fn(),
      fetchOpenIssues: vi.fn(),
      fetchOpenIssuesPage: vi.fn(),
      fetchIssueDetail: vi.fn(),
      listIssueComments: vi.fn(),
      createIssue: vi.fn(),
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
      postIssueComment: vi.fn(),
      getInputMode: vi.fn(),
      setInputMode: vi.fn(),
    }

    registerGuiIpcHandlers(ipcMain as never, workspace as never)

    await expect(handlers.get(GUI_IPC_CHANNELS.listRepos)?.({})).resolves.toEqual([
      { owner: 'cfg', name: 'repo' },
    ])
  })

  it('can return configured repos without waiting for the GitHub repo listing API', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = { handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler)) }
    const workspace = {
      configRepos: [{ owner: 'cfg', name: 'repo' }],
      listUserRepos: vi.fn().mockResolvedValue([{ owner: 'api', name: 'repo', pushedAt: '2026-01-01T00:00:00Z' }]),
      fetchLabels: vi.fn(),
      fetchOpenIssues: vi.fn(),
      fetchOpenIssuesPage: vi.fn(),
      fetchIssueDetail: vi.fn(),
      listIssueComments: vi.fn(),
      createIssue: vi.fn(),
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
      postIssueComment: vi.fn(),
      getInputMode: vi.fn(),
      setInputMode: vi.fn(),
    }

    registerGuiIpcHandlers(ipcMain as never, workspace as never)

    await expect(handlers.get(GUI_IPC_CHANNELS.listRepos)?.({}, { includeApi: false })).resolves.toEqual([
      { owner: 'cfg', name: 'repo' },
    ])
    expect(workspace.listUserRepos).not.toHaveBeenCalled()
  })

  it('aborts an in-flight paged issue request by request id', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = { handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler)) }
    let capturedSignal: AbortSignal | undefined
    const workspace = {
      configRepos: [],
      listUserRepos: vi.fn(),
      fetchLabels: vi.fn(),
      fetchOpenIssues: vi.fn(),
      fetchOpenIssuesPage: vi.fn((_owner, _name, options) => {
        capturedSignal = options.signal
        return new Promise(() => {})
      }),
      fetchIssueDetail: vi.fn(),
      listIssueComments: vi.fn(),
      createIssue: vi.fn(),
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
      postIssueComment: vi.fn(),
      getInputMode: vi.fn(),
      setInputMode: vi.fn(),
    }

    registerGuiIpcHandlers(ipcMain as never, workspace as never)

    void handlers.get(GUI_IPC_CHANNELS.listOpenIssuesPage)?.({}, 'api', 'repo', { requestId: 'issues-1' })
    await Promise.resolve()
    await handlers.get(GUI_IPC_CHANNELS.cancelRequest)?.({}, 'issues-1')

    expect(capturedSignal?.aborted).toBe(true)
  })
})
