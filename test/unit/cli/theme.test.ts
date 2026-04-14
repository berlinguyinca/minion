import { describe, it, expect } from 'vitest'
import { messages, colors } from '../../../src/cli/theme.js'

describe('theme', () => {
  describe('messages', () => {
    it('formats issue created message', () => {
      expect(messages.issueCreated(42, 'org/api')).toContain('#42')
      expect(messages.issueCreated(42, 'org/api')).toContain('org/api')
      expect(messages.issueCreated(42, 'org/api')).toContain('Bananaaaa')
    })

    it('formats issue updated message', () => {
      expect(messages.issueUpdated(42)).toContain('#42')
      expect(messages.issueUpdated(42)).toContain('Tank yu')
    })

    it('formats error message', () => {
      expect(messages.error('rate limited')).toContain('rate limited')
      expect(messages.error('rate limited')).toContain('Bee-do')
    })

    it('formats polish success', () => {
      expect(messages.polishSuccess()).toContain('Para tu')
    })

    it('formats polish no-change', () => {
      expect(messages.polishNoChange()).toContain('already perfect')
    })

    it('has loading text', () => {
      expect(messages.loading()).toBe('Para tu...')
    })

    it('has empty table text', () => {
      expect(messages.emptyTable()).toContain('No bananas')
    })

    it('has quit message', () => {
      expect(messages.quit()).toContain('Poopaye')
    })

    it('formats header with banana emoji', () => {
      expect(messages.header('test')).toContain('\ud83c\udf4c')
      expect(messages.header('test')).toContain('test')
    })
  })

  describe('colors', () => {
    it('exports banana color', () => {
      expect(colors.banana).toBeDefined()
      expect(typeof colors.banana).toBe('string')
    })

    it('exports goggle color', () => {
      expect(colors.goggle).toBeDefined()
    })

    it('exports overalls color', () => {
      expect(colors.overalls).toBeDefined()
    })

    it('exports success color', () => {
      expect(colors.success).toBeDefined()
    })

    it('exports error color', () => {
      expect(colors.error).toBeDefined()
    })
  })
})
