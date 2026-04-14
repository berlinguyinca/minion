export const colors = {
  banana: '#FFD700',
  goggle: '#87CEEB',
  overalls: '#4169E1',
  success: '#32CD32',
  error: '#FF4444',
  dim: '#666666',
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
