import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { MIN_SELECTION } from '../../../shared/constants'
import type { Point, Rect } from '../../../shared/types'

const api = window.api.overlay

/** A rectangle from two corners, whichever way the user dragged. */
function rectBetween(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  }
}

export function SelectionOverlay() {
  const [image, setImage] = useState<string | null>(null)
  const [start, setStart] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)
  const finished = useRef(false)

  useEffect(() => api.onImage(setImage), [])

  function finish(selection: Rect | null): void {
    if (finished.current) {
      return
    }
    finished.current = true
    api.done(selection)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        finish(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.button === 2) {
      finish(null)
      return
    }
    if (event.button !== 0) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = { x: event.clientX, y: event.clientY }
    setStart(point)
    setCurrent(point)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (start !== null) {
      setCurrent({ x: event.clientX, y: event.clientY })
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    if (start === null) {
      return
    }
    const selection = rectBetween(start, { x: event.clientX, y: event.clientY })
    setStart(null)
    setCurrent(null)
    // Too small to be deliberate (probably a click): stay in selection mode.
    if (selection.width < MIN_SELECTION || selection.height < MIN_SELECTION) {
      return
    }
    finish(selection)
  }

  const selection = start && current ? rectBetween(start, current) : null

  return (
    <div
      className="overlay"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(event) => event.preventDefault()}
    >
      {image && (
        <img
          className="overlay__image"
          src={image}
          alt=""
          draggable={false}
          onLoad={() => requestAnimationFrame(() => requestAnimationFrame(() => api.ready()))}
        />
      )}

      {selection === null ? (
        <div className="overlay__dim" />
      ) : (
        <div
          className="overlay__selection"
          style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}
        />
      )}

      <p className={selection === null ? 'overlay__hint' : 'overlay__hint overlay__hint--hidden'}>
        Drag around what you want to ask about. Esc to cancel.
      </p>
    </div>
  )
}
