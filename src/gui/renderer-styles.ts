export function createRendererStyles(): string {
  return `:root {
  --accent: #0a84ff;
  --bg: #f2f2f7;
  --surface: rgba(246, 246, 246, 0.82);
  --surface-strong: #ffffff;
  --surface-soft: rgba(229, 229, 234, 0.72);
  --border: rgba(60, 60, 67, 0.18);
  --text: #1d1d1f;
  --muted: #6e6e73;
  --danger: #ff3b30;
  --success: #34c759;
  --warning: #ff9f0a;
  --radius: 10px;
  color-scheme: light;
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; color: var(--text); background: var(--bg); font: 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif; }
button, input, textarea { font: inherit; }
button:focus-visible, input:focus-visible, textarea:focus-visible, [tabindex]:focus-visible { outline: 2px solid rgba(10,132,255,.45); outline-offset: 1px; }
.app-shell { display: grid; grid-template-rows: auto 1fr; height: 100vh; padding: 8px; gap: 8px; }
.command-bar { display: grid; grid-template-columns: auto minmax(260px, 380px) auto auto auto; gap: 6px; align-items: center; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); backdrop-filter: blur(18px); padding: 6px 8px; }
.brand-lockup { display: flex; align-items: center; gap: 7px; font-weight: 600; color: var(--text); }
.brand-mark { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; color: #fff; background: var(--accent); font-size: 13px; }
.tracker-layout { display: grid; grid-template-columns: minmax(260px, 32%) minmax(420px, 1fr); gap: 8px; min-height: 0; }
.surface-card { border: 1px solid var(--border); border-radius: 12px; background: var(--surface); backdrop-filter: blur(18px); overflow: hidden; min-height: 0; }
.panel-header { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--border); min-height: 30px; }
.panel-body { padding: 8px; }
.stack { display: grid; gap: 8px; }
.issue-loading [data-testid="tracker-detail-pane"] { opacity: 0.35; pointer-events: none; }
[data-testid="tracker-detail-pane"] { transition: opacity 140ms ease; }
.detail-grid { display: grid; grid-template-rows: auto auto 1fr auto; gap: 8px; height: 100%; min-height: 0; }
.search-input, .field, .textarea { width: 100%; border: 1px solid var(--border); border-radius: 7px; color: var(--text); background: rgba(255,255,255,.88); padding: 4px 7px; min-height: 24px; }
.textarea { min-height: 96px; resize: vertical; line-height: 1.38; }
.btn, .compact-btn { min-height: 24px; border: 1px solid rgba(60,60,67,.16); border-radius: 7px; padding: 3px 8px; cursor: pointer; color: var(--text); background: rgba(255,255,255,.82); font-size: 12px; font-weight: 500; }
.btn:hover, .compact-btn:hover { background: rgba(255,255,255,.96); }
.btn:disabled { cursor: not-allowed; opacity: .45; }
.btn-secondary { color: var(--text); background: rgba(242,242,247,.9); }
.btn-danger { color: var(--danger); background: rgba(255,59,48,.08); }
.composer-shell { max-width: 900px; margin: 0 auto; }
.button-row { display: flex; gap: 6px; flex-wrap: wrap; }
.scroll-pane { overflow: auto; min-height: 0; scrollbar-width: thin; scrollbar-color: rgba(60,60,67,.32) transparent; }
.scroll-pane::-webkit-scrollbar { width: 9px; height: 9px; }
.scroll-pane::-webkit-scrollbar-thumb { background: rgba(60,60,67,.28); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
.virtual-list { position: relative; height: 100%; min-height: 240px; }
.virtual-row { display: grid; gap: 2px; width: 100%; min-height: 46px; border: 0; border-bottom: 1px solid rgba(60,60,67,.10); padding: 6px 8px; color: var(--text); background: transparent; text-align: left; cursor: pointer; }
.virtual-row:hover, .virtual-row.active-row { background: rgba(10,132,255,.12); }
.card-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-meta { color: var(--muted); font-size: 11px; }
.pill-row { display: flex; flex-wrap: wrap; gap: 4px; }
.pill, .status-chip { display: inline-flex; align-items: center; border-radius: 999px; border: 1px solid var(--border); padding: 1px 6px; color: var(--muted); background: rgba(255,255,255,.68); font-size: 11px; font-weight: 500; }
.status-chip.success { color: var(--success); }
.status-chip.error { color: var(--danger); }
.status-chip.warning { color: var(--warning); }
.empty-state, .loading-state, .error-state { border: 1px dashed var(--border); border-radius: 9px; padding: 10px; color: var(--muted); text-align: center; background: rgba(255,255,255,.42); }
.error-state { color: var(--danger); }
.progress-strip { display: grid; grid-template-columns: minmax(80px, 1fr) auto; gap: 6px; align-items: center; color: var(--muted); font-size: 11px; }
progress { width: 100%; height: 5px; accent-color: var(--accent); }
.comments-collapsed .comments-body { display: none; }
.comments-list { max-height: 150px; display: grid; gap: 6px; padding-right: 4px; }
.comment-card, .result-card { border: 1px solid var(--border); border-radius: 9px; padding: 7px; background: rgba(255,255,255,.58); }
.run-log { min-height: 320px; max-height: 48vh; margin: 0; white-space: pre-wrap; color: #2c2c2e; background: rgba(255,255,255,.68); border: 1px solid var(--border); border-radius: 9px; padding: 7px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.overlay { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(242,242,247,.62); z-index: 20; backdrop-filter: blur(10px); }
.overlay-card { width: min(680px, calc(100vw - 32px)); max-height: min(680px, calc(100vh - 32px)); overflow: auto; border: 1px solid var(--border); border-radius: 14px; background: var(--surface-strong); padding: 14px; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px; }
.preview-textarea { min-height: 260px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.shortcuts-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
kbd { border: 1px solid var(--border); border-radius: 5px; padding: 1px 5px; background: rgba(242,242,247,.86); font-size: 11px; }
.panel-fullscreen { position: fixed !important; inset: 8px !important; z-index: 30 !important; display: grid !important; grid-template-rows: auto 1fr !important; overflow: auto !important; background: var(--surface-strong) !important; box-shadow: 0 24px 70px rgba(0,0,0,.22); }
.fullscreen-issues .issue-list-panel { position: fixed; inset: 8px; z-index: 30; display: grid; grid-template-rows: auto 1fr; overflow: auto; background: var(--surface-strong); }
.fullscreen-editor [data-testid="issue-workspace"] { position: fixed; inset: 8px; z-index: 30; display: grid; grid-template-rows: auto 1fr auto; overflow: auto; background: var(--surface-strong); }
.fullscreen-map [data-testid="map-output-shell"] { display: grid; }
.fullscreen-map [data-testid="map-output-scroll"] { display: block; overflow: auto; height: calc(100vh - 78px); max-height: none; }
.fullscreen-map .run-log { height: calc(100vh - 78px); max-height: none; overflow: auto; }
.fullscreen-map .map-output-panel { position: fixed; inset: 8px; z-index: 30; display: grid; grid-template-rows: auto 1fr; overflow: auto; background: var(--surface-strong); }
.fullscreen-map .map-output-body { display: grid !important; overflow: auto; }
.fullscreen-editor .panel-body, .fullscreen-issues .panel-body, .fullscreen-map .map-output-body { overflow: auto; }
.issue-list-collapsed .issue-list-panel { display: none; }
.map-output-collapsed .map-output-body { display: none; }
.repo-dropdown-layer { position: fixed; z-index: 100; }
.repo-dropdown { position: absolute; z-index: 10; max-height: 240px; width: min(380px, calc(100vw - 24px)); border: 1px solid var(--border); border-radius: 10px; background: var(--surface-strong); box-shadow: 0 16px 42px rgba(0,0,0,.16); }
.hidden { display: none !important; }
@media (prefers-color-scheme: dark) { :root { --bg: #1c1c1e; --surface: rgba(44,44,46,.82); --surface-strong: #2c2c2e; --surface-soft: rgba(58,58,60,.72); --border: rgba(235,235,245,.18); --text: #f5f5f7; --muted: #a1a1a6; color-scheme: dark; } .search-input, .field, .textarea, .btn, .compact-btn, .comment-card, .result-card, .run-log, .global-status { background: rgba(58,58,60,.72); color: var(--text); } }
@media (max-width: 980px) { body { min-width: 0; } .command-bar, .tracker-layout { grid-template-columns: 1fr; } .app-shell { height: auto; min-height: 100vh; } .scroll-pane { max-height: 52vh; } }`
}
