import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { HelpOverlay } from '../../../../src/cli/components/HelpOverlay.js'

describe('HelpOverlay', () => {
  it('renders help header', () => {
    const { lastFrame } = render(<HelpOverlay />)
    expect(lastFrame()).toContain('Minion Help')
  })

  it('shows navigation keybindings', () => {
    const { lastFrame } = render(<HelpOverlay />)
    expect(lastFrame()).toContain('j/k')
    expect(lastFrame()).toContain('h/l')
  })

  it('shows action keybindings', () => {
    const { lastFrame } = render(<HelpOverlay />)
    expect(lastFrame()).toContain('insert')
    expect(lastFrame()).toContain('polish')
  })

  it('shows command keybindings', () => {
    const { lastFrame } = render(<HelpOverlay />)
    expect(lastFrame()).toContain(':w')
    expect(lastFrame()).toContain(':q')
  })

  it('shows close instruction', () => {
    const { lastFrame } = render(<HelpOverlay />)
    expect(lastFrame()).toContain('Press ? to close')
  })
})
