import React from 'react'
import { Box } from 'ink'

export function SplitPane({ left, right }: { left: React.ReactNode; right: React.ReactNode }): React.JSX.Element {
  return (
    <Box flexDirection="row" width="100%" flexGrow={1}>
      <Box flexGrow={3} flexShrink={1} flexBasis={0}>{left}</Box>
      <Box flexGrow={2} flexShrink={1} flexBasis={0}>{right}</Box>
    </Box>
  )
}
