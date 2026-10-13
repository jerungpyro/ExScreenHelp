import { BrowserWindow, screen } from 'electron'
import { Channels } from '../../shared/api'
import type { Point, StageOpenPayload } from '../../shared/types'
import { loadRenderer, secureWebPreferences, waitForMessage } from './common'

export interface StageWindow {
  window: BrowserWindow
  /** Positions the window and has the renderer paint an orb over the bubble. Resolves once painted. */
  prepare(payload: StageOpenPayload): Promise<void>
  /** Makes the window clickable and focused, and starts the entry animation. */
  activate(): void
  /** Removes all content immediately and makes the window click-through again. Resolves once painted. */
  clear(): Promise<void>
  /**
   * While open: whether clicks land on the window, or pass through to the apps below. The window covers
   * the work area, so the renderer reports this as the pointer moves on and off the orb, menu and panel.
   */
  setInteractive(interactive: boolean): void
  /** Where the mouse pointer is, in the window's own coordinates. */
  cursorPosition(): Point
  send(channel: string, payload: unknown): void
}

const PAINT_TIMEOUT_MS = 300

/**
 * The stage window is never hidden. When the menu or panel isn't open it simply draws nothing and
 * lets clicks through. Hidden windows don't paint, and we need it to paint its orb over the bubble
 * *before* it becomes visible to the user, so the handoff from bubble to stage is seamless.
 */
export async function createStageWindow(): Promise<StageWindow> {
  const win = new BrowserWindow({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    show: false,
    type: 'toolbar',
    webPreferences: secureWebPreferences()
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true)

  await loadRenderer(win, 'stage')
  win.showInactive()

  // Between activate() and clear(). A late report from the renderer must never make the closed,
  // empty window catch clicks, since it can cover the whole work area.
  let open = false

  async function prepare(payload: StageOpenPayload): Promise<void> {
    win.setBounds(payload.layout.windowBounds)
    const ready = waitForMessage(Channels.stageReady, win.webContents, PAINT_TIMEOUT_MS)
    win.webContents.send(Channels.stageOpen, payload)
    await ready
  }

  function activate(): void {
    open = true
    // Clickable until the renderer reports what the pointer is over.
    win.setIgnoreMouseEvents(false)
    win.setFocusable(true)
    win.focus()
    win.webContents.send(Channels.stageActivate)
  }

  async function clear(): Promise<void> {
    open = false
    const cleared = waitForMessage(Channels.stageCleared, win.webContents, PAINT_TIMEOUT_MS)
    win.webContents.send(Channels.stageClear)
    await cleared
    // Click-through again even if the renderer never answered (e.g. it was reloading).
    win.setIgnoreMouseEvents(true)
    win.setFocusable(false)
  }

  function setInteractive(interactive: boolean): void {
    if (!open) {
      return
    }
    if (interactive) {
      win.setIgnoreMouseEvents(false)
    } else {
      // forward keeps mouse moves coming, so the renderer notices when the pointer is back over the panel.
      win.setIgnoreMouseEvents(true, { forward: true })
    }
  }

  function cursorPosition(): Point {
    const cursor = screen.getCursorScreenPoint()
    const bounds = win.getBounds()
    return { x: cursor.x - bounds.x, y: cursor.y - bounds.y }
  }

  function send(channel: string, payload: unknown): void {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }

  return { window: win, prepare, activate, clear, setInteractive, cursorPosition, send }
}
