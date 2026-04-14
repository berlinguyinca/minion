import React from 'react'
import { Box, Text, useStdout } from 'ink'
import { TextField } from './TextField.js'
import type { FormField } from '../hooks/useVim.js'
import { colors, messages } from '../theme.js'
import type { IssueComment } from '../../types/index.js'

// Estimate terminal display width — emojis and wide chars take 2 columns
// eslint-disable-next-line no-control-regex
const WIDE_RE = /[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{E000}-\u{F8FF}]|[\u{2702}-\u{27B0}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{2500}-\u{257F}]|[\u{2700}-\u{27BF}]|[✅❌⚠️✓✗⬆⬇➡⬅★☆♥♦♣♠]/gu

function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    w += WIDE_RE.test(ch) ? 2 : 1
    WIDE_RE.lastIndex = 0
  }
  return w
}

function truncate(s: string, maxWidth: number): string {
  let w = 0
  let i = 0
  for (const ch of s) {
    const cw = WIDE_RE.test(ch) ? 2 : 1
    WIDE_RE.lastIndex = 0
    if (w + cw > maxWidth - 1) {
      return s.slice(0, i) + '…'
    }
    w += cw
    i += ch.length
  }
  return s
}

interface IssueFormProps {
  title: string
  body: string
  labels: string[]
  onTitleChange: (v: string) => void
  onBodyChange: (v: string) => void
  active: boolean
  editingIssue: number | undefined
  formField: FormField
  comments: IssueComment[]
  commentText: string
  onCommentChange: (v: string) => void
  commentsExpanded?: boolean
}

export function IssueForm({
  title, body, labels, onTitleChange, onBodyChange, active, editingIssue, formField,
  comments, commentText, onCommentChange, commentsExpanded,
}: IssueFormProps): React.JSX.Element {
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 120
  // Left pane gets exactly 60% of terminal. Subtract: borders(2), paddingX(2), comment indent(2), buffer(2)
  const commentMaxWidth = Math.floor(cols * 0.6) - 8
  const borderColor = active ? colors.overalls : colors.dim

  const header = editingIssue !== undefined
    ? messages.header(`Editing #${editingIssue}`)
    : messages.header('Bello! Create Issue')

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1} flexGrow={1}>
      <Text color={colors.banana} bold>{header}</Text>
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Box width={2}>
            {active && formField === 'title'
              ? <Text color={colors.overalls}>{'▶'}</Text>
              : <Text>{' '}</Text>}
          </Box>
          <Box flexGrow={1}>
            <TextField
              label="Title" value={title} onChange={onTitleChange}
              active={active && formField === 'title'}
            />
          </Box>
        </Box>
        <Box marginTop={1}>
          <Box width={2}>
            {active && formField === 'body'
              ? <Text color={colors.overalls}>{'▶'}</Text>
              : <Text>{' '}</Text>}
          </Box>
          <Box flexGrow={1}>
            <TextField
              label="Body" value={body} onChange={onBodyChange}
              active={active && formField === 'body'}
              multiline
            />
          </Box>
        </Box>
      </Box>
      {editingIssue !== undefined && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={colors.dim}>{'── Comments (' + comments.length + ') ' + (commentsExpanded ? '[-]' : '[+]') + ' ──'}</Text>
          {comments.map((c, i) => (
            <Box key={i} flexDirection="column">
              {commentsExpanded ? (
                <>
                  <Text color={colors.goggle} bold>@{c.author}</Text>
                  <Box flexDirection="column" marginLeft={2}>
                    {c.body.split('\n').map((line, j) => (
                      <Text key={j}>{truncate(line, commentMaxWidth)}</Text>
                    ))}
                  </Box>
                  {i < comments.length - 1 && <Text color={colors.dim}>{'─'.repeat(20)}</Text>}
                </>
              ) : (
                <Text>
                  <Text color={colors.goggle}>@{c.author}</Text>
                  <Text color={colors.dim}>{': '}</Text>
                  <Text>{truncate(c.body.split('\n')[0] ?? '', commentMaxWidth)}</Text>
                </Text>
              )}
            </Box>
          ))}
          <Box marginTop={1}>
            <Box width={2}>
              {active && formField === 'comment'
                ? <Text color={colors.overalls}>{'▶'}</Text>
                : <Text>{' '}</Text>}
            </Box>
            <Box flexGrow={1}>
              <TextField
                label="Comment" value={commentText} onChange={onCommentChange}
                active={active && formField === 'comment'}
              />
            </Box>
          </Box>
        </Box>
      )}
      {labels.length > 0 && (
        <Box marginTop={1} gap={1}>
          {labels.map((l) => (
            <Text key={l} color={colors.goggle}>[{l}]</Text>
          ))}
        </Box>
      )}
    </Box>
  )
}
