import React, { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { VimProvider } from '../../../../src/cli/components/VimProvider.js'
import { StatusBar } from '../../../../src/cli/components/StatusBar.js'
import type { FormField } from '../../../../src/cli/hooks/useVim.js'

describe('StatusBar', () => {
  it('shows repo name', () => {
    const { lastFrame } = render(
      <VimProvider><StatusBar repo="org/api" message="" /></VimProvider>
    )
    expect(lastFrame()).toContain('org/api')
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

  describe('contextual hints', () => {
    it('basic mode form pane shows field focus and navigation hints', () => {
      const { lastFrame } = render(
        <VimProvider><StatusBar repo="org/api" message="" /></VimProvider>
      )
      expect(lastFrame()).toContain('[Title]')
      expect(lastFrame()).toContain('\u2191\u2193=field')
      expect(lastFrame()).toContain('Enter=edit')
      expect(lastFrame()).toContain(':w=save')
      expect(lastFrame()).toContain(':q=quit')
      expect(lastFrame()).toContain('^V=vim')
      expect(lastFrame()).toContain('?=help')
    })

    it('basic mode table pane shows arrow hints', () => {
      const { lastFrame, stdin } = render(
        <VimProvider><StatusBar repo="org/api" message="" /></VimProvider>
      )
      // Tab toggles to table pane in basic mode
      stdin.write('\t')
      expect(lastFrame()).toContain('\u2191\u2193=navigate')
      expect(lastFrame()).toContain('Enter=edit')
      expect(lastFrame()).toContain('^V=vim')
    })

    it('vim normal form shows field focus and navigation hints', () => {
      const { lastFrame } = render(
        <VimProvider initialInputMode="vim"><StatusBar repo="org/api" message="" /></VimProvider>
      )
      expect(lastFrame()).toContain('[Title]')
      expect(lastFrame()).toContain('j/k=field')
      expect(lastFrame()).toContain('Enter=edit')
      expect(lastFrame()).toContain(':w=save')
      expect(lastFrame()).toContain('h/l=panes')
      expect(lastFrame()).toContain('^V=basic')
    })

    it('vim normal table shows j/k=nav hint', () => {
      const { lastFrame, stdin } = render(
        <VimProvider initialInputMode="vim"><StatusBar repo="org/api" message="" /></VimProvider>
      )
      stdin.write('l')
      expect(lastFrame()).toContain('j/k=nav')
      expect(lastFrame()).toContain('Enter=edit')
      expect(lastFrame()).toContain('^V=basic')
    })

    it('vim insert mode shows Esc=normal hint', () => {
      const { lastFrame, stdin } = render(
        <VimProvider initialInputMode="vim"><StatusBar repo="org/api" message="" /></VimProvider>
      )
      stdin.write('i')
      expect(lastFrame()).toContain('Esc=normal')
      expect(lastFrame()).toContain('Tab=field')
      expect(lastFrame()).toContain('^V=basic')
    })

    it('basic mode form pane shows [Body] after arrow down', () => {
      function FieldNav() {
        const [field, setField] = useState<FormField>('title')
        return (
          <VimProvider
            formField={field}
            onFormFieldChange={setField}
            onAction={(a) => { if (a === 'move-down') setField((f) => f === 'title' ? 'body' : 'title') }}
          >
            <StatusBar repo="org/api" message="" />
          </VimProvider>
        )
      }
      const { lastFrame, stdin } = render(<FieldNav />)
      expect(lastFrame()).toContain('[Title]')
      stdin.write('\x1B[B') // arrow down
      expect(lastFrame()).toContain('[Body]')
    })

    it('shows [Comment] label when comment field is focused', () => {
      const { lastFrame } = render(
        <VimProvider formField="comment"><StatusBar repo="org/api" message="" /></VimProvider>
      )
      expect(lastFrame()).toContain('[Comment]')
    })

    it('vim insert on form pane shows field label', () => {
      const { lastFrame, stdin } = render(
        <VimProvider initialInputMode="vim"><StatusBar repo="org/api" message="" /></VimProvider>
      )
      stdin.write('i')
      expect(lastFrame()).toContain('[Title]')
      expect(lastFrame()).toContain('Esc=normal')
    })

    it('both modes show ^V toggle hint', () => {
      // Basic mode
      const basic = render(
        <VimProvider><StatusBar repo="org/api" message="" /></VimProvider>
      )
      expect(basic.lastFrame()).toContain('^V=vim')

      // Vim mode
      const vim = render(
        <VimProvider initialInputMode="vim"><StatusBar repo="org/api" message="" /></VimProvider>
      )
      expect(vim.lastFrame()).toContain('^V=basic')
    })
  })
})
