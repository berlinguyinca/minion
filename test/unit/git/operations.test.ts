import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { tmpdir } from 'node:os'

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => {
  const spawnMock = vi.fn()
  return { spawn: spawnMock }
})

// Mock fs functions used in createTempDir / cleanupTempDir
vi.mock('node:fs', () => {
  return {
    mkdtempSync: vi.fn((prefix: string) => `${prefix}abc123`),
    rmSync: vi.fn(),
    existsSync: vi.fn(() => true),
  }
})

import { GitOperations, buildBranchName, createTempDir, cleanupTempDir } from '../../../src/git/operations.js'
import * as cp from 'node:child_process'
import * as fs from 'node:fs'

// Helper to build a fake EventEmitter-like spawn child
function makeFakeChild(opts: {
  stdout?: string
  stderr?: string
  exitCode?: number
}) {
  const { stdout = '', stderr = '', exitCode = 0 } = opts

  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}

  const child = {
    stdout: {
      on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
        if (event === 'data') {
          // Emit data asynchronously
          setImmediate(() => cb(Buffer.from(stdout)))
        }
      }),
    },
    stderr: {
      on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
        if (event === 'data') {
          setImmediate(() => cb(Buffer.from(stderr)))
        }
      }),
    },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = []
      const handlers = listeners[event]
      if (handlers) handlers.push(cb)
      if (event === 'close') {
        setImmediate(() => cb(exitCode))
      }
    }),
  }

  return child
}

describe('buildBranchName', () => {
  it('returns ai/<number>-<slug> for a simple title', () => {
    expect(buildBranchName(123, 'Fix: the bug!')).toBe('ai/123-fix-the-bug')
  })

  it('handles leading/trailing spaces and converts to lowercase', () => {
    expect(buildBranchName(42, '  Leading spaces and CAPS  ')).toBe(
      'ai/42-leading-spaces-and-caps'
    )
  })

  it('strips percent signs and consecutive hyphens', () => {
    expect(buildBranchName(1, 'feat: add 100% test coverage!')).toBe(
      'ai/1-feat-add-100-test-coverage'
    )
  })
})

describe('createTempDir', () => {
  it('returns a path inside os.tmpdir()', () => {
    const dir = createTempDir()
    expect(dir).toContain(tmpdir())
  })
})

describe('cleanupTempDir', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes the directory and its contents when it exists', () => {
    ;(fs.existsSync as Mock).mockReturnValue(true)
    cleanupTempDir('/tmp/some-dir')
    expect(fs.rmSync).toHaveBeenCalledWith('/tmp/some-dir', { recursive: true, force: true })
  })

  it('does not throw if directory does not exist', () => {
    ;(fs.existsSync as Mock).mockReturnValue(false)
    expect(() => cleanupTempDir('/tmp/nonexistent')).not.toThrow()
    expect(fs.rmSync).not.toHaveBeenCalled()
  })
})

describe('GitOperations', () => {
  let git: GitOperations
  let spawnMock: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    git = new GitOperations()
    spawnMock = cp.spawn as unknown as Mock
  })

  describe('clone', () => {
    it('spawns git clone --depth 1 <url> <targetDir>', async () => {
      spawnMock.mockReturnValue(makeFakeChild({ exitCode: 0 }))

      await git.clone('https://github.com/acme/api.git', '/tmp/clone-dir')

      expect(spawnMock).toHaveBeenCalledWith(
        'git',
        ['clone', '--depth', '1', 'https://github.com/acme/api.git', '/tmp/clone-dir'],
        expect.any(Object)
      )
    })
  })

  describe('createBranch', () => {
    it('spawns git checkout -b <branchName> with cwd=dir', async () => {
      spawnMock.mockReturnValue(makeFakeChild({ exitCode: 0 }))

      await git.createBranch('/tmp/repo', 'ai/42-fix-bug')

      expect(spawnMock).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'ai/42-fix-bug'],
        expect.objectContaining({ cwd: '/tmp/repo' })
      )
    })
  })

  describe('commitAll', () => {
    it('spawns git add -A then git commit -m <message> with cwd=dir', async () => {
      spawnMock.mockReturnValue(makeFakeChild({ exitCode: 0 }))

      await git.commitAll('/tmp/repo', 'fix: resolve the bug')

      expect(spawnMock).toHaveBeenCalledTimes(2)
      expect(spawnMock).toHaveBeenNthCalledWith(
        1,
        'git',
        ['add', '-A'],
        expect.objectContaining({ cwd: '/tmp/repo' })
      )
      expect(spawnMock).toHaveBeenNthCalledWith(
        2,
        'git',
        ['commit', '-m', 'fix: resolve the bug'],
        expect.objectContaining({ cwd: '/tmp/repo' })
      )
    })

    it('resolves successfully when commit exits with code 1 and output contains "nothing to commit"', async () => {
      spawnMock
        .mockReturnValueOnce(makeFakeChild({ exitCode: 0 })) // git add -A succeeds
        .mockReturnValueOnce(
          makeFakeChild({ exitCode: 1, stdout: 'nothing to commit, working tree clean' })
        ) // git commit exits 1 with stdout message (real git behavior)

      await expect(git.commitAll('/tmp/repo', 'empty commit')).resolves.toBeUndefined()
    })
  })

  describe('push', () => {
    it('spawns git push --set-upstream origin <branchName> with cwd=dir', async () => {
      spawnMock.mockReturnValue(makeFakeChild({ exitCode: 0 }))

      await git.push('/tmp/repo', 'ai/42-fix-bug')

      expect(spawnMock).toHaveBeenCalledWith(
        'git',
        ['push', '--set-upstream', 'origin', 'ai/42-fix-bug'],
        expect.objectContaining({ cwd: '/tmp/repo' })
      )
    })

    it('uses --set-upstream flag (first push creates tracking branch)', async () => {
      spawnMock.mockReturnValue(makeFakeChild({ exitCode: 0 }))

      await git.push('/tmp/repo', 'feature/new-feature')

      const args = spawnMock.mock.calls[0] as [string, string[], object]
      expect(args[1]).toContain('--set-upstream')
    })
  })

  describe('getChangedFiles', () => {
    it('spawns git diff --name-only HEAD~1 and returns string[]', async () => {
      spawnMock.mockReturnValue(
        makeFakeChild({ stdout: 'src/index.ts\nsrc/utils.ts\n', exitCode: 0 })
      )

      const files = await git.getChangedFiles('/tmp/repo')

      expect(spawnMock).toHaveBeenCalledWith(
        'git',
        ['diff', '--name-only', 'HEAD~1'],
        expect.objectContaining({ cwd: '/tmp/repo' })
      )
      expect(files).toEqual(['src/index.ts', 'src/utils.ts'])
    })

    it('returns empty array when there are no previous commits (git exits non-zero)', async () => {
      spawnMock.mockReturnValue(
        makeFakeChild({ exitCode: 128, stderr: 'unknown revision HEAD~1' })
      )

      const files = await git.getChangedFiles('/tmp/repo')

      expect(files).toEqual([])
    })
  })
})
