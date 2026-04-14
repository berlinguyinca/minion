import React, { useState, useEffect, useCallback, useRef } from 'react'
import { render, Box, useApp } from 'ink'
import { VimProvider } from './components/VimProvider.js'
import { RepoSelector } from './components/RepoSelector.js'
import { IssueForm } from './components/IssueForm.js'
import { IssueTable } from './components/IssueTable.js'
import { StatusBar } from './components/StatusBar.js'
import { MessageToast } from './components/MessageToast.js'
import { SplitPane } from './components/SplitPane.js'
import { HelpOverlay } from './components/HelpOverlay.js'
import { DepsContext, type TuiDeps } from './hooks/useDeps.js'
import { messages } from './theme.js'
import type { Pane, FormField } from './hooks/useVim.js'

export type { TuiDeps } from './hooks/useDeps.js'

type Screen = 'repo-select' | 'main'
type TableTab = 'open' | 'recent'

interface RecentIssue {
  number: number
  title: string
  repo: string
}

interface RepoChoice {
  owner: string
  name: string
  pushedAt?: string | undefined
}

function App({ deps }: { deps: TuiDeps }): React.JSX.Element {
  const app = useApp()

  // Screen routing
  const [screen, setScreen] = useState<Screen>('repo-select')
  const [repos, setRepos] = useState<RepoChoice[]>([])
  const [selectedRepo, setSelectedRepo] = useState<RepoChoice | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [availableLabels, setAvailableLabels] = useState<string[]>([])
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])
  const [editingIssue, setEditingIssue] = useState<number | undefined>(undefined)
  const [formField, setFormField] = useState<FormField>('title')

  // Table state
  const [openIssues, setOpenIssues] = useState<Array<{ number: number; title: string; labels: string[] }>>([])
  const [recentIssues, setRecentIssues] = useState<RecentIssue[]>([])
  const [tableCursor, setTableCursor] = useState(0)
  const [tableTab, setTableTab] = useState<TableTab>('open')

  // UI state
  const [pane, setPane] = useState<Pane>('form')
  const [showHelp, setShowHelp] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [messageVariant, setMessageVariant] = useState<'success' | 'error' | undefined>(undefined)

  // Refs for stable closures
  const selectedRepoRef = useRef(selectedRepo)
  const titleRef = useRef(title)
  const bodyRef = useRef(body)
  const selectedLabelsRef = useRef(selectedLabels)
  const formFieldRef = useRef(formField)
  const editingIssueRef = useRef(editingIssue)
  const openIssuesRef = useRef(openIssues)
  const recentIssuesRef = useRef(recentIssues)
  const tableCursorRef = useRef(tableCursor)
  const tableTabRef = useRef(tableTab)
  const paneRef = useRef(pane)

  selectedRepoRef.current = selectedRepo
  titleRef.current = title
  bodyRef.current = body
  selectedLabelsRef.current = selectedLabels
  formFieldRef.current = formField
  editingIssueRef.current = editingIssue
  openIssuesRef.current = openIssues
  recentIssuesRef.current = recentIssues
  tableCursorRef.current = tableCursor
  tableTabRef.current = tableTab
  paneRef.current = pane

  // Show a transient message (auto-clears after 3s)
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showMessage = useCallback((msg: string, variant?: 'success' | 'error' | undefined): void => {
    if (messageTimerRef.current !== null) clearTimeout(messageTimerRef.current)
    setStatusMessage(msg)
    setMessageVariant(variant)
    messageTimerRef.current = setTimeout(() => {
      setStatusMessage('')
      setMessageVariant(undefined)
      messageTimerRef.current = null
    }, 3000)
  }, [])
  useEffect(() => {
    return () => { if (messageTimerRef.current !== null) clearTimeout(messageTimerRef.current) }
  }, [])

  // Fetch repos on startup
  useEffect(() => {
    void (async () => {
      let apiRepos: Array<RepoChoice & { pushedAt: string }> = []
      try {
        const fetched = await deps.listUserRepos()
        apiRepos = fetched.map((r) => ({ owner: r.owner, name: r.name, pushedAt: r.pushedAt }))
      } catch {
        // Fall back to config repos only
      }

      // Build a pushedAt lookup from API results
      const pushedAtMap = new Map<string, string>()
      for (const r of apiRepos) {
        pushedAtMap.set(`${r.owner}/${r.name}`, r.pushedAt)
      }

      // Merge config repos + API repos (dedup)
      const seen = new Set<string>()
      const merged: Array<RepoChoice & { pushedAt: string }> = []
      for (const r of deps.configRepos) {
        const key = `${r.owner}/${r.name}`
        if (!seen.has(key)) {
          seen.add(key)
          merged.push({ owner: r.owner, name: r.name, pushedAt: pushedAtMap.get(key) ?? '' })
        }
      }
      for (const r of apiRepos) {
        const key = `${r.owner}/${r.name}`
        if (!seen.has(key)) {
          seen.add(key)
          merged.push(r)
        }
      }

      // Sort by pushedAt descending; repos with empty pushedAt go to end
      merged.sort((a, b) => {
        if (a.pushedAt === '' && b.pushedAt === '') return 0
        if (a.pushedAt === '') return 1
        if (b.pushedAt === '') return -1
        return b.pushedAt.localeCompare(a.pushedAt)
      })

      setRepos(merged)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On repo selection
  const handleRepoSelect = useCallback((repo: RepoChoice): void => {
    setSelectedRepo(repo)
    setScreen('main')
    setOpenIssues([])
    setTableCursor(0)

    // Fetch open issues for the selected repo
    void (async () => {
      try {
        const issues = await deps.fetchOpenIssues(repo.owner, repo.name)
        setOpenIssues(issues)
      } catch {
        showMessage(messages.error('Could not fetch issues'), 'error')
      }
    })()

    // Fetch labels
    void (async () => {
      try {
        const fetched = await deps.fetchLabels(repo.owner, repo.name)
        setAvailableLabels(fetched)
      } catch {
        setAvailableLabels([])
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, showMessage])

  // Clear form helper
  const clearForm = useCallback((): void => {
    setTitle('')
    setBody('')
    setSelectedLabels([])
    setEditingIssue(undefined)
  }, [])

  // Handle vim : commands
  const handleCommand = useCallback((cmd: string): void => {
    const repo = selectedRepoRef.current
    if (!repo) return

    if (cmd === 'w') {
      void (async () => {
        try {
          const currentTitle = titleRef.current.trim()
          const currentBody = bodyRef.current.trim()
          if (!currentTitle) {
            showMessage(messages.error('Title is required'), 'error')
            return
          }

          const editing = editingIssueRef.current
          if (editing !== undefined) {
            await deps.updateIssue(repo.owner, repo.name, editing, currentTitle, currentBody)
            showMessage(messages.issueUpdated(editing), 'success')
          } else {
            const result = await deps.createIssue(repo.owner, repo.name, currentTitle, currentBody, selectedLabelsRef.current)
            showMessage(messages.issueCreated(result.number, `${repo.owner}/${repo.name}`), 'success')
            setRecentIssues((prev) => [
              { number: result.number, title: currentTitle, repo: `${repo.owner}/${repo.name}` },
              ...prev,
            ])
            // Refresh open issues
            try {
              const issues = await deps.fetchOpenIssues(repo.owner, repo.name)
              setOpenIssues(issues)
            } catch {
              // Non-fatal
            }
          }
          clearForm()
        } catch (err) {
          showMessage(messages.error(err instanceof Error ? err.message : String(err)), 'error')
        }
      })()
    } else if (cmd === 'q' || cmd === 'q!') {
      app.exit()
    } else if (cmd === 'wq') {
      void (async () => {
        try {
          const currentTitle = titleRef.current.trim()
          const currentBody = bodyRef.current.trim()
          if (!currentTitle) {
            showMessage(messages.error('Title is required'), 'error')
            return
          }

          const editing = editingIssueRef.current
          if (editing !== undefined) {
            await deps.updateIssue(repo.owner, repo.name, editing, currentTitle, currentBody)
          } else {
            await deps.createIssue(repo.owner, repo.name, currentTitle, currentBody, selectedLabelsRef.current)
          }
          app.exit()
        } catch (err) {
          showMessage(messages.error(err instanceof Error ? err.message : String(err)), 'error')
        }
      })()
    } else if (cmd === 'e') {
      clearForm()
      showMessage('New issue', undefined)
    } else if (cmd === 'repo') {
      clearForm()
      setScreen('repo-select')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, app, clearForm, showMessage])

  // Handle vim normal mode actions
  const handleAction = useCallback((action: string): void => {
    const currentPane = paneRef.current
    const currentTab = tableTabRef.current

    if (action === 'move-down') {
      if (currentPane === 'table') {
        setTableCursor((c) => {
          const items = currentTab === 'open' ? openIssuesRef.current : recentIssuesRef.current
          return items.length === 0 ? 0 : Math.min(c + 1, items.length - 1)
        })
      } else {
        setFormField((f) => (f === 'title' ? 'body' : 'title'))
      }
    } else if (action === 'move-up') {
      if (currentPane === 'table') {
        setTableCursor((c) => Math.max(0, c - 1))
      } else {
        setFormField((f) => (f === 'body' ? 'title' : 'body'))
      }
    } else if (action === 'move-left') {
      setPane('form')
    } else if (action === 'move-right') {
      setPane('table')
    } else if (action === 'jump-top') {
      setTableCursor(0)
    } else if (action === 'jump-bottom') {
      const items = currentTab === 'open' ? openIssuesRef.current : recentIssuesRef.current
      setTableCursor(items.length === 0 ? 0 : items.length - 1)
    } else if (action === 'tab-1') {
      setTableTab('open')
      setTableCursor(0)
    } else if (action === 'tab-2') {
      setTableTab('recent')
      setTableCursor(0)
    } else if (action === 'new-issue') {
      clearForm()
      setPane('form')
    } else if (action === 'enter') {
      if (currentPane === 'table') {
        const repo = selectedRepoRef.current
        if (!repo) return
        const items = currentTab === 'open' ? openIssuesRef.current : recentIssuesRef.current
        const item = items[tableCursorRef.current]
        if (!item) return

        void (async () => {
          try {
            const detail = await deps.fetchIssueDetail(repo.owner, repo.name, item.number)
            setTitle(detail.title)
            setBody(detail.body)
            setEditingIssue(detail.number)
            setPane('form')
          } catch (err) {
            showMessage(messages.error(err instanceof Error ? err.message : String(err)), 'error')
          }
        })()
      }
    } else if (action === 'polish') {
      if (deps.polishText !== undefined) {
        void (async () => {
          try {
            const result = await deps.polishText!(titleRef.current, bodyRef.current)
            if (result !== undefined) {
              setTitle(result.title)
              setBody(result.body)
              showMessage(messages.polishSuccess(), 'success')
            } else {
              showMessage(messages.polishNoChange(), undefined)
            }
          } catch (err) {
            showMessage(messages.error(err instanceof Error ? err.message : String(err)), 'error')
          }
        })()
      }
    } else if (action === 'refresh') {
      const repo = selectedRepoRef.current
      if (!repo) return
      void (async () => {
        try {
          const issues = await deps.fetchOpenIssues(repo.owner, repo.name)
          setOpenIssues(issues)
          showMessage('Refreshed', 'success')
        } catch (err) {
          showMessage(messages.error(err instanceof Error ? err.message : String(err)), 'error')
        }
      })()
    } else if (action === 'escape') {
      if (editingIssueRef.current !== undefined) {
        clearForm()
        showMessage('Cancelled edit', undefined)
      }
    } else if (action === 'clear-field') {
      const field = formFieldRef.current
      if (field === 'title') setTitle('')
      else if (field === 'body') setBody('')
    } else if (action === 'help') {
      setShowHelp((h) => !h)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, clearForm, showMessage])

  const repoLabel = selectedRepo ? `${selectedRepo.owner}/${selectedRepo.name}` : ''

  if (screen === 'repo-select') {
    return (
      <DepsContext.Provider value={deps}>
        <Box flexDirection="column">
          <RepoSelector repos={repos} onSelect={handleRepoSelect} />
        </Box>
      </DepsContext.Provider>
    )
  }

  return (
    <DepsContext.Provider value={deps}>
      <VimProvider onCommand={handleCommand} onAction={handleAction}>
        <Box flexDirection="column">
          {showHelp ? (
            <HelpOverlay />
          ) : (
            <SplitPane
              left={
                <IssueForm
                  title={title}
                  body={body}
                  labels={selectedLabels}
                  onTitleChange={setTitle}
                  onBodyChange={setBody}
                  active={pane === 'form'}
                  editingIssue={editingIssue}
                  formField={formField}
                />
              }
              right={
                <IssueTable
                  openIssues={openIssues}
                  recentIssues={recentIssues}
                  active={pane === 'table'}
                  cursor={tableCursor}
                  tab={tableTab}
                />
              }
            />
          )}
          <StatusBar repo={repoLabel} message={statusMessage} />
          <MessageToast message={statusMessage} variant={messageVariant} />
        </Box>
      </VimProvider>
    </DepsContext.Provider>
  )
}

export async function runTui(deps: TuiDeps): Promise<number> {
  const instance = render(<App deps={deps} />)
  await instance.waitUntilExit()
  return 0
}
