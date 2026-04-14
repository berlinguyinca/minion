import React from 'react'
import { Box, Text } from 'ink'
import { colors, messages } from '../theme.js'

interface IssueTableProps {
  openIssues: Array<{ number: number; title: string; labels: string[] }>
  recentIssues: Array<{ number: number; title: string; repo: string }>
  active: boolean
  cursor: number
  tab: 'open' | 'recent'
}

export function IssueTable({ openIssues, recentIssues, active, cursor, tab }: IssueTableProps): React.JSX.Element {
  const borderColor = active ? colors.overalls : colors.dim

  const rows: React.JSX.Element[] = tab === 'open'
    ? openIssues.map((issue, i) => {
        const isCursor = active && i === cursor
        return (
          <Box key={issue.number}>
            <Box width={2} flexShrink={0}>
              {isCursor ? <Text color={colors.overalls}>{'▶'}</Text> : <Text>{' '}</Text>}
            </Box>
            <Box width={5} flexShrink={0}>
              <Text color={colors.dim}>#{issue.number}</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end">{issue.title}</Text>
            </Box>
            {issue.labels.length > 0 && (
              <Box flexShrink={0} marginLeft={1}>
                <Text color={colors.banana} wrap="truncate-end">{issue.labels.join(', ')}</Text>
              </Box>
            )}
          </Box>
        )
      })
    : recentIssues.map((issue, i) => {
        const isCursor = active && i === cursor
        return (
          <Box key={`${issue.repo}-${issue.number}`}>
            <Box width={2} flexShrink={0}>
              {isCursor ? <Text color={colors.overalls}>{'▶'}</Text> : <Text>{' '}</Text>}
            </Box>
            <Box width={5} flexShrink={0}>
              <Text color={colors.dim}>#{issue.number}</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end">{issue.title}</Text>
            </Box>
            <Box flexShrink={0} marginLeft={1}>
              <Text color={colors.goggle}>{issue.repo}</Text>
            </Box>
          </Box>
        )
      })

  const isEmpty = rows.length === 0

  return (
    <Box borderStyle="round" borderColor={borderColor} flexDirection="column">
      {/* Tab headers */}
      <Box>
        <Box marginRight={1}>
          {tab === 'open'
            ? <Text bold color={colors.overalls}>[Open]</Text>
            : <Text color={colors.dim}>[Open]</Text>}
        </Box>
        <Box>
          {tab === 'recent'
            ? <Text bold color={colors.overalls}>[Recent]</Text>
            : <Text color={colors.dim}>[Recent]</Text>}
        </Box>
      </Box>
      {/* Content */}
      {isEmpty
        ? <Text color={colors.dim}>{messages.emptyTable()}</Text>
        : rows}
    </Box>
  )
}
