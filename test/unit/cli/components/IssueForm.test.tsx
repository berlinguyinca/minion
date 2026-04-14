import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { VimProvider } from '../../../../src/cli/components/VimProvider.js'
import { IssueForm } from '../../../../src/cli/components/IssueForm.js'

function wrap(node: React.ReactNode) {
  return <VimProvider>{node}</VimProvider>
}

describe('IssueForm', () => {
  it('renders create mode header', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="" body="" labels={[]}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true} editingIssue={undefined} formField="title" />
    ))
    expect(lastFrame()).toContain('Bello')
    expect(lastFrame()).toContain('Create Issue')
  })

  it('renders edit mode header with issue number', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="Fix bug" body="Details" labels={['bug']}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true} editingIssue={42} formField="title" />
    ))
    expect(lastFrame()).toContain('Editing #42')
  })

  it('shows Title and Body fields', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="My title" body="My body" labels={[]}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true} editingIssue={undefined} formField="title" />
    ))
    expect(lastFrame()).toContain('Title')
    expect(lastFrame()).toContain('My title')
    expect(lastFrame()).toContain('Body')
    expect(lastFrame()).toContain('My body')
  })

  it('shows label tags when present', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="" body="" labels={['bug', 'urgent']}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true} editingIssue={undefined} formField="title" />
    ))
    expect(lastFrame()).toContain('bug')
    expect(lastFrame()).toContain('urgent')
  })

  it('shows blue arrow on focused title field', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="Fix bug" body="Details" labels={[]}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true} editingIssue={42} formField="title" />
    ))
    expect(lastFrame()).toContain('▶')
    // Arrow should be near Title, not near Body
    const lines = lastFrame()!.split('\n')
    const titleLine = lines.find((l) => l.includes('Title'))
    const bodyLine = lines.find((l) => l.includes('Body'))
    expect(titleLine).toContain('▶')
    expect(bodyLine).not.toContain('▶')
  })

  it('shows blue arrow on focused body field', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="Fix bug" body="Details" labels={[]}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true} editingIssue={42} formField="body" />
    ))
    const lines = lastFrame()!.split('\n')
    const titleLine = lines.find((l) => l.includes('Title'))
    const bodyLine = lines.find((l) => l.includes('Body'))
    expect(titleLine).not.toContain('▶')
    expect(bodyLine).toContain('▶')
  })

  it('hides arrow when form is not active', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="Fix bug" body="Details" labels={[]}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={false} editingIssue={42} formField="title" />
    ))
    expect(lastFrame()).not.toContain('▶')
  })

  it('hides label section when no labels', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="" body="" labels={[]}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true} editingIssue={undefined} formField="title" />
    ))
    // No label brackets visible
    expect(lastFrame()).not.toContain('[')
  })
})
