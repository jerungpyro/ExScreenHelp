import { screen, type Display } from 'electron'
import type { BubbleAnchor } from '../shared/types'

/**
 * The display the bubble is anchored to. If that display isn't connected (or the anchor was saved
 * before the bubble could move between displays), the main display. The anchor keeps its display,
 * so the bubble goes back there when it is connected again.
 */
export function displayForAnchor(anchor: BubbleAnchor): Display {
  const saved = screen.getAllDisplays().find((display) => display.id === anchor.displayId)
  return saved ?? screen.getPrimaryDisplay()
}
