import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { invokeProcess } from './base-wrapper.js'

const POLISH_TIMEOUT_MS = 60_000

export async function polishIssueText(
  title: string,
  body: string,
): Promise<{ title: string; body: string } | undefined> {
  const workDir = mkdtempSync(join(tmpdir(), 'minion-polish-'))

  try {
    const prompt = [
      'You are an editor improving a GitHub issue draft.',
      'Fix spelling and grammar. Improve clarity and conciseness.',
      'Use proper markdown formatting for the body.',
      'Keep the original meaning — do NOT add information the author did not provide.',
      'Do NOT create any files.',
      '',
      `Input title: ${JSON.stringify(title)}`,
      `Input body: ${JSON.stringify(body)}`,
      '',
      'Output ONLY a single JSON object on the last line:',
      '{"title": "polished title", "body": "polished body"}',
    ].join('\n')

    const { stdout } = await invokeProcess({
      command: 'map',
      args: ['--headless', '--output-dir', workDir, prompt],
      cwd: workDir,
      timeoutMs: POLISH_TIMEOUT_MS,
      model: 'map',
    })

    const lines = stdout.trim().split('\n')
    const jsonLine = lines[lines.length - 1]
    if (!jsonLine) return undefined

    const result = JSON.parse(jsonLine) as { title?: string; body?: string }
    const newTitle = (result.title ?? title).trim()
    const newBody = (result.body ?? body).trim()

    if (newTitle === title.trim() && newBody === body.trim()) return undefined
    return { title: newTitle, body: newBody }
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }) } catch { /* best effort */ }
  }
}
