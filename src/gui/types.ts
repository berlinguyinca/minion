import type { IssueComment, ProcessingResult, RepoConfig } from '../types/index.js'
import type { PolishedIssueText, PolishIssueTextOptions } from '../ai/polish.js'

export interface GuiIssueSummary {
  number: number
  title: string
  labels: string[]
}

export interface GuiIssueDetail {
  number: number
  title: string
  body: string
  url: string
  labels: string[]
}

export interface GuiWorkspaceApi {
  listRepos(): Promise<RepoConfig[]>
  listLabels(owner: string, name: string): Promise<string[]>
  listOpenIssues(owner: string, name: string): Promise<GuiIssueSummary[]>
  listOpenIssuesPage(owner: string, name: string, options?: { page?: number; perPage?: number; etag?: string; requestId?: string }): Promise<{ issues: GuiIssueSummary[]; hasNextPage: boolean; page: number; perPage: number; durationMs?: number; etag?: string; notModified?: boolean }>
  getIssue(owner: string, name: string, number: number): Promise<GuiIssueDetail>
  listComments(owner: string, name: string, number: number): Promise<IssueComment[]>
  createIssue(owner: string, name: string, title: string, body: string, labels: string[]): Promise<{ number: number; url: string }>
  updateIssue(owner: string, name: string, number: number, title: string, body: string): Promise<void>
  closeIssue(owner: string, name: string, number: number): Promise<void>
  postComment(owner: string, name: string, number: number, body: string): Promise<void>
  polish(title: string, body: string, options?: PolishIssueTextOptions): Promise<PolishedIssueText | undefined>
  runIssue(repo: RepoConfig, number: number): Promise<ProcessingResult>
}
