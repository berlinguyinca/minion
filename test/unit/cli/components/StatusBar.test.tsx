import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { VimProvider } from '../../../../src/cli/components/VimProvider.js'
import { StatusBar } from '../../../../src/cli/components/StatusBar.js'

describe('StatusBar', () => {
  it('shows repo name and NORMAL mode by default', () => {
    const { lastFrame } = render(
      <VimProvider><StatusBar repo="org/api" message="" /></VimProvider>
    )
    expect(lastFrame()).toContain('org/api')
    expect(lastFrame()).toContain('NORMAL')
  })

  it('shows INSERT mode after pressing i', () => {
    const { lastFrame, stdin } = render(
      <VimProvider><StatusBar repo="org/api" message="" /></VimProvider>
    )
    stdin.write('i')
    expect(lastFrame()).toContain('INSERT')
  })

  it('shows command buffer in command mode', () => {
    const { lastFrame, stdin } = render(
      <VimProvider><StatusBar repo="org/api" message="" /></VimProvider>
    )
    stdin.write(':')
    stdin.write('w')
    stdin.write('q')
    expect(lastFrame()).toContain(':wq')
  })

  it('shows message when provided', () => {
    const { lastFrame } = render(
      <VimProvider><StatusBar repo="org/api" message="Bananaaaa! Issue created" /></VimProvider>
    )
    expect(lastFrame()).toContain('Bananaaaa')
  })

  it('shows banana emoji', () => {
    const { lastFrame } = render(
      <VimProvider><StatusBar repo="org/api" message="" /></VimProvider>
    )
    expect(lastFrame()).toContain('\ud83c\udf4c')
  })
})
