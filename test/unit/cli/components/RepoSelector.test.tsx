import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { RepoSelector, PAGE_SIZE, relativeTime } from '../../../../src/cli/components/RepoSelector.js'

const repos = [
  { owner: 'org', name: 'api' },
  { owner: 'org', name: 'web' },
  { owner: 'other', name: 'lib' },
]

// Generate 20 repos for pagination tests
function makeRepos(count: number): Array<{ owner: string; name: string; pushedAt?: string | undefined }> {
  return Array.from({ length: count }, (_, i) => ({
    owner: 'org',
    name: `repo-${String(i + 1).padStart(2, '0')}`,
  }))
}

describe('RepoSelector', () => {
  it('renders header and first page of repos', () => {
    const { lastFrame } = render(
      <RepoSelector repos={repos} onSelect={() => {}} />
    )
    expect(lastFrame()).toContain('Bello')
    expect(lastFrame()).toContain('org/api')
    expect(lastFrame()).toContain('org/web')
    expect(lastFrame()).toContain('other/lib')
  })

  it('shows cursor on first item', () => {
    const { lastFrame } = render(
      <RepoSelector repos={repos} onSelect={() => {}} />
    )
    expect(lastFrame()).toContain('\u25b6')
  })

  it('filters repos by search term', () => {
    const { lastFrame, stdin } = render(
      <RepoSelector repos={repos} onSelect={() => {}} />
    )
    stdin.write('web')
    expect(lastFrame()).toContain('org/web')
    expect(lastFrame()).not.toContain('other/lib')
  })

  it('calls onSelect with first item on Enter', () => {
    const onSelect = vi.fn()
    const { stdin } = render(
      <RepoSelector repos={repos} onSelect={onSelect} />
    )
    stdin.write('\r')
    expect(onSelect).toHaveBeenCalledWith({ owner: 'org', name: 'api' })
  })

  it('navigates with j/k and selects', () => {
    const onSelect = vi.fn()
    const { stdin } = render(
      <RepoSelector repos={repos} onSelect={onSelect} />
    )
    stdin.write('j') // move to org/web
    stdin.write('\r')
    expect(onSelect).toHaveBeenCalledWith({ owner: 'org', name: 'web' })
  })

  it('navigates with arrow keys', () => {
    const onSelect = vi.fn()
    const { stdin } = render(
      <RepoSelector repos={repos} onSelect={onSelect} />
    )
    stdin.write('\x1B[B') // down arrow
    stdin.write('\r')
    expect(onSelect).toHaveBeenCalledWith({ owner: 'org', name: 'web' })
  })

  it('shows empty message when no repos match', () => {
    const { lastFrame, stdin } = render(
      <RepoSelector repos={repos} onSelect={() => {}} />
    )
    stdin.write('zzzzz')
    expect(lastFrame()).toContain('No bananas')
  })

  it('handles backspace in search', () => {
    const { lastFrame, stdin } = render(
      <RepoSelector repos={repos} onSelect={() => {}} />
    )
    stdin.write('web')
    expect(lastFrame()).not.toContain('other/lib')
    stdin.write('\x7F') // backspace
    stdin.write('\x7F')
    stdin.write('\x7F')
    // Should show all repos again after clearing search
    expect(lastFrame()).toContain('other/lib')
  })

  it('shows page indicator', () => {
    const { lastFrame } = render(
      <RepoSelector repos={repos} onSelect={() => {}} />
    )
    expect(lastFrame()).toContain('Page 1/1 (3 repos)')
  })

  describe('pagination', () => {
    it('PAGE_SIZE is 10', () => {
      expect(PAGE_SIZE).toBe(10)
    })

    it('shows only first 10 repos on page 1 of 20', () => {
      const manyRepos = makeRepos(20)
      const { lastFrame } = render(
        <RepoSelector repos={manyRepos} onSelect={() => {}} />
      )
      expect(lastFrame()).toContain('org/repo-01')
      expect(lastFrame()).toContain('org/repo-10')
      expect(lastFrame()).not.toContain('org/repo-11')
      expect(lastFrame()).toContain('Page 1/2 (20 repos)')
    })

    it('> navigates to next page', () => {
      const manyRepos = makeRepos(20)
      const { lastFrame, stdin } = render(
        <RepoSelector repos={manyRepos} onSelect={() => {}} />
      )
      stdin.write('>')
      expect(lastFrame()).toContain('org/repo-11')
      expect(lastFrame()).toContain('org/repo-20')
      expect(lastFrame()).not.toContain('org/repo-01')
      expect(lastFrame()).toContain('Page 2/2 (20 repos)')
    })

    it('< navigates to prev page', () => {
      const manyRepos = makeRepos(20)
      const { lastFrame, stdin } = render(
        <RepoSelector repos={manyRepos} onSelect={() => {}} />
      )
      stdin.write('>') // go to page 2
      stdin.write('<') // back to page 1
      expect(lastFrame()).toContain('org/repo-01')
      expect(lastFrame()).toContain('Page 1/2 (20 repos)')
    })

    it('search resets page to 0', () => {
      const manyRepos = makeRepos(20)
      const { lastFrame, stdin } = render(
        <RepoSelector repos={manyRepos} onSelect={() => {}} />
      )
      stdin.write('>') // go to page 2
      expect(lastFrame()).toContain('Page 2/2')
      stdin.write('01') // search for "01"
      expect(lastFrame()).toContain('Page 1/1')
      expect(lastFrame()).toContain('org/repo-01')
    })

    it('j past last item on page wraps to next page', () => {
      const manyRepos = makeRepos(20)
      const onSelect = vi.fn()
      const { stdin } = render(
        <RepoSelector repos={manyRepos} onSelect={onSelect} />
      )
      // Move cursor to last item on page (index 9)
      for (let i = 0; i < 10; i++) {
        stdin.write('j')
      }
      // Should now be on page 2, first item (repo-11)
      stdin.write('\r')
      expect(onSelect).toHaveBeenCalledWith({ owner: 'org', name: 'repo-11' })
    })

    it('k before first item on page wraps to prev page', () => {
      const manyRepos = makeRepos(20)
      const { lastFrame, stdin } = render(
        <RepoSelector repos={manyRepos} onSelect={() => {}} />
      )
      stdin.write('>') // go to page 2
      expect(lastFrame()).toContain('Page 2/2')
      stdin.write('k') // go up from first item — should wrap to prev page
      expect(lastFrame()).toContain('Page 1/2')
    })

    it('> does not go past last page', () => {
      const manyRepos = makeRepos(20)
      const { lastFrame, stdin } = render(
        <RepoSelector repos={manyRepos} onSelect={() => {}} />
      )
      stdin.write('>')
      stdin.write('>')
      stdin.write('>')
      expect(lastFrame()).toContain('Page 2/2')
    })

    it('< does not go before first page', () => {
      const { lastFrame, stdin } = render(
        <RepoSelector repos={repos} onSelect={() => {}} />
      )
      stdin.write('<')
      expect(lastFrame()).toContain('Page 1/1')
    })
  })

  describe('help overlay', () => {
    it('? toggles help overlay', () => {
      const { lastFrame, stdin } = render(
        <RepoSelector repos={repos} onSelect={() => {}} />
      )
      expect(lastFrame()).toContain('Bello')
      stdin.write('?')
      expect(lastFrame()).toContain('Minion Help')
      expect(lastFrame()).not.toContain('Bello')
      stdin.write('?')
      expect(lastFrame()).toContain('Bello')
    })
  })

  describe('relative push date', () => {
    it('shows relative time next to repo', () => {
      const reposWithDate = [
        { owner: 'org', name: 'api', pushedAt: new Date(Date.now() - 3 * 3600_000).toISOString() },
      ]
      const { lastFrame } = render(
        <RepoSelector repos={reposWithDate} onSelect={() => {}} />
      )
      expect(lastFrame()).toContain('3h ago')
    })
  })

  describe('relativeTime', () => {
    it('returns "just now" for recent timestamps', () => {
      expect(relativeTime(new Date(Date.now() - 10_000).toISOString())).toBe('just now')
    })

    it('returns minutes ago', () => {
      expect(relativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5m ago')
    })

    it('returns hours ago', () => {
      expect(relativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3h ago')
    })

    it('returns days ago', () => {
      expect(relativeTime(new Date(Date.now() - 2 * 86_400_000).toISOString())).toBe('2d ago')
    })

    it('returns months ago', () => {
      expect(relativeTime(new Date(Date.now() - 60 * 86_400_000).toISOString())).toBe('2mo ago')
    })

    it('returns empty string for empty input', () => {
      expect(relativeTime('')).toBe('')
    })
  })
})
