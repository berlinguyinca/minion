import { describe, it, expect } from 'vitest'
import { createRendererHtml, createRendererScript, createRendererStyles } from '../../../src/gui/renderer-html.js'
import { createRendererScript as createSplitRendererScript } from '../../../src/gui/renderer-script.js'
import { createRendererStyles as createSplitRendererStyles } from '../../../src/gui/renderer-styles.js'
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
    expect(html).toContain('Start MAP')
  })

  it('renders a lean keyboard-centric issue tracker shell', () => {
    const html = createRendererHtml()

    expect(html).toContain('class="tracker-shell"')
    expect(html).toContain('data-testid="command-bar"')
    expect(html).toContain('data-testid="tracker-list-pane"')
    expect(html).toContain('data-testid="tracker-detail-pane"')
    expect(html).toContain('id="command-palette"')
    expect(html).toContain('id="shortcut-help"')
    expect(html).toContain('Quick switch')
    expect(html).not.toContain('grid-template-columns: minmax(250px, 0.75fr) minmax(420px, 1.45fr) minmax(330px, 1fr)')
  })

  it('renders a single-repository lightweight workspace with collapsible panes', () => {
    const html = createRendererHtml()

    expect(html).toContain('data-testid="repo-combobox"')
    expect(html).toContain('id="repo-dropdown-layer"')
    expect(html).toContain('data-testid="toggle-issue-list"')
    expect(html).toContain('data-testid="issue-list-panel"')
    expect(html).toContain('data-testid="issue-editor"')
    expect(html).toContain('data-testid="map-output-panel"')
    expect(html).toContain('data-testid="toggle-map-output"')
    expect(html).toContain('MAP output')
  })

  it('exports a responsive visual system with cards, pills, buttons, focus states, and status chips', () => {
    const styles = createRendererStyles()

    expect(styles).toContain(':root')
    expect(styles).toContain('.surface-card')
    expect(styles).toContain('.pill')
    expect(styles).toContain('.status-chip')
    expect(styles).toContain('scrollbar-color')
    expect(styles).toContain('.scroll-pane')
    expect(styles).toContain('.progress-strip')
    expect(styles).toContain('.issue-list-collapsed')
    expect(styles).toContain('.map-output-collapsed')
    expect(styles).toContain('.repo-dropdown')
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
    expect(script).toContain('runLog')
    expect(script).toContain('createDocumentFragment')
    expect(script).toContain('renderRunSummary')
    expect(script).toContain('renderRunSummary(state.runResult, state.runLog)')
    expect(script).toContain('function renderVirtualList')
    expect(script).toContain('overscan')
    expect(script).toContain('topSpacer')
    expect(script).toContain('bottomSpacer')
  })



  it('fades the old issue detail while a newly selected issue loads', () => {
    const styles = createRendererStyles()
    const script = createRendererScript()

    expect(styles).toContain('.issue-loading [data-testid="tracker-detail-pane"]')
    expect(styles).toContain('opacity: 0.35')
    expect(styles).toContain('transition: opacity 140ms ease')
    expect(script).toContain('issueLoading')
    expect(script).toContain("document.body.classList.toggle('issue-loading', state.issueLoading)")
    expect(script).toContain('state.issueLoading = true')
    expect(script).toContain('state.issueLoading = false')
  })

  it('opens the newly highlighted issue when keyboard navigation changes selection', () => {
    const script = createRendererScript()

    expect(script).toContain('openIssueByIndex')
    expect(script).toContain('void openIssueByIndex(state.activeIssueIndex)')
  })

  it('implements keyboard-centric tracker shortcuts from issue tracker research', () => {
    const script = createRendererScript()

    expect(script).toContain('function handleGlobalKeydown')
    expect(script).toContain('toggleIssueList')
    expect(script).toContain('toggleMapOutput')
    expect(script).toContain('issueListCollapsed')
    expect(script).toContain('mapOutputCollapsed')
    expect(script).toContain("event.key === '?'")
    expect(script).toContain("event.key === '/'")
    expect(script).toContain("event.key === 'j'")
    expect(script).toContain("event.key === 'k'")
    expect(script).toContain("event.key === 'Enter'")
    expect(script).toContain("event.key.toLowerCase() === 'o'")
    expect(script).toContain("event.key.toLowerCase() === 'c'")
    expect(script).toContain("event.key.toLowerCase() === 'm'")
    expect(script).toContain("event.key.toLowerCase() === 'r'")
    expect(script).toContain("event.key.toLowerCase() === 'x'")
    expect(script).toContain("event.key === 'Escape'")
    expect(script).toContain("event.key === '['")
    expect(script).toContain("event.key === ']'")
    expect(script).toContain("event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)")
  })




  it('uses refined dense hierarchy with narrow issue rail and integrated MAP panel', () => {
    const styles = createRendererStyles()
    const html = createRendererHtml()

    expect(styles).toContain('grid-template-columns: minmax(260px, 32%) minmax(420px, 1fr)')
    expect(styles).toContain('.surface-card')
    expect(styles).toContain('.map-output-panel')
    expect(styles).toContain('min-height: 320px')
    expect(styles).toContain('font-size: 12px')
    expect(html).toContain('data-testid="issue-workspace"')
    expect(html).toContain('data-testid="run-panel"')
  })

  it('uses a compact neutral macOS-inspired visual density', () => {
    const styles = createRendererStyles()

    expect(styles).toContain('--accent: #0a84ff')
    expect(styles).toContain('--surface: rgba(246, 246, 246, 0.82)')
    expect(styles).toContain('font-size: 13px')
    expect(styles).toContain('min-height: 24px')
    expect(styles).toContain('padding: 3px 8px')
    expect(styles).toContain('border-radius: 7px')
    expect(styles).not.toContain('linear-gradient(135deg, var(--banana), var(--banana-strong))')
    expect(styles).not.toContain('font-size: 22px')
  })





  it('prioritizes MAP space and auto-collapses comments while preserving a comment disclosure', () => {
    const html = createRendererHtml()
    const styles = createRendererStyles()
    const script = createRendererScript()

    expect(html).toContain('id="toggle-comments"')
    expect(html).toContain('id="comments-arrow"')
    expect(styles).toContain('.comments-collapsed .comments-body { display: none; }')
    expect(styles).toContain('min-height: 320px')
    expect(styles).toContain('max-height: 48vh')
    expect(script).toContain('commentsCollapsed')
    expect(script).toContain('toggleComments')
    expect(script).toContain('state.commentsCollapsed = true')
  })


  it('does not use hidden placeholder elements that collide with real MAP fullscreen targets', () => {
    const html = createRendererHtml()
    const bodyHtml = html.slice(html.indexOf('<body>'))
    const mapShellCount = (bodyHtml.match(/data-testid="map-output-shell"/g) ?? []).length
    const mapScrollCount = (bodyHtml.match(/data-testid="map-output-scroll"/g) ?? []).length

    expect(mapShellCount).toBe(1)
    expect(mapScrollCount).toBe(1)
    expect(bodyHtml).not.toContain('data-testid="map-output-shell" hidden')
    expect(bodyHtml).not.toContain('data-testid="map-output-scroll" hidden')
  })

  it('keeps MAP fullscreen usable with a visible header and scrollable log', () => {
    const html = createRendererHtml()
    const styles = createRendererStyles()
    const script = createRendererScript()

    expect(html).toContain('data-testid="map-output-shell"')
    expect(html).toContain('data-testid="map-output-scroll"')
    expect(styles).toContain('.fullscreen-map [data-testid="map-output-shell"]')
    expect(styles).toContain('.fullscreen-map .map-output-body')
    expect(styles).toContain('height: calc(100vh - 78px)')
    expect(styles).toContain('max-height: none')
    expect(script).toContain("if (panel === 'map')")
    expect(script).toContain("state.mapOutputCollapsed = false")
  })

  it('supports fullscreen panels with scrollable content', () => {
    const html = createRendererHtml()
    const styles = createRendererStyles()
    const script = createRendererScript()

    expect(html).toContain('data-action="fullscreen-issues"')
    expect(html).toContain('data-action="fullscreen-editor"')
    expect(html).toContain('data-action="fullscreen-map"')
    expect(styles).toContain('.panel-fullscreen')
    expect(styles).toContain('.fullscreen-issues .issue-list-panel')
    expect(styles).toContain('.fullscreen-editor [data-testid="issue-workspace"]')
    expect(styles).toContain('.fullscreen-map .map-output-panel')
    expect(styles).toContain('overflow: auto')
    expect(script).toContain('toggleFullscreenPanel')
    expect(script).toContain('fullscreenPanel')
  })

  it('keeps map disclosure header visible while only collapsing map body', () => {
    const html = createRendererHtml()
    const styles = createRendererStyles()
    const script = createRendererScript()

    expect(html).toContain('data-testid="map-output-body"')
    expect(html).toContain('aria-expanded="true"')
    expect(styles).toContain('.map-output-collapsed .map-output-body { display: none; }')
    expect(styles).not.toContain('.map-output-collapsed .map-output-panel { display: none; }')
    expect(script).toContain("$('toggle-map-output').setAttribute('aria-expanded', String(!state.mapOutputCollapsed))")
    expect(script).toContain("$('toggle-issue-list').setAttribute('aria-expanded', String(!state.issueListCollapsed))")
  })

  it('uses standard disclosure arrows for collapsible panes', () => {
    const html = createRendererHtml()
    const script = createRendererScript()

    expect(html).toContain('id="issue-list-arrow"')
    expect(html).toContain('id="map-output-arrow"')
    expect(html).toContain('▼')
    expect(script).toContain("textContent = state.issueListCollapsed ? '▶' : '▼'")
    expect(script).toContain("textContent = state.mapOutputCollapsed ? '▶' : '▼'")
  })




  it('renders repo dropdown as a top-level portal instead of inside the toolbar', () => {
    const html = createRendererHtml()
    const script = createRendererScript()
    const bodyHtml = html.slice(html.indexOf('<body>'))

    expect(bodyHtml).toContain('id="repo-dropdown-layer"')
    expect(bodyHtml).toContain('id="repo-dropdown-list"')
    expect(bodyHtml).not.toContain('id="repo-list"')
    expect(script).toContain("$('repo-dropdown-list')")
    expect(script).toContain('positionRepoDropdown')
  })

  it('keeps repo dropdown above panels and persists last selected repo', () => {
    const html = createRendererHtml()
    const styles = createRendererStyles()
    const script = createRendererScript()

    expect(html).toContain('data-testid="repo-dropdown-layer"')
    expect(styles).toContain('.repo-dropdown-layer')
    expect(styles).toContain('z-index: 100')
    expect(styles).toContain('position: fixed')
    expect(script).toContain('localStorage')
    expect(script).toContain('lastSelectedRepo')
    expect(script).toContain('restoreLastSelectedRepo')
    expect(script).toContain('positionRepoDropdown')
  })

  it('keeps known repos visible and uses staged loading while GitHub repo refresh is in flight', () => {
    const script = createRendererScript()

    expect(script).toContain('repoListCacheKey')
    expect(script).toContain('loadCachedRepos')
    expect(script).toContain('saveCachedRepos')
    expect(script).toContain('state.busy.repos && state.repos.length === 0')
    expect(script).toContain('includeApi: false')
    expect(script).toContain('includeApi: true')
    expect(script).toContain('mergeRepos')
  })

  it('persists issue summaries and progressively appends issue pages with timing metadata', () => {
    const script = createRendererScript()

    expect(script).toContain('issueListCachePrefix')
    expect(script).toContain('loadCachedIssues')
    expect(script).toContain('saveCachedIssues')
    expect(script).toContain('mergeIssues')
    expect(script).toContain('listOpenIssuesPage')
    expect(script).toContain('hasNextPage')
    expect(script).toContain('durationMs')
    expect(script).toContain('cancelStaleIssueLoads')
    expect(script).toContain('pageEtags')
    expect(script).toContain('notModified')
    expect(script).toContain('cancelRequest')
  })

  it('exposes settings, cache status, and cache clear controls', () => {
    const html = createRendererHtml()
    const script = createRendererScript()

    expect(html).toContain('id="cache-status"')
    expect(html).toContain('id="settings-dialog"')
    expect(html).toContain('data-action="open-settings"')
    expect(html).toContain('data-action="clear-github-cache"')
    expect(script).toContain('settingsOpen')
    expect(script).toContain('cacheStatus')
    expect(script).toContain('setCacheStatus')
    expect(script).toContain('clearGithubCache')
    expect(script).toContain('renderSettingsDialog')
  })

  it('persists issue detail and comment caches locally', () => {
    const script = createRendererScript()

    expect(script).toContain('issueDetailCachePrefix')
    expect(script).toContain('issueCommentsCachePrefix')
    expect(script).toContain('loadCachedIssueDetail')
    expect(script).toContain('saveCachedIssueDetail')
    expect(script).toContain('loadCachedIssueComments')
    expect(script).toContain('saveCachedIssueComments')
  })

  it('keeps renderer public exports compatible through split modules', () => {
    expect(createSplitRendererScript()).toBe(createRendererScript())
    expect(createSplitRendererStyles()).toBe(createRendererStyles())
  })

  it('supports pinned repos stored locally and rendered before other repos', () => {
    const html = createRendererHtml()
    const script = createRendererScript()

    expect(html).toContain('data-action="toggle-favorite-repo"')
    expect(script).toContain('favoriteRepoKeys')
    expect(script).toContain('favoriteReposCacheKey')
    expect(script).toContain('loadFavoriteRepos')
    expect(script).toContain('toggleFavoriteRepo')
    expect(script).toContain('sortReposForDisplay')
    expect(script).toContain('★')
  })

  it('allows direct owner/name repo selection before GitHub repo listing completes', () => {
    const script = createRendererScript()

    expect(script).toContain('parseRepoSlugInput')
    expect(script).toContain('selectRepoFromInput')
    expect(script).toContain("event.key === 'Enter'")
    expect(script).toContain("document.activeElement === $('repo-search')")
    expect(script).toContain('Type owner/name and press Enter')
  })

  it('loads issue detail and comments concurrently when opening an issue', () => {
    const script = createRendererScript()

    expect(script).toContain('issuePromise')
    expect(script).toContain('commentsPromise')
    expect(script).toContain('Promise.all([issuePromise, commentsPromise])')
  })


  it('does not show transient bottom status bubble for repo load info', () => {
    const html = createRendererHtml()
    const script = createRendererScript()

    expect(html).not.toContain('id="global-status"')
    expect(script).not.toContain("setStatus('Repos loaded'")
  })

  it('renders composer-first issue creation workflow', () => {
    const html = createRendererHtml()
    const styles = createRendererStyles()
    const script = createRendererScript()

    expect(html).toContain('data-testid="new-issue-composer"')
    expect(html).toContain('Create Issue')
    expect(html).toContain('Create + Run MAP')
    expect(html).toContain('Existing Issues')
    expect(html).toContain('MAP Output')
    expect(html).toContain('id="composer-title"')
    expect(html).toContain('id="composer-body"')
    expect(styles).toContain('.composer-shell')
    expect(styles).toContain('.compact-btn')
    expect(styles).toContain('font-size: 12px')
    expect(script).toContain('createIssueFromComposer')
    expect(script).toContain('createAndRunFromComposer')
    expect(script).toContain("event.key === 'Enter' && (event.metaKey || event.ctrlKey)")
    expect(script).toContain("event.key.toLowerCase() === 'r' && (event.metaKey || event.ctrlKey)")
  })

  it('renders MAP optimization controls and a preview dialog for applying text', () => {
    const html = createRendererHtml()
    const styles = createRendererStyles()
    const script = createRendererScript()

    expect(html).toContain('data-action="optimize-description"')
    expect(html).toContain('data-action="optimize-comment"')
    expect(html).toContain('id="optimization-dialog"')
    expect(html).toContain('id="optimization-preview"')
    expect(html).toContain('data-action="apply-optimization"')
    expect(styles).toContain('.dialog-actions')
    expect(script).toContain('optimizeText')
    expect(script).toContain('pendingOptimization')
    expect(script).toContain('renderOptimizationDialog')
    expect(script).toContain('applyOptimization')
  })

  it('routes description and comment optimization through MAP polish IPC with context', () => {
    const script = createRendererScript()

    expect(script).toContain('channels.polish')
    expect(script).toContain("optimizeText('description')")
    expect(script).toContain("optimizeText('comment')")
    expect(script).toContain('collectOptimizationContext')
    expect(script).toContain('commentCache')
    expect(script).toContain('const result = await invoke(channels.polish, title, body, context)')
    expect(script).toContain("$('issue-body').value = state.pendingOptimization.text")
    expect(script).toContain("$('comment-body').value = state.pendingOptimization.text")
  })

  it('includes run result summary hooks and telemetry compatibility messaging', () => {
    const html = createRendererHtml()

    expect(html).toContain('data-testid="run-summary"')
    expect(html).toContain('data-testid="global-progress"')
    expect(html).toContain('<progress')
    expect(html).toContain('PR URL')
    expect(html).toContain('Files changed')
    expect(html).toContain('Detailed model trace requires MAP telemetry support')
  })
})
