import {
  BUBBLE_SIZE,
  EDGE_MARGIN,
  MENU_GAP,
  MENU_HEIGHT,
  MENU_WIDTH,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  WINDOW_MARGIN
} from '../../shared/constants'
import type { BubbleAnchor, Rect, StageLayout } from '../../shared/types'
import { bubbleRect } from './snap'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function toLocal(rect: Rect, origin: Rect): Rect {
  return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height }
}

/**
 * Works out where the stage window goes and where the bubble, menu and panel sit inside it.
 * The panel opens from the bubble's edge toward the centre of the screen, and the menu sits
 * beside the bubble on the same side, so one window fits both.
 */
export function computeStageLayout(anchor: BubbleAnchor, workArea: Rect): StageLayout {
  const bubble = bubbleRect(anchor, workArea)
  const workAreaTop = workArea.y + EDGE_MARGIN
  const workAreaBottom = workArea.y + workArea.height - EDGE_MARGIN

  // Panel: same outer edge as the bubble, vertically centred on it, kept inside the work area.
  const panelHeight = Math.min(PANEL_HEIGHT, workAreaBottom - workAreaTop)
  let panelX: number
  if (anchor.side === 'right') {
    panelX = bubble.x + bubble.width - PANEL_WIDTH
  } else {
    panelX = bubble.x
  }
  const bubbleCentreY = bubble.y + BUBBLE_SIZE / 2
  const panelY = clamp(bubbleCentreY - panelHeight / 2, workAreaTop, workAreaBottom - panelHeight)
  const panel: Rect = { x: panelX, y: panelY, width: PANEL_WIDTH, height: panelHeight }

  // Menu: beside the bubble, toward the centre, top-aligned with the bubble.
  let menuX: number
  if (anchor.side === 'right') {
    menuX = bubble.x - MENU_GAP - MENU_WIDTH
  } else {
    menuX = bubble.x + BUBBLE_SIZE + MENU_GAP
  }
  const menuY = clamp(bubble.y, workAreaTop, workAreaBottom - MENU_HEIGHT)
  const menu: Rect = { x: menuX, y: menuY, width: MENU_WIDTH, height: MENU_HEIGHT }

  // Window: the smallest box containing all three, plus the shadow margin.
  const left = Math.min(panel.x, menu.x, bubble.x)
  const top = Math.min(panel.y, menu.y, bubble.y)
  const right = Math.max(panel.x + panel.width, menu.x + menu.width, bubble.x + bubble.width)
  const bottom = Math.max(panel.y + panel.height, menu.y + menu.height, bubble.y + bubble.height)
  const windowBounds: Rect = {
    x: left - WINDOW_MARGIN,
    y: top - WINDOW_MARGIN,
    width: right - left + WINDOW_MARGIN * 2,
    height: bottom - top + WINDOW_MARGIN * 2
  }

  return {
    windowBounds,
    bubble: toLocal(bubble, windowBounds),
    menu: toLocal(menu, windowBounds),
    panel: toLocal(panel, windowBounds),
    side: anchor.side
  }
}
