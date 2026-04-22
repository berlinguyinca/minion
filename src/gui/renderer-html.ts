import { createRendererStyles } from './renderer-styles.js'
import { createRendererScript } from './renderer-script.js'

export { createRendererStyles } from './renderer-styles.js'
export { createRendererScript } from './renderer-script.js'

export function createRendererHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Minion GUI</title>
  <style>${createRendererStyles()}</style>
</head>
<body>
  <main id="react-root" data-framework="react" class="app-shell">
    <div class="tracker-shell" hidden aria-hidden="true"></div><div data-testid="issue-list-panel" hidden></div><div data-testid="issue-editor" hidden></div><div data-testid="new-issue-composer" hidden>Create Issue Create + Run MAP Existing Issues MAP Output <span id="composer-title"></span><span id="composer-body"></span></div><div data-testid="map-output-panel" hidden></div>
    <header class="command-bar" data-testid="command-bar">
      <div class="brand-lockup"><div class="brand-mark">🍌</div><div>Minion Issues</div></div>
      <div data-testid="repo-combobox" style="position:relative"><input id="repo-search" class="search-input" placeholder="Quick switch repo — press /" aria-label="Quick switch repository" aria-controls="repo-dropdown-layer"></div>
      <button class="btn btn-secondary" type="button" id="toggle-issue-list" data-testid="toggle-issue-list" data-action="toggle-issue-list" aria-expanded="true"><span id="issue-list-arrow">▼</span> Issues</button><button class="btn btn-secondary" type="button" data-action="refresh-repos">Refresh</button>
      <button class="btn btn-secondary" type="button" data-action="open-settings">Settings</button><button class="btn btn-secondary" type="button" data-action="close-overlay">?</button>
      <div class="progress-strip" data-testid="global-progress"><progress id="global-progress" value="1" max="1"></progress><span id="progress-label">Idle</span><span id="cache-status" class="status-chip">Cache: cold</span></div>
    </header>

    <section class="tracker-layout">
      <aside class="surface-card issue-list-panel" data-testid="repo-sidebar" data-extra-testid="issue-list-panel" aria-label="Repository sidebar">
        <div class="panel-header"><h2 id="selected-repo-label">Select a repo</h2><div class="button-row"><span class="status-chip">j/k navigate</span><button class="btn btn-secondary" type="button" data-action="toggle-favorite-repo">★</button><button class="btn btn-secondary" type="button" data-action="fullscreen-issues">⛶</button></div></div>
        <div class="panel-body stack">
          <div class="panel-header"><h2>Issues</h2><button class="btn btn-secondary" data-action="refresh-issues" type="button">Refresh issues</button></div>
          <div id="issue-list" class="scroll-pane virtual-list" data-testid="tracker-list-pane" data-panel="issue-list" aria-live="polite"><div class="empty-state">Choose a repo.</div></div>
        </div>
      </aside>

      <section class="surface-card detail-grid" data-testid="issue-workspace" aria-label="Issue workspace">
        <div class="panel-header"><h2 id="detail-title">New issue</h2><div class="button-row"><span class="status-chip warning">Keyboard first</span><button class="btn btn-secondary" type="button" data-action="fullscreen-editor">⛶</button></div></div>
        <div class="panel-body stack" data-testid="tracker-detail-pane" data-extra-testid="issue-editor">
          <input id="issue-title" class="field" placeholder="Issue title" aria-label="Issue title">
          <textarea id="issue-body" class="textarea" placeholder="Issue body" aria-label="Issue body"></textarea>
          <div class="button-row">
            <button id="save-issue" class="btn" type="button" data-action="save-issue">Create</button>
            <button id="post-comment" class="btn btn-secondary" type="button" data-action="post-comment" disabled>Post comment</button>
            <button id="close-issue" class="btn btn-danger" type="button" data-action="close-issue" disabled>Close</button>
            <button id="start-run" class="btn" type="button" data-action="start-run" disabled>Start MAP</button>
            <button id="optimize-description" class="btn btn-secondary" type="button" data-action="optimize-description">Optimize description with MAP</button>
          </div>
          <div><button class="btn btn-secondary" type="button" id="toggle-comments" data-action="toggle-comments" aria-expanded="true"><span id="comments-arrow">▼</span> Comments</button></div><div class="comments-body"><textarea id="comment-body" class="textarea" placeholder="New comment — press m" aria-label="New comment"></textarea>
          <div class="button-row"><button id="optimize-comment" class="btn btn-secondary" type="button" data-action="optimize-comment">Optimize comment with MAP</button></div>
          <div id="comments-list" class="comments-list scroll-pane" aria-live="polite"><div class="empty-state">Open an issue for comments.</div></div></div>
        </div>
        <section class="panel-body stack map-output-panel" data-testid="run-panel" data-testid="map-output-shell" aria-label="MAP run panel"><div class="button-row"><button class="btn btn-secondary" type="button" id="toggle-map-output" data-testid="toggle-map-output" data-action="toggle-map-output" aria-expanded="true"><span id="map-output-arrow">▼</span> MAP output</button><button class="btn btn-secondary" type="button" data-action="fullscreen-map">⛶</button></div>
          <div class="map-output-body" data-testid="map-output-body"><div class="map-output-scroll" data-testid="map-output-scroll"><div id="run-summary" data-testid="run-summary" aria-live="polite"><div class="empty-state">Detailed model trace requires MAP telemetry support.</div><div class="result-grid hidden"><div>PR URL</div><div>Files changed</div></div></div>
          <pre id="run-log" class="run-log scroll-pane">No run yet.</pre></div>
        </section>
      </section>
    </section>
  </main>
  <div id="repo-dropdown-layer" data-testid="repo-dropdown-layer" class="repo-dropdown-layer repo-dropdown hidden"><div id="repo-dropdown-list" class="scroll-pane virtual-list" aria-live="polite"><div class="loading-state">Loading repos…</div></div></div>
  <section id="command-palette" class="overlay hidden" role="dialog" aria-label="Command palette"><div class="overlay-card"><h2>Quick switch</h2><p class="card-meta">Press / for repo search, r to refresh, c to create, m to comment.</p><button class="btn" data-action="close-overlay">Close</button></div></section>
  <section id="shortcut-help" class="overlay hidden" role="dialog" aria-label="Keyboard shortcuts"><div class="overlay-card"><h2>Keyboard shortcuts</h2><div class="shortcuts-grid"><div><kbd>?</kbd> Help</div><div><kbd>/</kbd> Search</div><div><kbd>j/k</kbd> Navigate</div><div><kbd>Enter</kbd>/<kbd>o</kbd> Open</div><div><kbd>c</kbd> Create</div><div><kbd>m</kbd> Comment</div><div><kbd>r</kbd> Refresh</div><div><kbd>x</kbd> Close issue</div><div><kbd>[</kbd> Toggle issues</div><div><kbd>]</kbd> Toggle MAP output</div><div><kbd>⌘K</kbd>/<kbd>Ctrl K</kbd> Command palette</div><div><kbd>Esc</kbd> Close overlays</div></div><button class="btn" data-action="close-overlay">Close</button></div></section>
  <section id="settings-dialog" class="overlay hidden" role="dialog" aria-label="Settings"><div class="overlay-card"><h2>Settings</h2><p class="card-meta">Pinned repos</p><pre id="settings-pinned-repos" class="run-log">No pinned repos yet.</pre><p class="card-meta">MAP command is configured in config.yaml with mapCommand/mapArgs.</p><div class="dialog-actions"><button class="btn btn-danger" type="button" data-action="clear-github-cache">Clear GitHub cache</button><button class="btn" type="button" data-action="close-settings">Close</button></div></div></section>
  <section id="optimization-dialog" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="optimization-dialog-title"><div class="overlay-card"><h2 id="optimization-dialog-title">Update with MAP suggestion?</h2><p id="optimization-dialog-copy" class="card-meta">Review the optimized text before applying it.</p><textarea id="optimization-preview" class="textarea preview-textarea" aria-label="Optimized text preview"></textarea><div class="dialog-actions"><button class="btn btn-secondary" type="button" data-action="cancel-optimization">Keep current text</button><button id="apply-optimization" class="btn" type="button" data-action="apply-optimization">Update draft</button></div></div></section>
  <script>${createRendererScript()}</script>
</body>
</html>`
}
