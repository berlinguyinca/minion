import type { IpcMain } from 'electron'
import type { IssueWorkspace } from '../cli/workspace.js'
import type { RepoConfig } from '../types/index.js'
import type { PolishIssueTextOptions } from '../ai/polish.js'

export const GUI_IPC_CHANNELS = {
  listRepos: 'minion:list-repos',
  listLabels: 'minion:list-labels',
  listOpenIssues: 'minion:list-open-issues',
  listOpenIssuesPage: 'minion:list-open-issues-page',
  cancelRequest: 'minion:cancel-request',
  getIssue: 'minion:get-issue',
  listComments: 'minion:list-comments',
  createIssue: 'minion:create-issue',
  updateIssue: 'minion:update-issue',
  closeIssue: 'minion:close-issue',
  postComment: 'minion:post-comment',
  polish: 'minion:polish',
  runIssue: 'minion:run-issue',
} as const

interface ListReposOptions {
  includeApi?: boolean
}

export function registerGuiIpcHandlers(ipcMain: Pick<IpcMain, 'handle'>, workspace: IssueWorkspace): void {
  const abortControllers = new Map<string, AbortController>()

  ipcMain.handle(GUI_IPC_CHANNELS.listRepos, async (_event, options?: ListReposOptions) => {
    let apiRepos: Awaited<ReturnType<IssueWorkspace['listUserRepos']>> = []
    if (options?.includeApi !== false) {
      try {
        apiRepos = await workspace.listUserRepos()
      } catch {
        apiRepos = []
      }
    }
    const seen = new Set<string>()
    const repos: RepoConfig[] = []
    for (const repo of [...workspace.configRepos, ...apiRepos]) {
      const key = `${repo.owner}/${repo.name}`
      if (!seen.has(key)) {
        seen.add(key)
        repos.push({ owner: repo.owner, name: repo.name })
      }
    }
    return repos
  })
  ipcMain.handle(GUI_IPC_CHANNELS.listLabels, async (_event, owner: string, name: string) => workspace.fetchLabels(owner, name))
  ipcMain.handle(GUI_IPC_CHANNELS.listOpenIssues, async (_event, owner: string, name: string) => workspace.fetchOpenIssues(owner, name))
  ipcMain.handle(GUI_IPC_CHANNELS.listOpenIssuesPage, async (_event, owner: string, name: string, options?: { page?: number; perPage?: number; etag?: string; requestId?: string }) => {
    const started = Date.now()
    const controller = new AbortController()
    if (options?.requestId !== undefined) {
      abortControllers.get(options.requestId)?.abort()
      abortControllers.set(options.requestId, controller)
    }
    try {
      const result = await workspace.fetchOpenIssuesPage(owner, name, { ...options, signal: controller.signal })
      return { ...result, durationMs: Date.now() - started }
    } finally {
      if (options?.requestId !== undefined && abortControllers.get(options.requestId) === controller) {
        abortControllers.delete(options.requestId)
      }
    }
  })
  ipcMain.handle(GUI_IPC_CHANNELS.cancelRequest, async (_event, requestId: string) => {
    abortControllers.get(requestId)?.abort()
    abortControllers.delete(requestId)
  })
  ipcMain.handle(GUI_IPC_CHANNELS.getIssue, async (_event, owner: string, name: string, number: number) => workspace.fetchIssueDetail(owner, name, number))
  ipcMain.handle(GUI_IPC_CHANNELS.listComments, async (_event, owner: string, name: string, number: number) => workspace.listIssueComments(owner, name, number))
  ipcMain.handle(GUI_IPC_CHANNELS.createIssue, async (_event, owner: string, name: string, title: string, body: string, labels: string[]) => workspace.createIssue(owner, name, title, body, labels))
  ipcMain.handle(GUI_IPC_CHANNELS.updateIssue, async (_event, owner: string, name: string, number: number, title: string, body: string) => workspace.updateIssue(owner, name, number, title, body))
  ipcMain.handle(GUI_IPC_CHANNELS.closeIssue, async (_event, owner: string, name: string, number: number) => workspace.closeIssue(owner, name, number))
  ipcMain.handle(GUI_IPC_CHANNELS.postComment, async (_event, owner: string, name: string, number: number, body: string) => workspace.postIssueComment(owner, name, number, body))
  ipcMain.handle(GUI_IPC_CHANNELS.polish, async (_event, title: string, body: string, options?: PolishIssueTextOptions) => workspace.polishText?.(title, body, options))
  ipcMain.handle(GUI_IPC_CHANNELS.runIssue, async (_event, repo: RepoConfig, number: number) => {
    if (workspace.runExplicitIssue === undefined) {
      throw new Error('Explicit issue runs are not available')
    }
    return workspace.runExplicitIssue(repo, number)
  })
}
