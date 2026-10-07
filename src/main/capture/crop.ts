import { MIN_SELECTION } from '../../shared/constants'
import type { Rect, Size } from '../../shared/types'

/**
 * Converts a selection made on the overlay (in DIPs) into a pixel rectangle on the captured image.
 *
 * The scale is taken from the image itself (image width ÷ display width) rather than from Windows'
 * scale factor, so it stays correct even if the capture comes back at a slightly different size.
 * Edges are rounded outwards so no selected pixel is lost. Returns null for selections that are too
 * small or fall entirely outside the image.
 */
export function toPhysicalRect(selection: Rect, displaySize: Size, imageSize: Size): Rect | null {
  if (selection.width < MIN_SELECTION || selection.height < MIN_SELECTION) {
    return null
  }

  const scaleX = imageSize.width / displaySize.width
  const scaleY = imageSize.height / displaySize.height

  const left = Math.max(0, Math.floor(selection.x * scaleX))
  const top = Math.max(0, Math.floor(selection.y * scaleY))
  const right = Math.min(imageSize.width, Math.ceil((selection.x + selection.width) * scaleX))
  const bottom = Math.min(imageSize.height, Math.ceil((selection.y + selection.height) * scaleY))

  const width = right - left
  const height = bottom - top
  if (width <= 0 || height <= 0) {
    return null
  }
  return { x: left, y: top, width, height }
}
