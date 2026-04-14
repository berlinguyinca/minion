export interface TuiDeps {
  // Data layer
  listUserRepos: () => Promise<Array<{ owner: string; name: string; description: string }>>
  fetchLabels: (owner: string, name: string) => Promise<string[]>
  createIssue: (
    owner: string,
    name: string,
    title: string,
    body: string,
    labels: string[],
  ) => Promise<{ number: number; url: string }>
  // Prompt layer
  promptSearch: <T>(config: {
    message: string
    source: (
      term: string | undefined,
    ) => Promise<Array<{ name: string; value: T }>>
  }) => Promise<T>
  promptInput: (config: {
    message: string
    validate?: (v: string) => boolean | string
  }) => Promise<string>
  promptCheckbox: <T>(config: {
    message: string
    choices: Array<{ name: string; value: T }>
  }) => Promise<T[]>
  // Config
  configRepos: Array<{ owner: string; name: string }>
  output: Pick<Console, 'log' | 'error'>
}

interface RepoChoice {
  owner: string
  name: string
}

type PostSubmitAction = 'new-issue' | 'switch-repo' | 'quit'

function nonEmpty(v: string): boolean | string {
  return v.trim().length > 0 || 'This field is required'
}

async function selectRepo(deps: TuiDeps, cachedApiRepos: RepoChoice[]): Promise<RepoChoice> {
  const configChoices = deps.configRepos.map((r) => ({
    name: `${r.owner}/${r.name}`,
    value: { owner: r.owner, name: r.name } satisfies RepoChoice,
  }))

  return deps.promptSearch<RepoChoice>({
    message: 'Select a repository',
    source: async (term) => {
      const allChoices = [
        ...configChoices,
        ...cachedApiRepos
          .filter((r) => !deps.configRepos.some((c) => c.owner === r.owner && c.name === r.name))
          .map((r) => ({
            name: `${r.owner}/${r.name}`,
            value: { owner: r.owner, name: r.name } satisfies RepoChoice,
          })),
      ]

      if (!term) return allChoices

      const lower = term.toLowerCase()
      return allChoices.filter((c) => c.name.toLowerCase().includes(lower))
    },
  })
}

async function submitIssue(
  deps: TuiDeps,
  owner: string,
  name: string,
  title: string,
  body: string,
  labels: string[],
): Promise<{ success: true; number: number; url: string } | { success: false; error: string }> {
  try {
    const result = await deps.createIssue(owner, name, title, body, labels)
    return { success: true, number: result.number, url: result.url }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function issueLoop(deps: TuiDeps, owner: string, name: string): Promise<PostSubmitAction> {
  // Fetch labels once for this repo
  let labels: string[] = []
  try {
    labels = await deps.fetchLabels(owner, name)
  } catch {
    deps.output.error(`Warning: Could not fetch labels for ${owner}/${name}. Continuing without labels.`)
  }

  while (true) {
    const title = await deps.promptInput({
      message: 'Issue title',
      validate: nonEmpty,
    })

    const body = await deps.promptInput({
      message: 'Issue body',
      validate: nonEmpty,
    })

    // Labels: multi-select from existing, skip with empty selection
    let selectedLabels: string[] = []
    if (labels.length > 0) {
      selectedLabels = await deps.promptCheckbox<string>({
        message: 'Labels (Enter to skip)',
        choices: labels.map((l) => ({ name: l, value: l })),
      })
    }

    // Submit (awaited, not fire-and-forget)
    const result = await submitIssue(deps, owner, name, title, body, selectedLabels)

    if (result.success) {
      deps.output.log(`\u2713 Issue #${String(result.number)} created in ${owner}/${name} (${result.url})`)
    } else {
      deps.output.error(`\u2717 Failed to create issue: ${result.error}`)
    }

    // Post-submit menu
    const action = await deps.promptSearch<PostSubmitAction>({
      message: 'What next?',
      source: async () => [
        { name: 'New issue (same repo)', value: 'new-issue' as const },
        { name: 'Switch repository', value: 'switch-repo' as const },
        { name: 'Quit', value: 'quit' as const },
      ],
    })

    if (action !== 'new-issue') {
      return action
    }
  }
}

export async function runTui(deps: TuiDeps): Promise<number> {
  try {
    // Fetch user repos once for the session
    let apiRepos: RepoChoice[] = []
    try {
      const repos = await deps.listUserRepos()
      apiRepos = repos.map((r) => ({ owner: r.owner, name: r.name }))
    } catch {
      deps.output.error('Warning: Could not fetch repos from GitHub API. Using config repos only.')
    }

    while (true) {
      const repo = await selectRepo(deps, apiRepos)
      const action = await issueLoop(deps, repo.owner, repo.name)

      if (action === 'quit') {
        return 0
      }
      // action === 'switch-repo' → loop back to selectRepo
    }
  } catch (err) {
    // ExitPromptError from @inquirer/core on Ctrl+C
    if (err instanceof Error && err.name === 'ExitPromptError') {
      return 0
    }
    throw err
  }
}
