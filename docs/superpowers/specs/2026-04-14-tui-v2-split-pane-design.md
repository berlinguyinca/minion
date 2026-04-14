# TUI v2: Split-Pane Issue Manager with Vim Keybindings

## Context

The current TUI (`minion --tui`) is a sequential prompt-based CLI using `@inquirer/*`. It works but is visually plain and single-tasked — you can only create issues one at a time with no visibility into existing issues. The user wants a split-pane layout with a recent issues table, full vim-style modal keybindings, and subtle Minion personality.

## Technology

**Ink v5 (React for terminals)** with `react` 18.x. Ink provides a component model with flexbox layout, keyboard event handling, and a test harness (`ink-testing-library`). This replaces the `@inquirer/*` prompt-based approach entirely.

## Layout

```
╭─ 🍌 Bello! Create Issue ──────╮╭─ [Open] [Recent] ──────────╮
│                                ││  #   Title         Labels  │
│  Title: _                      ││▶ 42  Fix login     bug     │
│                                ││  38  Add dark mode feat    │
│  Body:                         ││  35  Update deps   chore   │
│  _                             ││  31  API timeout   bug     │
│                                ││  28  New dashboard  feat   │
│                                ││                            │
╰────────────────────────────────╯╰────────────────────────────╯
 🍌 org/api                              -- NORMAL --    :q=quit
```

Two side-by-side panes of equal width:
- **Left pane**: Issue form (create or edit mode)
- **Right pane**: Issue table with two tabs (Open Issues / My Recent)
- **Status bar**: Repo name, vim mode indicator, keybind hints

## Screens

### 1. Repo Selector (initial screen)

Full-width fuzzy search over config repos + API-discovered repos. Shown at startup and when switching repos. Same data as current TUI but rendered as an Ink component.

```
╭─ 🍌 Bello! Select a repo ─────────────────────────────────────╮
│                                                                │
│  Search: api_                                                  │
│                                                                │
│  ▶ org/api                                                     │
│    org/api-gateway                                             │
│    other/api-client                                            │
│                                                                │
╰────────────────────────────────────────────────────────────────╯
```

After selection, transitions to the split-pane layout.

### 2. Split-Pane (main screen)

#### Left Pane — Issue Form

Two modes indicated by the header:
- **Create mode**: "🍌 Bello! Create Issue" — empty fields
- **Edit mode**: "🍌 Editing #42" — fields pre-populated from selected issue

Fields:
- **Title** (single line, required)
- **Body** (multi-line, required)
- **Labels** (displayed as tags below body when selected, multi-select via `/labels` command or dedicated prompt)

Action hints shown at bottom of pane based on context:
- Create: `:w=submit  p=polish  o=new  :q=quit`
- Edit: `:w=save  p=polish  Esc=cancel  :q=quit`

#### Right Pane — Issue Table

Two tabs, switchable via `1`/`2` keys or `h`/`l` when table is focused:

**[Open] tab**: Open issues from currently selected repo
- Columns: `#`, `Title` (truncated), `Labels` (first 2)
- Sorted by newest first
- Fetched on repo selection, refreshable

