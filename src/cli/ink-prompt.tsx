import React, { useState } from 'react'
import { render, Box, Text, useInput, useApp } from 'ink'

interface PromptComponentProps {
  question: string
  onSubmit: (answer: string) => void
}

function PromptComponent({ question, onSubmit }: PromptComponentProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const { exit } = useApp()

  useInput((input, key) => {
    if (key.return) {
      onSubmit(value)
      exit()
      return
    }
    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1))
      return
    }
    if (input && !key.ctrl && !key.meta && !key.escape) {
      setValue((v) => v + input)
    }
  })

  return (
    <Box>
      <Text>{question}</Text>
      <Text>{value}</Text>
    </Box>
  )
}

export interface InkPromptHandle {
  ask: (question: string) => Promise<string>
  close: () => void
}

export function createInkPrompt(): InkPromptHandle {
  return {
    ask: (question: string) =>
      new Promise<string>((resolve) => {
        const { unmount } = render(
          <PromptComponent
            question={question}
            onSubmit={(answer) => {
              resolve(answer)
              unmount()
            }}
          />,
        )
      }),
    close: () => {
      // no-op: each ask() call manages its own render instance
    },
  }
}
