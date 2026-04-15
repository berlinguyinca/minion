import type { IssueWorkspace } from '../cli/workspace.js'

export async function runGui(workspace: IssueWorkspace): Promise<number> {
  try {
    const electron = await import('electron') as typeof import('electron')
    const { app, BrowserWindow } = electron

    await app.whenReady()
    const { createRendererHtml } = await import('./renderer-html.js')
    const { registerGuiIpcHandlers } = await import('./ipc.js')
    registerGuiIpcHandlers(electron.ipcMain, workspace)

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    })
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createRendererHtml())}`)
    return 0
  } catch (err) {
    console.error('Error: failed to launch GUI:', err instanceof Error ? err.message : String(err))
    return 1
  }
}
