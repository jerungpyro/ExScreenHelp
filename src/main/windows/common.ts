import { join } from 'node:path'
import { app, ipcMain, type BrowserWindow, type IpcMainEvent, type WebContents } from 'electron'

export type RendererPage = 'bubble' | 'stage' | 'overlay'

/** Loads one of the three renderer pages: from the Vite dev server in development, from disk when built. */
export function loadRenderer(win: BrowserWindow, page: RendererPage): Promise<void> {
  // Our windows only ever show our own pages. Links in answers are opened in the browser instead.
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devServerUrl) {
    return win.loadURL(`${devServerUrl}/${page}.html`)
  }
  return win.loadFile(join(__dirname, `../renderer/${page}.html`))
}

/** Settings shared by every window: isolated renderer, no Node access, our preload script. */
export function secureWebPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    // Our windows are often "in the background" while still on screen; keep animations running.
    backgroundThrottling: false
  }
}

/**
 * Waits for a renderer to send `channel`. Resolves with the message's arguments,
 * or null if it doesn't arrive within `timeoutMs` (pass null to wait indefinitely)
 * or the renderer goes away first.
 */
export function waitForMessage(channel: string, from: WebContents, timeoutMs: number | null): Promise<unknown[] | null> {
  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | undefined

    function finish(result: unknown[] | null): void {
      clearTimeout(timer)
      ipcMain.removeListener(channel, onMessage)
      from.removeListener('destroyed', onDestroyed)
      resolve(result)
    }
    function onMessage(event: IpcMainEvent, ...args: unknown[]): void {
      if (event.sender === from) {
        finish(args)
      }
    }
    function onDestroyed(): void {
      finish(null)
    }

    ipcMain.on(channel, onMessage)
    from.once('destroyed', onDestroyed)
    if (timeoutMs !== null) {
      timer = setTimeout(() => finish(null), timeoutMs)
    }
  })
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
