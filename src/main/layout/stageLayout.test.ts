import { describe, expect, it } from 'vitest'
import { computeStageLayout } from './stageLayout'

const workArea = { x: 0, y: 0, width: 1920, height: 1040 }

describe('computeStageLayout — bubble on the right', () => {
  const layout = computeStageLayout({ side: 'right', y: 400 }, workArea)

  it('right-aligns the panel with the bubble and centres it vertically on the bubble', () => {
    // Bubble is at x 1856..1912, so the panel spans 1492..1912. Centre y = 428, so top = 128.
    expect(layout.windowBounds).toEqual({ x: 1476, y: 112, width: 452, height: 632 })
    expect(layout.panel).toEqual({ x: 16, y: 16, width: 420, height: 600 })
  })

  it('gives the bubble position relative to the window', () => {
    expect(layout.bubble).toEqual({ x: 380, y: 288, width: 56, height: 56 })
  })

  it('puts the menu to the left of the bubble, top-aligned with it', () => {
    // Menu x on screen = 1856 - 10 - 188 = 1658 → local 182.
    expect(layout.menu).toEqual({ x: 182, y: 288, width: 188, height: 132 })
  })

  it('records the side', () => {
    expect(layout.side).toBe('right')
  })
})

describe('computeStageLayout — bubble on the left', () => {
  const layout = computeStageLayout({ side: 'left', y: 400 }, workArea)

  it('left-aligns the panel with the bubble', () => {
    expect(layout.windowBounds).toEqual({ x: -8, y: 112, width: 452, height: 632 })
    expect(layout.panel).toEqual({ x: 16, y: 16, width: 420, height: 600 })
    expect(layout.bubble).toEqual({ x: 16, y: 288, width: 56, height: 56 })
  })

  it('puts the menu to the right of the bubble', () => {
    // Menu x on screen = 8 + 56 + 10 = 74 → local 82.
    expect(layout.menu).toEqual({ x: 82, y: 288, width: 188, height: 132 })
  })
})

describe('computeStageLayout — clamping', () => {
  it('keeps the panel inside the work area when the bubble is near the top', () => {
    const layout = computeStageLayout({ side: 'right', y: 8 }, workArea)
    const panelTopOnScreen = layout.windowBounds.y + layout.panel.y
    expect(panelTopOnScreen).toBe(8)
  })

  it('keeps the panel and menu above the taskbar when the bubble is near the bottom', () => {
    const layout = computeStageLayout({ side: 'right', y: 976 }, workArea)
    const panelBottomOnScreen = layout.windowBounds.y + layout.panel.y + layout.panel.height
    const menuBottomOnScreen = layout.windowBounds.y + layout.menu.y + layout.menu.height
    expect(panelBottomOnScreen).toBe(1032)
    expect(menuBottomOnScreen).toBe(1032)
  })

  it('shrinks the panel on a short screen', () => {
    const shortArea = { x: 0, y: 0, width: 1280, height: 500 }
    const layout = computeStageLayout({ side: 'left', y: 200 }, shortArea)
    expect(layout.panel.height).toBe(484)
  })

  it('keeps the bubble inside the window in every case', () => {
    for (const y of [8, 300, 700, 976]) {
      const layout = computeStageLayout({ side: 'right', y }, workArea)
      expect(layout.bubble.x).toBeGreaterThanOrEqual(0)
      expect(layout.bubble.y).toBeGreaterThanOrEqual(0)
      expect(layout.bubble.x + layout.bubble.width).toBeLessThanOrEqual(layout.windowBounds.width)
      expect(layout.bubble.y + layout.bubble.height).toBeLessThanOrEqual(layout.windowBounds.height)
    }
  })
})
