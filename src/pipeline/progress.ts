type ProgressKind = 'merge' | 'review' | 'issue'

interface OutputLike {
  write(chunk: string): void
  isTTY?: boolean
}

interface ActiveItem {
  kind: ProgressKind
  repoLabel: string
  repoIndex: number
  repoTotal: number
  itemLabel: string
  itemIndex: number
  itemTotal: number
  startedAt: number
  scopeKey: string
}

export interface ProgressReporter {
  beginPhase(message: string): void
  beginRepo(kind: ProgressKind, repoIndex: number, repoTotal: number, repoLabel: string, itemTotal: number): void
  beginItem(
    kind: ProgressKind,
    repoLabel: string,
    repoIndex: number,
    repoTotal: number,
    itemLabel: string,
    itemIndex: number,
    itemTotal: number,
  ): void
  update(message: string): void
  complete(message: string): void
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, '0')}m`
  }
  if (minutes > 0) {
    return `${minutes}m${String(seconds).padStart(2, '0')}s`
  }
  return `${seconds}s`
}

export class ConsoleProgressReporter implements ProgressReporter {
  private readonly completedDurations = new Map<string, number[]>()
  private active: ActiveItem | undefined

  constructor(
    private readonly output: OutputLike = process.stdout,
    private readonly now: () => number = () => Date.now(),
  ) {}

  beginPhase(message: string): void {
    this.writeLine(`[pipeline] ${message}`)
  }

  beginRepo(kind: ProgressKind, repoIndex: number, repoTotal: number, repoLabel: string, itemTotal: number): void {
    this.writeLine(`[${kind}] Repo ${repoIndex}/${repoTotal}: ${repoLabel} (${itemTotal} item${itemTotal === 1 ? '' : 's'})`)
  }

  beginItem(
    kind: ProgressKind,
    repoLabel: string,
    repoIndex: number,
    repoTotal: number,
    itemLabel: string,
    itemIndex: number,
    itemTotal: number,
  ): void {
    this.active = {
      kind,
      repoLabel,
      repoIndex,
      repoTotal,
      itemLabel,
      itemIndex,
      itemTotal,
      startedAt: this.now(),
      scopeKey: `${kind}:${repoLabel}`,
    }
    this.render('starting')
  }

  update(message: string): void {
    if (!this.active) return
    this.render(message)
  }

  complete(message: string): void {
    if (!this.active) return
    const elapsedMs = this.now() - this.active.startedAt
    const durations = this.completedDurations.get(this.active.scopeKey) ?? []
    durations.push(elapsedMs)
    this.completedDurations.set(this.active.scopeKey, durations)
    this.render(message, true)
    this.active = undefined
  }

  private render(message: string, final = false): void {
    if (!this.active) return

    const elapsedMs = this.now() - this.active.startedAt
    const elapsed = formatDuration(elapsedMs)
    const eta = this.estimateEta(elapsedMs)
    const counters = `${this.active.repoIndex}/${this.active.repoTotal} ${this.active.itemIndex}/${this.active.itemTotal}`
    const etaSuffix = eta !== undefined ? `, eta ${eta}` : ''
    const line = `[${this.active.kind}] ${counters} ${this.active.repoLabel} ${this.active.itemLabel}: ${message} (elapsed ${elapsed}${etaSuffix})`

    if (this.output.isTTY === true) {
      this.output.write(`\r\x1b[2K${line}${final ? '\n' : ''}`)
      return
    }

    this.output.write(`${line}\n`)
  }

  private estimateEta(elapsedMs: number): string | undefined {
    if (!this.active) return undefined
    const durations = this.completedDurations.get(this.active.scopeKey)
    if (durations === undefined || durations.length === 0) return undefined

    const remainingItems = this.active.itemTotal - this.active.itemIndex
    if (remainingItems <= 0) return undefined

    const averageMs = durations.reduce((sum, value) => sum + value, 0) / durations.length
    const etaMs = averageMs * remainingItems
    if (!Number.isFinite(etaMs) || etaMs <= 0) return undefined

    const currentElapsed = Math.max(0, elapsedMs)
    if (currentElapsed > 0 && etaMs < currentElapsed) {
      return formatDuration(currentElapsed)
    }

    return formatDuration(etaMs)
  }

  private writeLine(message: string): void {
    if (this.output.isTTY === true) {
      this.output.write(`\r\x1b[2K${message}\n`)
      return
    }
    this.output.write(`${message}\n`)
  }
}

export class NoopProgressReporter implements ProgressReporter {
  beginPhase(): void {}
  beginRepo(): void {}
  beginItem(): void {}
  update(): void {}
  complete(): void {}
}
