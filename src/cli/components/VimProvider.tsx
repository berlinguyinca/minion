import React, { useState, useCallback, useRef, useLayoutEffect, type ReactNode } from 'react'
import { useStdin } from 'ink'
import { VimContext, type VimMode, type Pane, type FormField, type InputMode } from '../hooks/useVim.js'

export interface VimProviderProps {
  children: ReactNode
  onAction?: (action: string) => void
  onCommand?: (command: string) => void
  initialInputMode?: InputMode
  pane?: Pane
  formField?: FormField
  onPaneChange?: (pane: Pane) => void
  onFormFieldChange?: (field: FormField) => void
}

const DOUBLE_KEY_TIMEOUT_MS = 500

// Parse a raw input chunk into its meaningful parts
function parseChunk(chunk: string): {
  input: string; escape: boolean; enter: boolean; backspace: boolean
  tab: boolean; shiftTab: boolean; ctrlV: boolean
  arrowUp: boolean; arrowDown: boolean; arrowLeft: boolean; arrowRight: boolean
} {
  const escape = chunk === '\x1B'
  const enter = chunk === '\r' || chunk === '\n'
  const backspace = chunk === '\x7F' || chunk === '\b'
  const tab = chunk === '\t'
  const shiftTab = chunk === '\x1B[Z'
  const ctrlV = chunk === '\x16'
  const arrowUp = chunk === '\x1B[A'
  const arrowDown = chunk === '\x1B[B'
  const arrowRight = chunk === '\x1B[C'
  const arrowLeft = chunk === '\x1B[D'
  // For regular printable input, use the chunk as-is (single char or sequence)
  const isSpecial = escape || enter || backspace || tab || shiftTab || ctrlV || arrowUp || arrowDown || arrowLeft || arrowRight
  const input = isSpecial ? '' : chunk
  return { input, escape, enter, backspace, tab, shiftTab, ctrlV, arrowUp, arrowDown, arrowLeft, arrowRight }
}

export function VimProvider({
  children,
  onAction,
  onCommand,
  initialInputMode,
  pane: controlledPane,
  formField: controlledFormField,
  onPaneChange,
  onFormFieldChange,
}: VimProviderProps): React.JSX.Element {
  const [mode, setMode] = useState<VimMode>('normal')
  const [paneState, setPaneState] = useState<Pane>('form')
  const [formFieldState, setFormFieldState] = useState<FormField>('title')
  const [commandBuffer, setCommandBuffer] = useState('')
  const [inputMode, setInputMode] = useState<InputMode>(initialInputMode ?? 'basic')
  const pane = controlledPane ?? paneState
  const formField = controlledFormField ?? formFieldState

  // For double-key sequences (gg, dd)
  const lastKeyRef = useRef<string | null>(null)
  const lastKeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Use refs for mode/commandBuffer/inputMode so the stable handler can read current values
  const modeRef = useRef<VimMode>('normal')
  const paneRef = useRef<Pane>(pane)
  const formFieldRef = useRef<FormField>(formField)
  const commandBufferRef = useRef('')
  const inputModeRef = useRef<InputMode>(initialInputMode ?? 'basic')

  useLayoutEffect(() => {
    paneRef.current = pane
  }, [pane])

  useLayoutEffect(() => {
    formFieldRef.current = formField
  }, [formField])

  const setPaneSync = useCallback((next: Pane): void => {
    paneRef.current = next
    if (controlledPane === undefined) {
      setPaneState(next)
    }
    onPaneChange?.(next)
  }, [controlledPane, onPaneChange])

  const setFormFieldSync = useCallback((next: FormField | ((prev: FormField) => FormField)): void => {
    const resolved = typeof next === 'function' ? next(formFieldRef.current) : next
    formFieldRef.current = resolved
    if (controlledFormField === undefined) {
      setFormFieldState(resolved)
    }
    onFormFieldChange?.(resolved)
  }, [controlledFormField, onFormFieldChange])

  const togglePane = useCallback((): void => {
    setPaneSync(paneRef.current === 'form' ? 'table' : 'form')
  }, [setPaneSync])

  // Keep refs in sync with state
  const setModeSync = useCallback((m: VimMode): void => {
    modeRef.current = m
    setMode(m)
  }, [])

  const setInputModeSync = useCallback((m: InputMode): void => {
    inputModeRef.current = m
    setInputMode(m)
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
      const { input, escape, enter, backspace, tab, shiftTab, ctrlV, arrowUp, arrowDown, arrowLeft, arrowRight } = parseChunk(chunk)
      const currentMode = modeRef.current

      // Ctrl+V toggles input mode in ALL modes
      if (ctrlV) {
        const next: InputMode = inputModeRef.current === 'vim' ? 'basic' : 'vim'
        setInputModeSync(next)
        onActionRef.current?.('mode-changed')
        return
      }

      if (currentMode === 'insert') {
        if (escape) {
          setModeSync('normal')
        } else if (shiftTab) {
          setFormFieldSync((f) => {
            if (f === 'title') return 'comment'
            if (f === 'body') return 'title'
            return 'body'
          })
        } else if (tab) {
          setFormFieldSync((f) => {
            if (f === 'title') return 'body'
            if (f === 'body') return 'comment'
            return 'title'
          })
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

      // Normal mode — branch on input mode
      if (inputModeRef.current === 'basic') {
        // Basic mode normal handler
        if (tab) {
          togglePane()
          onActionRef.current?.('toggle-pane')
          return
        }
        if (input === 'H') {
          onActionRef.current?.('help')
          return
        }
        if (enter) {
          if (paneRef.current === 'form') {
            setModeSync('insert')
          }
          onActionRef.current?.('enter')
          return
        }
        if (arrowUp) {
          onActionRef.current?.('move-up')
          return
        }
        if (arrowDown) {
          onActionRef.current?.('move-down')
          return
        }
        if (arrowLeft) {
          setPaneSync('form')
          onActionRef.current?.('move-left')
          return
        }
        if (arrowRight) {
          setPaneSync('table')
          onActionRef.current?.('move-right')
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
        if (input === ':') {
          setModeSync('command')
          setCommandBufferSync('')
          return
        }
        if (input === '?') {
          onActionRef.current?.('help')
          return
        }
        if (escape) {
          onActionRef.current?.('escape')
          return
        }
        // Any other printable char enters insert mode.
        // Note: the first char is lost — the user types one extra char.
        // This is a minor UX tradeoff to keep the implementation simple.
        if (input.length > 0) {
          setModeSync('insert')
          return
        }
        return
      }

      // Vim mode normal handler (existing behavior)
      if (enter) {
        if (paneRef.current === 'form') {
          setModeSync('insert')
        }
        onActionRef.current?.('enter')
        return
      }

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
        setPaneSync('form')
        onActionRef.current?.('move-left')
        return
      }

      if (input === 'l') {
        setPaneSync('table')
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
  }, [
    eventEmitter,
    setRawMode,
    isRawModeSupported,
    setModeSync,
    setCommandBufferSync,
    setInputModeSync,
    setPaneSync,
    setFormFieldSync,
    togglePane,
  ])

  const contextValue = {
    mode,
    pane,
    formField,
    commandBuffer,
    inputMode,
    setMode: setModeSync,
    setPane: setPaneSync,
    setFormField: (field: FormField) => setFormFieldSync(field),
    setCommandBuffer: (buf: string) => setCommandBufferSync(buf),
    togglePane,
    setInputMode: setInputModeSync,
  }

  return (
    <VimContext.Provider value={contextValue}>
      {children}
    </VimContext.Provider>
  )
}
