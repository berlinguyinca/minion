import React, { useState, useEffect } from 'react'
import { Text } from 'ink'
import { colors } from '../theme.js'

const FRAMES = ['🍌', '🍌🍌', '🍌🍌🍌', '🍌🍌', '🍌']
const FRAME_MS = 200

interface SpinnerProps {
  message: string
}

export function Spinner({ message }: SpinnerProps): React.JSX.Element {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % FRAMES.length)
    }, FRAME_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <Text color={colors.banana}>
      {FRAMES[frame] ?? FRAMES[0]} {message}
    </Text>
  )
}
