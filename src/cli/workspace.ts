import type { GitHubClient } from '../github/client.js'
import type { ProcessingResult, RepoConfig } from '../types/index.js'
import type { ExplicitIssueRunner } from '../pipeline/explicit-runner.js'
import type { TuiDeps } from './hooks/useDeps.js'

type InputMode = 'vim' | 'basic'

type WorkspaceGitHub = Pick<GitHubClient,
  | 'listUserRepos'
  | 'fetchLabels'
  | 'fetchOpenIssues'
  | 'fetchIssueDetail'
  | 'createIssue'
  | 'updateIssue'
  | 'closeIssue'
  | 'listIssueComments'
  | 'postIssueComment'
>

interface WorkspaceState {
  getInputMode(): InputMode
  setInputMode(mode: InputMode): void
}

export interface IssueWorkspace extends TuiDeps {
  runExplicitIssue?: (repo: RepoConfig, issueNumber: number) => Promise<ProcessingResult>
}

export interface CreateIssueWorkspaceOptions {
  github: WorkspaceGitHub
  configRepos: RepoConfig[]
  state: WorkspaceState
  polishText?: (title: string, body: string) => Promise<{ title: string; body: string } | undefined>
  explicitRunner?: Pick<ExplicitIssueRunner, 'runIssue'>
}

export function createIssueWorkspace(options: CreateIssueWorkspaceOptions): IssueWorkspace {
  const workspace: IssueWorkspace = {
    listUserRepos: () => options.github.listUserRepos(),
    fetchLabels: (owner, name) => options.github.fetchLabels(owner, name),
    fetchOpenIssues: async (owner, name) => {
      const issues = await options.github.fetchOpenIssues(owner, name)
      return issues.map((issue) => ({ number: issue.number, title: issue.title, labels: issue.labels }))
    },
    fetchIssueDetail: (owner, name, number) => options.github.fetchIssueDetail(owner, name, number),
    createIssue: (owner, name, title, body, labels) => options.github.createIssue(owner, name, title, body, labels),
    updateIssue: (owner, name, number, title, body) => options.github.updateIssue(owner, name, number, title, body),
    closeIssue: (owner, name, number) => options.github.closeIssue(owner, name, number),
    listIssueComments: (owner, name, number) => options.github.listIssueComments(owner, name, number),
    postIssueComment: (owner, name, number, body) => options.github.postIssueComment(owner, name, number, body),
    configRepos: options.configRepos,
    getInputMode: () => options.state.getInputMode(),
    setInputMode: (mode) => options.state.setInputMode(mode),
  }

  if (options.polishText !== undefined) {
    workspace.polishText = options.polishText
  }
  if (options.explicitRunner !== undefined) {
    const { explicitRunner } = options
    workspace.runExplicitIssue = (repo, issueNumber) => explicitRunner.runIssue(repo, issueNumber)
  }

  return workspace
}
