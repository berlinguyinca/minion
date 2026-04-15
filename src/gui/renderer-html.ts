import { GUI_IPC_CHANNELS } from './ipc.js'

export function createRendererStyles(): string {
  return `:root {
  --banana: #ffd54a;
  --banana-strong: #ffb703;
  --goggle: #7dd3fc;
  --overalls: #4169e1;
  --overalls-soft: rgba(65, 105, 225, 0.22);
  --bg: #080b13;
  --bg-glow: #111827;
  --surface: rgba(15, 23, 42, 0.88);
  --surface-strong: #111827;
  --surface-soft: rgba(30, 41, 59, 0.72);
  --border: rgba(148, 163, 184, 0.22);
  --border-strong: rgba(125, 211, 252, 0.42);
  --text: #f8fafc;
  --muted: #94a3b8;
  --danger: #fb7185;
  --success: #34d399;
  --warning: #fbbf24;
  --shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
  --radius: 18px;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-width: 860px;
  min-height: 100vh;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text);
  background:
    radial-gradient(circle at 10% 10%, rgba(255, 213, 74, 0.14), transparent 32%),
    radial-gradient(circle at 88% 8%, rgba(125, 211, 252, 0.13), transparent 36%),
    linear-gradient(135deg, var(--bg), var(--bg-glow));
}
button, input, textarea {
  font: inherit;
}
button:focus-visible, input:focus-visible, textarea:focus-visible {
  outline: 2px solid var(--banana);
  outline-offset: 2px;
}
.app-shell {
  display: grid;
  grid-template-columns: minmax(250px, 0.75fr) minmax(420px, 1.45fr) minmax(330px, 1fr);
  gap: 16px;
  min-height: 100vh;
  padding: 16px;
}
.surface-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(15, 23, 42, 0.78));
  box-shadow: var(--shadow);
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border);
}
.brand-lockup { display: flex; align-items: center; gap: 10px; }
.brand-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--banana), var(--banana-strong));
  color: #172033;
  font-size: 22px;
  box-shadow: 0 10px 28px rgba(255, 183, 3, 0.22);
}
.eyebrow { color: var(--muted); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
h1, h2, h3 { margin: 0; }
h1 { font-size: 20px; }
h2 { font-size: 16px; }
h3 { font-size: 14px; }
.panel-body { padding: 14px; }
.toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.search-input, .field, .textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  background: rgba(2, 6, 23, 0.58);
  padding: 10px 12px;
}
.textarea { min-height: 150px; resize: vertical; line-height: 1.45; }
.comment-box { min-height: 86px; }
.btn {
  border: 0;
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  color: #111827;
  background: linear-gradient(135deg, var(--banana), var(--banana-strong));
  font-weight: 700;
  transition: transform 140ms ease, filter 140ms ease, opacity 140ms ease;
}
.btn:hover { transform: translateY(-1px); filter: brightness(1.05); }
.btn:disabled { cursor: not-allowed; opacity: 0.45; transform: none; }
.btn-secondary { color: var(--text); background: var(--surface-soft); border: 1px solid var(--border); }
.btn-danger { color: #fff; background: linear-gradient(135deg, #e11d48, var(--danger)); }
.btn-ghost { color: var(--goggle); background: transparent; border: 1px solid var(--border); }
.list { display: grid; gap: 8px; }
.repo-card, .issue-card, .comment-card, .result-card {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px;
  color: var(--text);
  background: rgba(15, 23, 42, 0.72);
  text-align: left;
}
.repo-card, .issue-card { cursor: pointer; }
.repo-card:hover, .issue-card:hover, .selected-card {
  border-color: var(--border-strong);
  background: linear-gradient(135deg, rgba(65, 105, 225, 0.24), rgba(15, 23, 42, 0.88));
}
.card-title { font-weight: 750; margin-bottom: 6px; }
.card-meta { color: var(--muted); font-size: 12px; }
.pill-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.pill, .status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  color: var(--goggle);
  background: rgba(14, 165, 233, 0.10);
  font-size: 12px;
  font-weight: 700;
}
.status-chip.success { color: var(--success); background: rgba(52, 211, 153, 0.10); }
.status-chip.error { color: var(--danger); background: rgba(251, 113, 133, 0.10); }
.status-chip.warning { color: var(--warning); background: rgba(251, 191, 36, 0.10); }
.empty-state, .loading-state, .error-state {
  border: 1px dashed var(--border);
  border-radius: 14px;
  padding: 18px;
  color: var(--muted);
  text-align: center;
  background: rgba(2, 6, 23, 0.26);
}
.error-state { color: var(--danger); border-color: rgba(251, 113, 133, 0.36); }
.form-grid { display: grid; gap: 12px; }
.button-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.comments-list { display: grid; gap: 8px; max-height: 220px; overflow: auto; padding-right: 4px; }
.run-log {
  min-height: 180px;
  max-height: 40vh;
  overflow: auto;
  margin: 0;
  border-radius: 14px;
  border: 1px solid var(--border);
  padding: 12px;
  color: #dbeafe;
  background: rgba(2, 6, 23, 0.62);
  white-space: pre-wrap;
}
.result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
.global-status {
  position: fixed;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  max-width: min(720px, calc(100vw - 40px));
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  padding: 9px 14px;
  background: rgba(15, 23, 42, 0.94);
  box-shadow: var(--shadow);
  color: var(--text);
}
.hidden { display: none !important; }
@media (max-width: 980px) {
  body { min-width: 0; }
  .app-shell { grid-template-columns: 1fr; }
  .button-row, .result-grid { grid-template-columns: 1fr; }
}`
}

