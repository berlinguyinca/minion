import React from 'react'
import { Box, Text } from 'ink'
import { useVim } from '../hooks/useVim.js'
import { colors } from '../theme.js'

interface StatusBarProps {
  repo: string
  message: string
}

export function StatusBar({ repo, message }: StatusBarProps): React.JSX.Element {
  const { mode, commandBuffer } = useVim()

  const modeLabel = mode === 'command'
    ? `:${commandBuffer}`
    : `-- ${mode.toUpperCase()} --`

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
        <Text color={colors.dim}>{modeLabel}</Text>
      </Box>
    </Box>
  )
}
