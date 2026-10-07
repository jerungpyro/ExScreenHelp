import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'

/** URL of one of a conversation's screenshots, served by the main process's capture:// protocol. */
export function captureUrl(conversationId: string, captureName = 'capture.png'): string {
  return `capture://${conversationId}/${captureName}`
}

interface CaptureThumbnailProps {
  url: string
  onEnlarge(url: string): void
  onLoad?(): void
}

/** The first selected area, shown small at the top of the conversation. Click to enlarge. */
export function CaptureThumbnail({ url, onEnlarge, onLoad }: CaptureThumbnailProps) {
  return (
    <button type="button" className="capture" onClick={() => onEnlarge(url)} aria-label="Enlarge the selected area">
      <img className="capture__image" src={url} alt="The area you selected" draggable={false} onLoad={onLoad} />
    </button>
  )
}

interface LightboxProps {
  /** The image to show full size, or null when closed. */
  url: string | null
  onClose(): void
}

/** A screenshot at full size, covering the conversation. Click or Esc closes it. */
export function Lightbox({ url, onClose }: LightboxProps) {
  // While open, Esc closes the preview instead of the whole panel.
  useEffect(() => {
    if (url === null) {
      return
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [url, onClose])

  return (
    <AnimatePresence>
      {url !== null && (
        <motion.button
          key="lightbox"
          type="button"
          className="lightbox"
          aria-label="Close preview"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.img
            className="lightbox__image"
            src={url}
            alt="Screenshot, full size"
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
