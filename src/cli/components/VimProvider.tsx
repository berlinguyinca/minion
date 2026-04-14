import React, { useState, useCallback, useRef, useLayoutEffect, type ReactNode } from 'react'
import { useStdin } from 'ink'
import { VimContext, type VimMode, type Pane, type FormField } from '../hooks/useVim.js'

export interface VimProviderProps {
  children: ReactNode
  onAction?: (action: string) => void
  onCommand?: (command: string) => void
}

const DOUBLE_KEY_TIMEOUT_MS = 500

// Parse a raw input chunk into its meaningful parts
function parseChunk(chunk: string): { input: string; escape: boolean; enter: boolean; backspace: boolean; tab: boolean; shiftTab: boolean } {
  const escape = chunk === '\x1B'
  const enter = chunk === '\r' || chunk === '\n'
  const backspace = chunk === '\x7F' || chunk === '\b'
  const tab = chunk === '\t'
  const shiftTab = chunk === '\x1B[Z'
  // For regular printable input, use the chunk as-is (single char or sequence)
  const input = (escape || enter || backspace || tab || shiftTab) ? '' : chunk
  return { input, escape, enter, backspace, tab, shiftTab }
}

export function VimProvider({ children, onAction, onCommand }: VimProviderProps): React.JSX.Element {
  const [mode, setMode] = useState<VimMode>('normal')
  const [pane, setPane] = useState<Pane>('form')
  const [formField, setFormField] = useState<FormField>('title')
  const [commandBuffer, setCommandBuffer] = useState('')

  // For double-key sequences (gg, dd)
  const lastKeyRef = useRef<string | null>(null)
  const lastKeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Use refs for mode/commandBuffer so the stable handler can read current values
  const modeRef = useRef<VimMode>('normal')
  const commandBufferRef = useRef('')

  const togglePane = useCallback((): void => {
    setPane((p) => (p === 'form' ? 'table' : 'form'))
  }, [])

  // Keep refs in sync with state
  const setModeSync = useCallback((m: VimMode): void => {
    modeRef.current = m
    setMode(m)
  }, [])

  const setCommandBufferSync = useCallback((buf: string | ((prev: string) => string)): void => {
    const next = typeof buf === 'function' ? buf(commandBufferRef.current) : buf
    commandBufferRef.current = next
    setCommandBuffer(next)
  }, [])

  // onAction/onCommand refs to avoid stale closures
  const onActionRef = useRef(onAction)
  const onCommandRef = useRef(onCommand)
  useLayoutEffect(() => {
    onActionRef.current = onAction
  })
  useLayoutEffect(() => {
    onCommandRef.current = onCommand
  })

  const { internal_eventEmitter: eventEmitter, setRawMode, isRawModeSupported } = useStdin()

  useLayoutEffect(() => {
    if (isRawModeSupported) {
      setRawMode(true)
    }

    const handleInput = (chunk: string): void => {
      const { input, escape, enter, backspace, tab, shiftTab } = parseChunk(chunk)
      const currentMode = modeRef.current

      if (currentMode === 'insert') {
        if (escape) {
          setModeSync('normal')
        } else if (shiftTab) {
          setFormField((f) => (f === 'body' ? 'title' : 'body'))
        } else if (tab) {
          setFormField((f) => (f === 'title' ? 'body' : 'title'))
        }
        // All other keys pass through to text fields
        return
      }

      if (currentMode === 'command') {
        if (escape) {
          setModeSync('normal')
          setCommandBufferSync('')
        } else if (enter) {
          onCommandRef.current?.(commandBufferRef.current)
          setCommandBufferSync('')
          setModeSync('normal')
        } else if (backspace) {
          setCommandBufferSync((buf) => buf.slice(0, -1))
        } else if (input.length > 0) {
          setCommandBufferSync((buf) => buf + input)
        }
        return
      }

      // Normal mode
      if (input === ':') {
        setModeSync('command')
        setCommandBufferSync('')
        return
      }

      if (input === 'i' || input === 'a') {
        setModeSync('insert')
        return
      }

      if (input === 'o') {
        onActionRef.current?.('new-issue')
        setModeSync('insert')
        return
      }

      if (input === 'p') {
        onActionRef.current?.('polish')
        return
      }

      if (input === 'r') {
        onActionRef.current?.('refresh')
        return
      }

      if (input === 'G') {
        onActionRef.current?.('jump-bottom')
        return
      }

      if (input === '1') {
        onActionRef.current?.('tab-1')
        return
      }

      if (input === '2') {
        onActionRef.current?.('tab-2')
        return
      }

      if (input === 'j') {
        onActionRef.current?.('move-down')
        return
      }

      if (input === 'k') {
        onActionRef.current?.('move-up')
        return
      }

      if (input === 'h') {
        onActionRef.current?.('move-left')
        return
      }

      if (input === 'l') {
        onActionRef.current?.('move-right')
        return
      }

      if (input === '?') {
        onActionRef.current?.('help')
        return
      }

      // Double-key sequences: gg (jump top), dd (clear field)
      if (input === 'g' || input === 'd') {
        const prev = lastKeyRef.current
        if (prev === input) {
          if (lastKeyTimerRef.current !== null) {
            clearTimeout(lastKeyTimerRef.current)
            lastKeyTimerRef.current = null
          }
          lastKeyRef.current = null
          if (input === 'g') {
            onActionRef.current?.('jump-top')
          } else {
            onActionRef.current?.('clear-field')
          }
        } else {
          if (lastKeyTimerRef.current !== null) {
            clearTimeout(lastKeyTimerRef.current)
          }
          lastKeyRef.current = input
          lastKeyTimerRef.current = setTimeout(() => {
            lastKeyRef.current = null
            lastKeyTimerRef.current = null
          }, DOUBLE_KEY_TIMEOUT_MS)
        }
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
  }, [eventEmitter, setRawMode, isRawModeSupported, setModeSync, setCommandBufferSync])

  const contextValue = {
    mode,
    pane,
    formField,
    commandBuffer,
    setMode: setModeSync,
    setPane,
    setFormField,
    setCommandBuffer: (buf: string) => setCommandBufferSync(buf),
    togglePane,
  }

  return (
    <VimContext.Provider value={contextValue}>
      {children}
    </VimContext.Provider>
  )
}
