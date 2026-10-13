import { useRef, useState, type PointerEvent } from 'react'
import { DRAG_THRESHOLD } from '../../../shared/constants'

export interface PressOrDragCallbacks {
  /** Whether a press may start now. Without it, any left-button press does. */
  canStart?(): boolean
  /** The press moved far enough to count as a drag. */
  onDragStart(): void
  /** The pointer moved during a drag. `dx` and `dy` are how far it is from where the press began, in screen pixels. */
  onDragMove(dx: number, dy: number): void
  onDragEnd(): void
  /** The press ended without becoming a drag. */
  onClick(): void
}

interface Press {
  startX: number
  startY: number
  dragging: boolean
}

/**
 * A press on an element that becomes a drag once the pointer moves past DRAG_THRESHOLD, or counts as
 * a click if it doesn't. Spread `handlers` on the element. The pointer is captured, so a drag carries
 * on outside the element. Screen coordinates are used, so it works even when the window itself moves.
 */
export function usePressOrDrag(callbacks: PressOrDragCallbacks) {
  const [pressed, setPressed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const press = useRef<Press | null>(null)
  // The latest callbacks, so a press that began during an earlier render still calls current code.
  const latest = useRef(callbacks)
  latest.current = callbacks

  function onPointerDown(event: PointerEvent<HTMLElement>): void {
    const allowed = latest.current.canStart ? latest.current.canStart() : true
    if (event.button !== 0 || !allowed) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    press.current = { startX: event.screenX, startY: event.screenY, dragging: false }
    setPressed(true)
  }

  function onPointerMove(event: PointerEvent<HTMLElement>): void {
    const current = press.current
    if (current === null) {
      return
    }
    const dx = event.screenX - current.startX
    const dy = event.screenY - current.startY
    if (!current.dragging) {
      if (Math.hypot(dx, dy) <= DRAG_THRESHOLD) {
        return
      }
      current.dragging = true
      setDragging(true)
      latest.current.onDragStart()
    }
    latest.current.onDragMove(dx, dy)
  }

  function finish(allowClick: boolean): void {
    const current = press.current
    if (current === null) {
      return
    }
    press.current = null
    setPressed(false)
    setDragging(false)
    if (current.dragging) {
      latest.current.onDragEnd()
    } else if (allowClick) {
      latest.current.onClick()
    }
  }

  return {
    pressed,
    dragging,
    /** True from the pointer going down until the press ends. */
    isPressing: () => press.current !== null,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: () => finish(true),
      onPointerCancel: () => finish(false)
    }
  }
}
