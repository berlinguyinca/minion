import { existsSync, readFileSync } from 'node:fs'

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith('\'') && value.endsWith('\''))
  ) {
    return value.slice(1, -1)
  }

  return value
}

export function loadDotEnv(envPath = '.env'): void {
  if (!existsSync(envPath)) return

  let raw: string
  try {
    raw = readFileSync(envPath, 'utf-8')
  } catch {
    return
  }

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator <= 0) continue

    const key = trimmed.slice(0, separator).trim()
    const value = stripWrappingQuotes(trimmed.slice(separator + 1).trim())

    if (!key || process.env[key] !== undefined) continue
    process.env[key] = value
  }
}
