import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Text } from 'ink'
import { VimProvider } from '../../../../src/cli/components/VimProvider.js'
import { useVim } from '../../../../src/cli/hooks/useVim.js'

function ModeDisplay() {
  const { mode } = useVim()
  return <Text>{mode}</Text>
}

function PaneDisplay() {
  const { pane } = useVim()
  return <Text>{pane}</Text>
}

function CommandDisplay() {
  const { commandBuffer } = useVim()
  return <Text>cmd:{commandBuffer}</Text>
}

function InputModeDisplay() {
  const { inputMode } = useVim()
  return <Text>{inputMode}</Text>
}

function FormFieldDisplay() {
  const { formField } = useVim()
  return <Text>{formField}</Text>
}

describe('VimProvider', () => {
  it('starts in normal mode', () => {
    const { lastFrame } = render(
      <VimProvider><ModeDisplay /></VimProvider>
    )
    expect(lastFrame()).toBe('normal')
  })

  it('transitions to insert mode on "i"', () => {
    const { lastFrame, stdin } = render(
      <VimProvider initialInputMode="vim"><ModeDisplay /></VimProvider>
    )
    stdin.write('i')
    expect(lastFrame()).toBe('insert')
  })

  it('transitions to insert mode on "a"', () => {
    const { lastFrame, stdin } = render(
      <VimProvider initialInputMode="vim"><ModeDisplay /></VimProvider>
    )
    stdin.write('a')
    expect(lastFrame()).toBe('insert')
  })

  it('returns to normal mode on Escape from insert', () => {
    const { lastFrame, stdin } = render(
      <VimProvider initialInputMode="vim"><ModeDisplay /></VimProvider>
    )
    stdin.write('i')
    expect(lastFrame()).toBe('insert')
    stdin.write('\x1B')
    expect(lastFrame()).toBe('normal')
  })

  it('enters command mode on ":"', () => {
    const { lastFrame, stdin } = render(
      <VimProvider><ModeDisplay /></VimProvider>
    )
    stdin.write(':')
    expect(lastFrame()).toBe('command')
  })

  it('exits command mode on Escape', () => {
    const { lastFrame, stdin } = render(
      <VimProvider><ModeDisplay /></VimProvider>
    )
    stdin.write(':')
    stdin.write('\x1B')
    expect(lastFrame()).toBe('normal')
  })

  it('builds command buffer in command mode', () => {
    const { lastFrame, stdin } = render(
      <VimProvider><CommandDisplay /></VimProvider>
    )
    stdin.write(':')
    stdin.write('w')
    stdin.write('q')
    expect(lastFrame()).toContain('cmd:wq')
  })

  it('calls onCommand when Enter pressed in command mode', () => {
    const onCommand = vi.fn()
    const { stdin } = render(
      <VimProvider onCommand={onCommand}><ModeDisplay /></VimProvider>
    )
    stdin.write(':')
    stdin.write('w')
    stdin.write('\r')
    expect(onCommand).toHaveBeenCalledWith('w')
  })

  it('fires onAction for j/k/h/l in normal mode', () => {
    const onAction = vi.fn()
    const { stdin } = render(
      <VimProvider onAction={onAction} initialInputMode="vim"><ModeDisplay /></VimProvider>
    )
    stdin.write('j')
    expect(onAction).toHaveBeenCalledWith('move-down')
    stdin.write('k')
    expect(onAction).toHaveBeenCalledWith('move-up')
    stdin.write('h')
    expect(onAction).toHaveBeenCalledWith('move-left')
    stdin.write('l')
    expect(onAction).toHaveBeenCalledWith('move-right')
  })

  it('fires onAction for o (new issue)', () => {
    const onAction = vi.fn()
    const { lastFrame, stdin } = render(
      <VimProvider onAction={onAction} initialInputMode="vim"><ModeDisplay /></VimProvider>
    )
    stdin.write('o')
    expect(onAction).toHaveBeenCalledWith('new-issue')
    expect(lastFrame()).toBe('insert')
  })

  it('fires onAction for p (polish)', () => {
    const onAction = vi.fn()
    const { stdin } = render(
      <VimProvider onAction={onAction} initialInputMode="vim"><ModeDisplay /></VimProvider>
    )
    stdin.write('p')
    expect(onAction).toHaveBeenCalledWith('polish')
  })

  it('fires onAction for G (jump bottom)', () => {
    const onAction = vi.fn()
    const { stdin } = render(
      <VimProvider onAction={onAction} initialInputMode="vim"><ModeDisplay /></VimProvider>
    )
    stdin.write('G')
    expect(onAction).toHaveBeenCalledWith('jump-bottom')
  })

  it('fires onAction for 1/2 (tab switch)', () => {
    const onAction = vi.fn()
    const { stdin } = render(
      <VimProvider onAction={onAction} initialInputMode="vim"><ModeDisplay /></VimProvider>
    )
    stdin.write('1')
    expect(onAction).toHaveBeenCalledWith('tab-1')
    stdin.write('2')
    expect(onAction).toHaveBeenCalledWith('tab-2')
  })

  it('starts with form pane focused', () => {
    const { lastFrame } = render(
      <VimProvider><PaneDisplay /></VimProvider>
    )
    expect(lastFrame()).toBe('form')
  })

  it('ignores j/k/h/l in insert mode (passes to text fields)', () => {
    const onAction = vi.fn()
    const { stdin } = render(
      <VimProvider onAction={onAction} initialInputMode="vim"><ModeDisplay /></VimProvider>
    )
    stdin.write('i') // enter insert mode
    onAction.mockClear()
    stdin.write('j')
    stdin.write('k')
    expect(onAction).not.toHaveBeenCalled()
  })

  describe('Enter-to-insert on form pane', () => {
    it('basic mode: Enter on form pane enters insert mode', () => {
      const onAction = vi.fn()
      const { lastFrame, stdin } = render(
        <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
      )
      expect(lastFrame()).toBe('normal')
      stdin.write('\r')
      expect(lastFrame()).toBe('insert')
      expect(onAction).toHaveBeenCalledWith('enter')
    })

    it('basic mode: Enter on table pane does NOT enter insert mode', () => {
      const onAction = vi.fn()
      const { lastFrame, stdin } = render(
        <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
      )
      stdin.write('\t') // toggle to table pane
      onAction.mockClear()
      stdin.write('\r')
      expect(lastFrame()).toBe('normal')
      expect(onAction).toHaveBeenCalledWith('enter')
    })

    it('vim mode: Enter on form pane enters insert mode', () => {
      const onAction = vi.fn()
      const { lastFrame, stdin } = render(
        <VimProvider onAction={onAction} initialInputMode="vim"><ModeDisplay /></VimProvider>
      )
      expect(lastFrame()).toBe('normal')
      stdin.write('\r')
      expect(lastFrame()).toBe('insert')
      expect(onAction).toHaveBeenCalledWith('enter')
    })

    it('vim mode: Enter on table pane does NOT enter insert mode', () => {
      const onAction = vi.fn()
      const { lastFrame, stdin } = render(
        <VimProvider onAction={onAction} initialInputMode="vim"><ModeDisplay /></VimProvider>
      )
      stdin.write('l') // move to table pane
      onAction.mockClear()
      stdin.write('\r')
      expect(lastFrame()).toBe('normal')
      expect(onAction).toHaveBeenCalledWith('enter')
    })
  })

  describe('insert mode arrow protection', () => {
    it('arrow up in insert mode does NOT fire move-up', () => {
      const onAction = vi.fn()
      const { stdin } = render(
        <VimProvider onAction={onAction} initialInputMode="vim"><ModeDisplay /></VimProvider>
      )
      stdin.write('i') // enter insert mode
      onAction.mockClear()
      stdin.write('\x1B[A') // arrow up
      expect(onAction).not.toHaveBeenCalledWith('move-up')
    })

    it('arrow down in insert mode does NOT fire move-down', () => {
      const onAction = vi.fn()
      const { stdin } = render(
        <VimProvider onAction={onAction} initialInputMode="vim"><ModeDisplay /></VimProvider>
      )
      stdin.write('i') // enter insert mode
      onAction.mockClear()
      stdin.write('\x1B[B') // arrow down
      expect(onAction).not.toHaveBeenCalledWith('move-down')
    })
  })

  describe('3-field form navigation', () => {
    it('insert mode Tab cycles title → body', () => {
      const onFormFieldChange = vi.fn()
      const { stdin } = render(
        <VimProvider initialInputMode="vim" formField="title" onFormFieldChange={onFormFieldChange}>
          <FormFieldDisplay />
        </VimProvider>
      )
      stdin.write('i')
      stdin.write('\t')
      expect(onFormFieldChange).toHaveBeenCalledWith('body')
    })

    it('insert mode Tab from body goes to comment', () => {
      const onFormFieldChange = vi.fn()
      const { stdin } = render(
        <VimProvider initialInputMode="vim" formField="body" onFormFieldChange={onFormFieldChange}>
          <FormFieldDisplay />
        </VimProvider>
      )
      stdin.write('i')
      stdin.write('\t')
      expect(onFormFieldChange).toHaveBeenCalledWith('comment')
    })

    it('insert mode Tab from comment wraps to title', () => {
      const onFormFieldChange = vi.fn()
      const { stdin } = render(
        <VimProvider initialInputMode="vim" formField="comment" onFormFieldChange={onFormFieldChange}>
          <FormFieldDisplay />
        </VimProvider>
      )
      stdin.write('i')
      stdin.write('\t')
      expect(onFormFieldChange).toHaveBeenCalledWith('title')
    })

    it('insert mode Shift+Tab cycles backwards from title to comment', () => {
      const onFormFieldChange = vi.fn()
      const { stdin } = render(
        <VimProvider initialInputMode="vim" formField="title" onFormFieldChange={onFormFieldChange}>
          <FormFieldDisplay />
        </VimProvider>
      )
      stdin.write('i')
      stdin.write('\x1B[Z')
      expect(onFormFieldChange).toHaveBeenCalledWith('comment')
    })
  })

  describe('input mode', () => {
    it('defaults to basic input mode', () => {
      const { lastFrame } = render(
        <VimProvider><InputModeDisplay /></VimProvider>
      )
      expect(lastFrame()).toBe('basic')
    })

    it('respects initialInputMode prop', () => {
      const { lastFrame } = render(
        <VimProvider initialInputMode="vim"><InputModeDisplay /></VimProvider>
      )
      expect(lastFrame()).toBe('vim')
    })

    describe('basic mode', () => {
      it('Tab fires toggle-pane', () => {
        const onAction = vi.fn()
        const { stdin } = render(
          <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
        )
        stdin.write('\t')
        expect(onAction).toHaveBeenCalledWith('toggle-pane')
      })

      it('H fires help', () => {
        const onAction = vi.fn()
        const { stdin } = render(
          <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
        )
        stdin.write('H')
        expect(onAction).toHaveBeenCalledWith('help')
      })

      it('arrow down fires move-down', () => {
        const onAction = vi.fn()
        const { stdin } = render(
          <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
        )
        stdin.write('\x1B[B')
        expect(onAction).toHaveBeenCalledWith('move-down')
      })

      it('arrow up fires move-up', () => {
        const onAction = vi.fn()
        const { stdin } = render(
          <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
        )
        stdin.write('\x1B[A')
        expect(onAction).toHaveBeenCalledWith('move-up')
      })

      it('arrow left fires move-left', () => {
        const onAction = vi.fn()
        const { stdin } = render(
          <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
        )
        stdin.write('\x1B[D')
        expect(onAction).toHaveBeenCalledWith('move-left')
      })

      it('arrow right fires move-right', () => {
        const onAction = vi.fn()
        const { stdin } = render(
          <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
        )
        stdin.write('\x1B[C')
        expect(onAction).toHaveBeenCalledWith('move-right')
      })

      it('Enter fires enter action', () => {
        const onAction = vi.fn()
        const { stdin } = render(
          <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
        )
        stdin.write('\r')
        expect(onAction).toHaveBeenCalledWith('enter')
      })

      it('printable char enters insert mode', () => {
        const { lastFrame, stdin } = render(
          <VimProvider><ModeDisplay /></VimProvider>
        )
        expect(lastFrame()).toBe('normal')
        stdin.write('x')
        expect(lastFrame()).toBe('insert')
      })

      it('? fires help', () => {
        const onAction = vi.fn()
        const { stdin } = render(
          <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
        )
        stdin.write('?')
        expect(onAction).toHaveBeenCalledWith('help')
      })

      it(': enters command mode', () => {
        const { lastFrame, stdin } = render(
          <VimProvider><ModeDisplay /></VimProvider>
        )
        stdin.write(':')
        expect(lastFrame()).toBe('command')
      })
    })

    describe('Ctrl+V toggle', () => {
      it('toggles from basic to vim', () => {
        const onAction = vi.fn()
        const { lastFrame, stdin } = render(
          <VimProvider onAction={onAction}><InputModeDisplay /></VimProvider>
        )
        expect(lastFrame()).toBe('basic')
        stdin.write('\x16')
        expect(lastFrame()).toBe('vim')
        expect(onAction).toHaveBeenCalledWith('mode-changed')
      })

      it('toggles from vim back to basic', () => {
        const { lastFrame, stdin } = render(
          <VimProvider initialInputMode="vim"><InputModeDisplay /></VimProvider>
        )
        expect(lastFrame()).toBe('vim')
        stdin.write('\x16')
        expect(lastFrame()).toBe('basic')
      })

      it('works in insert mode', () => {
        const { lastFrame, stdin } = render(
          <VimProvider initialInputMode="vim"><InputModeDisplay /></VimProvider>
        )
        stdin.write('i') // enter insert mode
        stdin.write('\x16')
        expect(lastFrame()).toBe('basic')
      })

      it('works in command mode', () => {
        const { lastFrame, stdin } = render(
          <VimProvider><InputModeDisplay /></VimProvider>
        )
        stdin.write(':') // enter command mode
        stdin.write('\x16')
        expect(lastFrame()).toBe('vim')
      })
    })
  })
})
