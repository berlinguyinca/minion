import React from 'react'
import { Box, Text } from 'ink'
import { TextField } from './TextField.js'
import type { FormField } from '../hooks/useVim.js'
import { colors, messages } from '../theme.js'
import type { IssueComment } from '../../types/index.js'

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
}

export function IssueForm({
  title, body, labels, onTitleChange, onBodyChange, active, editingIssue, formField,
  comments, commentText, onCommentChange,
}: IssueFormProps): React.JSX.Element {
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
          <Text color={colors.dim}>{'── Comments (' + comments.length + ') ──'}</Text>
          {comments.map((c, i) => (
            <Box key={i}>
              <Text wrap="truncate-end">
                <Text color={colors.goggle}>@{c.author}</Text>
                <Text color={colors.dim}>{': '}</Text>
                <Text>{c.body.split('\n')[0] ?? ''}</Text>
              </Text>
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
