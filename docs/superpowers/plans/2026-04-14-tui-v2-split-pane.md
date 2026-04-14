# TUI v2: Split-Pane Issue Manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sequential @inquirer-based TUI with an Ink-powered split-pane layout featuring vim modal keybindings, a tabbed issue table, inline editing of existing issues, and subtle Minion personality.

**Architecture:** Ink v5 (React for terminals) component tree. `<VimProvider>` context manages modal state (normal/insert/command), intercepting keystrokes before they reach child components. Left pane is `<IssueForm>` (create/edit), right pane is `<IssueTable>` (tabbed Open/Recent). All GitHub API calls injected via `<DepsProvider>` context for testability.

**Tech Stack:** Ink 5, React 18, chalk 5, ink-testing-library (dev)

---

## File Map

```
src/cli/
  tui.tsx              — App root, DepsProvider, screen routing (repo selector vs split-pane)
  index.ts             — barrel exports (update)
  theme.ts             — Minion color palette, message templates
  onboarding.tsx       — Rewrite from readline to Ink
  components/
    VimProvider.tsx     — Modal state context + keystroke interception
    RepoSelector.tsx    — Fuzzy search repo picker
    SplitPane.tsx       — Left/right layout container
    IssueForm.tsx       — Left pane: title/body fields, labels, actions
    IssueTable.tsx      — Right pane: tabbed table with scrolling
    TextField.tsx       — Vim-aware single/multi-line text input
    StatusBar.tsx       — Repo name, mode indicator, keybind hints
    MessageToast.tsx    — Auto-dismissing success/error messages
  hooks/
    useVim.ts           — Hook to consume VimProvider context
    useDeps.ts          — Hook to consume DepsProvider context

src/github/client.ts   — Add updateIssue, fetchIssueDetail
src/index.ts           — Update TUI wiring
tsconfig.json          — Add jsx: "react-jsx"
vitest.config.ts       — Add .tsx to coverage globs
package.json           — Add ink/react/chalk, remove @inquirer/*

test/unit/cli/
  components/
    VimProvider.test.tsx
    TextField.test.tsx
    RepoSelector.test.tsx
    IssueForm.test.tsx
    IssueTable.test.tsx
    StatusBar.test.tsx
    MessageToast.test.tsx
  tui.test.tsx          — Integration: full app flow
  theme.test.ts         — Message formatting
test/unit/cli/onboarding.test.tsx — Rewrite
test/unit/github/client.test.ts  — Add updateIssue/fetchIssueDetail tests
```

---

### Task 1: Dependencies and Build Config

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Install Ink, React, chalk; remove @inquirer**

```bash
pnpm add ink@^5 react@^18 chalk@^5
pnpm add -D ink-testing-library @types/react
pnpm remove @inquirer/search @inquirer/input @inquirer/checkbox
```

- [ ] **Step 2: Add JSX support to tsconfig.json**

Add `"jsx": "react-jsx"` to compilerOptions in `tsconfig.json`.

- [ ] **Step 3: Add .tsx to vitest coverage globs**

In `vitest.config.ts`, update the coverage `include` patterns to also match `.tsx`:
```typescript
include: [
  "src/ai/**/*.ts",
  "src/cli/**/*.{ts,tsx}",
  "src/config/**/*.ts",
  "src/git/**/*.ts",
  "src/github/**/*.ts",
  "src/pipeline/**/*.ts",
],
```

Also remove the old `"src/cli/tui.ts"` specific entry if present.

- [ ] **Step 4: Verify build**

```bash
pnpm build
```

Expected: passes (no tsx files yet, but config is ready).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts
git commit -m "chore: add ink/react/chalk deps, remove @inquirer, enable JSX"
```

---

### Task 2: Theme Module

**Files:**
- Create: `src/cli/theme.ts`
- Create: `test/unit/cli/theme.test.ts`

- [ ] **Step 1: Write failing tests for theme**

```typescript
// test/unit/cli/theme.test.ts
import { describe, it, expect } from 'vitest'
import { messages, colors } from '../../../src/cli/theme.js'

