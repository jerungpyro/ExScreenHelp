import { nativeImage } from 'electron'
import { MAX_PASTED_BYTES } from '../../shared/constants'

/**
 * Every request resends every screenshot in the conversation, so a large pasted photo would weigh on
 * the rest of the chat. 2000px leaves a full HD screenshot as it is, and stays within what every
 * provider accepts even when a conversation holds many images.
 */
const MAX_PASTED_EDGE = 2000

/**
 * Turns a pasted image (PNG or JPEG) into a PNG to save with the conversation, scaled down if it is
 * very large. The bytes come from the renderer, so they are decoded and re-encoded rather than
 * saved as they are. Returns null if they aren't a usable image.
 */
export function pngFromPastedImage(bytes: Uint8Array): Buffer | null {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PASTED_BYTES) {
    return null
  }
  let image = nativeImage.createFromBuffer(Buffer.from(bytes))
  if (image.isEmpty()) {
    return null
  }

  // Given one side, resize keeps the image's shape.
  const { width, height } = image.getSize()
  if (width >= height && width > MAX_PASTED_EDGE) {
    image = image.resize({ width: MAX_PASTED_EDGE, quality: 'best' })
  } else if (height > width && height > MAX_PASTED_EDGE) {
    image = image.resize({ height: MAX_PASTED_EDGE, quality: 'best' })
  }
  return image.toPNG()
}
