# TUI Issue Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add close issue, view comments, and add comment capabilities to the TUI.

**Architecture:** Two new GitHubClient methods (`closeIssue`, `listIssueComments`), wire existing `postIssueComment` + new methods into TuiDeps, extend `FormField` to include `'comment'`, add comment display and input to IssueForm, add keybindings (`x`, `c`) and commands (`:close`, `:comment`), make `:w` context-sensitive.

**Tech Stack:** TypeScript, React/Ink 5, Octokit REST, Vitest

---

### Task 1: Add `IssueComment` type and `closeIssue` / `listIssueComments` to GitHubClient

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/github/client.ts`
- Modify: `test/unit/github/client.test.ts`

- [ ] **Step 1: Add `IssueComment` type**

In `src/types/index.ts`, add after the existing `PRComment` interface (line 121):

```typescript
export interface IssueComment {
  author: string
  body: string
  createdAt: string
}
```

- [ ] **Step 2: Write failing tests for `closeIssue` and `listIssueComments`**

In `test/unit/github/client.test.ts`, add `mockListComments` to the mock setup. In the `vi.mock` block at the top, add a new mock alongside the existing ones:

```typescript
const mockListComments = vi.fn()
const mockUpdatePR = vi.fn()
```

Add `listComments: mockListComments` to the `mockOctokit.issues` object, and `update: mockUpdatePR` to the `mockOctokit.pulls` object.

Update the `getMockOctokit` return type to include `listComments: Mock` in the `issues` object.

Then add the test suites:

```typescript
// -----------------------------------------------------------------------
// closeIssue
// -----------------------------------------------------------------------
describe('closeIssue', () => {
  it('calls issues.update with state closed', async () => {
    const mocks = getMockOctokit()
    mocks.issues.update.mockResolvedValueOnce({ data: {} })

    const client = new GitHubClient()
    await client.closeIssue('acme', 'api', 42)

    expect(mocks.issues.update).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'api',
      issue_number: 42,
      state: 'closed',
    })
  })

  it('re-throws 401 errors with GITHUB_TOKEN message', async () => {
    const mocks = getMockOctokit()
    mocks.issues.update.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))
    const client = new GitHubClient()
    await expect(client.closeIssue('acme', 'api', 42)).rejects.toThrow(/GITHUB_TOKEN/i)
  })

  it('re-throws 404 errors with repo not found message', async () => {
    const mocks = getMockOctokit()
    mocks.issues.update.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
    const client = new GitHubClient()
    await expect(client.closeIssue('acme', 'api', 42)).rejects.toThrow(/not found|no access/i)
  })
})

