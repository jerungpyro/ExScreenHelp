import { describe, expect, it } from 'vitest'
import { toPhysicalRect } from './crop'

const selection = { x: 10, y: 20, width: 100, height: 50 }

describe('toPhysicalRect', () => {
  it('keeps the rect unchanged at 100% scaling', () => {
    const result = toPhysicalRect(selection, { width: 1920, height: 1080 }, { width: 1920, height: 1080 })
    expect(result).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })

  it('scales by 1.5 at 150% scaling', () => {
    // A 1920x1080 screen at 150% is 1280x720 DIPs.
    const result = toPhysicalRect(selection, { width: 1280, height: 720 }, { width: 1920, height: 1080 })
    expect(result).toEqual({ x: 15, y: 30, width: 150, height: 75 })
  })

  it('rounds outwards at 125% so no selected pixel is lost', () => {
    // 1920x1080 at 125% is 1536x864 DIPs. x: 12.5 → 12, right: 137.5 → 138. bottom: 87.5 → 88.
    const result = toPhysicalRect(selection, { width: 1536, height: 864 }, { width: 1920, height: 1080 })
    expect(result).toEqual({ x: 12, y: 25, width: 126, height: 63 })
  })

  it('clamps a selection that runs past the image edges', () => {
    const result = toPhysicalRect(
      { x: -10, y: 1000, width: 100, height: 200 },
      { width: 1920, height: 1080 },
      { width: 1920, height: 1080 }
    )
    expect(result).toEqual({ x: 0, y: 1000, width: 90, height: 80 })
  })

  it('returns null for a selection smaller than 8 DIPs wide', () => {
    const result = toPhysicalRect({ x: 10, y: 10, width: 7, height: 100 }, { width: 1920, height: 1080 }, { width: 1920, height: 1080 })
    expect(result).toBeNull()
  })

  it('returns null for a selection smaller than 8 DIPs tall', () => {
    const result = toPhysicalRect({ x: 10, y: 10, width: 100, height: 7 }, { width: 1920, height: 1080 }, { width: 1920, height: 1080 })
    expect(result).toBeNull()
  })

  it('returns null when the selection is entirely outside the image', () => {
    const result = toPhysicalRect({ x: 5000, y: 10, width: 100, height: 100 }, { width: 1920, height: 1080 }, { width: 1920, height: 1080 })
    expect(result).toBeNull()
  })
})
