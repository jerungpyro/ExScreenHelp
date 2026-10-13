// Rectangles shared by the main process and the stage window: where the panel may go, and how it
// moves and resizes. Main uses this to place the panel, the stage while the user drags it.
import { EDGE_MARGIN, PANEL_MIN_HEIGHT, PANEL_MIN_WIDTH } from './constants'
import type { Rect, Size } from './types'

/** The edge or corner being dragged to resize the panel, as compass points: n, s, e, w, ne, nw, se, sw. */
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** A rectangle from another process, checked to have four finite numbers. */
export function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const r = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every((key) => typeof r[key] === 'number' && Number.isFinite(r[key]))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** The area the panel stays inside: the work area, less the usual gap at its edges. */
export function panelArea(workArea: Rect): Rect {
  return {
    x: workArea.x + EDGE_MARGIN,
    y: workArea.y + EDGE_MARGIN,
    width: workArea.width - EDGE_MARGIN * 2,
    height: workArea.height - EDGE_MARGIN * 2
  }
}

/** The smallest the panel may be, unless the area itself is smaller. */
function minimumSize(area: Rect): Size {
  return { width: Math.min(PANEL_MIN_WIDTH, area.width), height: Math.min(PANEL_MIN_HEIGHT, area.height) }
}

/** The panel made to fit `area`: between the minimum size and the area's size, and moved inside it. */
export function fitPanel(rect: Rect, area: Rect): Rect {
  const min = minimumSize(area)
  const width = Math.round(clamp(rect.width, min.width, area.width))
  const height = Math.round(clamp(rect.height, min.height, area.height))
  const x = Math.round(clamp(rect.x, area.x, area.x + area.width - width))
  const y = Math.round(clamp(rect.y, area.y, area.y + area.height - height))
  return { x, y, width, height }
}

/** The panel moved by (dx, dy) from where it was when the drag started, kept inside `area`. */
export function movePanel(start: Rect, dx: number, dy: number, area: Rect): Rect {
  return fitPanel({ ...start, x: start.x + dx, y: start.y + dy }, area)
}

/**
 * The panel resized by dragging `edge` by (dx, dy) from where it was when the drag started.
 * The edges not being dragged stay where they were, even when the minimum size or the area stops it.
 */
export function resizePanel(start: Rect, edge: ResizeEdge, dx: number, dy: number, area: Rect): Rect {
  const min = minimumSize(area)
  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height

  if (edge.includes('w')) {
    left = clamp(left + Math.round(dx), area.x, right - min.width)
  }
  if (edge.includes('e')) {
    right = clamp(right + Math.round(dx), left + min.width, area.x + area.width)
  }
  if (edge.includes('n')) {
    top = clamp(top + Math.round(dy), area.y, bottom - min.height)
  }
  if (edge.includes('s')) {
    bottom = clamp(bottom + Math.round(dy), top + min.height, area.y + area.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}
