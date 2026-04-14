import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { MessageToast } from '../../../../src/cli/components/MessageToast.js'

describe('MessageToast', () => {
  it('renders nothing when message is empty', () => {
    const { lastFrame } = render(<MessageToast message="" />)
    expect(lastFrame()).toBe('')
  })

  it('renders success message', () => {
    const { lastFrame } = render(<MessageToast message="Issue created" variant="success" />)
    expect(lastFrame()).toContain('Issue created')
  })

  it('renders error message', () => {
    const { lastFrame } = render(<MessageToast message="Something broke" variant="error" />)
    expect(lastFrame()).toContain('Something broke')
  })

  it('renders message without variant', () => {
    const { lastFrame } = render(<MessageToast message="Info text" />)
    expect(lastFrame()).toContain('Info text')
  })
})
