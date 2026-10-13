import { desktopCapturer, type Display, type NativeImage } from 'electron'

/** Captures a display at its full physical resolution. */
export async function captureDisplay(display: Display): Promise<NativeImage> {
  const physicalSize = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor)
  }
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: physicalSize })
  // With one screen its id may not be reported; with several, a wrong guess would show the wrong screen.
  const source = sources.find((s) => s.display_id === String(display.id)) ?? (sources.length === 1 ? sources[0] : undefined)
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('Screen capture returned no image')
  }
  return source.thumbnail
}
