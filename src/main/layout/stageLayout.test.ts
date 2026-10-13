import { describe, expect, it } from 'vitest'
import type { Rect, StageLayout } from '../../shared/types'
import { computeStageLayout, type PanelPlacement } from './stageLayout'

const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
const besideBubble: PanelPlacement = { size: null, position: null }

/** A rectangle from the layout, in screen coordinates. */
function onScreen(layout: StageLayout, rect: Rect): Rect {
  return { ...rect, x: rect.x + layout.windowBounds.x, y: rect.y + layout.windowBounds.y }
}

describe('computeStageLayout: the window', () => {
  it('covers the work area, with room for shadows around it', () => {
    const layout = computeStageLayout({ side: 'right', y: 400 }, workArea, besideBubble)
    expect(layout.windowBounds).toEqual({ x: -16, y: -16, width: 1952, height: 1072 })
  })

  it('gives the area the panel may be moved and resized in, away from the edges', () => {
    const layout = computeStageLayout({ side: 'right', y: 400 }, workArea, besideBubble)
    expect(onScreen(layout, layout.panelArea)).toEqual({ x: 8, y: 8, width: 1904, height: 1024 })
  })
})

describe('computeStageLayout: bubble on the right', () => {
  const layout = computeStageLayout({ side: 'right', y: 400 }, workArea, besideBubble)

  it('right-aligns the panel with the bubble and centres it vertically on the bubble', () => {
    // Bubble is at x 1856..1912, so the panel spans 1492..1912. Centre y = 428, so top = 128.
    expect(onScreen(layout, layout.panel)).toEqual({ x: 1492, y: 128, width: 420, height: 600 })
  })

  it('places the bubble at its anchor', () => {
    expect(onScreen(layout, layout.bubble)).toEqual({ x: 1856, y: 400, width: 56, height: 56 })
  })

  it('puts the menu to the left of the bubble, top-aligned with it', () => {
    // 1856 - 10 - 188 = 1658.
    expect(onScreen(layout, layout.menu)).toEqual({ x: 1658, y: 400, width: 188, height: 132 })
  })

  it('records the side', () => {
    expect(layout.side).toBe('right')
  })
})

describe('computeStageLayout: bubble on the left', () => {
  const layout = computeStageLayout({ side: 'left', y: 400 }, workArea, besideBubble)

  it('left-aligns the panel with the bubble', () => {
    expect(onScreen(layout, layout.panel)).toEqual({ x: 8, y: 128, width: 420, height: 600 })
    expect(onScreen(layout, layout.bubble)).toEqual({ x: 8, y: 400, width: 56, height: 56 })
  })

  it('puts the menu to the right of the bubble', () => {
    // 8 + 56 + 10 = 74.
    expect(onScreen(layout, layout.menu)).toEqual({ x: 74, y: 400, width: 188, height: 132 })
  })
})

describe('computeStageLayout: where the user put the panel', () => {
  it('opens where the user left it, at their size', () => {
    const placement = { size: { width: 600, height: 700 }, position: { x: 300, y: 150 } }
    const layout = computeStageLayout({ side: 'right', y: 400 }, workArea, placement)
    expect(onScreen(layout, layout.panel)).toEqual({ x: 300, y: 150, width: 600, height: 700 })
  })

  it('opens beside the bubble at the size the user chose when it has no position', () => {
    const placement = { size: { width: 600, height: 700 }, position: null }
    const layout = computeStageLayout({ side: 'right', y: 400 }, workArea, placement)
    // Right edge still lines up with the bubble's (1912), centred on it: 428 - 350 = 78.
    expect(onScreen(layout, layout.panel)).toEqual({ x: 1312, y: 78, width: 600, height: 700 })
  })

  it('keeps a remembered place on screen after the screen got smaller', () => {
    const placement = { size: { width: 900, height: 900 }, position: { x: 1500, y: 600 } }
    const smaller = { x: 0, y: 0, width: 1280, height: 680 }
    const layout = computeStageLayout({ side: 'right', y: 300 }, smaller, placement)
    expect(onScreen(layout, layout.panel)).toEqual({ x: 372, y: 8, width: 900, height: 664 })
  })
})

describe('computeStageLayout: clamping', () => {
  it('keeps the panel inside the work area when the bubble is near the top', () => {
    const layout = computeStageLayout({ side: 'right', y: 8 }, workArea, besideBubble)
    expect(onScreen(layout, layout.panel).y).toBe(8)
  })

  it('keeps the panel and menu above the taskbar when the bubble is near the bottom', () => {
    const layout = computeStageLayout({ side: 'right', y: 976 }, workArea, besideBubble)
    const panel = onScreen(layout, layout.panel)
    const menu = onScreen(layout, layout.menu)
    expect(panel.y + panel.height).toBe(1032)
    expect(menu.y + menu.height).toBe(1032)
  })

  it('shrinks the panel on a short screen', () => {
    const shortArea = { x: 0, y: 0, width: 1280, height: 500 }
    const layout = computeStageLayout({ side: 'left', y: 200 }, shortArea, besideBubble)
    expect(layout.panel.height).toBe(484)
  })

  it('keeps everything inside the window in every case', () => {
    for (const y of [8, 300, 700, 976]) {
      const layout = computeStageLayout({ side: 'right', y }, workArea, besideBubble)
      for (const rect of [layout.bubble, layout.menu, layout.panel]) {
        expect(rect.x).toBeGreaterThanOrEqual(0)
        expect(rect.y).toBeGreaterThanOrEqual(0)
        expect(rect.x + rect.width).toBeLessThanOrEqual(layout.windowBounds.width)
        expect(rect.y + rect.height).toBeLessThanOrEqual(layout.windowBounds.height)
      }
    }
  })
})