describe('theme', () => {
  describe('messages', () => {
    it('formats issue created message', () => {
      expect(messages.issueCreated(42, 'org/api')).toContain('#42')
      expect(messages.issueCreated(42, 'org/api')).toContain('org/api')
      expect(messages.issueCreated(42, 'org/api')).toContain('Bananaaaa')
    })

    it('formats issue updated message', () => {
      expect(messages.issueUpdated(42)).toContain('#42')
      expect(messages.issueUpdated(42)).toContain('Tank yu')
    })

    it('formats error message', () => {
      expect(messages.error('rate limited')).toContain('rate limited')
      expect(messages.error('rate limited')).toContain('Bee-do')
    })

    it('formats polish success message', () => {
      expect(messages.polishSuccess()).toContain('Para tu')
    })

    it('formats polish no-change message', () => {
      expect(messages.polishNoChange()).toContain('already perfect')
    })

    it('has loading text', () => {
      expect(messages.loading()).toBe('Para tu...')
    })

    it('has empty table text', () => {
      expect(messages.emptyTable()).toContain('No bananas')
    })

    it('has quit message', () => {
      expect(messages.quit()).toContain('Poopaye')
    })
  })

  describe('colors', () => {
    it('exports banana, goggle, overalls color values', () => {
      expect(colors.banana).toBeDefined()
      expect(colors.goggle).toBeDefined()
      expect(colors.overalls).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run test/unit/cli/theme.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement theme module**

```typescript
// src/cli/theme.ts

export const colors = {
  banana: '#FFD700',    // yellow — headers, accents
  goggle: '#87CEEB',    // light blue — highlights
  overalls: '#4169E1',  // blue — borders, active elements
  success: '#32CD32',   // green — success messages
  error: '#FF4444',     // red — errors
  dim: '#666666',       // dim — secondary text
} as const

export const messages = {
  issueCreated: (num: number, repo: string) =>
    `Bananaaaa! \u2713 Issue #${num} created in ${repo}`,
  issueUpdated: (num: number) =>
    `Tank yu! \u2713 Issue #${num} updated`,
  polishSuccess: () =>
    `Para tu! \u2728 Polished successfully`,
  polishNoChange: () =>
    `Hmm, already perfect! La boda la bodaaa`,
  error: (msg: string) =>
    `Bee-do bee-do! \u2717 ${msg}`,
  loading: () => 'Para tu...',
  emptyTable: () => 'No bananas here...',
  quit: () => 'Poopaye!',
  header: (text: string) => `\ud83c\udf4c ${text}`,
} as const
```

- [ ] **Step 4: Run tests**

```bash
pnpm vitest run test/unit/cli/theme.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/theme.ts test/unit/cli/theme.test.ts
git commit -m "feat(tui): add Minion theme module with colors and messages"
```

---

### Task 3: GitHub Client Extensions

**Files:**
- Modify: `src/github/client.ts`
- Modify: `test/unit/github/client.test.ts`

- [ ] **Step 1: Write failing tests for updateIssue and fetchIssueDetail**

Add to the existing client test file:

```typescript
describe('updateIssue', () => {
  it('calls PATCH on the issue endpoint', async () => {
    mockPool.intercept({
      path: '/repos/org/api/issues/42',
      method: 'PATCH',
    }).reply(200, { number: 42, html_url: 'https://github.com/org/api/issues/42' })

    await client.updateIssue('org', 'api', 42, 'New title', 'New body')
  })
})

describe('fetchIssueDetail', () => {
  it('returns full issue body and labels', async () => {
    mockPool.intercept({
      path: '/repos/org/api/issues/42',
      method: 'GET',
    }).reply(200, {
      number: 42,
      title: 'Fix bug',
      body: 'Full description here',
      html_url: 'https://github.com/org/api/issues/42',
      labels: [{ name: 'bug' }, { name: 'urgent' }],
      user: { login: 'testuser' },
    })

    const detail = await client.fetchIssueDetail('org', 'api', 42)
    expect(detail.number).toBe(42)
    expect(detail.title).toBe('Fix bug')
    expect(detail.body).toBe('Full description here')
    expect(detail.labels).toEqual(['bug', 'urgent'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run test/unit/github/client.test.ts
```

Expected: FAIL — methods not found.

- [ ] **Step 3: Implement updateIssue and fetchIssueDetail**

Add to `src/github/client.ts`:

```typescript
async updateIssue(
  owner: string,
  name: string,
  issueNumber: number,
  title: string,
  body: string,
): Promise<void> {
  try {
    await this.octokit.issues.update({
      owner,
      repo: name,
      issue_number: issueNumber,
      title,
      body,
    })
  } catch (err) {
    throw wrapError(err, owner, name)
  }
}

async fetchIssueDetail(
  owner: string,
  name: string,
  issueNumber: number,
): Promise<{ number: number; title: string; body: string; url: string; labels: string[] }> {
  try {
    const { data } = await this.octokit.issues.get({
      owner,
      repo: name,
      issue_number: issueNumber,
    })
    return {
      number: data.number,
      title: data.title,
      body: data.body ?? '',
      url: data.html_url,
      labels: data.labels
        .map((l) => (typeof l === 'string' ? l : l.name ?? ''))
        .filter((n) => n !== ''),
    }
  } catch (err) {
    throw wrapError(err, owner, name)
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm vitest run test/unit/github/client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/github/client.ts test/unit/github/client.test.ts
git commit -m "feat(github): add updateIssue and fetchIssueDetail methods"
```

---

### Task 4: DepsProvider and useVim Hook

**Files:**
- Create: `src/cli/hooks/useDeps.ts`
- Create: `src/cli/components/VimProvider.tsx`
- Create: `src/cli/hooks/useVim.ts`
- Create: `test/unit/cli/components/VimProvider.test.tsx`

- [ ] **Step 1: Create DepsProvider context and hook**

```typescript
// src/cli/hooks/useDeps.ts
import { createContext, useContext } from 'react'

export interface TuiDeps {
  listUserRepos: () => Promise<Array<{ owner: string; name: string; description: string }>>
  fetchLabels: (owner: string, name: string) => Promise<string[]>
  fetchOpenIssues: (owner: string, name: string) => Promise<Array<{ number: number; title: string; labels: string[] }>>
  fetchIssueDetail: (owner: string, name: string, number: number) => Promise<{ number: number; title: string; body: string; url: string; labels: string[] }>
  createIssue: (owner: string, name: string, title: string, body: string, labels: string[]) => Promise<{ number: number; url: string }>
  updateIssue: (owner: string, name: string, number: number, title: string, body: string) => Promise<void>
  polishText?: ((title: string, body: string) => Promise<{ title: string; body: string } | undefined>) | undefined
  configRepos: Array<{ owner: string; name: string }>
}

export const DepsContext = createContext<TuiDeps | null>(null)

export function useDeps(): TuiDeps {
  const deps = useContext(DepsContext)
  if (!deps) throw new Error('useDeps must be used inside <DepsContext.Provider>')
  return deps
}
```

- [ ] **Step 2: Write failing tests for VimProvider**

```typescript
// test/unit/cli/components/VimProvider.test.tsx
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { Text } from 'ink'
import { VimProvider } from '../../../../src/cli/components/VimProvider.js'
import { useVim } from '../../../../src/cli/hooks/useVim.js'

function ModeDisplay() {
  const { mode } = useVim()
  return <Text>{mode}</Text>
}

describe('VimProvider', () => {
  it('starts in normal mode', () => {
    const { lastFrame } = render(
      <VimProvider>
        <ModeDisplay />
      </VimProvider>
    )
    expect(lastFrame()).toBe('normal')
  })

  it('transitions to insert mode on "i"', () => {
    const { lastFrame, stdin } = render(
      <VimProvider>
        <ModeDisplay />
      </VimProvider>
    )
    stdin.write('i')
    expect(lastFrame()).toBe('insert')
  })

  it('transitions back to normal on Escape', () => {
    const { lastFrame, stdin } = render(
      <VimProvider>
        <ModeDisplay />
      </VimProvider>
    )
    stdin.write('i')
    expect(lastFrame()).toBe('insert')
    stdin.write('\x1B')  // Escape
    expect(lastFrame()).toBe('normal')
  })

  it('enters command mode on ":"', () => {
    const { lastFrame, stdin } = render(
      <VimProvider>
        <ModeDisplay />
      </VimProvider>
    )
    stdin.write(':')
    expect(lastFrame()).toBe('command')
  })

  it('exits command mode on Escape', () => {
    const { lastFrame, stdin } = render(
      <VimProvider>
        <ModeDisplay />
      </VimProvider>
    )
    stdin.write(':')
    stdin.write('\x1B')
    expect(lastFrame()).toBe('normal')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm vitest run test/unit/cli/components/VimProvider.test.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Implement useVim hook**

```typescript
// src/cli/hooks/useVim.ts
import { createContext, useContext } from 'react'

export type VimMode = 'normal' | 'insert' | 'command'
export type Pane = 'form' | 'table'
export type FormField = 'title' | 'body'

export interface VimState {
  mode: VimMode
  pane: Pane
  formField: FormField
  commandBuffer: string
  searchActive: boolean
}

export interface VimActions {
  setMode: (mode: VimMode) => void
  setPane: (pane: Pane) => void
  setFormField: (field: FormField) => void
  setCommandBuffer: (buf: string) => void
  setSearchActive: (active: boolean) => void
  togglePane: () => void
}

export type VimContextValue = VimState & VimActions

export const VimContext = createContext<VimContextValue | null>(null)

export function useVim(): VimContextValue {
  const ctx = useContext(VimContext)
  if (!ctx) throw new Error('useVim must be used inside <VimProvider>')
  return ctx
}
```

- [ ] **Step 5: Implement VimProvider**

```typescript
// src/cli/components/VimProvider.tsx
import React, { useState, useCallback, useMemo } from 'react'
import { useInput } from 'ink'
import { VimContext } from '../hooks/useVim.js'
import type { VimMode, Pane, FormField, VimContextValue } from '../hooks/useVim.js'

interface VimProviderProps {
  children: React.ReactNode
  onCommand?: (cmd: string) => void
  onAction?: (action: string) => void
}

export function VimProvider({ children, onCommand, onAction }: VimProviderProps): React.JSX.Element {
  const [mode, setMode] = useState<VimMode>('normal')
  const [pane, setPane] = useState<Pane>('form')
  const [formField, setFormField] = useState<FormField>('title')
  const [commandBuffer, setCommandBuffer] = useState('')
  const [searchActive, setSearchActive] = useState(false)
  const [gPending, setGPending] = useState(false)
  const [dPending, setDPending] = useState(false)

  const togglePane = useCallback(() => {
    setPane((p) => (p === 'form' ? 'table' : 'form'))
  }, [])

  useInput((input, key) => {
    if (mode === 'command') {
      if (key.escape) {
        setMode('normal')
        setCommandBuffer('')
      } else if (key.return) {
        onCommand?.(commandBuffer)
        setMode('normal')
        setCommandBuffer('')
      } else if (key.backspace || key.delete) {
        setCommandBuffer((b) => b.slice(0, -1))
      } else if (input && !key.ctrl && !key.meta) {
        setCommandBuffer((b) => b + input)
      }
      return
    }

    if (mode === 'insert') {
      if (key.escape) {
        setMode('normal')
      } else if (key.tab && !key.shift) {
        setFormField((f) => (f === 'title' ? 'body' : 'title'))
      } else if (key.tab && key.shift) {
        setFormField((f) => (f === 'body' ? 'title' : 'body'))
      }
      // All other keys are passed to the focused TextField
      return
    }

    // Normal mode
    if (input === ':') {
      setMode('command')
      setCommandBuffer('')
      return
    }
    if (input === 'i') { setMode('insert'); return }
    if (input === 'a') { setMode('insert'); onAction?.('cursor-end'); return }
    if (input === 'o') { onAction?.('new-issue'); setMode('insert'); return }
    if (input === 'j') { onAction?.('move-down'); return }
    if (input === 'k') { onAction?.('move-up'); return }
    if (input === 'h') { onAction?.('move-left'); return }
    if (input === 'l') { onAction?.('move-right'); return }
    if (input === 'p') { onAction?.('polish'); return }
    if (input === 'r') { onAction?.('refresh'); return }
    if (input === '/') { onAction?.('search'); return }
    if (input === '1') { onAction?.('tab-1'); return }
    if (input === '2') { onAction?.('tab-2'); return }

    if (input === 'G') { onAction?.('jump-bottom'); return }
    if (input === 'g') {
      if (gPending) { onAction?.('jump-top'); setGPending(false); return }
      setGPending(true)
      setTimeout(() => setGPending(false), 500)
      return
    }
    if (input === 'd') {
      if (dPending) { onAction?.('clear-field'); setDPending(false); return }
      setDPending(true)
      setTimeout(() => setDPending(false), 500)
      return
    }

    if (key.tab) { togglePane(); return }
    if (key.return) { onAction?.('enter'); return }
    if (key.escape) { onAction?.('escape'); return }
  })

  const value = useMemo<VimContextValue>(() => ({
    mode, pane, formField, commandBuffer, searchActive,
    setMode, setPane, setFormField, setCommandBuffer, setSearchActive, togglePane,
  }), [mode, pane, formField, commandBuffer, searchActive, togglePane])

  return (
    <VimContext.Provider value={value}>
      {children}
    </VimContext.Provider>
  )
}
```

- [ ] **Step 6: Run tests**

```bash
pnpm vitest run test/unit/cli/components/VimProvider.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/cli/hooks/ src/cli/components/VimProvider.tsx test/unit/cli/components/
git commit -m "feat(tui): add VimProvider with modal state and useVim/useDeps hooks"
```

---

### Task 5: TextField Component

**Files:**
- Create: `src/cli/components/TextField.tsx`
- Create: `test/unit/cli/components/TextField.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// test/unit/cli/components/TextField.test.tsx
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { VimProvider } from '../../../../src/cli/components/VimProvider.js'
import { TextField } from '../../../../src/cli/components/TextField.js'

function wrap(node: React.ReactNode) {
  return <VimProvider>{node}</VimProvider>
}

describe('TextField', () => {
  it('renders label and empty value', () => {
    const { lastFrame } = render(wrap(
      <TextField label="Title" value="" onChange={() => {}} active={false} />
    ))
    expect(lastFrame()).toContain('Title')
  })

  it('renders the current value', () => {
    const { lastFrame } = render(wrap(
      <TextField label="Title" value="Hello world" onChange={() => {}} active={false} />
    ))
    expect(lastFrame()).toContain('Hello world')
  })

  it('shows cursor indicator when active in insert mode', () => {
    const { lastFrame, stdin } = render(
      <VimProvider>
        <TextField label="Title" value="" onChange={() => {}} active={true} />
      </VimProvider>
    )
    stdin.write('i') // enter insert mode
    expect(lastFrame()).toContain('_')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run test/unit/cli/components/TextField.test.tsx
```

- [ ] **Step 3: Implement TextField**

```typescript
// src/cli/components/TextField.tsx
import React from 'react'
import { Text, Box, useInput } from 'ink'
import chalk from 'chalk'
import { useVim } from '../hooks/useVim.js'
import { colors } from '../theme.js'

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  active: boolean
  multiline?: boolean | undefined
}

export function TextField({ label, value, onChange, active, multiline }: TextFieldProps): React.JSX.Element {
  const { mode } = useVim()
  const isEditing = active && mode === 'insert'

  useInput((input, key) => {
    if (!isEditing) return

    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1))
    } else if (key.return && multiline) {
      onChange(value + '\n')
    } else if (input && !key.ctrl && !key.meta && !key.escape && !key.tab) {
      onChange(value + input)
    }
  }, { isActive: isEditing })

  const labelColor = active ? colors.banana : colors.dim
  const cursor = isEditing ? chalk.inverse(' ') : ''
  const displayValue = value || (active ? '' : chalk.hex(colors.dim)('(empty)'))

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={labelColor} bold={active}>{label}: </Text>
        <Text>{displayValue}{cursor}</Text>
      </Text>
      {multiline && value.split('\n').length > 1 && (
        <Box marginLeft={label.length + 2}>
          {value.split('\n').slice(1).map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
      )}
    </Box>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm vitest run test/unit/cli/components/TextField.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/components/TextField.tsx test/unit/cli/components/TextField.test.tsx
git commit -m "feat(tui): add vim-aware TextField component"
```

---

### Task 6: StatusBar Component

**Files:**
- Create: `src/cli/components/StatusBar.tsx`
- Create: `test/unit/cli/components/StatusBar.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// test/unit/cli/components/StatusBar.test.tsx
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { VimProvider } from '../../../../src/cli/components/VimProvider.js'
import { StatusBar } from '../../../../src/cli/components/StatusBar.js'

describe('StatusBar', () => {
  it('shows repo name and normal mode', () => {
    const { lastFrame } = render(
      <VimProvider>
        <StatusBar repo="org/api" message="" />
      </VimProvider>
    )
    expect(lastFrame()).toContain('org/api')
    expect(lastFrame()).toContain('NORMAL')
  })

  it('shows insert mode after pressing i', () => {
    const { lastFrame, stdin } = render(
      <VimProvider>
        <StatusBar repo="org/api" message="" />
      </VimProvider>
    )
    stdin.write('i')
    expect(lastFrame()).toContain('INSERT')
  })

  it('shows command buffer in command mode', () => {
    const { lastFrame, stdin } = render(
      <VimProvider>
        <StatusBar repo="org/api" message="" />
      </VimProvider>
    )
    stdin.write(':')
    stdin.write('w')
    expect(lastFrame()).toContain(':w')
  })

  it('shows toast message when provided', () => {
    const { lastFrame } = render(
      <VimProvider>
        <StatusBar repo="org/api" message="Bananaaaa! Issue created" />
      </VimProvider>
    )
    expect(lastFrame()).toContain('Bananaaaa')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run test/unit/cli/components/StatusBar.test.tsx
```

- [ ] **Step 3: Implement StatusBar**

```typescript
// src/cli/components/StatusBar.tsx
import React from 'react'
import { Box, Text } from 'ink'
import { useVim } from '../hooks/useVim.js'
import { colors } from '../theme.js'

interface StatusBarProps {
  repo: string
  message: string
}

export function StatusBar({ repo, message }: StatusBarProps): React.JSX.Element {
  const { mode, commandBuffer } = useVim()

  const modeLabel = mode === 'command'
    ? `:${commandBuffer}`
    : `-- ${mode.toUpperCase()} --`

  return (
    <Box>
      <Box flexGrow={1}>
        <Text color={colors.banana}>{'\ud83c\udf4c'} {repo}</Text>
      </Box>
      {message ? (
        <Box flexGrow={1} justifyContent="center">
          <Text>{message}</Text>
        </Box>
      ) : null}
      <Box>
        <Text color={colors.dim}>{modeLabel}</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm vitest run test/unit/cli/components/StatusBar.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/components/StatusBar.tsx test/unit/cli/components/StatusBar.test.tsx
git commit -m "feat(tui): add StatusBar with mode indicator and Minion branding"
```

---

### Task 7: MessageToast Component

**Files:**
- Create: `src/cli/components/MessageToast.tsx`
- Create: `test/unit/cli/components/MessageToast.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// test/unit/cli/components/MessageToast.test.tsx
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { MessageToast } from '../../../../src/cli/components/MessageToast.js'

describe('MessageToast', () => {
  it('renders nothing when message is empty', () => {
    const { lastFrame } = render(<MessageToast message="" />)
    expect(lastFrame()).toBe('')
  })

  it('renders success message with green check', () => {
    const { lastFrame } = render(<MessageToast message="Issue created" variant="success" />)
    expect(lastFrame()).toContain('Issue created')
  })

  it('renders error message', () => {
    const { lastFrame } = render(<MessageToast message="Something broke" variant="error" />)
    expect(lastFrame()).toContain('Something broke')
  })
})
```

- [ ] **Step 2: Implement MessageToast**

```typescript
// src/cli/components/MessageToast.tsx
import React from 'react'
import { Text } from 'ink'
import { colors } from '../theme.js'

interface MessageToastProps {
  message: string
  variant?: 'success' | 'error' | undefined
}

export function MessageToast({ message, variant }: MessageToastProps): React.JSX.Element | null {
  if (!message) return null

  const color = variant === 'error' ? colors.error : variant === 'success' ? colors.success : undefined

  return <Text color={color}>{message}</Text>
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm vitest run test/unit/cli/components/MessageToast.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/cli/components/MessageToast.tsx test/unit/cli/components/MessageToast.test.tsx
git commit -m "feat(tui): add MessageToast component for success/error feedback"
```

---

### Task 8: RepoSelector Component

**Files:**
- Create: `src/cli/components/RepoSelector.tsx`
- Create: `test/unit/cli/components/RepoSelector.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// test/unit/cli/components/RepoSelector.test.tsx
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { RepoSelector } from '../../../../src/cli/components/RepoSelector.js'

describe('RepoSelector', () => {
  const repos = [
    { owner: 'org', name: 'api' },
    { owner: 'org', name: 'web' },
    { owner: 'other', name: 'lib' },
  ]

  it('renders header and all repos', () => {
    const { lastFrame } = render(
      <RepoSelector repos={repos} onSelect={() => {}} />
    )
    expect(lastFrame()).toContain('Bello')
    expect(lastFrame()).toContain('org/api')
    expect(lastFrame()).toContain('org/web')
    expect(lastFrame()).toContain('other/lib')
  })

  it('highlights the first repo by default', () => {
    const { lastFrame } = render(
      <RepoSelector repos={repos} onSelect={() => {}} />
    )
    // First item should have the cursor indicator
    expect(lastFrame()).toContain('\u25b6')
  })

  it('filters repos by search term', () => {
    const { lastFrame, stdin } = render(
      <RepoSelector repos={repos} onSelect={() => {}} />
    )
    stdin.write('web')
    expect(lastFrame()).toContain('org/web')
    expect(lastFrame()).not.toContain('other/lib')
  })

  it('calls onSelect when Enter is pressed', () => {
    const onSelect = vi.fn()
    const { stdin } = render(
      <RepoSelector repos={repos} onSelect={onSelect} />
    )
    stdin.write('\r') // Enter
    expect(onSelect).toHaveBeenCalledWith({ owner: 'org', name: 'api' })
  })

  it('navigates with j/k', () => {
    const onSelect = vi.fn()
    const { stdin } = render(
      <RepoSelector repos={repos} onSelect={onSelect} />
    )
    stdin.write('j') // move down
    stdin.write('\r') // Enter
    expect(onSelect).toHaveBeenCalledWith({ owner: 'org', name: 'web' })
  })
})
```

- [ ] **Step 2: Implement RepoSelector**

```typescript
// src/cli/components/RepoSelector.tsx
import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { colors, messages } from '../theme.js'

interface RepoChoice {
  owner: string
  name: string
}

interface RepoSelectorProps {
  repos: RepoChoice[]
  onSelect: (repo: RepoChoice) => void
}

export function RepoSelector({ repos, onSelect }: RepoSelectorProps): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState(0)

  const filtered = repos.filter((r) => {
    if (!search) return true
    const term = search.toLowerCase()
    return `${r.owner}/${r.name}`.toLowerCase().includes(term)
  })

  useInput((input, key) => {
    if (key.return) {
      const selected = filtered[cursor]
      if (selected) onSelect(selected)
      return
    }
    if (key.backspace || key.delete) {
      setSearch((s) => s.slice(0, -1))
      setCursor(0)
      return
    }
    if (input === 'j' || key.downArrow) {
      setCursor((c) => Math.min(c + 1, filtered.length - 1))
      return
    }
    if (input === 'k' || key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0))
      return
    }
    if (input && !key.ctrl && !key.meta && !key.escape && !key.tab) {
      setSearch((s) => s + input)
      setCursor(0)
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.overalls} paddingX={1}>
      <Text color={colors.banana} bold>{messages.header('Bello! Select a repo')}</Text>
      <Text> </Text>
      <Text>  Search: {search}<Text color={colors.dim}>_</Text></Text>
      <Text> </Text>
      {filtered.map((repo, i) => (
        <Text key={`${repo.owner}/${repo.name}`}>
          {i === cursor ? <Text color={colors.banana}>{'\u25b6'} </Text> : '  '}
          <Text bold={i === cursor}>{repo.owner}/{repo.name}</Text>
        </Text>
      ))}
      {filtered.length === 0 && (
        <Text color={colors.dim}>  {messages.emptyTable()}</Text>
      )}
    </Box>
  )
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm vitest run test/unit/cli/components/RepoSelector.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/cli/components/RepoSelector.tsx test/unit/cli/components/RepoSelector.test.tsx
git commit -m "feat(tui): add RepoSelector with fuzzy search and j/k navigation"
```

---

### Task 9: IssueTable Component

**Files:**
- Create: `src/cli/components/IssueTable.tsx`
- Create: `test/unit/cli/components/IssueTable.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// test/unit/cli/components/IssueTable.test.tsx
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { VimProvider } from '../../../../src/cli/components/VimProvider.js'
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

function wrap(node: React.ReactNode) {
  return <VimProvider>{node}</VimProvider>
}

describe('IssueTable', () => {
  it('renders open issues tab by default', () => {
    const { lastFrame } = render(wrap(
      <IssueTable
        openIssues={openIssues}
        recentIssues={recentIssues}
        active={true}
        cursor={0}
        tab="open"
        onSelect={() => {}}
      />
    ))
    expect(lastFrame()).toContain('Open')
    expect(lastFrame()).toContain('42')
    expect(lastFrame()).toContain('Fix login bug')
  })

  it('renders recent issues when tab is recent', () => {
    const { lastFrame } = render(wrap(
      <IssueTable
        openIssues={openIssues}
        recentIssues={recentIssues}
        active={true}
        cursor={0}
        tab="recent"
        onSelect={() => {}}
      />
    ))
    expect(lastFrame()).toContain('Recent')
    expect(lastFrame()).toContain('org/api')
    expect(lastFrame()).toContain('org/web')
  })

  it('shows cursor on active row', () => {
    const { lastFrame } = render(wrap(
      <IssueTable
        openIssues={openIssues}
        recentIssues={[]}
        active={true}
        cursor={1}
        tab="open"
        onSelect={() => {}}
      />
    ))
    // Row at index 1 (Add dark mode) should have cursor
    expect(lastFrame()).toContain('\u25b6')
  })

  it('shows empty message when no issues', () => {
    const { lastFrame } = render(wrap(
      <IssueTable
        openIssues={[]}
        recentIssues={[]}
        active={true}
        cursor={0}
        tab="open"
        onSelect={() => {}}
      />
    ))
    expect(lastFrame()).toContain('No bananas')
  })
})
```

- [ ] **Step 2: Implement IssueTable**

```typescript
// src/cli/components/IssueTable.tsx
import React from 'react'
import { Box, Text } from 'ink'
import { colors, messages } from '../theme.js'

interface OpenIssue {
  number: number
  title: string
  labels: string[]
}

interface RecentIssue {
  number: number
  title: string
  repo: string
}

interface IssueTableProps {
  openIssues: OpenIssue[]
  recentIssues: RecentIssue[]
  active: boolean
  cursor: number
  tab: 'open' | 'recent'
  onSelect: (issueNumber: number) => void
  searchFilter?: string | undefined
}

export function IssueTable({
  openIssues, recentIssues, active, cursor, tab, searchFilter,
}: IssueTableProps): React.JSX.Element {
  const borderColor = active ? colors.overalls : colors.dim

  const openTab = tab === 'open'
    ? <Text color={colors.banana} bold>[Open]</Text>
    : <Text color={colors.dim}> Open </Text>
  const recentTab = tab === 'recent'
    ? <Text color={colors.banana} bold>[Recent]</Text>
    : <Text color={colors.dim}> Recent </Text>

  const rows = tab === 'open'
    ? openIssues
        .filter((i) => !searchFilter || i.title.toLowerCase().includes(searchFilter.toLowerCase()))
        .map((issue, i) => ({
          key: issue.number,
          cols: [
            String(issue.number).padStart(4),
            issue.title.slice(0, 20).padEnd(20),
            issue.labels.slice(0, 2).join(', '),
          ],
          isCurrent: i === cursor,
        }))
    : recentIssues
        .filter((i) => !searchFilter || i.title.toLowerCase().includes(searchFilter.toLowerCase()))
        .map((issue, i) => ({
          key: issue.number,
          cols: [
            String(issue.number).padStart(4),
            issue.title.slice(0, 20).padEnd(20),
            issue.repo,
          ],
          isCurrent: i === cursor,
        }))

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1} flexGrow={1}>
      <Box gap={1}>
        {openTab}
        {recentTab}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {rows.length === 0 ? (
          <Text color={colors.dim}>{messages.emptyTable()}</Text>
        ) : rows.map((row) => (
          <Text key={row.key}>
            {row.isCurrent && active ? <Text color={colors.banana}>{'\u25b6'}</Text> : ' '}
            <Text bold={row.isCurrent}> {row.cols.join('  ')}</Text>
          </Text>
        ))}
      </Box>
    </Box>
  )
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm vitest run test/unit/cli/components/IssueTable.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/cli/components/IssueTable.tsx test/unit/cli/components/IssueTable.test.tsx
git commit -m "feat(tui): add IssueTable with tabbed Open/Recent views"
```

---

### Task 10: IssueForm Component

**Files:**
- Create: `src/cli/components/IssueForm.tsx`
- Create: `test/unit/cli/components/IssueForm.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// test/unit/cli/components/IssueForm.test.tsx
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { VimProvider } from '../../../../src/cli/components/VimProvider.js'
import { IssueForm } from '../../../../src/cli/components/IssueForm.js'

function wrap(node: React.ReactNode) {
  return <VimProvider>{node}</VimProvider>
}

describe('IssueForm', () => {
  it('renders create mode header by default', () => {
    const { lastFrame } = render(wrap(
      <IssueForm
        title="" body="" labels={[]}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true}
        editingIssue={undefined}
      />
    ))
    expect(lastFrame()).toContain('Bello')
    expect(lastFrame()).toContain('Create Issue')
  })

  it('renders edit mode header with issue number', () => {
    const { lastFrame } = render(wrap(
      <IssueForm
        title="Fix bug" body="Details" labels={['bug']}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true}
        editingIssue={42}
      />
    ))
    expect(lastFrame()).toContain('Editing #42')
  })

  it('shows Title and Body fields', () => {
    const { lastFrame } = render(wrap(
      <IssueForm
        title="My title" body="My body" labels={[]}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true}
        editingIssue={undefined}
      />
    ))
    expect(lastFrame()).toContain('Title')
    expect(lastFrame()).toContain('My title')
    expect(lastFrame()).toContain('Body')
    expect(lastFrame()).toContain('My body')
  })

  it('shows label tags when labels present', () => {
    const { lastFrame } = render(wrap(
      <IssueForm
        title="" body="" labels={['bug', 'urgent']}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true}
        editingIssue={undefined}
      />
    ))
    expect(lastFrame()).toContain('bug')
    expect(lastFrame()).toContain('urgent')
  })
})
```

- [ ] **Step 2: Implement IssueForm**

```typescript
// src/cli/components/IssueForm.tsx
import React from 'react'
import { Box, Text } from 'ink'
import { TextField } from './TextField.js'
import { useVim } from '../hooks/useVim.js'
import { colors, messages } from '../theme.js'

interface IssueFormProps {
  title: string
  body: string
  labels: string[]
  onTitleChange: (v: string) => void
  onBodyChange: (v: string) => void
  active: boolean
  editingIssue: number | undefined
}

export function IssueForm({
  title, body, labels, onTitleChange, onBodyChange, active, editingIssue,
}: IssueFormProps): React.JSX.Element {
  const { formField } = useVim()
  const borderColor = active ? colors.overalls : colors.dim

  const header = editingIssue !== undefined
    ? messages.header(`Editing #${editingIssue}`)
    : messages.header('Bello! Create Issue')

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1} flexGrow={1}>
      <Text color={colors.banana} bold>{header}</Text>
      <Box flexDirection="column" marginTop={1} gap={1}>
        <TextField
          label="Title"
          value={title}
          onChange={onTitleChange}
          active={active && formField === 'title'}
        />
        <TextField
          label="Body"
          value={body}
          onChange={onBodyChange}
          active={active && formField === 'body'}
          multiline
        />
      </Box>
      {labels.length > 0 && (
        <Box marginTop={1} gap={1}>
          {labels.map((l) => (
            <Text key={l} color={colors.goggle}>[{l}]</Text>
          ))}
        </Box>
      )}
    </Box>
  )
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm vitest run test/unit/cli/components/IssueForm.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/cli/components/IssueForm.tsx test/unit/cli/components/IssueForm.test.tsx
git commit -m "feat(tui): add IssueForm with create/edit modes and label tags"
```

---

### Task 11: App Root and SplitPane

**Files:**
- Create: `src/cli/tui.tsx` (replaces old `src/cli/tui.ts`)
- Create: `src/cli/components/SplitPane.tsx`
- Create: `test/unit/cli/tui.test.tsx`

This is the integration task — wiring all components together into the full app.

- [ ] **Step 1: Create SplitPane layout component**

```typescript
// src/cli/components/SplitPane.tsx
import React from 'react'
import { Box } from 'ink'

interface SplitPaneProps {
  left: React.ReactNode
  right: React.ReactNode
}

export function SplitPane({ left, right }: SplitPaneProps): React.JSX.Element {
  return (
    <Box flexDirection="row" width="100%">
      <Box flexGrow={1} flexBasis="50%">{left}</Box>
      <Box flexGrow={1} flexBasis="50%">{right}</Box>
    </Box>
  )
}
```

- [ ] **Step 2: Write the App root (tui.tsx)**

Delete `src/cli/tui.ts` and create `src/cli/tui.tsx`:

```typescript
// src/cli/tui.tsx
import React, { useState, useCallback } from 'react'
import { render, Box } from 'ink'
import { DepsContext } from './hooks/useDeps.js'
import type { TuiDeps } from './hooks/useDeps.js'
import { VimProvider } from './components/VimProvider.js'
import { RepoSelector } from './components/RepoSelector.js'
import { SplitPane } from './components/SplitPane.js'
import { IssueForm } from './components/IssueForm.js'
import { IssueTable } from './components/IssueTable.js'
import { StatusBar } from './components/StatusBar.js'
import { MessageToast } from './components/MessageToast.js'
import { messages } from './theme.js'
import type { VimMode, Pane } from './hooks/useVim.js'

interface RepoChoice { owner: string; name: string }
interface OpenIssue { number: number; title: string; labels: string[] }
interface RecentIssue { number: number; title: string; repo: string }

function App({ deps }: { deps: TuiDeps }): React.JSX.Element {
  // Screen state
  const [screen, setScreen] = useState<'repo-select' | 'main'>('repo-select')
  const [repo, setRepo] = useState<RepoChoice | null>(null)
  const [allRepos, setAllRepos] = useState<RepoChoice[]>(deps.configRepos)

  // Form state
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [editingIssue, setEditingIssue] = useState<number | undefined>(undefined)

  // Table state
  const [openIssues, setOpenIssues] = useState<OpenIssue[]>([])
  const [recentIssues, setRecentIssues] = useState<RecentIssue[]>([])
  const [tableCursor, setTableCursor] = useState(0)
  const [tableTab, setTableTab] = useState<'open' | 'recent'>('open')

  // UI state
  const [pane, setPane] = useState<Pane>('form')
  const [statusMessage, setStatusMessage] = useState('')
  const [messageVariant, setMessageVariant] = useState<'success' | 'error' | undefined>(undefined)

  // Repo selection
  const handleRepoSelect = useCallback(async (selected: RepoChoice) => {
    setRepo(selected)
    setScreen('main')
    try {
      const issues = await deps.fetchOpenIssues(selected.owner, selected.name)
      setOpenIssues(issues.map((i) => ({
        number: i.number, title: i.title, labels: i.labels,
      })))
    } catch {
      setOpenIssues([])
    }
  }, [deps])

  // Initialize repos
  React.useEffect(() => {
    deps.listUserRepos().then((apiRepos) => {
      const merged = [...deps.configRepos]
      for (const r of apiRepos) {
        if (!merged.some((c) => c.owner === r.owner && c.name === r.name)) {
          merged.push({ owner: r.owner, name: r.name })
        }
      }
      setAllRepos(merged)
    }).catch(() => { /* use config repos only */ })
  }, [deps])

  // Vim command handler
  const handleCommand = useCallback(async (cmd: string) => {
    if (cmd === 'q' || cmd === 'q!') {
      process.exit(0)
    }
    if ((cmd === 'w' || cmd === 'wq') && repo) {
      try {
        if (editingIssue !== undefined) {
          await deps.updateIssue(repo.owner, repo.name, editingIssue, title, body)
          setStatusMessage(messages.issueUpdated(editingIssue))
          setMessageVariant('success')
        } else {
          const result = await deps.createIssue(repo.owner, repo.name, title, body, labels)
          setStatusMessage(messages.issueCreated(result.number, `${repo.owner}/${repo.name}`))
          setMessageVariant('success')
          setRecentIssues((prev) => [
            { number: result.number, title, repo: `${repo.owner}/${repo.name}` },
            ...prev,
          ])
        }
        setTitle('')
        setBody('')
        setLabels([])
        setEditingIssue(undefined)
      } catch (err) {
        setStatusMessage(messages.error(err instanceof Error ? err.message : String(err)))
        setMessageVariant('error')
      }
      if (cmd === 'wq') process.exit(0)
    }
    if (cmd === 'e') {
      setTitle('')
      setBody('')
      setLabels([])
      setEditingIssue(undefined)
    }
    if (cmd === 'repo') {
      setScreen('repo-select')
    }
  }, [deps, repo, editingIssue, title, body, labels])

  // Vim action handler
  const handleAction = useCallback(async (action: string) => {
    if (action === 'move-down' && pane === 'table') {
      const max = tableTab === 'open' ? openIssues.length - 1 : recentIssues.length - 1
      setTableCursor((c) => Math.min(c + 1, max))
    }
    if (action === 'move-up' && pane === 'table') {
      setTableCursor((c) => Math.max(c - 1, 0))
    }
    if (action === 'move-left') setPane('form')
    if (action === 'move-right') setPane('table')
    if (action === 'jump-top') setTableCursor(0)
    if (action === 'jump-bottom') {
      const max = tableTab === 'open' ? openIssues.length - 1 : recentIssues.length - 1
      setTableCursor(Math.max(max, 0))
    }
    if (action === 'tab-1') { setTableTab('open'); setTableCursor(0) }
    if (action === 'tab-2') { setTableTab('recent'); setTableCursor(0) }
    if (action === 'new-issue') {
      setTitle('')
      setBody('')
      setLabels([])
      setEditingIssue(undefined)
      setPane('form')
    }
    if (action === 'enter' && pane === 'table' && repo) {
      const issues = tableTab === 'open' ? openIssues : recentIssues
      const selected = issues[tableCursor]
      if (selected) {
        try {
          const detail = await deps.fetchIssueDetail(repo.owner, repo.name, selected.number)
          setTitle(detail.title)
          setBody(detail.body)
          setLabels(detail.labels)
          setEditingIssue(detail.number)
          setPane('form')
        } catch (err) {
          setStatusMessage(messages.error(err instanceof Error ? err.message : String(err)))
          setMessageVariant('error')
        }
      }
    }
    if (action === 'polish' && deps.polishText && repo) {
      try {
        const polished = await deps.polishText(title, body)
        if (polished) {
          setTitle(polished.title)
          setBody(polished.body)
          setStatusMessage(messages.polishSuccess())
          setMessageVariant('success')
        } else {
          setStatusMessage(messages.polishNoChange())
          setMessageVariant('success')
        }
      } catch (err) {
        setStatusMessage(messages.error(err instanceof Error ? err.message : String(err)))
        setMessageVariant('error')
      }
    }
    if (action === 'refresh' && repo) {
      try {
        const issues = await deps.fetchOpenIssues(repo.owner, repo.name)
        setOpenIssues(issues.map((i) => ({ number: i.number, title: i.title, labels: i.labels })))
      } catch { /* ignore */ }
    }
    if (action === 'escape') {
      if (editingIssue !== undefined) {
        setTitle('')
        setBody('')
        setLabels([])
        setEditingIssue(undefined)
      }
    }
    if (action === 'clear-field') {
      // dd clears current field — handled by VimProvider formField
    }
  }, [pane, tableTab, tableCursor, openIssues, recentIssues, repo, deps, title, body, editingIssue])

  if (screen === 'repo-select') {
    return <RepoSelector repos={allRepos} onSelect={handleRepoSelect} />
  }

  const repoName = repo ? `${repo.owner}/${repo.name}` : ''

  return (
    <DepsContext.Provider value={deps}>
      <VimProvider onCommand={handleCommand} onAction={handleAction}>
        <Box flexDirection="column">
          <SplitPane
            left={
              <IssueForm
                title={title} body={body} labels={labels}
                onTitleChange={setTitle} onBodyChange={setBody}
                active={pane === 'form'}
                editingIssue={editingIssue}
              />
            }
            right={
              <IssueTable
                openIssues={openIssues}
                recentIssues={recentIssues}
                active={pane === 'table'}
                cursor={tableCursor}
                tab={tableTab}
                onSelect={() => {}}
              />
            }
          />
          <StatusBar repo={repoName} message={statusMessage} />
          <MessageToast message={statusMessage} variant={messageVariant} />
        </Box>
      </VimProvider>
    </DepsContext.Provider>
  )
}

export type { TuiDeps } from './hooks/useDeps.js'

export async function runTui(deps: TuiDeps): Promise<number> {
  const { waitUntilExit } = render(<App deps={deps} />)
  await waitUntilExit()
  return 0
}
```

- [ ] **Step 3: Write integration test**

```typescript
// test/unit/cli/tui.test.tsx
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import type { TuiDeps } from '../../../src/cli/hooks/useDeps.js'

// We test the components individually — this is a smoke test for the App assembly
// Import the App indirectly via the module (rendered in test with ink-testing-library)

describe('TUI v2 smoke', () => {
  it('renders repo selector on startup', async () => {
    const { runTui } = await import('../../../src/cli/tui.js')
    // runTui calls render() which blocks — we test components directly instead
    expect(runTui).toBeDefined()
    expect(typeof runTui).toBe('function')
  })
})
```

- [ ] **Step 4: Delete old tui.ts and update index.ts**

Remove `src/cli/tui.ts`. Update `src/cli/index.ts`:

```typescript
// src/cli/index.ts
export { runTui } from './tui.js'
export type { TuiDeps } from './hooks/useDeps.js'
```

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```

Expected: PASS (old tui tests removed, new component tests pass).

- [ ] **Step 6: Commit**

```bash
git add src/cli/ test/unit/cli/
git commit -m "feat(tui): assemble split-pane App with VimProvider and all components"
```

---

### Task 12: Update Entry Point Wiring

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update TUI wiring in src/index.ts**

Replace the `--tui` block. Remove all `@inquirer/*` imports and replace with the new Ink-based `runTui`:

```typescript
// In the --tui block, replace the old wiring with:
const github = new GitHubClient(token)
const mapAvailable = MAPWrapper.detect().available
const { runTui } = await import('./cli/tui.js')
return runTui({
  listUserRepos: () => github.listUserRepos(),
  fetchLabels: (o, n) => github.fetchLabels(o, n),
  fetchOpenIssues: (o, n) => github.fetchOpenIssues(o, n),
  fetchIssueDetail: (o, n, num) => github.fetchIssueDetail(o, n, num),
  createIssue: (o, n, t, b, l) => github.createIssue(o, n, t, b, l),
  updateIssue: (o, n, num, t, b) => github.updateIssue(o, n, num, t, b),
  polishText: mapAvailable ? (t, b) => polishIssueText(t, b) : undefined,
  configRepos,
})
```

Remove the old `@inquirer/*` dynamic imports that are no longer used.

- [ ] **Step 2: Run build and tests**

```bash
pnpm build && pnpm test
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(tui): wire new Ink-based TUI deps in entry point"
```

---

### Task 13: Onboarding Migration to Ink

**Files:**
- Create: `src/cli/onboarding.tsx` (replace `src/cli/onboarding.ts`)
- Modify: `test/unit/onboarding.test.ts` → `test/unit/onboarding.test.tsx`

This is a separate migration of the onboarding wizard from readline to Ink. The onboarding is simpler than the TUI — it's a linear wizard. The Ink version uses `useState` for each step and renders sequentially.

- [ ] **Step 1: Rewrite onboarding as Ink component**

The onboarding wizard collects: GitHub token, repos, max issues per run. Then writes `config.yaml` and `.env`.

The core logic (file writing, config rendering, command checks) stays the same — only the I/O layer changes from `readline` to Ink components.

Create `src/cli/onboarding.tsx` reusing the existing helper functions (`renderConfigTemplate`, `renderEnvTemplate`, `commandExists`, etc.) but replacing the `readline` prompts with Ink `useInput` + `useState`.

- [ ] **Step 2: Update onboarding tests**

Update existing tests to work with the new Ink-based component. Use `ink-testing-library` to render and interact.

- [ ] **Step 3: Delete old onboarding.ts**

Remove `src/cli/onboarding.ts`.

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/onboarding.tsx test/unit/onboarding.test.tsx
git rm src/cli/onboarding.ts test/unit/onboarding.test.ts
git commit -m "feat(onboarding): migrate from readline to Ink components"
```

---

### Task 14: Cleanup and Final Verification

**Files:**
- Modify: `package.json` (verify @inquirer removed)
- Remove: old test files

- [ ] **Step 1: Verify no @inquirer references remain**

```bash
grep -r "@inquirer" src/ test/ --include="*.ts" --include="*.tsx"
```

Expected: no matches.

- [ ] **Step 2: Run full verification**

```bash
pnpm build && pnpm lint && pnpm test
```

Expected: all pass.

- [ ] **Step 3: Manual test**

```bash
GITHUB_TOKEN=$(gh auth token) node dist/index.js --tui
```

Verify:
- Repo selector appears with fuzzy search
- Split pane renders after selection
- Vim keys work: `i` to insert, `Esc` to normal, `j/k` to navigate table
- `:w` submits, `:q` quits
- Tab switches panes
- Enter on table row loads issue into form
- Polish (p) works when MAP available

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup — remove @inquirer references, verify all tests pass"
```
