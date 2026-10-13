import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { IDLE_FADE_DELAY_MS } from '../../../shared/constants'
import { Orb, type OrbHandle } from '../components/Orb'
import { usePressOrDrag } from '../components/usePressOrDrag'
import './bubble.css'

const api = window.api.bubble

/** Runs `callback` after the current state has actually been drawn on screen. */
function afterPaint(callback: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(callback))
}

export function Bubble() {
  const [visible, setVisible] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [idle, setIdle] = useState(false)
  const [orbOrigin, setOrbOrigin] = useState<number | undefined>(undefined)
  const visibleRef = useRef(true)
  const orbRef = useRef<OrbHandle>(null)
  // Dragging moves the bubble window (main follows the cursor); a click opens the menu.
  const press = usePressOrDrag({
    canStart: () => visibleRef.current,
    onDragStart: () => api.dragStart(),
    onDragMove: () => api.dragMove(),
    onDragEnd: () => api.dragEnd(),
    onClick: () => api.click(orbRef.current?.getOrigin() ?? Date.now())
  })

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
    if (!press.isPressing()) {
      api.setInteractive(false)
    }
  }

  // The orb only animates while "awake" (not faded). At rest it freezes, which keeps idle CPU near zero.
  const awake = visible && !idle

  const classNames = ['bubble']
  if (!visible) classNames.push('bubble--hidden')
  if (idle) classNames.push('bubble--idle')
  if (press.pressed) classNames.push('bubble--pressed')
  if (press.dragging) classNames.push('bubble--dragging')

  return (
    <div
      className={classNames.join(' ')}
      role="button"
      aria-label="Open ExScreenHelp"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      {...press.handlers}
    >
      <div className="bubble__press">
        <Orb ref={orbRef} animated={awake} origin={orbOrigin} />
      </div>
    </div>
  )
}
