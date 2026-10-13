import { BrowserWindow, screen, type Display, type NativeImage } from 'electron'
import { Channels } from '../../shared/api'
import { isRect } from '../../shared/geometry'
import type { Rect } from '../../shared/types'
import { loadRenderer, secureWebPreferences, waitForMessage } from './common'

const READY_TIMEOUT_MS = 1500

export interface DisplayCapture {
  display: Display
  /** The display as it looked when selecting began, at its full resolution. */
  image: NativeImage
}

export interface PickedArea {
  /** The display the user selected on. */
  capture: DisplayCapture
  /** The rectangle in DIPs, relative to that display. */
  selection: Rect
}

function createOverlayWindow(display: Display): BrowserWindow {
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
  return win
}

/** Loads the overlay page and paints the frozen screenshot on it. Resolves once painted (or after a timeout). */
async function paintFrozenScreen(win: BrowserWindow, image: NativeImage): Promise<void> {
  await loadRenderer(win, 'overlay')
  // JPEG is much quicker to encode than PNG, and this copy is only for display.
  // The crop sent to the AI provider is taken from the original, lossless image.
  const ready = waitForMessage(Channels.overlayReady, win.webContents, READY_TIMEOUT_MS)
  win.webContents.send(Channels.overlayImage, `data:image/jpeg;base64,${image.toJPEG(92).toString('base64')}`)
  await ready
}

/**
 * Covers every display with its frozen screenshot and lets the user drag a rectangle on any one of
 * them. Finishing on one screen (with a selection, Esc or a right-click) closes them all. Resolves with
 * the display and the rectangle, or null if cancelled.
 */
export async function selectAreaOnDisplays(captures: DisplayCapture[]): Promise<PickedArea | null> {
  const windows = captures.map((capture) => createOverlayWindow(capture.display))

  try {
    await Promise.all(windows.map((win, index) => paintFrozenScreen(win, captures[index].image)))

    const finished = windows.map(async (win, index) => {
      const result = await waitForMessage(Channels.overlayDone, win.webContents, null)
      return { index, result }
    })
    for (const [index, win] of windows.entries()) {
      win.setBounds(captures[index].display.bounds)
      win.show()
    }
    // Keyboard focus (for Esc) goes to the screen the pointer is on.
    const pointerDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const pointerIndex = captures.findIndex((capture) => capture.display.id === pointerDisplay.id)
    windows[pointerIndex === -1 ? 0 : pointerIndex].focus()

    const first = await Promise.race(finished)
    if (first.result === null || !isRect(first.result[0])) {
      return null
    }
    return { capture: captures[first.index], selection: first.result[0] }
  } finally {
    // Closing the windows also ends the other screens' waits.
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.destroy()
      }
    }
  }
}
