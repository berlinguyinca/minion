export const colors = {
  // Existing
  banana: '#FFD700',
  goggle: '#87CEEB',
  overalls: '#4169E1',
  success: '#32CD32',
  error: '#FF4444',
  dim: '#666666',
  // New
  issueNumber: '#5B9BD5',    // bright blue for issue numbers
  pushDate: '#888888',        // gray for timestamps
  pageIndicator: '#888888',   // gray for page info
  statusBg: '#1a1a2e',       // dark background for status bar
  sectionHeader: '#4169E1',   // blue for help section headers
  cursor: '#FFD700',          // yellow for cursor indicator
  activeBorder: '#4169E1',    // blue border for active pane
  inactiveBorder: '#444444',  // dark gray for inactive
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
