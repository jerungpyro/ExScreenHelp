import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { DRAG_THRESHOLD, IDLE_FADE_DELAY_MS } from '../../../shared/constants'
import { Orb, type OrbHandle } from '../components/Orb'
import './bubble.css'

const api = window.api.bubble

/** Runs `callback` after the current state has actually been drawn on screen. */
function afterPaint(callback: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(callback))
}

interface Press {
  startX: number
  startY: number
  dragging: boolean
}

export function Bubble() {
  const [visible, setVisible] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [idle, setIdle] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [orbOrigin, setOrbOrigin] = useState<number | undefined>(undefined)
  const press = useRef<Press | null>(null)
  const visibleRef = useRef(true)
  const orbRef = useRef<OrbHandle>(null)

  // Main hides the orb while the stage window shows its own copy, then shows it again on close.
  useEffect(() => {
    return api.onVisibility((change) => {
      visibleRef.current = change.visible
      flushSync(() => {
        setVisible(change.visible)
        if (!change.visible) {
          setHovered(false)
        }
        // Continue in exactly the pose the stage's orb had when it handed back.
        if (change.visible && change.orbOrigin !== null) {
          setOrbOrigin(change.orbOrigin)
        }
      })
      afterPaint(() => api.painted())
    })
  }, [])

  // Fade to semi-transparent after a few seconds without the pointer on it.
  useEffect(() => {
    if (hovered || !visible) {
      setIdle(false)
      return
    }
    const timer = setTimeout(() => setIdle(true), IDLE_FADE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [hovered, visible])

  function onPointerEnter(): void {
    if (!visibleRef.current) {
      return
    }
    setHovered(true)
    api.setInteractive(true)
  }

  function onPointerLeave(): void {
    setHovered(false)
    if (press.current === null) {
      api.setInteractive(false)
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !visibleRef.current) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    press.current = { startX: event.screenX, startY: event.screenY, dragging: false }
    setPressed(true)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const current = press.current
    if (current === null) {
      return
    }
    if (!current.dragging) {
      const distance = Math.hypot(event.screenX - current.startX, event.screenY - current.startY)
      if (distance > DRAG_THRESHOLD) {
        current.dragging = true
        setDragging(true)
        api.dragStart()
      }
    }
    if (current.dragging) {
      api.dragMove()
    }
  }

  function finishPress(allowClick: boolean): void {
    const current = press.current
    if (current === null) {
      return
    }
    press.current = null
    setPressed(false)
    setDragging(false)
    if (current.dragging) {
      api.dragEnd()
    } else if (allowClick) {
      api.click(orbRef.current?.getOrigin() ?? Date.now())
    }
  }

  // The orb only animates while "awake" (not faded). At rest it freezes, which keeps idle CPU near zero.
  const awake = visible && !idle

  const classNames = ['bubble']
  if (!visible) classNames.push('bubble--hidden')
  if (idle) classNames.push('bubble--idle')
  if (pressed) classNames.push('bubble--pressed')
  if (dragging) classNames.push('bubble--dragging')

  return (
    <div
      className={classNames.join(' ')}
      role="button"
      aria-label="Open ExScreenHelp"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finishPress(true)}
      onPointerCancel={() => finishPress(false)}
    >
      <div className="bubble__press">
        <Orb ref={orbRef} animated={awake} origin={orbOrigin} />
      </div>
    </div>
  )
}
