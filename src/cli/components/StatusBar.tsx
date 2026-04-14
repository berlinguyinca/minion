import React from 'react'
import { Box, Text } from 'ink'
import { useVim } from '../hooks/useVim.js'
import { colors } from '../theme.js'

interface StatusBarProps {
  repo: string
  message: string
}

function getHints(mode: string, inputMode: string, pane: string, commandBuffer: string, formField: string): string {
  if (mode === 'command') {
    return `:${commandBuffer}`
  }

  const fieldLabel = formField === 'title' ? 'Title' : formField === 'body' ? 'Body' : 'Comment'

  if (mode === 'insert') {
    if (pane === 'form') {
      return `[${fieldLabel}]  Esc=normal  Tab=field  ^V=` + (inputMode === 'vim' ? 'basic' : 'vim')
    }
    return 'Esc=normal  Tab=field  ^V=' + (inputMode === 'vim' ? 'basic' : 'vim')
  }

  // Normal mode
  if (inputMode === 'basic') {
    if (pane === 'form') {
      return `[${fieldLabel}]  \u2191\u2193=field  Enter=edit  :w=save  :q=quit  ^V=vim  ?=help`
    }
    return 'Tab=pane  \u2191\u2193=navigate  Enter=edit  :w=save  ^V=vim  ?=help'
  }

  // Vim normal
  if (pane === 'form') {
    return `[${fieldLabel}]  j/k=field  Enter=edit  :w=save  :q=quit  h/l=panes  ^V=basic`
  }
  return 'j/k=nav  Enter=edit  :w=save  :q=quit  ^V=basic'
}

export function StatusBar({ repo, message }: StatusBarProps): React.JSX.Element {
  const { mode, commandBuffer, inputMode, pane, formField } = useVim()

  const hints = getHints(mode, inputMode, pane, commandBuffer, formField)

  return (
    <Box>
      <Box flexGrow={1}>
        <Text color={colors.banana}>{'\ud83c\udf4c'} {repo}</Text>
      </Box>
      {message !== '' ? (
        <Box flexGrow={1} justifyContent="center">
          <Text>{message}</Text>
        </Box>
      ) : null}
      <Box>
        <Text color={colors.dim}>{hints}</Text>
      </Box>
    </Box>
  )
}
