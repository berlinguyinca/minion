import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { Spinner } from '../../../../src/cli/components/Spinner.js'

describe('Spinner', () => {
  it('renders the message', () => {
    const { lastFrame } = render(<Spinner message="Loading repos" />)
    expect(lastFrame()).toContain('Loading repos')
  })

  it('renders banana emoji', () => {
    const { lastFrame } = render(<Spinner message="test" />)
    expect(lastFrame()).toContain('🍌')
  })
})
