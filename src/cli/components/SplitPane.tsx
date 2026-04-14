import React from 'react'
import { Box } from 'ink'

export function SplitPane({ left, right }: { left: React.ReactNode; right: React.ReactNode }): React.JSX.Element {
  return (
    <Box flexDirection="row" width="100%" flexGrow={1}>
      <Box width="60%" flexShrink={0}>{left}</Box>
      <Box width="40%" flexShrink={0}>{right}</Box>
    </Box>
  )
}
