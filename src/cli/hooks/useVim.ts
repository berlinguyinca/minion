import { createContext, useContext } from 'react'

export type VimMode = 'normal' | 'insert' | 'command'
export type Pane = 'form' | 'table'
export type FormField = 'title' | 'body' | 'comment'
export type InputMode = 'vim' | 'basic'

export interface VimState {
  mode: VimMode
  pane: Pane
  formField: FormField
  commandBuffer: string
  inputMode: InputMode
}

export interface VimActions {
  setMode: (mode: VimMode) => void
  setPane: (pane: Pane) => void
  setFormField: (field: FormField) => void
  setCommandBuffer: (buf: string) => void
  togglePane: () => void
  setInputMode: (mode: InputMode) => void
}

export type VimContextValue = VimState & VimActions

export const VimContext = createContext<VimContextValue | null>(null)

export function useVim(): VimContextValue {
  const ctx = useContext(VimContext)
  if (!ctx) throw new Error('useVim must be used inside <VimProvider>')
  return ctx
}
