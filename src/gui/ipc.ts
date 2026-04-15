import type { IpcMain } from 'electron'
import type { IssueWorkspace } from '../cli/workspace.js'
import type { RepoConfig } from '../types/index.js'

export const GUI_IPC_CHANNELS = {
  listRepos: 'minion:list-repos',
  listLabels: 'minion:list-labels',
  listOpenIssues: 'minion:list-open-issues',
  getIssue: 'minion:get-issue',
  listComments: 'minion:list-comments',
  createIssue: 'minion:create-issue',
  updateIssue: 'minion:update-issue',
  closeIssue: 'minion:close-issue',
  postComment: 'minion:post-comment',
  polish: 'minion:polish',
  runIssue: 'minion:run-issue',
} as const

export function registerGuiIpcHandlers(ipcMain: Pick<IpcMain, 'handle'>, workspace: IssueWorkspace): void {
  ipcMain.handle(GUI_IPC_CHANNELS.listRepos, async () => {
    let apiRepos: Awaited<ReturnType<IssueWorkspace['listUserRepos']>> = []
    try {
      apiRepos = await workspace.listUserRepos()
    } catch {
      apiRepos = []
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
  ipcMain.handle(GUI_IPC_CHANNELS.getIssue, async (_event, owner: string, name: string, number: number) => workspace.fetchIssueDetail(owner, name, number))
  ipcMain.handle(GUI_IPC_CHANNELS.listComments, async (_event, owner: string, name: string, number: number) => workspace.listIssueComments(owner, name, number))
  ipcMain.handle(GUI_IPC_CHANNELS.createIssue, async (_event, owner: string, name: string, title: string, body: string, labels: string[]) => workspace.createIssue(owner, name, title, body, labels))
  ipcMain.handle(GUI_IPC_CHANNELS.updateIssue, async (_event, owner: string, name: string, number: number, title: string, body: string) => workspace.updateIssue(owner, name, number, title, body))
  ipcMain.handle(GUI_IPC_CHANNELS.closeIssue, async (_event, owner: string, name: string, number: number) => workspace.closeIssue(owner, name, number))
  ipcMain.handle(GUI_IPC_CHANNELS.postComment, async (_event, owner: string, name: string, number: number, body: string) => workspace.postIssueComment(owner, name, number, body))
  ipcMain.handle(GUI_IPC_CHANNELS.polish, async (_event, title: string, body: string) => workspace.polishText?.(title, body))
  ipcMain.handle(GUI_IPC_CHANNELS.runIssue, async (_event, repo: RepoConfig, number: number) => {
    if (workspace.runExplicitIssue === undefined) {
      throw new Error('Explicit issue runs are not available')
    }
    return workspace.runExplicitIssue(repo, number)
  })
}
