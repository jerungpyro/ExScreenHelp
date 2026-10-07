import { BUBBLE_SIZE, EDGE_MARGIN, WINDOW_MARGIN } from '../../shared/constants'
import type { BubbleAnchor, Point, Rect } from '../../shared/types'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function clampBubbleY(y: number, workArea: Rect): number {
  const top = workArea.y + EDGE_MARGIN
  const bottom = workArea.y + workArea.height - EDGE_MARGIN - BUBBLE_SIZE
  return clamp(y, top, bottom)
}

/** The bubble's rectangle on screen for a given anchor. */
export function bubbleRect(anchor: BubbleAnchor, workArea: Rect): Rect {
  let x: number
  if (anchor.side === 'left') {
    x = workArea.x + EDGE_MARGIN
  } else {
    x = workArea.x + workArea.width - EDGE_MARGIN - BUBBLE_SIZE
  }
  return { x, y: anchor.y, width: BUBBLE_SIZE, height: BUBBLE_SIZE }
}

/** The bubble window's bounds: the bubble plus a transparent margin for its glow. */
export function bubbleWindowBounds(anchor: BubbleAnchor, workArea: Rect): Rect {
  const bubble = bubbleRect(anchor, workArea)
  return {
    x: bubble.x - WINDOW_MARGIN,
    y: bubble.y - WINDOW_MARGIN,
    width: bubble.width + WINDOW_MARGIN * 2,
    height: bubble.height + WINDOW_MARGIN * 2
  }
}

/** Where the bubble should settle after being dropped with its top-left corner at `dropTopLeft`. */
export function snapBubble(dropTopLeft: Point, workArea: Rect): BubbleAnchor {
  const bubbleCentreX = dropTopLeft.x + BUBBLE_SIZE / 2
  const screenMiddleX = workArea.x + workArea.width / 2
  const side = bubbleCentreX < screenMiddleX ? 'left' : 'right'
  return { side, y: clampBubbleY(dropTopLeft.y, workArea) }
}

/** Makes sure a saved anchor is still fully on screen (e.g. after a resolution change). */
export function clampAnchor(anchor: BubbleAnchor, workArea: Rect): BubbleAnchor {
  return { side: anchor.side, y: clampBubbleY(anchor.y, workArea) }
}
