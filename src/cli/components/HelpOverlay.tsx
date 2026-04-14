import React from 'react'
import { Box, Text } from 'ink'
import { colors, messages } from '../theme.js'

export function HelpOverlay(): React.JSX.Element {
  return (
    <Box borderStyle="round" borderColor={colors.banana} flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color={colors.banana}>{messages.header('Minion Help')}</Text>
      </Box>

      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column" minWidth={24}>
          <Text color={colors.banana}>Navigation</Text>
          <Text color={colors.dim}>{'──────────'}</Text>
          <Text>{'j/k  move up/down'}</Text>
          <Text>{'h/l  switch pane'}</Text>
          <Text>{'Tab  toggle pane'}</Text>
          <Text>{'1/2  switch tab'}</Text>
          <Text>{'gg   jump to top'}</Text>
          <Text>{'G    jump to bottom'}</Text>
        </Box>

        <Box flexDirection="column" minWidth={22}>
          <Text color={colors.banana}>Actions</Text>
          <Text color={colors.dim}>{'───────'}</Text>
          <Text>{'i    insert'}</Text>
          <Text>{'a    append'}</Text>
          <Text>{'o    new issue'}</Text>
          <Text>{'p    polish'}</Text>
          <Text>{'r    refresh'}</Text>
          <Text>{'dd   clear'}</Text>
          <Text>{'Esc  cancel'}</Text>
        </Box>

        <Box flexDirection="column" minWidth={22}>
          <Text color={colors.banana}>Commands</Text>
          <Text color={colors.dim}>{'────────'}</Text>
          <Text>{':w   save/submit'}</Text>
          <Text>{':q   quit'}</Text>
          <Text>{':wq  save & quit'}</Text>
          <Text>{':e   clear form'}</Text>
          <Text>{':repo switch repo'}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={colors.banana}>Repo Selector</Text>
        <Text color={colors.dim}>{'──────────────'}</Text>
        <Box flexDirection="row" gap={4}>
          <Text>{'j/k \u2191/\u2193  navigate'}</Text>
          <Text>{'>/< next/prev page'}</Text>
        </Box>
        <Box flexDirection="row" gap={4}>
          <Text>{'Enter    select'}</Text>
          <Text>{'?    toggle help'}</Text>
        </Box>
        <Box flexDirection="row" gap={4}>
          <Text>{'type     search'}</Text>
          <Text>{'Esc  clear search'}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color={colors.dim}>Press ? to close</Text>
      </Box>
    </Box>
  )
}
