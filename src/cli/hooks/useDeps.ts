import { createContext, useContext } from 'react'

export interface TuiDeps {
  listUserRepos: () => Promise<Array<{ owner: string; name: string; description: string }>>
  fetchLabels: (owner: string, name: string) => Promise<string[]>
  fetchOpenIssues: (owner: string, name: string) => Promise<Array<{ number: number; title: string; labels: string[] }>>
  fetchIssueDetail: (owner: string, name: string, number: number) => Promise<{ number: number; title: string; body: string; url: string; labels: string[] }>
  createIssue: (owner: string, name: string, title: string, body: string, labels: string[]) => Promise<{ number: number; url: string }>
  updateIssue: (owner: string, name: string, number: number, title: string, body: string) => Promise<void>
  polishText?: ((title: string, body: string) => Promise<{ title: string; body: string } | undefined>) | undefined
  configRepos: Array<{ owner: string; name: string }>
}

export const DepsContext = createContext<TuiDeps | null>(null)

export function useDeps(): TuiDeps {
  const deps = useContext(DepsContext)
  if (!deps) throw new Error('useDeps must be used inside <DepsContext.Provider>')
  return deps
}
