import React from 'react'
import { Box } from 'ink'

interface SplitPaneProps {
  left: React.ReactNode
  right: React.ReactNode
}

export function SplitPane({ left, right, isWide }: { left: React.ReactNode; right: React.ReactNode; isWide?: boolean }): React.JSX.Element {
  return (
    <Box flexDirection="row" width="100%" flexGrow={1}>
      <Box width={isWide ? "70%" : "50%"} flexShrink={0}>{left}</Box>
      <Box width={isWide ? "30%" : "50%"} flexShrink={0}>{right}</Box>
    </Box>
  )
}
