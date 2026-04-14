import React from 'react'
import { Box } from 'ink'

interface SplitPaneProps {
  left: React.ReactNode
  right: React.ReactNode
}

export function SplitPane({ left, right }: SplitPaneProps): React.JSX.Element {
  return (
    <Box flexDirection="row" width="100%">
      <Box flexGrow={1} flexBasis="50%">{left}</Box>
      <Box flexGrow={1} flexBasis="50%">{right}</Box>
    </Box>
  )
}
