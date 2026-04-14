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

describe('VimProvider', () => {
  it('starts in normal mode', () => {
    const { lastFrame } = render(
      <VimProvider><ModeDisplay /></VimProvider>
    )
    expect(lastFrame()).toBe('normal')
  })

  it('transitions to insert mode on "i"', () => {
    const { lastFrame, stdin } = render(
      <VimProvider><ModeDisplay /></VimProvider>
    )
    stdin.write('i')
    expect(lastFrame()).toBe('insert')
  })

  it('transitions to insert mode on "a"', () => {
    const { lastFrame, stdin } = render(
      <VimProvider><ModeDisplay /></VimProvider>
    )
    stdin.write('a')
    expect(lastFrame()).toBe('insert')
  })

  it('returns to normal mode on Escape from insert', () => {
    const { lastFrame, stdin } = render(
      <VimProvider><ModeDisplay /></VimProvider>
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
      <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
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
      <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
    )
    stdin.write('o')
    expect(onAction).toHaveBeenCalledWith('new-issue')
    expect(lastFrame()).toBe('insert')
  })

  it('fires onAction for p (polish)', () => {
    const onAction = vi.fn()
    const { stdin } = render(
      <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
    )
    stdin.write('p')
    expect(onAction).toHaveBeenCalledWith('polish')
  })

  it('fires onAction for G (jump bottom)', () => {
    const onAction = vi.fn()
    const { stdin } = render(
      <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
    )
    stdin.write('G')
    expect(onAction).toHaveBeenCalledWith('jump-bottom')
  })

  it('fires onAction for 1/2 (tab switch)', () => {
    const onAction = vi.fn()
    const { stdin } = render(
      <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
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
      <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
    )
    stdin.write('i') // enter insert mode
    onAction.mockClear()
    stdin.write('j')
    stdin.write('k')
    expect(onAction).not.toHaveBeenCalled()
  })
})