export function createRendererScript(): string {
  const channelsJson = JSON.stringify(GUI_IPC_CHANNELS)
  return `(() => {
  const channels = ${channelsJson};
  const { ipcRenderer } = require('electron');
  const state = {
    repos: [],
    repo: null,
    issue: null,
    repoCache: new Map(),
    issueCache: new Map(),
    commentCache: new Map(),
    requestSeq: { repos: 0, issues: 0, issue: 0, comments: 0, run: 0 },
    busy: { repos: false, issues: false, issue: false, run: false },
    filter: '',
    runResult: null,
    runLog: 'No run yet.',
  };

  const $ = (id) => document.getElementById(id);
  const repoKey = (repo) => repo ? repo.owner + '/' + repo.name : '';
  const issueKey = (repo, number) => repoKey(repo) + '#' + number;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const setStatus = (message, variant = 'info') => {
    const node = $('global-status');
    node.textContent = message;
    node.dataset.variant = variant;
    node.classList.toggle('hidden', message.length === 0);
  };
  const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

  function relativeTime(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms)) return '';
    const minutes = Math.max(0, Math.floor(ms / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    return Math.floor(hours / 24) + 'd ago';
  }

  function clearAndAppend(container, fragment) {
    container.replaceChildren(fragment);
  }

  function renderRepos() {
    const box = $('repo-list');
    if (state.busy.repos) {
      box.innerHTML = '<div class="loading-state">Loading repos…</div>';
      return;
    }
    const filtered = state.repos.filter((repo) => repoKey(repo).toLowerCase().includes(state.filter.toLowerCase()));
    if (filtered.length === 0) {
      box.innerHTML = '<div class="empty-state">No bananas found. Try a different search.</div>';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const repo of filtered) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'repo-card' + (repoKey(repo) === repoKey(state.repo) ? ' selected-card' : '');
      button.dataset.action = 'select-repo';
      button.dataset.owner = repo.owner;
      button.dataset.name = repo.name;
      button.innerHTML = '<div class="card-title">' + escapeHtml(repo.owner + '/' + repo.name) + '</div><div class="card-meta">GitHub repository</div>';
      fragment.appendChild(button);
    }
    clearAndAppend(box, fragment);
  }

  function renderIssues() {
    const box = $('issue-list');
    const label = $('selected-repo-label');
    label.textContent = state.repo ? repoKey(state.repo) : 'No repo selected';
    if (!state.repo) {
      box.innerHTML = '<div class="empty-state">Pick a repo to load open issues.</div>';
      return;
    }
    if (state.busy.issues) {
      box.innerHTML = '<div class="loading-state">Fetching open issues…</div>';
      return;
    }
    const issues = state.repoCache.get(repoKey(state.repo)) || [];
    if (issues.length === 0) {
      box.innerHTML = '<div class="empty-state">No open issues. Bello!</div>';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const issue of issues) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'issue-card' + (state.issue && state.issue.number === issue.number ? ' selected-card' : '');
      button.dataset.action = 'select-issue';
      button.dataset.number = String(issue.number);
      const labels = (issue.labels || []).map((label) => '<span class="pill">' + escapeHtml(label) + '</span>').join('');
      button.innerHTML = '<div class="card-title">#' + issue.number + ' ' + escapeHtml(issue.title) + '</div><div class="card-meta">Open issue</div><div class="pill-row">' + labels + '</div>';
      fragment.appendChild(button);
    }
    clearAndAppend(box, fragment);
  }

  function renderIssueDetail() {
    const hasIssue = Boolean(state.issue);
    $('issue-title').value = hasIssue ? state.issue.title : '';
    $('issue-body').value = hasIssue ? state.issue.body : '';
    $('detail-title').textContent = hasIssue ? 'Editing #' + state.issue.number : 'Create or edit issue';
    $('save-issue').textContent = hasIssue ? 'Save issue' : 'Create issue';
    $('close-issue').disabled = !hasIssue;
    $('post-comment').disabled = !hasIssue;
    $('start-run').disabled = !hasIssue || state.busy.run;
  }

  function renderComments() {
    const box = $('comments-list');
    if (!state.repo || !state.issue) {
      box.innerHTML = '<div class="empty-state">Load an issue to view comments.</div>';
      return;
    }
    if (state.busy.issue) {
      box.innerHTML = '<div class="loading-state">Loading comments…</div>';
      return;
    }
    const comments = state.commentCache.get(issueKey(state.repo, state.issue.number)) || [];
    if (comments.length === 0) {
      box.innerHTML = '<div class="empty-state">No comments yet.</div>';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const comment of comments) {
      const card = document.createElement('article');
      card.className = 'comment-card';
      card.innerHTML = '<div class="card-title">@' + escapeHtml(comment.author || 'unknown') + ' <span class="card-meta">' + relativeTime(comment.createdAt) + '</span></div><div>' + escapeHtml(comment.body) + '</div>';
      fragment.appendChild(card);
    }
    clearAndAppend(box, fragment);
  }

  function renderRunSummary(result, runLog) {
    const summary = $('run-summary');
    if (!result) {
      summary.innerHTML = state.busy.run
        ? '<div class="loading-state">MAP is running…</div>'
        : '<div class="empty-state">Detailed model trace requires MAP telemetry support. Start MAP to see run output.</div>';
      $('run-log').textContent = runLog;
      return;
    }
    const status = result.success ? 'success' : 'error';
    summary.innerHTML = '<div class="result-grid">'
      + '<div class="result-card"><div class="card-meta">Status</div><span class="status-chip ' + status + '">' + (result.success ? 'Succeeded' : 'Failed') + '</span></div>'
      + '<div class="result-card"><div class="card-meta">PR URL</div><div>' + escapeHtml(result.prUrl || 'No PR') + '</div></div>'
      + '<div class="result-card"><div class="card-meta">Tests</div><div>' + (result.testsPassed ? 'Passing' : 'Not passing / not run') + '</div></div>'
      + '<div class="result-card"><div class="card-meta">Files changed</div><div>' + escapeHtml((result.filesChanged || []).join(', ') || 'none') + '</div></div>'
      + '</div><div class="empty-state">Detailed model trace requires MAP telemetry support.</div>';
    $('run-log').textContent = JSON.stringify(result, null, 2);
  }

  function renderRunPanel() {
    $('start-run').disabled = !state.repo || !state.issue || state.busy.run;
    renderRunSummary(state.runResult, state.runLog);
  }

  function renderAll() {
    renderRepos();
    renderIssues();
    renderIssueDetail();
    renderComments();
    renderRunPanel();
  }

  async function loadRepos(force = false) {
    const seq = ++state.requestSeq.repos;
    if (!force && state.repos.length > 0) return renderRepos();
    state.busy.repos = true;
    renderRepos();
    try {
      const repos = await invoke(channels.listRepos);
      if (seq !== state.requestSeq.repos) return;
      state.repos = repos;
      setStatus('Repos loaded', 'success');
    } catch (err) {
      setStatus(err.message || String(err), 'error');
      $('repo-list').innerHTML = '<div class="error-state">Could not load repos.</div>';
    } finally {
      if (seq === state.requestSeq.repos) state.busy.repos = false;
      renderRepos();
    }
  }

  async function selectRepo(owner, name) {
    state.repo = { owner, name };
    state.issue = null;
    state.runResult = null;
    state.runLog = 'No run yet.';
    renderAll();
    await loadIssues(state.repo);
  }

  async function loadIssues(repo, force = false) {
    const key = repoKey(repo);
    const seq = ++state.requestSeq.issues;
    if (!force && state.repoCache.has(key)) return renderIssues();
    state.busy.issues = true;
    renderIssues();
    try {
      const issues = await invoke(channels.listOpenIssues, repo.owner, repo.name);
      if (seq !== state.requestSeq.issues) return;
      state.repoCache.set(key, issues);
      setStatus('Issues loaded for ' + key, 'success');
    } catch (err) {
      setStatus(err.message || String(err), 'error');
      $('issue-list').innerHTML = '<div class="error-state">Could not load issues.</div>';
    } finally {
      if (seq === state.requestSeq.issues) state.busy.issues = false;
      renderIssues();
    }
  }

  async function selectIssue(number) {
    if (!state.repo) return setStatus('Select a repo first', 'warning');
    const key = issueKey(state.repo, number);
    const seq = ++state.requestSeq.issue;
    state.busy.issue = true;
    renderComments();
    try {
      const issue = state.issueCache.get(key) || await invoke(channels.getIssue, state.repo.owner, state.repo.name, number);
      if (seq !== state.requestSeq.issue) return;
      state.issueCache.set(key, issue);
      state.issue = issue;
      const comments = state.commentCache.get(key) || await invoke(channels.listComments, state.repo.owner, state.repo.name, number);
      if (seq !== state.requestSeq.issue) return;
      state.commentCache.set(key, comments);
      state.runResult = null;
      state.runLog = 'No run yet.';
      setStatus('Loaded issue #' + number, 'success');
    } catch (err) {
      setStatus(err.message || String(err), 'error');
    } finally {
      if (seq === state.requestSeq.issue) state.busy.issue = false;
      renderAll();
    }
  }

  async function saveIssue() {
    if (!state.repo) return setStatus('Select a repo first', 'warning');
    const title = $('issue-title').value.trim();
    const body = $('issue-body').value;
    if (!title) return setStatus('Title is required', 'warning');
    if (state.issue) {
      await invoke(channels.updateIssue, state.repo.owner, state.repo.name, state.issue.number, title, body);
      state.issue = { ...state.issue, title, body };
      state.issueCache.set(issueKey(state.repo, state.issue.number), state.issue);
      setStatus('Issue saved', 'success');
    } else {
      const created = await invoke(channels.createIssue, state.repo.owner, state.repo.name, title, body, []);
      await loadIssues(state.repo, true);
      await selectIssue(created.number);
      setStatus('Issue created', 'success');
    }
    renderAll();
  }

  async function postComment() {
    if (!state.repo || !state.issue) return setStatus('Load an issue first', 'warning');
    const body = $('comment-body').value.trim();
    if (!body) return setStatus('Comment is empty', 'warning');
    await invoke(channels.postComment, state.repo.owner, state.repo.name, state.issue.number, body);
    $('comment-body').value = '';
    state.commentCache.delete(issueKey(state.repo, state.issue.number));
    await selectIssue(state.issue.number);
    setStatus('Comment posted', 'success');
  }

  async function closeIssue() {
    if (!state.repo || !state.issue) return setStatus('Load an issue first', 'warning');
    await invoke(channels.closeIssue, state.repo.owner, state.repo.name, state.issue.number);
    setStatus('Issue closed', 'success');
    state.issue = null;
    await loadIssues(state.repo, true);
    renderAll();
  }

  async function startRun() {
    if (!state.repo || !state.issue) return setStatus('Load an issue first', 'warning');
    const seq = ++state.requestSeq.run;
    state.busy.run = true;
    state.runLog = 'Running MAP for issue #' + state.issue.number + '…';
    renderRunPanel();
    try {
      const result = await invoke(channels.runIssue, state.repo, state.issue.number);
      if (seq !== state.requestSeq.run) return;
      state.runResult = result;
      setStatus('MAP run finished', result.success ? 'success' : 'error');
    } catch (err) {
      setStatus(err.message || String(err), 'error');
      state.runLog = err.stack || err.message || String(err);
    } finally {
      if (seq === state.requestSeq.run) state.busy.run = false;
      renderRunPanel();
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'refresh-repos') void loadRepos(true);
    if (action === 'refresh-issues' && state.repo) void loadIssues(state.repo, true);
    if (action === 'select-repo') void selectRepo(target.dataset.owner, target.dataset.name);
    if (action === 'select-issue') void selectIssue(Number(target.dataset.number));
    if (action === 'save-issue') void saveIssue().catch((err) => setStatus(err.message || String(err), 'error'));
    if (action === 'post-comment') void postComment().catch((err) => setStatus(err.message || String(err), 'error'));
    if (action === 'close-issue') void closeIssue().catch((err) => setStatus(err.message || String(err), 'error'));
    if (action === 'start-run') void startRun();
  });

  $('repo-search').addEventListener('input', (event) => {
    state.filter = event.target.value;
    renderRepos();
  });

  renderAll();
  void loadRepos();
})();`
}

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
    <section class="surface-card" data-testid="repo-sidebar" aria-label="Repository sidebar">
      <header class="panel-header">
        <div class="brand-lockup"><div class="brand-mark">🍌</div><div><div class="eyebrow">Minion</div><h1>Repos</h1></div></div>
        <button class="btn btn-ghost" type="button" data-action="refresh-repos">Refresh</button>
      </header>
      <div class="panel-body">
        <input id="repo-search" class="search-input" placeholder="Search repos" aria-label="Search repositories">
        <div id="repo-list" class="list" aria-live="polite"><div class="loading-state">Loading repos…</div></div>
      </div>
    </section>

    <section class="surface-card" data-testid="issue-workspace" aria-label="Issue workspace">
      <header class="panel-header">
        <div><div class="eyebrow">Issue Workspace</div><h2 id="selected-repo-label">No repo selected</h2></div>
        <button class="btn btn-secondary" type="button" data-action="refresh-issues">Refresh issues</button>
      </header>
      <div class="panel-body form-grid">
        <div id="issue-list" class="list" aria-live="polite"><div class="empty-state">Pick a repo to load open issues.</div></div>
        <div class="surface-card">
          <div class="panel-header"><h2 id="detail-title">Create or edit issue</h2><span class="status-chip warning">Draft-safe</span></div>
          <div class="panel-body form-grid">
            <input id="issue-title" class="field" placeholder="Issue title" aria-label="Issue title">
            <textarea id="issue-body" class="textarea" placeholder="Describe the issue" aria-label="Issue body"></textarea>
            <div class="button-row">
              <button id="save-issue" class="btn" type="button" data-action="save-issue">Create issue</button>
              <button id="post-comment" class="btn btn-secondary" type="button" data-action="post-comment" disabled>Post comment</button>
              <button id="close-issue" class="btn btn-danger" type="button" data-action="close-issue" disabled>Close issue</button>
            </div>
            <textarea id="comment-body" class="textarea comment-box" placeholder="New comment" aria-label="New comment"></textarea>
            <div id="comments-list" class="comments-list" aria-live="polite"><div class="empty-state">Load an issue to view comments.</div></div>
          </div>
        </div>
      </div>
    </section>

    <section class="surface-card" data-testid="run-panel" aria-label="MAP run panel">
      <header class="panel-header">
        <div><div class="eyebrow">MAP Runner</div><h2>Explicit issue run</h2></div>
        <button id="start-run" class="btn" type="button" data-action="start-run" disabled>Start MAP</button>
      </header>
      <div class="panel-body">
        <div id="run-summary" data-testid="run-summary" aria-live="polite">
          <div class="empty-state">Detailed model trace requires MAP telemetry support. Start MAP to see run output.</div>
          <div class="result-grid hidden"><div>PR URL</div><div>Files changed</div></div>
        </div>
        <pre id="run-log" class="run-log">No run yet.</pre>
      </div>
    </section>
  </main>
  <div id="global-status" class="global-status hidden" aria-live="polite"></div>
  <script>${createRendererScript()}</script>
</body>
</html>`
}
