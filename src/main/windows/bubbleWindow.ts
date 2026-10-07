import { BrowserWindow, screen } from 'electron'
import { Channels } from '../../shared/api'
import { SNAP_DURATION_MS, WINDOW_MARGIN } from '../../shared/constants'
import type { BubbleAnchor, BubbleVisibility, Rect } from '../../shared/types'
import { bubbleWindowBounds, snapBubble } from '../layout/snap'
import { loadRenderer, secureWebPreferences, waitForMessage } from './common'

export interface BubbleWindow {
  window: BrowserWindow
  /** Puts the bubble at an anchor immediately (no animation). */
  placeAt(anchor: BubbleAnchor): void
  startDrag(): void
  dragMove(): void
  /** Ends a drag, animates to the nearest edge and returns where the bubble settled. */
  endDrag(): BubbleAnchor
  /**
   * Shows or hides the orb without hiding the window, and waits until that has been painted.
   * `orbOrigin` (when showing) is the stage orb's animation phase to continue from.
   */
  setOrbVisible(visible: boolean, orbOrigin?: number): Promise<void>
  /** Whether the window takes mouse clicks. When false, clicks pass through to whatever is below. */
  setInteractive(interactive: boolean): void
}

const PAINT_TIMEOUT_MS = 250

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export async function createBubbleWindow(anchor: BubbleAnchor, getWorkArea: () => Rect): Promise<BubbleWindow> {
  const bounds = bubbleWindowBounds(anchor, getWorkArea())
  const win = new BrowserWindow({
    ...bounds,
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
    // Clicking the bubble shouldn't pull keyboard focus away from the app you're working in.
    focusable: false,
    hasShadow: false,
    show: false,
    // A tool window stays out of Alt+Tab.
    type: 'toolbar',
    webPreferences: secureWebPreferences()
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  // Start click-through; the renderer turns clicks on while the pointer is over the orb.
  win.setIgnoreMouseEvents(true, { forward: true })

  await loadRenderer(win, 'bubble')
  win.showInactive()

  let dragOffset = { x: 0, y: 0 }
  let snapTimer: NodeJS.Timeout | undefined

  function moveWindow(x: number, y: number): void {
    // setBounds (not setPosition) so Windows display scaling can't nudge the window size.
    win.setBounds({ x: Math.round(x), y: Math.round(y), width: bounds.width, height: bounds.height })
  }

  function stopSnapAnimation(): void {
    clearInterval(snapTimer)
    snapTimer = undefined
  }

  function animateTo(target: Rect): void {
    stopSnapAnimation()
    const [startX, startY] = win.getPosition()
    const startTime = Date.now()
    snapTimer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startTime) / SNAP_DURATION_MS)
      const eased = easeOutCubic(progress)
      moveWindow(startX + (target.x - startX) * eased, startY + (target.y - startY) * eased)
      if (progress >= 1) {
        stopSnapAnimation()
      }
    }, 8)
  }

  function placeAt(newAnchor: BubbleAnchor): void {
    stopSnapAnimation()
    const target = bubbleWindowBounds(newAnchor, getWorkArea())
    moveWindow(target.x, target.y)
  }

  function startDrag(): void {
    stopSnapAnimation()
    const cursor = screen.getCursorScreenPoint()
    const [windowX, windowY] = win.getPosition()
    dragOffset = { x: cursor.x - windowX, y: cursor.y - windowY }
  }

  function dragMove(): void {
    const cursor = screen.getCursorScreenPoint()
    moveWindow(cursor.x - dragOffset.x, cursor.y - dragOffset.y)
  }

  function endDrag(): BubbleAnchor {
    const workArea = getWorkArea()
    const [windowX, windowY] = win.getPosition()
    const bubbleTopLeft = { x: windowX + WINDOW_MARGIN, y: windowY + WINDOW_MARGIN }
    const snapped = snapBubble(bubbleTopLeft, workArea)
    animateTo(bubbleWindowBounds(snapped, workArea))
    return snapped
  }

  async function setOrbVisible(visible: boolean, orbOrigin?: number): Promise<void> {
    const painted = waitForMessage(Channels.bubblePainted, win.webContents, PAINT_TIMEOUT_MS)
    const change: BubbleVisibility = { visible, orbOrigin: orbOrigin ?? null }
    win.webContents.send(Channels.bubbleVisibility, change)
    await painted
    if (!visible) {
      setInteractive(false)
    }
  }

  function setInteractive(interactive: boolean): void {
    if (interactive) {
      win.setIgnoreMouseEvents(false)
    } else {
      win.setIgnoreMouseEvents(true, { forward: true })
    }
  }

  return { window: win, placeAt, startDrag, dragMove, endDrag, setOrbVisible, setInteractive }
}
