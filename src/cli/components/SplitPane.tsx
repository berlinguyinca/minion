import React from 'react'
import { Box, useStdout } from 'ink'

export type EditorPane = 'left' | 'right'

export function getSplitPaneWidths(cols: number, editorPane: EditorPane = 'left', editorRatio = 0.6): { leftWidth: number; rightWidth: number } {
  const editorWidth = Math.floor(cols * editorRatio)
  const otherWidth = cols - editorWidth
  return editorPane === 'left'
    ? { leftWidth: editorWidth, rightWidth: otherWidth }
    : { leftWidth: otherWidth, rightWidth: editorWidth }
}

export function SplitPane({
  left,
  right,
  editorPane = 'left',
}: {
  left: React.ReactNode
  right: React.ReactNode
  editorPane?: EditorPane
}): React.JSX.Element {
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 120
  const { leftWidth, rightWidth } = getSplitPaneWidths(cols, editorPane)

  return (
    <Box flexDirection="row" flexGrow={1}>
      <Box width={leftWidth}>{left}</Box>
      <Box width={rightWidth}>{right}</Box>
    </Box>
  )
}
