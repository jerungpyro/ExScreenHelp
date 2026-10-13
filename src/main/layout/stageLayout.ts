import { BUBBLE_SIZE, EDGE_MARGIN, MENU_GAP, MENU_HEIGHT, MENU_WIDTH, PANEL_HEIGHT, PANEL_WIDTH, WINDOW_MARGIN } from '../../shared/constants'
import { fitPanel, panelArea } from '../../shared/geometry'
import type { BubbleAnchor, Point, Rect, Size, StageLayout } from '../../shared/types'
import { bubbleRect } from './snap'

/** What the user last chose for the panel. Null parts fall back to the default size, beside the bubble. */
export interface PanelPlacement {
  size: Size | null
  position: Point | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function toLocal(rect: Rect, origin: Rect): Rect {
  return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height }
}

/**
 * Works out where the stage window goes and where the bubble, menu and panel sit inside it.
 * The panel opens where the user last put it, or else from the bubble's edge toward the centre of
 * the screen. The menu sits beside the bubble on the same side.
 */
export function computeStageLayout(anchor: BubbleAnchor, workArea: Rect, placement: PanelPlacement): StageLayout {
  const bubble = bubbleRect(anchor, workArea)
  const area = panelArea(workArea)
  const workAreaTop = workArea.y + EDGE_MARGIN
  const workAreaBottom = workArea.y + workArea.height - EDGE_MARGIN

  const size = placement.size ?? { width: PANEL_WIDTH, height: PANEL_HEIGHT }
  let panel: Rect
  if (placement.position !== null) {
    panel = fitPanel({ x: placement.position.x, y: placement.position.y, ...size }, area)
  } else {
    // Beside the bubble: the same outer edge as the bubble, vertically centred on it.
    let x: number
    if (anchor.side === 'right') {
      x = bubble.x + bubble.width - size.width
    } else {
      x = bubble.x
    }
    const y = bubble.y + BUBBLE_SIZE / 2 - size.height / 2
    panel = fitPanel({ x, y, ...size }, area)
  }

  // Menu: beside the bubble, toward the centre, top-aligned with the bubble.
  let menuX: number
  if (anchor.side === 'right') {
    menuX = bubble.x - MENU_GAP - MENU_WIDTH
  } else {
    menuX = bubble.x + BUBBLE_SIZE + MENU_GAP
  }
  const menuY = clamp(bubble.y, workAreaTop, workAreaBottom - MENU_HEIGHT)
  const menu: Rect = { x: menuX, y: menuY, width: MENU_WIDTH, height: MENU_HEIGHT }

  // While open, the window covers the whole work area (plus room for shadows at its edges), so the
  // panel can be moved and resized inside it without the window moving. Its empty parts let clicks through.
  const windowBounds: Rect = {
    x: workArea.x - WINDOW_MARGIN,
    y: workArea.y - WINDOW_MARGIN,
    width: workArea.width + WINDOW_MARGIN * 2,
    height: workArea.height + WINDOW_MARGIN * 2
  }

  return {
    windowBounds,
    bubble: toLocal(bubble, windowBounds),
    menu: toLocal(menu, windowBounds),
    panel: toLocal(panel, windowBounds),
    panelArea: toLocal(area, windowBounds),
    side: anchor.side
  }
}
