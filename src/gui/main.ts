import { spawn } from 'node:child_process'
import type { IssueWorkspace } from '../cli/workspace.js'

type ElectronModule = typeof import('electron') & { default?: unknown }

function installEditMenu(Menu: typeof import('electron').Menu): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    {
      role: 'editMenu',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]))
}

function runElectronChild(executablePath: string): Promise<number> {
  return new Promise((resolve) => {
    const scriptPath = process.argv[1]
    if (scriptPath === undefined) {
      console.error('Error: failed to launch GUI: could not determine current script path')
      resolve(1)
      return
    }

    const child = spawn(executablePath, [scriptPath, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: process.env,
    })
    child.on('error', (err) => {
      console.error('Error: failed to launch GUI:', err.message)
      resolve(1)
    })
    child.on('close', (code) => {
      resolve(code ?? 1)
    })
  })
}

export async function runGui(workspace: IssueWorkspace): Promise<number> {
  try {
    const electron = await import('electron') as ElectronModule
    if (electron.app === undefined) {
      if (typeof electron.default !== 'string') {
        throw new Error('Electron runtime APIs are unavailable')
      }
      return runElectronChild(electron.default)
    }

    const { app, BrowserWindow, Menu } = electron

    await app.whenReady()
    installEditMenu(Menu)
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

    return await new Promise<number>((resolve) => {
      app.on('window-all-closed', () => {
        app.quit()
      })
      app.on('quit', () => {
        resolve(0)
      })
    })
  } catch (err) {
    console.error('Error: failed to launch GUI:', err instanceof Error ? err.message : String(err))
    return 1
  }
}
