import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('GUI main launcher', () => {
  it('falls back to spawning the Electron binary when runtime APIs are unavailable under Node', () => {
    const source = readFileSync(new URL('../../../src/gui/main.ts', import.meta.url), 'utf8')

    expect(source).toContain('runElectronChild')
    expect(source).toContain("typeof electron.default !== 'string'")
    expect(source).toContain('spawn(executablePath')
    expect(source).toContain("app.on('quit'")
  })

  it('installs a native edit menu so copy and paste shortcuts work in the GUI', () => {
    const source = readFileSync(new URL('../../../src/gui/main.ts', import.meta.url), 'utf8')

    expect(source).toContain('installEditMenu')
    expect(source).toContain('Menu.setApplicationMenu')
    expect(source).toContain("role: 'editMenu'")
    expect(source).toContain("role: 'copy'")
    expect(source).toContain("role: 'paste'")
    expect(source).toContain("role: 'selectAll'")
  })
})
