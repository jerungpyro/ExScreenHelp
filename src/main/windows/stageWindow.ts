import { BrowserWindow } from 'electron'
import { Channels } from '../../shared/api'
import type { StageOpenPayload } from '../../shared/types'
import { loadRenderer, secureWebPreferences, waitForMessage } from './common'

export interface StageWindow {
  window: BrowserWindow
  /** Positions the window and has the renderer paint an orb over the bubble. Resolves once painted. */
  prepare(payload: StageOpenPayload): Promise<void>
  /** Makes the window clickable and focused, and starts the entry animation. */
  activate(): void
  /** Removes all content immediately and makes the window click-through again. Resolves once painted. */
  clear(): Promise<void>
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

  async function prepare(payload: StageOpenPayload): Promise<void> {
    win.setBounds(payload.layout.windowBounds)
    const ready = waitForMessage(Channels.stageReady, win.webContents, PAINT_TIMEOUT_MS)
    win.webContents.send(Channels.stageOpen, payload)
    await ready
  }

  function activate(): void {
    win.setIgnoreMouseEvents(false)
    win.setFocusable(true)
    win.focus()
    win.webContents.send(Channels.stageActivate)
  }

  async function clear(): Promise<void> {
    const cleared = waitForMessage(Channels.stageCleared, win.webContents, PAINT_TIMEOUT_MS)
    win.webContents.send(Channels.stageClear)
    await cleared
    // Click-through again even if the renderer never answered (e.g. it was reloading).
    win.setIgnoreMouseEvents(true)
    win.setFocusable(false)
  }

  function send(channel: string, payload: unknown): void {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }

  return { window: win, prepare, activate, clear, send }
}
