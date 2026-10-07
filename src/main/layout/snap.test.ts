import { describe, expect, it } from 'vitest'
import { bubbleRect, bubbleWindowBounds, clampAnchor, snapBubble } from './snap'

// A 1920x1080 screen with a 40px taskbar at the bottom.
const workArea = { x: 0, y: 0, width: 1920, height: 1040 }

describe('snapBubble', () => {
  it('snaps to the left edge when dropped on the left half', () => {
    expect(snapBubble({ x: 100, y: 300 }, workArea)).toEqual({ side: 'left', y: 300 })
  })

  it('snaps to the right edge when dropped on the right half', () => {
    expect(snapBubble({ x: 1500, y: 300 }, workArea)).toEqual({ side: 'right', y: 300 })
  })

  it('uses the centre of the bubble to decide the side', () => {
    // Top-left at 931 puts the centre at 959: just left of the middle (960).
    expect(snapBubble({ x: 931, y: 300 }, workArea).side).toBe('left')
    // Top-left at 932 puts the centre at 960: the middle counts as right.
    expect(snapBubble({ x: 932, y: 300 }, workArea).side).toBe('right')
  })

  it('keeps the bubble below the top edge', () => {
    expect(snapBubble({ x: 100, y: -50 }, workArea).y).toBe(8)
  })

  it('keeps the bubble above the taskbar', () => {
    // 1040 (work area bottom) - 8 (margin) - 56 (bubble) = 976
    expect(snapBubble({ x: 100, y: 2000 }, workArea).y).toBe(976)
  })
})

describe('bubbleRect', () => {
  it('places a left bubble 8px from the left edge', () => {
    expect(bubbleRect({ side: 'left', y: 300 }, workArea)).toEqual({ x: 8, y: 300, width: 56, height: 56 })
  })

  it('places a right bubble 8px from the right edge', () => {
    expect(bubbleRect({ side: 'right', y: 300 }, workArea)).toEqual({ x: 1856, y: 300, width: 56, height: 56 })
  })

  it('respects a work area that does not start at 0 (taskbar on the left)', () => {
    const shifted = { x: 48, y: 0, width: 1872, height: 1080 }
    expect(bubbleRect({ side: 'left', y: 300 }, shifted).x).toBe(56)
  })
})

describe('bubbleWindowBounds', () => {
  it('adds the 16px window margin around the bubble', () => {
    expect(bubbleWindowBounds({ side: 'left', y: 300 }, workArea)).toEqual({ x: -8, y: 284, width: 88, height: 88 })
  })
})

describe('clampAnchor', () => {
  it('pulls a saved position back on screen after a resolution change', () => {
    expect(clampAnchor({ side: 'right', y: 1400 }, workArea)).toEqual({ side: 'right', y: 976 })
  })

  it('leaves a valid position alone', () => {
    expect(clampAnchor({ side: 'left', y: 500 }, workArea)).toEqual({ side: 'left', y: 500 })
  })
})
