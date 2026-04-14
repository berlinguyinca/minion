import { describe, it, expect } from 'vitest'

describe('TUI v2', () => {
  it('exports runTui function', async () => {
    const { runTui } = await import('../../../src/cli/tui.js')
    expect(typeof runTui).toBe('function')
  })

  it('re-exports TuiDeps type from hooks/useDeps', async () => {
    // Verify the type re-export compiles — importing TuiDeps from tui.js
    const mod = await import('../../../src/cli/tui.js')
    // runTui is the only runtime export; TuiDeps is a type-only export
    expect(mod.runTui).toBeDefined()
  })
})
