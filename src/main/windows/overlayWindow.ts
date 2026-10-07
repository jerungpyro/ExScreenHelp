import { BrowserWindow, type Display, type NativeImage } from 'electron'
import { Channels } from '../../shared/api'
import type { Rect } from '../../shared/types'
import { loadRenderer, secureWebPreferences, waitForMessage } from './common'

const READY_TIMEOUT_MS = 1500

function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const r = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every((key) => typeof r[key] === 'number' && Number.isFinite(r[key]))
}

/**
 * Covers the display with the frozen screenshot and lets the user drag a rectangle on it.
 * Resolves with the rectangle in DIPs relative to the display, or null if cancelled.
 */
export async function selectAreaOnOverlay(display: Display, frozen: NativeImage): Promise<Rect | null> {
  const win = new BrowserWindow({
    ...display.bounds,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#000000',
    type: 'toolbar',
    webPreferences: secureWebPreferences()
  })
  win.setAlwaysOnTop(true, 'screen-saver')

  try {
    await loadRenderer(win, 'overlay')

    // JPEG is much quicker to encode than PNG, and this copy is only for display.
    // The crop sent to the AI provider is taken from the original, lossless image.
    const ready = waitForMessage(Channels.overlayReady, win.webContents, READY_TIMEOUT_MS)
    win.webContents.send(Channels.overlayImage, `data:image/jpeg;base64,${frozen.toJPEG(92).toString('base64')}`)
    await ready

    const done = waitForMessage(Channels.overlayDone, win.webContents, null)
    win.setBounds(display.bounds)
    win.show()
    win.focus()

    const result = await done
    if (result === null || !isRect(result[0])) {
      return null
    }
    return result[0]
  } finally {
    if (!win.isDestroyed()) {
      win.destroy()
    }
  }
}
