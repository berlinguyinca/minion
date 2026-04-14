import React, { useState, useLayoutEffect, useRef } from 'react'
import { Box, Text, useStdin } from 'ink'
import { colors, messages } from '../theme.js'
import { HelpOverlay } from './HelpOverlay.js'

export const PAGE_SIZE = 10

export interface Repo {
  owner: string
  name: string
  pushedAt?: string | undefined
}

export interface RepoSelectorProps {
  repos: Repo[]
  onSelect: (repo: Repo) => void
}

export function relativeTime(isoString: string): string {
  if (!isoString) return ''
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then
  if (diffMs < 0) return 'just now'

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(diffMs / 86_400_000)
  if (days < 30) return `${days}d ago`

  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export function RepoSelector({ repos, onSelect }: RepoSelectorProps): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState(0)
  const [page, setPage] = useState(0)
  const [showHelp, setShowHelp] = useState(false)

  const filtered = repos.filter((r) => {
    const full = `${r.owner}/${r.name}`.toLowerCase()
    return full.includes(search.toLowerCase())
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageStart = safePage * PAGE_SIZE
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  // Clamp cursor within the current page
  const safeCursor = pageItems.length === 0 ? 0 : Math.min(cursor, pageItems.length - 1)

  // Keep stable refs for the event handler
  const searchRef = useRef(search)
  const filteredRef = useRef(filtered)
  const safeCursorRef = useRef(safeCursor)
  const safePageRef = useRef(safePage)
  const totalPagesRef = useRef(totalPages)
  const pageItemsRef = useRef(pageItems)
  const onSelectRef = useRef(onSelect)
  const showHelpRef = useRef(showHelp)

  useLayoutEffect(() => { searchRef.current = search })
  useLayoutEffect(() => { filteredRef.current = filtered })
  useLayoutEffect(() => { safeCursorRef.current = safeCursor })
  useLayoutEffect(() => { safePageRef.current = safePage })
  useLayoutEffect(() => { totalPagesRef.current = totalPages })
  useLayoutEffect(() => { pageItemsRef.current = pageItems })
  useLayoutEffect(() => { onSelectRef.current = onSelect })
  useLayoutEffect(() => { showHelpRef.current = showHelp })

  const { internal_eventEmitter: eventEmitter, setRawMode, isRawModeSupported } = useStdin()

  useLayoutEffect(() => {
    if (isRawModeSupported) {
      setRawMode(true)
    }

    const handleInput = (chunk: string): void => {
      // Toggle help overlay
      if (chunk === '?') {
        setShowHelp((h) => !h)
        return
      }

      // When help is shown, only ? (above) and Esc close it
      if (showHelpRef.current) {
        if (chunk === '\x1B') {
          setShowHelp(false)
        }
        return
      }

      const isEnter = chunk === '\r' || chunk === '\n'
      const isBackspace = chunk === '\x7F' || chunk === '\b'
      const isDown = chunk === 'j' || chunk === '\x1B[B'
      const isUp = chunk === 'k' || chunk === '\x1B[A'
      const isNextPage = chunk === '>'
      const isPrevPage = chunk === '<'

      if (isEnter) {
        const items = pageItemsRef.current
        const idx = safeCursorRef.current
        if (items.length > 0) {
          const selected = items[idx]
          if (selected !== undefined) {
            onSelectRef.current(selected)
          }
        }
        return
      }

      if (isBackspace) {
        setSearch((s) => s.slice(0, -1))
        setCursor(0)
        setPage(0)
        return
      }

      if (isNextPage) {
        setPage((p) => {
          const tp = totalPagesRef.current
          return p < tp - 1 ? p + 1 : p
        })
        setCursor(0)
        return
      }

      if (isPrevPage) {
        setPage((p) => (p > 0 ? p - 1 : 0))
        setCursor(0)
        return
      }

      if (isDown) {
        setCursor((c) => {
          const items = pageItemsRef.current
          if (items.length === 0) return 0
          if (c >= items.length - 1) {
            // Wrap to next page if available
            const cp = safePageRef.current
            const tp = totalPagesRef.current
            if (cp < tp - 1) {
              setPage(cp + 1)
              return 0
            }
            return c
          }
          return c + 1
        })
        return
      }

      if (isUp) {
        setCursor((c) => {
          if (c <= 0) {
            // Wrap to prev page if available
            const cp = safePageRef.current
            if (cp > 0) {
              setPage(cp - 1)
              return PAGE_SIZE - 1
            }
            return 0
          }
          return c - 1
        })
        return
      }

      // Escape clears search
      if (chunk === '\x1B') {
        setSearch('')
        setCursor(0)
        setPage(0)
        return
      }

      // Printable characters — append to search
      if (chunk.length > 0) {
        setSearch((s) => s + chunk)
        setCursor(0)
        setPage(0)
      }
    }

    eventEmitter.on('input', handleInput)
    return () => {
      eventEmitter.removeListener('input', handleInput)
      if (isRawModeSupported) {
        setRawMode(false)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventEmitter, setRawMode, isRawModeSupported])

  if (showHelp) {
    return <HelpOverlay />
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.banana} padding={1}>
      <Text color={colors.banana}>{messages.header('Bello! Select a repo')}</Text>
      <Box marginTop={1}>
        <Text color={colors.goggle}>Search: </Text>
        <Text>{search}</Text>
        <Text color={colors.banana}>█</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {pageItems.length === 0 ? (
          <Text color={colors.dim}>{messages.emptyTable()}</Text>
        ) : (
          pageItems.map((repo, i) => {
            const isCurrent = i === safeCursor
            const timeStr = repo.pushedAt ? relativeTime(repo.pushedAt) : ''
            return (
              <Box key={`${repo.owner}/${repo.name}`}>
                {isCurrent ? (
                  <Text color={colors.banana}>{'▶ '}</Text>
                ) : (
                  <Text>{'  '}</Text>
                )}
                {isCurrent ? (
                  <Text color={colors.banana}>{`${repo.owner}/${repo.name}`}</Text>
                ) : (
                  <Text>{`${repo.owner}/${repo.name}`}</Text>
                )}
                {timeStr.length > 0 ? (
                  <Text color={colors.dim}>{`  ${timeStr}`}</Text>
                ) : null}
              </Box>
            )
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={colors.dim}>
          {`Page ${safePage + 1}/${totalPages} (${filtered.length} repos)`}
        </Text>
      </Box>
    </Box>
  )
}
