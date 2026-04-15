import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { VimProvider } from '../../../../src/cli/components/VimProvider.js'
import { IssueForm } from '../../../../src/cli/components/IssueForm.js'
import type { IssueComment } from '../../../../src/types/index.js'

function wrap(node: React.ReactNode) {
  return <VimProvider>{node}</VimProvider>
}

describe('IssueForm', () => {
  it('renders create mode header', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="" body="" labels={[]}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true} editingIssue={undefined} formField="title"
        comments={[]} commentText="" onCommentChange={() => {}} />
    ))
    expect(lastFrame()).toContain('Bello')
    expect(lastFrame()).toContain('Create Issue')
  })

  it('renders edit mode header with issue number', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="Fix bug" body="Details" labels={['bug']}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true} editingIssue={42} formField="title"
        comments={[]} commentText="" onCommentChange={() => {}} />
    ))
    expect(lastFrame()).toContain('Editing #42')
  })

  it('shows Title and Body fields', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="My title" body="My body" labels={[]}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true} editingIssue={undefined} formField="title"
        comments={[]} commentText="" onCommentChange={() => {}} />
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
        active={true} editingIssue={undefined} formField="title"
        comments={[]} commentText="" onCommentChange={() => {}} />
    ))
    expect(lastFrame()).toContain('bug')
    expect(lastFrame()).toContain('urgent')
  })

  it('shows blue arrow on focused title field', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="Fix bug" body="Details" labels={[]}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true} editingIssue={42} formField="title"
        comments={[]} commentText="" onCommentChange={() => {}} />
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
        active={true} editingIssue={42} formField="body"
        comments={[]} commentText="" onCommentChange={() => {}} />
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
        active={false} editingIssue={42} formField="title"
        comments={[]} commentText="" onCommentChange={() => {}} />
    ))
    expect(lastFrame()).not.toContain('▶')
  })

  it('hides label section when no labels', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="" body="" labels={[]}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true} editingIssue={undefined} formField="title"
        comments={[]} commentText="" onCommentChange={() => {}} />
    ))
    // No label brackets visible
    expect(lastFrame()).not.toContain('[')
  })

  describe('comments', () => {
    const sampleComments: IssueComment[] = [
      { author: 'alice', body: 'Looks good', createdAt: '2026-04-14T10:00:00Z' },
      { author: 'bob', body: 'Needs fix', createdAt: '2026-04-14T11:00:00Z' },
    ]

    it('shows comments section when editing and comments exist', () => {
      const { lastFrame } = render(wrap(
        <IssueForm title="Bug" body="Details" labels={[]}
          onTitleChange={() => {}} onBodyChange={() => {}}
          active={true} editingIssue={42} formField="title"
          comments={sampleComments} commentText="" onCommentChange={() => {}} />
      ))
      expect(lastFrame()).toContain('Comments (2)')
      expect(lastFrame()).toContain('@alice')
      expect(lastFrame()).toContain('Looks good')
      expect(lastFrame()).toContain('@bob')
    })

    it('shows relative timestamps for comments', () => {
      const { lastFrame } = render(wrap(
        <IssueForm title="Bug" body="Details" labels={[]}
          onTitleChange={() => {}} onBodyChange={() => {}}
          active={true} editingIssue={42} formField="title"
          comments={sampleComments} commentText="" onCommentChange={() => {}}
          now={new Date('2026-04-14T12:00:00Z')} />
      ))
      expect(lastFrame()).toContain('@alice (2h ago)')
      expect(lastFrame()).toContain('@bob (1h ago)')
    })

    it('hides comments section when creating new issue', () => {
      const { lastFrame } = render(wrap(
        <IssueForm title="" body="" labels={[]}
          onTitleChange={() => {}} onBodyChange={() => {}}
          active={true} editingIssue={undefined} formField="title"
          comments={[]} commentText="" onCommentChange={() => {}} />
      ))
      expect(lastFrame()).not.toContain('Comments')
      expect(lastFrame()).not.toContain('Comment')
    })

    it('shows New Comment field when editing', () => {
      const { lastFrame } = render(wrap(
        <IssueForm title="Bug" body="" labels={[]}
          onTitleChange={() => {}} onBodyChange={() => {}}
          active={true} editingIssue={42} formField="comment"
          comments={[]} commentText="" onCommentChange={() => {}} />
      ))
      expect(lastFrame()).toContain('Comment')
    })

    it('shows arrow on comment field when focused', () => {
      const { lastFrame } = render(wrap(
        <IssueForm title="Bug" body="" labels={[]}
          onTitleChange={() => {}} onBodyChange={() => {}}
          active={true} editingIssue={42} formField="comment"
          comments={[]} commentText="my comment" onCommentChange={() => {}} />
      ))
      const lines = lastFrame()!.split('\n')
      const commentLine = lines.find((l) => l.includes('Comment') && !l.includes('Comments'))
      expect(commentLine).toContain('▶')
    })
  })
})
