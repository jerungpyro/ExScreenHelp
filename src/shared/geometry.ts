import type { Rect } from './types'

/** A rectangle from another process, checked to have four finite numbers. */
export function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const r = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every((key) => typeof r[key] === 'number' && Number.isFinite(r[key]))
}
