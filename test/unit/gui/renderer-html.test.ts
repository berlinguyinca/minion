import { describe, it, expect } from 'vitest'
import { createRendererHtml, createRendererScript, createRendererStyles } from '../../../src/gui/renderer-html.js'
import { GUI_IPC_CHANNELS } from '../../../src/gui/ipc.js'

describe('createRendererHtml', () => {
  it('renders a React-marked root and GUI IPC channel names', () => {
    const html = createRendererHtml()
    expect(html).toContain('id="react-root"')
    expect(html).toContain('data-framework="react"')
    expect(html).toContain('Start MAP')
    expect(html).toContain(GUI_IPC_CHANNELS.runIssue)
    expect(html).toContain(GUI_IPC_CHANNELS.listComments)
  })

  it('renders polished desktop landmarks and accessible live status regions', () => {
    const html = createRendererHtml()

    expect(html).toContain('class="app-shell"')
    expect(html).toContain('data-testid="repo-sidebar"')
    expect(html).toContain('data-testid="issue-workspace"')
    expect(html).toContain('data-testid="run-panel"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('id="global-status"')
    expect(html).toContain('Start MAP')
  })

  it('exports a responsive visual system with cards, pills, buttons, focus states, and status chips', () => {
    const styles = createRendererStyles()

    expect(styles).toContain(':root')
    expect(styles).toContain('--banana')
    expect(styles).toContain('.surface-card')
    expect(styles).toContain('.pill')
    expect(styles).toContain('.status-chip')
    expect(styles).toContain(':focus-visible')
    expect(styles).toContain('@media (max-width: 980px)')
  })

  it('uses efficient renderer patterns: event delegation, caches, request sequencing, and document fragments', () => {
    const script = createRendererScript()

    expect(script).toContain("addEventListener('click'")
    expect(script).not.toContain('.onclick =')
    expect(script).toContain('repoCache')
    expect(script).toContain('issueCache')
    expect(script).toContain('commentCache')
    expect(script).toContain('requestSeq')
    expect(script).toContain('createDocumentFragment')
    expect(script).toContain('renderRunSummary')
  })

  it('includes run result summary hooks and telemetry compatibility messaging', () => {
    const html = createRendererHtml()

    expect(html).toContain('data-testid="run-summary"')
    expect(html).toContain('PR URL')
    expect(html).toContain('Files changed')
    expect(html).toContain('Detailed model trace requires MAP telemetry support')
  })
})
