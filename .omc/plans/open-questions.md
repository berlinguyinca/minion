# Open Questions

## TUI Issue Creator - 2026-04-13

- [ ] **Ctrl+R for repo switching:** `@inquirer/prompts` does not support raw keybinding interception mid-prompt. Should we use a menu option after each submission ("Create another / Switch repo / Exit") or a sentinel value in the title field (e.g., typing `/switch`)? — Affects UX flow speed
- [ ] **Body input: single-line vs multi-line:** The spec says "required" but doesn't clarify if multi-line editing is needed. `@inquirer/input` is single-line; `@inquirer/editor` opens $EDITOR. For speed, single-line seems right, but some issues need multi-line bodies. — Affects library choice for body prompt
- [ ] **Free-form label entry:** Spec mentions "free-form" label creation alongside multi-select. Should we allow creating labels that don't exist on the repo yet (GitHub API supports this), or just allow typing labels that exist? — Affects createIssue payload and UX
- [ ] **Coverage for existing cli/ files:** Adding `src/cli/**/*.ts` to coverage includes `onboarding.ts` and `env.ts`. Need to verify these already have 100% coverage or add missing tests. — Could block the coverage gate
- [ ] **GitHub API rate limiting for search:** The fuzzy repo search hits the GitHub search API on keystrokes. Should we enforce a minimum query length (e.g., 3 chars) and/or debounce interval? — Affects UX responsiveness and API quota
