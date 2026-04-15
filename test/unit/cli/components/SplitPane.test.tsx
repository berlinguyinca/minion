import { describe, it, expect } from 'vitest'
import { getSplitPaneWidths } from '../../../../src/cli/components/SplitPane.js'

describe('SplitPane', () => {
  it('makes the left editor pane wider by default', () => {
    expect(getSplitPaneWidths(100)).toEqual({ leftWidth: 60, rightWidth: 40 })
  })

  it('makes the right editor pane wider when editorPane is right', () => {
    expect(getSplitPaneWidths(100, 'right')).toEqual({ leftWidth: 40, rightWidth: 60 })
  })
})
