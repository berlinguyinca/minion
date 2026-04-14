import React from 'react'
import { Box, useStdout } from 'ink'

export function SplitPane({ left, right }: { left: React.ReactNode; right: React.ReactNode }): React.JSX.Element {
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 120
  const leftWidth = Math.floor(cols * 0.6)
  const rightWidth = cols - leftWidth

  return (
    <Box flexDirection="row" flexGrow={1}>
      <Box width={leftWidth}>{left}</Box>
      <Box width={rightWidth}>{right}</Box>
    </Box>
  )
}
