import { describe, expect, it } from 'vitest'
import { fitPanel, isRect, movePanel, panelArea, resizePanel } from './geometry'

// The usable area of a 1920x1040 work area, less the 8px gap at its edges.
const area = { x: 8, y: 8, width: 1904, height: 1024 }
const panel = { x: 1000, y: 200, width: 420, height: 600 }

describe('isRect', () => {
  it('accepts four finite numbers and nothing else', () => {
    expect(isRect({ x: 1, y: 2, width: 3, height: 4 })).toBe(true)
    expect(isRect({ x: 1, y: 2, width: 3 })).toBe(false)
    expect(isRect({ x: 1, y: 2, width: 3, height: Number.NaN })).toBe(false)
    expect(isRect('1,2,3,4')).toBe(false)
  })
})

describe('panelArea', () => {
  it('keeps the usual gap from the edges of the work area', () => {
    expect(panelArea({ x: 0, y: 0, width: 1920, height: 1040 })).toEqual(area)
  })
})

describe('fitPanel', () => {
  it('leaves a panel that already fits alone', () => {
    expect(fitPanel(panel, area)).toEqual(panel)
  })

  it('moves a panel that hangs off the screen back on', () => {
    expect(fitPanel({ ...panel, x: 1700, y: -50 }, area)).toEqual({ ...panel, x: 1492, y: 8 })
  })

  it('shrinks a panel bigger than the area, and grows one below the minimum size', () => {
    expect(fitPanel({ x: 0, y: 0, width: 5000, height: 5000 }, area)).toEqual(area)
    expect(fitPanel({ ...panel, width: 100, height: 100 }, area)).toEqual({ ...panel, width: 360, height: 420 })
  })

  it('lets the minimum size give way on a very small screen', () => {
    const small = { x: 8, y: 8, width: 300, height: 400 }
    expect(fitPanel(panel, small)).toEqual(small)
  })
})

describe('movePanel', () => {
  it('moves by the distance dragged', () => {
    expect(movePanel(panel, -300, 50, area)).toEqual({ ...panel, x: 700, y: 250 })
  })

  it('stops at the edges of the area', () => {
    expect(movePanel(panel, -5000, 5000, area)).toEqual({ ...panel, x: 8, y: 432 })
  })

  it('rounds to whole pixels so text stays sharp', () => {
    expect(movePanel(panel, 10.6, -0.4, area)).toEqual({ ...panel, x: 1011, y: 200 })
  })
})

describe('resizePanel', () => {
  it('grows from the bottom-right corner, keeping the top-left corner still', () => {
    expect(resizePanel(panel, 'se', 80, 100, area)).toEqual({ x: 1000, y: 200, width: 500, height: 700 })
  })

  it('grows from the top-left corner, keeping the bottom-right corner still', () => {
    expect(resizePanel(panel, 'nw', -80, -100, area)).toEqual({ x: 920, y: 100, width: 500, height: 700 })
  })

  it('changes only one side when dragging an edge', () => {
    expect(resizePanel(panel, 'n', 40, -100, area)).toEqual({ x: 1000, y: 100, width: 420, height: 700 })
    expect(resizePanel(panel, 'e', 60, 100, area)).toEqual({ x: 1000, y: 200, width: 480, height: 600 })
  })

  it('stops at the minimum size without moving the opposite edges', () => {
    expect(resizePanel(panel, 'nw', 400, 400, area)).toEqual({ x: 1060, y: 380, width: 360, height: 420 })
    expect(resizePanel(panel, 'se', -400, -400, area)).toEqual({ x: 1000, y: 200, width: 360, height: 420 })
  })

  it('stops at the edges of the area', () => {
    expect(resizePanel(panel, 'ne', 5000, -5000, area)).toEqual({ x: 1000, y: 8, width: 912, height: 792 })
    expect(resizePanel(panel, 'sw', -5000, 5000, area)).toEqual({ x: 8, y: 200, width: 1412, height: 832 })
  })
})
