import React, { useLayoutEffect, useRef } from 'react'
import { Text, Box, useStdin } from 'ink'
import { useVim } from '../hooks/useVim.js'
import { colors } from '../theme.js'

export interface TextFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  active: boolean
  multiline?: boolean | undefined
}

export function TextField({ label, value, onChange, active, multiline }: TextFieldProps): React.JSX.Element {
  const { mode } = useVim()
  const isEditing = active && mode === 'insert'

  // Use refs so the stable event handler always reads current values
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const multilineRef = useRef(multiline)
  const isEditingRef = useRef(isEditing)

  useLayoutEffect(() => { valueRef.current = value })
  useLayoutEffect(() => { onChangeRef.current = onChange })
  useLayoutEffect(() => { multilineRef.current = multiline })
  useLayoutEffect(() => { isEditingRef.current = isEditing })

  const { internal_eventEmitter: eventEmitter } = useStdin()

  useLayoutEffect(() => {
    const handleInput = (chunk: string): void => {
      if (!isEditingRef.current) return

      const isBackspace = chunk === '\x7F' || chunk === '\b'
      const isEnter = chunk === '\r' || chunk === '\n'
      const isEscape = chunk === '\x1B'
      const isTab = chunk === '\t' || chunk === '\x1B[Z'
      const isControl = isBackspace || isEnter || isEscape || isTab

      if (isBackspace) {
        onChangeRef.current(valueRef.current.slice(0, -1))
        return
      }

      if (isEnter && multilineRef.current) {
        onChangeRef.current(valueRef.current + '\n')
        return
      }

      if (!isControl && chunk.length > 0) {
        onChangeRef.current(valueRef.current + chunk)
      }
    }

    eventEmitter.on('input', handleInput)
    return () => {
      eventEmitter.removeListener('input', handleInput)
    }
  // Register once; all mutable values are accessed via refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventEmitter])

  return (
    <Box overflowX="hidden">
      <Text color={colors.banana}>{label}: </Text>
      {value.length === 0 && !active ? (
        <Text color={colors.dim}>(empty)</Text>
      ) : (
        <Text wrap="truncate-end">
          {value}
          {isEditing ? <Text color={colors.banana}>█</Text> : null}
        </Text>
      )}
    </Box>
  )
}
