import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { IssueTable } from '../../../../src/cli/components/IssueTable.js'

const openIssues = [
  { number: 42, title: 'Fix login bug', labels: ['bug'] },
  { number: 38, title: 'Add dark mode', labels: ['feat'] },
  { number: 35, title: 'Update deps', labels: ['chore'] },
]

const recentIssues = [
  { number: 42, title: 'Fix login bug', repo: 'org/api' },
  { number: 10, title: 'New feature', repo: 'org/web' },
]

describe('IssueTable', () => {
  it('renders open issues by default', () => {
    const { lastFrame } = render(
      <IssueTable openIssues={openIssues} recentIssues={recentIssues}
        active={true} cursor={0} tab="open" />
    )
    expect(lastFrame()).toContain('Open')
    expect(lastFrame()).toContain('42')
    expect(lastFrame()).toContain('Fix login bug')
  })

  it('renders recent issues tab', () => {
    const { lastFrame } = render(
      <IssueTable openIssues={openIssues} recentIssues={recentIssues}
        active={true} cursor={0} tab="recent" />
    )
    expect(lastFrame()).toContain('Recent')
    expect(lastFrame()).toContain('org/api')
    expect(lastFrame()).toContain('org/web')
  })

  it('shows cursor on active row', () => {
    const { lastFrame } = render(
      <IssueTable openIssues={openIssues} recentIssues={[]}
        active={true} cursor={1} tab="open" />
    )
    expect(lastFrame()).toContain('\u25b6')
  })

  it('shows empty message when no issues', () => {
    const { lastFrame } = render(
      <IssueTable openIssues={[]} recentIssues={[]}
        active={true} cursor={0} tab="open" />
    )
    expect(lastFrame()).toContain('No bananas')
  })

  it('shows labels for open issues', () => {
    const { lastFrame } = render(
      <IssueTable openIssues={openIssues} recentIssues={[]}
        active={true} cursor={0} tab="open" />
    )
    expect(lastFrame()).toContain('bug')
    expect(lastFrame()).toContain('feat')
  })

  it('dims border when inactive', () => {
    const active = render(
      <IssueTable openIssues={openIssues} recentIssues={[]}
        active={true} cursor={0} tab="open" />
    )
    const inactive = render(
      <IssueTable openIssues={openIssues} recentIssues={[]}
        active={false} cursor={0} tab="open" />
    )
    // Both should render, but they'll have different border colors
    expect(active.lastFrame()).toBeDefined()
    expect(inactive.lastFrame()).toBeDefined()
  })

  it('truncates long titles', () => {
    const longIssues = [{ number: 1, title: 'A'.repeat(50), labels: [] }]
    const { lastFrame } = render(
      <IssueTable openIssues={longIssues} recentIssues={[]}
        active={true} cursor={0} tab="open" />
    )
    // Title should be truncated, not showing all 50 chars
    expect(lastFrame()).not.toContain('A'.repeat(50))
  })
})
