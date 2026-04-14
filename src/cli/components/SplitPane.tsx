import React from 'react'
import { Box } from 'ink'

interface SplitPaneProps {
  left: React.ReactNode
  right: React.ReactNode
}

export function SplitPane({ left, right }: SplitPaneProps): React.JSX.Element {
  return (
    <Box flexDirection="row" width="100%">
      <Box width="50%" flexShrink={0}>{left}</Box>
      <Box width="50%" flexShrink={0}>{right}</Box>
    </Box>
  )
}
