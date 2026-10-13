import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFileSafely } from './writeFileSafely'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'exscreen-write-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('writeFileSafely', () => {
  it('replaces an existing file and leaves no temporary file behind', () => {
    const path = join(dir, 'settings.json')
    writeFileSync(path, 'old')

    writeFileSafely(path, '{ "new": true }')

    expect(readFileSync(path, 'utf8')).toBe('{ "new": true }')
    expect(existsSync(`${path}.tmp`)).toBe(false)
  })

  it('writes bytes as they are', () => {
    const path = join(dir, 'apikey.bin')
    writeFileSafely(path, Buffer.from([0, 1, 254, 255]))
    expect(readFileSync(path)).toEqual(Buffer.from([0, 1, 254, 255]))
  })
})