**[Recent] tab**: Issues created this session + user's recent issues from API
- Columns: `#`, `Title`, `Repo`
- Session-created issues marked with a subtle indicator
- Cross-repo (shows issues from all repos you've created)

Table features:
- Scrollable (j/k navigation with visible cursor `▶`)
- Current row highlighted with inverse/bold styling
- Enter loads the issue into the left form for editing
- `/` activates inline search/filter

#### Status Bar

Single line below both panes:
```
 🍌 org/api                              -- NORMAL --    :q=quit
```

- Left: current repo with banana emoji
- Center: vim mode indicator (`-- NORMAL --` / `-- INSERT --`)
- Right: context-sensitive keybind hints

## Vim Modal Keybindings

### Normal Mode (default on startup)

Navigation:
| Key | Context | Action |
|-----|---------|--------|
| `j` | table | Move cursor down |
| `k` | table | Move cursor up |
| `j` | form | Move to next field |
| `k` | form | Move to previous field |
| `h` | any | Focus left pane / previous tab |
| `l` | any | Focus right pane / next tab |
| `G` | table | Jump to last row |
| `gg` | table | Jump to first row |
| `Tab` | any | Toggle pane focus |
| `1` | table | Switch to Open tab |
| `2` | table | Switch to Recent tab |

Actions:
| Key | Context | Action |
|-----|---------|--------|
| `i` | form | Enter insert mode on current field |
| `a` | form | Enter insert mode at end of current field |
| `o` | any | New issue: clear form, focus title, enter insert mode |
| `Enter` | table | Load selected issue into form (edit mode) |
| `Enter` | form | Move to next field |
| `p` | form | Polish current title+body with AI |
| `dd` | form | Clear current field |
| `/` | table | Activate search filter |
| `r` | table | Refresh issue list |
| `:w` | form | Submit (create) or save (edit) |
| `:q` | any | Quit |
| `:wq` | form | Submit and quit |
| `Esc` | edit mode | Cancel edit, return to create mode |
| `Esc` | search | Close search filter |

### Insert Mode

| Key | Action |
|-----|--------|
| Any text | Type in focused field |
| `Esc` | Return to normal mode |
| `Tab` | Move to next field |
| `Shift+Tab` | Move to previous field |
| `Enter` | New line (body field) / move to next field (title) |

### Command Mode (`:` prefix)

Triggered by typing `:` in normal mode. Shows a command input in the status bar:

| Command | Action |
|---------|--------|
| `:w` | Submit/save current issue |
| `:q` | Quit |
| `:wq` | Submit and quit |
| `:q!` | Quit without saving |
| `:e` | Clear form (new issue) |
| `:repo` | Switch repository |
| `:labels` | Open label selector for current issue |

## Minion Personality (Subtle)

Messages use Minion-speak for personality without being overwhelming:

| Event | Message |
|-------|---------|
| Startup | "🍌 Bello!" in header |
| Issue created | "Bananaaaa! ✓ Issue #42 created in org/api" |
| Issue updated | "Tank yu! ✓ Issue #42 updated" |
| Issue polished | "Para tu! ✨ Polished successfully" |
| Error | "Bee-do bee-do! ✗ {error message}" |
| Loading issues | "Para tu..." |
| Empty table | "No bananas here..." |
| Quit | "Poopaye!" |
| Polish no changes | "Hmm, already perfect! La boda la bodaaa" |

## Component Architecture

```
<App>
  ├─ <RepoSelector>            # Full-screen fuzzy search (initial + :repo)
  └─ <SplitPane>               # Main layout after repo selected
      ├─ <VimProvider>          # Modal state, keystroke interception
      ├─ <IssueForm>            # Left pane — create/edit form
      │    ├─ <FormHeader>      # "🍌 Create Issue" / "🍌 Editing #42"
      │    ├─ <TextField>       # Title input (vim-aware)
      │    ├─ <TextField>       # Body input (vim-aware, multi-line)
      │    ├─ <LabelTags>       # Selected labels display
      │    └─ <ActionHints>     # Context-sensitive keybind hints
      ├─ <IssueTable>           # Right pane — tabbed table
      │    ├─ <TabBar>          # [Open] [Recent] tab headers
      │    ├─ <TableView>       # Scrollable issue rows with cursor
      │    └─ <SearchFilter>    # Inline / search (when active)
      ├─ <StatusBar>            # Bottom: repo, mode, hints
      └─ <MessageToast>         # Success/error messages (auto-dismiss)
```

### Key Component Details

**`<VimProvider>`**: React context that tracks `mode` (`normal` | `insert` | `command`), intercepts all `useInput` keystrokes. In normal mode, maps keys to actions. In insert mode, passes keystrokes to the focused `<TextField>`. In command mode, captures `:` commands.

**`<TextField>`**: Custom text input that respects vim mode. In insert mode, accepts typing. In normal mode, shows cursor position but ignores typing. Supports single-line (title) and multi-line (body) variants.

**`<TableView>`**: Renders rows with a visible cursor (`▶`). Manages scroll offset for tables larger than the pane height. Supports `j/k/G/gg` navigation and `/` search filtering.

**`<MessageToast>`**: Transient messages shown below the panes. Auto-dismisses after 3 seconds. Supports success (green ✓) and error (red ✗) variants.

## DI Pattern

Same `TuiDeps` interface approach. All GitHub API calls and polish function injected. Ink components receive deps via React context (`<DepsProvider>`).

```typescript
interface TuiDeps {
  // Data layer
  listUserRepos: () => Promise<RepoChoice[]>
  fetchLabels: (owner: string, name: string) => Promise<string[]>
  fetchOpenIssues: (owner: string, name: string) => Promise<IssueRow[]>
  fetchIssueDetail: (owner: string, name: string, number: number) => Promise<IssueDetail>
  createIssue: (owner, name, title, body, labels) => Promise<{ number; url }>
  updateIssue: (owner, name, number, title, body) => Promise<void>
  // AI
  polishText?: ((title: string, body: string) => Promise<PolishResult | undefined>) | undefined
  // Config
  configRepos: RepoChoice[]
}
```

New methods vs current TuiDeps:
- `fetchOpenIssues` — needed for the Open tab
- `fetchIssueDetail` — needed to load full body when editing
- `updateIssue` — needed for edit mode saves

## Dependencies

### New runtime dependencies
- `ink` ^5.x — React terminal renderer
- `react` ^18.x — required by Ink
- `chalk` ^5.x — styled text (colors, bold, dim)

### New dev dependencies
- `ink-testing-library` — render Ink components in tests
- `@types/react` — TypeScript types

### Removed dependencies (replaced by Ink)
- `@inquirer/search`
- `@inquirer/input`
- `@inquirer/checkbox`

The onboarding wizard (`src/cli/onboarding.ts`) will also be migrated from `readline` to Ink components, so all `@inquirer/*` packages are fully removed.

## Files

| File | Change |
|------|--------|
| `src/cli/tui.tsx` | **Rewrite** — Ink component tree (renamed from .ts to .tsx) |
| `src/cli/components/` | **New directory** — VimProvider, IssueForm, IssueTable, RepoSelector, StatusBar, TextField, etc. |
| `src/cli/hooks/` | **New directory** — useVim, useFocus, useIssues custom hooks |
| `src/cli/theme.ts` | **New** — Minion color palette, message templates |
| `src/cli/onboarding.tsx` | **Rewrite** — migrate from readline to Ink components |
| `src/cli/index.ts` | Update exports |
| `src/github/client.ts` | Add `updateIssue`, `fetchIssueDetail` methods |
| `src/index.ts` | Update TUI wiring for new deps |
| `test/unit/cli/tui.test.tsx` | **Rewrite** — ink-testing-library based tests |
| `test/unit/cli/components/` | **New** — per-component tests |
| `vitest.config.ts` | Add .tsx to coverage globs |

## Testing Strategy

- **Component tests** via `ink-testing-library`: render components with mock deps, assert rendered output, simulate keystrokes
- **Vim keybinding tests**: dedicated test suite for the VimProvider — verify mode transitions, key mappings, command parsing
- **Integration test**: render full `<App>` with mock deps, walk through create → polish → submit flow
- **100% coverage** maintained on new files

## Verification

1. `pnpm build` — type-check passes (tsx support)
2. `pnpm lint` — lint clean
3. `pnpm test` — all tests pass
4. Manual: `minion --tui` — full workflow: select repo, create issue with vim keys, tab to table, navigate, edit existing issue, polish, submit
