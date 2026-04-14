import React from 'react'
import { Text } from 'ink'
import { colors } from '../theme.js'

interface MessageToastProps {
  message: string
  variant?: 'success' | 'error' | undefined
}

export function MessageToast({ message, variant }: MessageToastProps): React.JSX.Element | null {
  if (!message) return null

  if (variant === 'error') return <Text color={colors.error}>{message}</Text>
  if (variant === 'success') return <Text color={colors.success}>{message}</Text>
  return <Text>{message}</Text>
}
