import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { invokeProcess } from './base-wrapper.js'
import type { ProviderConfig } from '../types/index.js'

const POLISH_TIMEOUT_MS = 60_000

export interface PolishIssueTextOptions {
  target?: 'description' | 'comment'
  repo?: string
  issueNumber?: number
  issueUrl?: string
  labels?: string[]
  comment?: string
  comments?: string[]
}

export interface PolishedIssueText {
  title: string
  body: string
  comment?: string
}

export async function polishIssueText(
  title: string,
  body: string,
  options: PolishIssueTextOptions = {},
  config?: Pick<ProviderConfig, 'command' | 'args' | 'timeoutMs'>,
): Promise<PolishedIssueText | undefined> {
  const workDir = mkdtempSync(join(tmpdir(), 'minion-polish-'))

  try {
    const target = options.target ?? 'description'
    const currentComment = options.comment ?? ''
    const prompt = [
      'You are an editor improving GitHub issue text with MAP.',
      'Use the available repository and issue context to explain what the user wants to do to the best of your knowledge.',
      'Fix spelling and grammar. Improve clarity, actionability, and markdown formatting.',
      'Preserve the original intent. You may make cautious inferences from the provided context, but do NOT invent unsupported facts.',
      'Do NOT create any files.',
      `Target field: ${target}`,
      ...(options.repo !== undefined ? [`Repository: ${options.repo}`] : []),
      ...(options.issueNumber !== undefined ? [`Issue number: ${options.issueNumber}`] : []),
      ...(options.issueUrl !== undefined ? [`Issue URL: ${options.issueUrl}`] : []),
      ...(options.labels !== undefined && options.labels.length > 0 ? [`Labels: ${options.labels.join(', ')}`] : []),
      '',
      `Input title: ${JSON.stringify(title)}`,
      `Input body: ${JSON.stringify(body)}`,
      ...(currentComment.length > 0 ? [`Pending comment draft: ${JSON.stringify(currentComment)}`] : []),
      ...(options.comments !== undefined && options.comments.length > 0
        ? ['', 'Visible comments/context:', ...options.comments.map((comment) => `- ${comment}`)]
        : []),
      '',
      'Output ONLY a single JSON object on the last line:',
      target === 'comment'
        ? '{"title": "unchanged or polished title", "body": "unchanged or polished body", "comment": "optimized comment"}'
        : '{"title": "polished title", "body": "optimized issue description"}',
    ].join('\n')

    const command = config?.command ?? 'map'
    const args = [...(config?.args ?? []), '--headless', '--output-dir', workDir, prompt]
    const { stdout } = await invokeProcess({
      command,
      args,
      cwd: workDir,
      timeoutMs: config?.timeoutMs ?? POLISH_TIMEOUT_MS,
      model: 'map',
    })

    const lines = stdout.trim().split('\n')
    const jsonLine = lines[lines.length - 1]
    if (!jsonLine) return undefined

    const result = JSON.parse(jsonLine) as { title?: string; body?: string; comment?: string }
    const newTitle = (result.title ?? title).trim()
    const newBody = (result.body ?? body).trim()
    const newComment = result.comment?.trim()

    if (target === 'comment') {
      const comment = newComment ?? currentComment.trim()
      if (newTitle === title.trim() && newBody === body.trim() && comment === currentComment.trim()) return undefined
      return { title: newTitle, body: newBody, comment }
    }

    if (newTitle === title.trim() && newBody === body.trim()) return undefined
    return { title: newTitle, body: newBody }
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }) } catch { /* best effort */ }
  }
}
