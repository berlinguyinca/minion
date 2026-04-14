import { describe, it, expect, vi, beforeEach } from 'vitest'
// node:fs is mocked below to spy on rmSync

vi.mock('../../../src/ai/base-wrapper.js', () => ({
  invokeProcess: vi.fn(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, rmSync: vi.fn(actual.rmSync) }
})

import { rmSync } from 'node:fs'
import { polishIssueText } from '../../../src/ai/polish.js'
import { invokeProcess } from '../../../src/ai/base-wrapper.js'
import type { InvokeProcessOptions } from '../../../src/ai/base-wrapper.js'

const mockInvoke = vi.mocked(invokeProcess)
const mockRmSync = vi.mocked(rmSync)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('polishIssueText', () => {
  it('returns polished title and body from MAP JSON output', async () => {
    mockInvoke.mockResolvedValueOnce({
      stdout: 'thinking...\n{"title":"Fixed title","body":"Improved body"}\n',
      stderr: '',
    })

    const result = await polishIssueText('fixd title', 'bad body')

    expect(result).toEqual({ title: 'Fixed title', body: 'Improved body' })
    expect(mockInvoke).toHaveBeenCalledOnce()
    const opts = mockInvoke.mock.calls[0]?.[0] as InvokeProcessOptions
    expect(opts.command).toBe('map')
    expect(opts.args).toContain('--headless')
    expect(opts.timeoutMs).toBe(60_000)
  })

  it('returns undefined when polished text matches input', async () => {
    mockInvoke.mockResolvedValueOnce({
      stdout: '{"title":"same title","body":"same body"}\n',
      stderr: '',
    })

    const result = await polishIssueText('same title', 'same body')
    expect(result).toBeUndefined()
  })

  it('returns undefined when polished text matches trimmed input', async () => {
    mockInvoke.mockResolvedValueOnce({
      stdout: '{"title":"hello","body":"world"}\n',
      stderr: '',
    })

    const result = await polishIssueText('  hello  ', '  world  ')
    expect(result).toBeUndefined()
  })

  it('uses input title when JSON title is missing', async () => {
    mockInvoke.mockResolvedValueOnce({
      stdout: '{"body":"new body"}\n',
      stderr: '',
    })

    const result = await polishIssueText('keep this title', 'old body')
    expect(result).toEqual({ title: 'keep this title', body: 'new body' })
  })

  it('uses input body when JSON body is missing', async () => {
    mockInvoke.mockResolvedValueOnce({
      stdout: '{"title":"new title"}\n',
      stderr: '',
    })

    const result = await polishIssueText('old title', 'keep this body')
    expect(result).toEqual({ title: 'new title', body: 'keep this body' })
  })

  it('returns undefined when MAP produces empty stdout', async () => {
    mockInvoke.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
    })

    const result = await polishIssueText('title', 'body')
    expect(result).toBeUndefined()
  })

  it('throws when MAP produces invalid JSON', async () => {
    mockInvoke.mockResolvedValueOnce({
      stdout: 'not json at all\n',
      stderr: '',
    })

    await expect(polishIssueText('title', 'body')).rejects.toThrow()
  })

  it('propagates invokeProcess errors', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('MAP binary not found'))

    await expect(polishIssueText('title', 'body')).rejects.toThrow('MAP binary not found')
  })

  it('survives rmSync failure during cleanup', async () => {
    mockInvoke.mockResolvedValueOnce({
      stdout: '{"title":"polished","body":"text"}\n',
      stderr: '',
    })
    mockRmSync.mockImplementationOnce(() => { throw new Error('EPERM') })

    const result = await polishIssueText('title', 'body')
    expect(result).toEqual({ title: 'polished', body: 'text' })
  })

  it('includes title and body in the prompt', async () => {
    mockInvoke.mockResolvedValueOnce({
      stdout: '{"title":"t","body":"b"}\n',
      stderr: '',
    })

    await polishIssueText('my title', 'my body')

    const opts = mockInvoke.mock.calls[0]?.[0] as InvokeProcessOptions
    const prompt = opts.args[opts.args.length - 1] as string
    expect(prompt).toContain('my title')
    expect(prompt).toContain('my body')
  })
})
