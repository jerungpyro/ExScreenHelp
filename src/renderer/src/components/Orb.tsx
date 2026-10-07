import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import './orb.css'

// Animation lengths, in ms. Must match orb.css.
const BREATHE_MS = 4200
const SPIN_MS = 11000

export interface OrbHandle {
  /**
   * The orb's "origin": the wall-clock time at which its animations were at their starting pose.
   * Passing this to another Orb makes it continue from exactly the same pose.
   */
  getOrigin(): number
}

interface OrbProps {
  /** Animations only run while true. When false the orb freezes in its current pose (and costs nothing). */
  animated: boolean
  /** Swirls faster and sends out ripples while an answer is being prepared. */
  thinking?: boolean
  /** Continue from another orb's pose (see OrbHandle.getOrigin). */
  origin?: number
}

/** Negative delays that start each animation at the pose it would have if it had run since `origin`. */
function delaysFor(origin: number): CSSProperties {
  const elapsed = Date.now() - origin
  return {
    '--orb-breathe-delay': `${-(elapsed % BREATHE_MS)}ms`,
    '--orb-spin-delay': `${-(elapsed % SPIN_MS)}ms`
  } as CSSProperties
}

/**
 * The assistant's "living orb". Always 56px; scale it with a transform on a parent.
 *
 * The bubble window and the stage window each draw their own orb. When one hands over to the
 * other, it passes its origin along, so the new orb starts in the identical pose and the swap
 * is invisible. Pausing and resuming keep the pose continuous by moving the origin forward.
 */
export const Orb = forwardRef<OrbHandle, OrbProps>(function Orb({ animated, thinking = false, origin }, ref) {
  const originRef = useRef(origin ?? Date.now())
  const pausedAtRef = useRef<number | null>(null)
  const [delays, setDelays] = useState(() => delaysFor(originRef.current))
  // Changing this remounts the animated layers, which restarts their CSS animations with new delays.
  const [restartCount, setRestartCount] = useState(0)

  // A new origin handed over from the other window: restart the animations at that pose.
  useLayoutEffect(() => {
    if (origin === undefined || origin === originRef.current) {
      return
    }
    originRef.current = origin
    pausedAtRef.current = animated ? null : Date.now()
    setDelays(delaysFor(origin))
    setRestartCount((count) => count + 1)
    // Only react to a new origin; `animated` is read as it is at that moment.
  }, [origin])

  // Pausing freezes the pose. Resuming carries on from it, so the origin moves by the time spent paused.
  useLayoutEffect(() => {
    if (!animated && pausedAtRef.current === null) {
      pausedAtRef.current = Date.now()
    }
    if (animated && pausedAtRef.current !== null) {
      originRef.current += Date.now() - pausedAtRef.current
      pausedAtRef.current = null
    }
  }, [animated])

  useImperativeHandle(
    ref,
    () => ({
      getOrigin() {
        const pausedAt = pausedAtRef.current
        if (pausedAt === null) {
          return originRef.current
        }
        // Paused: the pose is frozen, which is the same as having started later by the paused time.
        return originRef.current + (Date.now() - pausedAt)
      }
    }),
    []
  )

  const classNames = ['orb']
  if (!animated) classNames.push('orb--paused')
  if (thinking) classNames.push('orb--thinking')

  return (
    <div className={classNames.join(' ')} style={delays} aria-hidden="true">
      <span className="orb__ripple" />
      <span className="orb__ripple orb__ripple--second" />
      <span key={restartCount} className="orb__body">
        <span className="orb__swirl" />
        <span className="orb__swirl orb__swirl--fast" />
        <span className="orb__depth" />
        <span className="orb__sheen" />
      </span>
    </div>
  )
})
