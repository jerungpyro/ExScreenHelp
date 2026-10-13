import { useCallback, useEffect, useRef } from 'react'

const api = window.api.stage

/**
 * Put this attribute on anything that takes clicks: the orb, the menu, the panel and its edges.
 * Everywhere else in the window, clicks pass through to the apps below.
 */
export const CLICKABLE = { 'data-clickable': '' }

function isClickable(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-clickable]') !== null
}

/**
 * While the stage is open its window covers the work area, so it should only take clicks while the
 * pointer is over the orb, menu or panel. This tells main as the pointer moves on and off them.
 *
 * `recheck` looks again when something moved under a pointer that stood still (the panel opening
 * around it, say). `hold` keeps clicks coming during a drag, even if the pointer runs off the panel.
 */
export function useClickThrough(open: boolean) {
  // What main was last told. Opening the stage makes the window take clicks.
  const reported = useRef(true)
  const held = useRef(false)

  const report = useCallback((interactive: boolean) => {
    if (reported.current !== interactive) {
      reported.current = interactive
      api.setInteractive(interactive)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    reported.current = true
    function onMouseMove(event: MouseEvent): void {
      if (!held.current) {
        report(isClickable(event.target))
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [open, report])

  const recheck = useCallback(async () => {
    const point = await api.cursorPosition()
    if (!held.current) {
      report(isClickable(document.elementFromPoint(point.x, point.y)))
    }
  }, [report])

  const hold = useCallback(
    (holding: boolean) => {
      held.current = holding
      if (holding) {
        report(true)
      }
    },
    [report]
  )

  return { recheck, hold }
}