// -----------------------------------------------------------------------
// listIssueComments
// -----------------------------------------------------------------------
describe('listIssueComments', () => {
  it('returns mapped comments', async () => {
    const mocks = getMockOctokit()
    mocks.issues.listComments.mockResolvedValueOnce({
      data: [
        { id: 1, body: 'First comment', user: { login: 'alice' }, created_at: '2026-04-14T10:00:00Z' },
        { id: 2, body: 'Second', user: { login: 'bob' }, created_at: '2026-04-14T11:00:00Z' },
        { id: 3, body: 'No user', user: null, created_at: '2026-04-14T12:00:00Z' },
      ],
    })

    const client = new GitHubClient()
    const comments = await client.listIssueComments('acme', 'api', 10)

    expect(comments).toEqual([
      { author: 'alice', body: 'First comment', createdAt: '2026-04-14T10:00:00Z' },
      { author: 'bob', body: 'Second', createdAt: '2026-04-14T11:00:00Z' },
      { author: '', body: 'No user', createdAt: '2026-04-14T12:00:00Z' },
    ])
    expect(mocks.issues.listComments).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'api',
      issue_number: 10,
    })
  })

  it('re-throws 401 errors with GITHUB_TOKEN message', async () => {
    const mocks = getMockOctokit()
    mocks.issues.listComments.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }))
    const client = new GitHubClient()
    await expect(client.listIssueComments('acme', 'api', 10)).rejects.toThrow(/GITHUB_TOKEN/i)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run test/unit/github/client.test.ts`
Expected: FAIL — `closeIssue` and `listIssueComments` not defined

- [ ] **Step 4: Implement `closeIssue` and `listIssueComments`**

In `src/github/client.ts`, add the import for `IssueComment` at line 2:

```typescript
import type { Issue, ReviewComment, PRComment, PRInfo, IssueComment } from '../types/index.js'
```

Add `closeIssue` method after `updateIssue` (after line 358):

```typescript
async closeIssue(owner: string, name: string, issueNumber: number): Promise<void> {
  try {
    await this.octokit.issues.update({
      owner,
      repo: name,
      issue_number: issueNumber,
      state: 'closed',
    })
  } catch (err) {
    wrapError(err, owner, name)
  }
}
```

Add `listIssueComments` method after `closeIssue`:

```typescript
async listIssueComments(owner: string, name: string, issueNumber: number): Promise<IssueComment[]> {
  try {
    const response = await this.octokit.issues.listComments({
      owner,
      repo: name,
      issue_number: issueNumber,
    })
    return response.data.map((c) => ({
      author: c.user?.login ?? '',
      body: c.body ?? '',
      createdAt: c.created_at,
    }))
  } catch (err) {
    wrapError(err, owner, name)
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run test/unit/github/client.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/github/client.ts test/unit/github/client.test.ts
git commit -m "feat: add closeIssue and listIssueComments to GitHubClient"
```

---

### Task 2: Wire new methods into TuiDeps and index.ts

**Files:**
- Modify: `src/cli/hooks/useDeps.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Extend TuiDeps interface**

In `src/cli/hooks/useDeps.ts`, add after the `updateIssue` line (line 9):

```typescript
closeIssue: (owner: string, name: string, number: number) => Promise<void>
listIssueComments: (owner: string, name: string, number: number) => Promise<Array<{ author: string; body: string; createdAt: string }>>
postIssueComment: (owner: string, name: string, number: number, body: string) => Promise<void>
```

- [ ] **Step 2: Wire deps in index.ts**

In `src/index.ts`, add the three new deps inside the `runTui({...})` call, after the `updateIssue` line (after line 222):

```typescript
closeIssue: (o, n, num) => github.closeIssue(o, n, num),
listIssueComments: (o, n, num) => github.listIssueComments(o, n, num),
postIssueComment: (o, n, num, body) => github.postIssueComment(o, n, num, body),
```

- [ ] **Step 3: Run build to verify types**

Run: `pnpm build`
Expected: PASS (no type errors). Note: existing tests that create mock TuiDeps objects will need updating in later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/cli/hooks/useDeps.ts src/index.ts
git commit -m "feat: wire closeIssue, listIssueComments, postIssueComment into TuiDeps"
```

---

### Task 3: Extend FormField type and fix navigation cycle

**Files:**
- Modify: `src/cli/hooks/useVim.ts`
- Modify: `src/cli/components/VimProvider.tsx`
- Modify: `test/unit/cli/components/VimProvider.test.tsx`

- [ ] **Step 1: Extend FormField type**

In `src/cli/hooks/useVim.ts`, change line 3:

```typescript
export type FormField = 'title' | 'body' | 'comment'
```

- [ ] **Step 2: Write failing test for 3-field navigation**

In `test/unit/cli/components/VimProvider.test.tsx`, add a new `FormField` display component and test:

```tsx
function FormFieldDisplay() {
  const { formField } = useVim()
  return <Text>{formField}</Text>
}
```

Add a new describe block:

```tsx
describe('3-field form navigation', () => {
  it('insert mode Tab cycles title → body → comment → title', () => {
    const onFormFieldChange = vi.fn()
    const { lastFrame, stdin } = render(
      <VimProvider
        initialInputMode="vim"
        formField="title"
        onFormFieldChange={onFormFieldChange}
      >
        <FormFieldDisplay />
      </VimProvider>
    )
    expect(lastFrame()).toBe('title')
    stdin.write('i') // enter insert mode
    stdin.write('\t') // Tab
    expect(onFormFieldChange).toHaveBeenCalledWith('body')
  })

  it('insert mode Tab from body goes to comment', () => {
    const onFormFieldChange = vi.fn()
    const { stdin } = render(
      <VimProvider
        initialInputMode="vim"
        formField="body"
        onFormFieldChange={onFormFieldChange}
      >
        <FormFieldDisplay />
      </VimProvider>
    )
    stdin.write('i')
    stdin.write('\t')
    expect(onFormFieldChange).toHaveBeenCalledWith('comment')
  })

  it('insert mode Tab from comment wraps to title', () => {
    const onFormFieldChange = vi.fn()
    const { stdin } = render(
      <VimProvider
        initialInputMode="vim"
        formField="comment"
        onFormFieldChange={onFormFieldChange}
      >
        <FormFieldDisplay />
      </VimProvider>
    )
    stdin.write('i')
    stdin.write('\t')
    expect(onFormFieldChange).toHaveBeenCalledWith('title')
  })

  it('insert mode Shift+Tab cycles backwards', () => {
    const onFormFieldChange = vi.fn()
    const { stdin } = render(
      <VimProvider
        initialInputMode="vim"
        formField="title"
        onFormFieldChange={onFormFieldChange}
      >
        <FormFieldDisplay />
      </VimProvider>
    )
    stdin.write('i')
    stdin.write('\x1B[Z') // Shift+Tab
    expect(onFormFieldChange).toHaveBeenCalledWith('comment')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run test/unit/cli/components/VimProvider.test.tsx`
Expected: FAIL — Tab cycle logic is 2-field, not 3-field

- [ ] **Step 4: Update VimProvider Tab/Shift+Tab cycle**

In `src/cli/components/VimProvider.tsx`, replace the insert-mode Tab/Shift+Tab handlers (inside the `currentMode === 'insert'` block):

```typescript
} else if (shiftTab) {
  setFormFieldSync((f) => {
    if (f === 'title') return 'comment'
    if (f === 'body') return 'title'
    return 'body'
  })
} else if (tab) {
  setFormFieldSync((f) => {
    if (f === 'title') return 'body'
    if (f === 'body') return 'comment'
    return 'title'
  })
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run test/unit/cli/components/VimProvider.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/hooks/useVim.ts src/cli/components/VimProvider.tsx test/unit/cli/components/VimProvider.test.tsx
git commit -m "feat: extend FormField to 3-field cycle (title/body/comment)"
```

---

### Task 4: Add `x` and `c` keybindings to VimProvider

**Files:**
- Modify: `src/cli/components/VimProvider.tsx`
- Modify: `test/unit/cli/components/VimProvider.test.tsx`

- [ ] **Step 1: Write failing tests**

In `test/unit/cli/components/VimProvider.test.tsx`, add:

```tsx
describe('issue management keybindings', () => {
  it('vim mode: x fires close-issue action', () => {
    const onAction = vi.fn()
    const { stdin } = render(
      <VimProvider onAction={onAction} initialInputMode="vim"><ModeDisplay /></VimProvider>
    )
    stdin.write('x')
    expect(onAction).toHaveBeenCalledWith('close-issue')
  })

  it('vim mode: c fires focus-comment and enters insert mode', () => {
    const onAction = vi.fn()
    const { lastFrame, stdin } = render(
      <VimProvider onAction={onAction} initialInputMode="vim"><ModeDisplay /></VimProvider>
    )
    stdin.write('c')
    expect(onAction).toHaveBeenCalledWith('focus-comment')
    expect(lastFrame()).toBe('insert')
  })

  it('basic mode: x fires close-issue action', () => {
    const onAction = vi.fn()
    const { stdin } = render(
      <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
    )
    stdin.write('x')
    // In basic mode, any printable char enters insert mode — x should NOT enter insert here
    // x is a special key that fires close-issue before entering insert
    expect(onAction).toHaveBeenCalledWith('close-issue')
  })

  it('basic mode: c fires focus-comment and enters insert mode', () => {
    const onAction = vi.fn()
    const { lastFrame, stdin } = render(
      <VimProvider onAction={onAction}><ModeDisplay /></VimProvider>
    )
    stdin.write('c')
    expect(onAction).toHaveBeenCalledWith('focus-comment')
    expect(lastFrame()).toBe('insert')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/unit/cli/components/VimProvider.test.tsx`
Expected: FAIL

- [ ] **Step 3: Add keybindings to VimProvider**

In `src/cli/components/VimProvider.tsx`, in the **basic mode** normal handler, add before the `if (input === ':')` block:

```typescript
if (input === 'x') {
  onActionRef.current?.('close-issue')
  return
}
if (input === 'c') {
  onActionRef.current?.('focus-comment')
  setModeSync('insert')
  return
}
```

In the **vim mode** normal handler, add after the `if (input === 'r')` block:

```typescript
if (input === 'x') {
  onActionRef.current?.('close-issue')
  return
}

if (input === 'c') {
  onActionRef.current?.('focus-comment')
  setModeSync('insert')
  return
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/unit/cli/components/VimProvider.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/components/VimProvider.tsx test/unit/cli/components/VimProvider.test.tsx
git commit -m "feat: add x (close) and c (comment) keybindings"
```

---

### Task 5: Add comment display and comment field to IssueForm

**Files:**
- Modify: `src/cli/components/IssueForm.tsx`
- Modify: `test/unit/cli/components/IssueForm.test.tsx`

- [ ] **Step 1: Write failing tests**

In `test/unit/cli/components/IssueForm.test.tsx`, add the import for `IssueComment`:

```typescript
import type { IssueComment } from '../../../../src/types/index.js'
```

Update the `IssueFormProps` in test calls to include the new props. Add tests:

```tsx
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

  it('hides comments section when creating new issue', () => {
    const { lastFrame } = render(wrap(
      <IssueForm title="" body="" labels={[]}
        onTitleChange={() => {}} onBodyChange={() => {}}
        active={true} editingIssue={undefined} formField="title"
        comments={[]} commentText="" onCommentChange={() => {}} />
    ))
    expect(lastFrame()).not.toContain('Comments')
    expect(lastFrame()).not.toContain('New Comment')
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
    const commentLine = lines.find((l) => l.includes('Comment'))
    expect(commentLine).toContain('▶')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/unit/cli/components/IssueForm.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement comment display and field**

In `src/cli/components/IssueForm.tsx`, update the import and props:

```typescript
import type { FormField } from '../hooks/useVim.js'
import type { IssueComment } from '../../types/index.js'
```

Update the interface:

```typescript
interface IssueFormProps {
  title: string
  body: string
  labels: string[]
  onTitleChange: (v: string) => void
  onBodyChange: (v: string) => void
  active: boolean
  editingIssue: number | undefined
  formField: FormField
  comments: IssueComment[]
  commentText: string
  onCommentChange: (v: string) => void
}
```

Update the function signature and add the comments section after the body field, before the labels section:

```tsx
export function IssueForm({
  title, body, labels, onTitleChange, onBodyChange, active, editingIssue, formField,
  comments, commentText, onCommentChange,
}: IssueFormProps): React.JSX.Element {
```

Add after the Body `</Box>` (closing the marginTop={1} box), before the labels block:

```tsx
{editingIssue !== undefined && (
  <Box flexDirection="column" marginTop={1}>
    <Text color={colors.dim}>{'── Comments (' + comments.length + ') ──'}</Text>
    {comments.map((c, i) => (
      <Box key={i}>
        <Text color={colors.goggle}>@{c.author}</Text>
        <Text color={colors.dim}>{': '}</Text>
        <Text>{c.body}</Text>
      </Box>
    ))}
    <Box marginTop={1}>
      <Box width={2}>
        {active && formField === 'comment'
          ? <Text color={colors.overalls}>{'▶'}</Text>
          : <Text>{' '}</Text>}
      </Box>
      <Box flexGrow={1}>
        <TextField
          label="Comment" value={commentText} onChange={onCommentChange}
          active={active && formField === 'comment'}
        />
      </Box>
    </Box>
  </Box>
)}
```

- [ ] **Step 4: Fix existing IssueForm tests**

Existing tests don't pass the new required props. Update all existing `<IssueForm .../>` calls in the test file to include:

```
comments={[]} commentText="" onCommentChange={() => {}}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run test/unit/cli/components/IssueForm.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/components/IssueForm.tsx test/unit/cli/components/IssueForm.test.tsx
git commit -m "feat: add comment display and comment field to IssueForm"
```

---

### Task 6: Update StatusBar for comment field label

**Files:**
- Modify: `src/cli/components/StatusBar.tsx`
- Modify: `test/unit/cli/components/StatusBar.test.tsx`

- [ ] **Step 1: Write failing test**

In `test/unit/cli/components/StatusBar.test.tsx`, add:

```tsx
it('shows [Comment] label when comment field is focused', () => {
  const { lastFrame } = render(
    <VimProvider formField="comment"><StatusBar repo="org/api" message="" /></VimProvider>
  )
  expect(lastFrame()).toContain('[Comment]')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/unit/cli/components/StatusBar.test.tsx`
Expected: FAIL — `[Comment]` not shown

- [ ] **Step 3: Update `getHints` fieldLabel logic**

In `src/cli/components/StatusBar.tsx`, change the `fieldLabel` line:

```typescript
const fieldLabel = formField === 'title' ? 'Title' : formField === 'body' ? 'Body' : 'Comment'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/unit/cli/components/StatusBar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/components/StatusBar.tsx test/unit/cli/components/StatusBar.test.tsx
git commit -m "feat: show [Comment] label in StatusBar for comment field"
```

---

### Task 7: Wire commands and actions in tui.tsx

**Files:**
- Modify: `src/cli/tui.tsx`

- [ ] **Step 1: Add comment state**

In the App component, after the `formField` state (line 46), add:

```typescript
const [comments, setComments] = useState<Array<{ author: string; body: string; createdAt: string }>>([])
const [commentText, setCommentText] = useState('')
```

Add refs for them (after existing refs):

```typescript
const commentsRef = useRef(comments)
const commentTextRef = useRef(commentText)
commentsRef.current = comments
commentTextRef.current = commentText
```

- [ ] **Step 2: Fetch comments when loading an issue**

In the `handleAction` callback, inside `action === 'enter'` for the table pane, after `setEditingIssue(detail.number)`, add:

```typescript
// Fetch comments
try {
  const fetchedComments = await deps.listIssueComments(repo.owner, repo.name, detail.number)
  setComments(fetchedComments)
} catch {
  setComments([])
}
```

- [ ] **Step 3: Clear comments on form clear**

In the `clearForm` callback, add:

```typescript
setComments([])
setCommentText('')
```

- [ ] **Step 4: Add `close-issue` action handler**

In `handleAction`, add a new `else if` block:

```typescript
} else if (action === 'close-issue') {
  const editing = editingIssueRef.current
  const repo = selectedRepoRef.current
  if (editing === undefined || !repo) {
    showMessage(messages.error('No issue loaded'), 'error')
    return
  }
  void (async () => {
    try {
      await deps.closeIssue(repo.owner, repo.name, editing)
      showMessage(`Issue #${editing} closed`, 'success')
      clearForm()
      // Refresh open issues
      try {
        const issues = await deps.fetchOpenIssues(repo.owner, repo.name)
        setOpenIssues(issues)
      } catch {
        // Non-fatal
      }
    } catch (err) {
      showMessage(messages.error(err instanceof Error ? err.message : String(err)), 'error')
    }
  })()
```

- [ ] **Step 5: Add `focus-comment` action handler**

In `handleAction`, add:

```typescript
} else if (action === 'focus-comment') {
  const editing = editingIssueRef.current
  if (editing === undefined) {
    showMessage(messages.error('No issue loaded'), 'error')
    return
  }
  setFormField('comment')
  setPane('form')
```

- [ ] **Step 6: Make `:w` context-sensitive**

In `handleCommand`, update the `:w` handler. Wrap the existing `:w` logic in a `formField` check. Before the existing `:w` body, add a check:

```typescript
if (cmd === 'w') {
  const currentFormField = formFieldRef.current
  if (currentFormField === 'comment') {
    // Submit comment
    void (async () => {
      try {
        const editing = editingIssueRef.current
        const currentComment = commentTextRef.current.trim()
        if (!currentComment) {
          showMessage(messages.error('Comment is empty'), 'error')
          return
        }
        if (editing === undefined || !repo) return
        await deps.postIssueComment(repo.owner, repo.name, editing, currentComment)
        setCommentText('')
        showMessage('Comment added', 'success')
        // Refresh comments
        try {
          const refreshed = await deps.listIssueComments(repo.owner, repo.name, editing)
          setComments(refreshed)
        } catch {
          // Non-fatal
        }
      } catch (err) {
        showMessage(messages.error(err instanceof Error ? err.message : String(err)), 'error')
      }
    })()
    return
  }
  // ... existing :w logic for title/body follows unchanged
```

- [ ] **Step 7: Add `:close` and `:comment` commands**

In `handleCommand`, add after the `:repo` handler:

```typescript
} else if (cmd === 'close') {
  const editing = editingIssueRef.current
  if (editing === undefined) {
    showMessage(messages.error('No issue loaded'), 'error')
    return
  }
  void (async () => {
    try {
      await deps.closeIssue(repo.owner, repo.name, editing)
      showMessage(`Issue #${editing} closed`, 'success')
      clearForm()
      try {
        const issues = await deps.fetchOpenIssues(repo.owner, repo.name)
        setOpenIssues(issues)
      } catch {
        // Non-fatal
      }
    } catch (err) {
      showMessage(messages.error(err instanceof Error ? err.message : String(err)), 'error')
    }
  })()
} else if (cmd === 'comment') {
  const editing = editingIssueRef.current
  if (editing === undefined) {
    showMessage(messages.error('No issue loaded'), 'error')
    return
  }
  setFormField('comment')
  setPane('form')
```

- [ ] **Step 8: Update IssueForm props in JSX**

In the `<IssueForm>` JSX, add the new props:

```tsx
<IssueForm
  title={title}
  body={body}
  labels={selectedLabels}
  onTitleChange={setTitle}
  onBodyChange={setBody}
  active={pane === 'form'}
  editingIssue={editingIssue}
  formField={formField}
  comments={comments}
  commentText={commentText}
  onCommentChange={setCommentText}
/>
```

- [ ] **Step 9: Limit formField cycle to 2 fields in create mode**

In `handleAction`, update the `move-down` and `move-up` handlers for the form pane to be conditional:

```typescript
if (action === 'move-down') {
  if (currentPane === 'table') {
    setTableCursor((c) => {
      const items = currentTab === 'open' ? openIssuesRef.current : recentIssuesRef.current
      return items.length === 0 ? 0 : Math.min(c + 1, items.length - 1)
    })
  } else {
    const hasComment = editingIssueRef.current !== undefined
    setFormField((f) => {
      if (f === 'title') return 'body'
      if (f === 'body') return hasComment ? 'comment' : 'title'
      return 'title' // comment → title
    })
  }
} else if (action === 'move-up') {
  if (currentPane === 'table') {
    setTableCursor((c) => Math.max(0, c - 1))
  } else {
    const hasComment = editingIssueRef.current !== undefined
    setFormField((f) => {
      if (f === 'title') return hasComment ? 'comment' : 'body'
      if (f === 'body') return 'title'
      return 'body' // comment → body
    })
  }
}
```

- [ ] **Step 10: Run build to verify types**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/cli/tui.tsx
git commit -m "feat: wire close/comment commands and actions in TUI"
```

---

### Task 8: Update HelpOverlay

**Files:**
- Modify: `src/cli/components/HelpOverlay.tsx`
- Modify: `test/unit/cli/components/HelpOverlay.test.tsx`

- [ ] **Step 1: Add new keybindings to help overlay**

In `src/cli/components/HelpOverlay.tsx`, in the Actions column, add after `{'dd   clear'}`:

```tsx
<Text>{'x    close issue'}</Text>
<Text>{'c    comment'}</Text>
```

In the Commands column, add after `{':repo switch repo'}`:

```tsx
<Text>{':close  close issue'}</Text>
<Text>{':comment  comment'}</Text>
```

- [ ] **Step 2: Write test**

In `test/unit/cli/components/HelpOverlay.test.tsx`, add:

```tsx
it('shows close and comment keybindings', () => {
  const { lastFrame } = render(wrap(<HelpOverlay />))
  expect(lastFrame()).toContain('close issue')
  expect(lastFrame()).toContain('comment')
  expect(lastFrame()).toContain(':close')
  expect(lastFrame()).toContain(':comment')
})
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run test/unit/cli/components/HelpOverlay.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/cli/components/HelpOverlay.tsx test/unit/cli/components/HelpOverlay.test.tsx
git commit -m "feat: add close/comment to HelpOverlay"
```

---

### Task 9: Fix mock TuiDeps in existing tests and add tui integration tests

**Files:**
- Modify: `test/unit/cli/tui.test.tsx`

- [ ] **Step 1: Update mock TuiDeps**

In `test/unit/cli/tui.test.tsx`, add the three new methods to the mock deps object:

```typescript
closeIssue: vi.fn().mockResolvedValue(undefined),
listIssueComments: vi.fn().mockResolvedValue([]),
postIssueComment: vi.fn().mockResolvedValue(undefined),
```

- [ ] **Step 2: Run all tests to verify nothing is broken**

Run: `pnpm test:unit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add test/unit/cli/tui.test.tsx
git commit -m "test: update mock TuiDeps with new issue management methods"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test:unit`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: No type errors

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: No lint errors

- [ ] **Step 4: Commit any remaining fixes and push**

```bash
git push
```
