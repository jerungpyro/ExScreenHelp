import { useRef } from 'react'
import type { ResizeEdge } from '../../../shared/geometry'
import type { Rect } from '../../../shared/types'
import { usePressOrDrag } from '../components/usePressOrDrag'
import { CLICKABLE } from './useClickThrough'

const EDGES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

interface ResizeHandlesProps {
  /** The panel's rectangle. */
  rect: Rect
  onResizeStart(edge: ResizeEdge): void
  /** `dx` and `dy` are how far the pointer is from where the drag began. */
  onResize(dx: number, dy: number): void
  onResizeEnd(): void
}

/** Invisible strips along the panel's edges and corners. Drag one to resize the panel. */
export function ResizeHandles({ rect, onResizeStart, onResize, onResizeEnd }: ResizeHandlesProps) {
  const edge = useRef<ResizeEdge>('se')
  const press = usePressOrDrag({
    onDragStart: () => onResizeStart(edge.current),
    onDragMove: onResize,
    onDragEnd: onResizeEnd,
    onClick: () => {}
  })

  return (
    <div className="resize-handles" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
      {EDGES.map((name) => (
        <div
          key={name}
          className={`resize-handle resize-handle--${name}`}
          {...CLICKABLE}
          {...press.handlers}
          onPointerDown={(event) => {
            edge.current = name
            press.handlers.onPointerDown(event)
          }}
        />
      ))}
    </div>
  )
}
