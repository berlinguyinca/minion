import { createContext, useContext } from 'react'
import type { PolishedIssueText, PolishIssueTextOptions } from '../../ai/polish.js'

export interface TuiDeps {
  listUserRepos: () => Promise<Array<{ owner: string; name: string; description: string; pushedAt: string }>>
  fetchLabels: (owner: string, name: string) => Promise<string[]>
  fetchOpenIssues: (owner: string, name: string) => Promise<Array<{ number: number; title: string; labels: string[] }>>
  fetchOpenIssuesPage: (owner: string, name: string, options?: { page?: number; perPage?: number; etag?: string; signal?: AbortSignal }) => Promise<{ issues: Array<{ number: number; title: string; labels: string[] }>; hasNextPage: boolean; page: number; perPage: number; etag?: string; notModified?: boolean }>
  fetchIssueDetail: (owner: string, name: string, number: number) => Promise<{ number: number; title: string; body: string; url: string; labels: string[] }>
  createIssue: (owner: string, name: string, title: string, body: string, labels: string[]) => Promise<{ number: number; url: string }>
  updateIssue: (owner: string, name: string, number: number, title: string, body: string) => Promise<void>
  closeIssue: (owner: string, name: string, number: number) => Promise<void>
  listIssueComments: (owner: string, name: string, number: number) => Promise<Array<{ author: string; body: string; createdAt: string }>>
  postIssueComment: (owner: string, name: string, number: number, body: string) => Promise<void>
  polishText?: ((title: string, body: string, options?: PolishIssueTextOptions) => Promise<PolishedIssueText | undefined>) | undefined
  configRepos: Array<{ owner: string; name: string }>
  getInputMode: () => 'vim' | 'basic'
  setInputMode: (mode: 'vim' | 'basic') => void
}

export const DepsContext = createContext<TuiDeps | null>(null)

export function useDeps(): TuiDeps {
  const deps = useContext(DepsContext)
  if (!deps) throw new Error('useDeps must be used inside <DepsContext.Provider>')
  return deps
}
