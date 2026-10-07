import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHistoryStore, isValidCaptureName, isValidId } from './history'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'exscreen-history-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function storeAt(time: string, suffix = 'ab12') {
  return createHistoryStore(root, { now: () => new Date(time), randomSuffix: () => suffix })
}

describe('history store', () => {
  it('creates a folder with the capture and a conversation file', () => {
    const store = storeAt('2026-09-28T14:03:22')
    const conversation = store.create(PNG)

    expect(conversation.id).toBe('20260928-140322-ab12')
    expect(conversation.title).toBe('New capture')
    expect(conversation.messages).toEqual([
      { role: 'user', text: '', image: 'capture.png', createdAt: conversation.createdAt }
    ])
    expect(readFileSync(join(root, conversation.id, 'capture.png'))).toEqual(PNG)
    expect(existsSync(join(root, conversation.id, 'conversation.json'))).toBe(true)
  })

  it('loads what it saved', () => {
    const store = storeAt('2026-09-28T14:03:22')
    const conversation = store.create(PNG)
    conversation.messages.push({ role: 'assistant', text: 'Hi', status: 'complete', createdAt: 'later' })
    store.save(conversation)

    expect(store.load(conversation.id)).toEqual(conversation)
  })

  it('lists the most recently updated conversation first', () => {
    const older = storeAt('2026-09-28T10:00:00', 'aaaa').create(PNG)
    const newer = storeAt('2026-09-28T11:00:00', 'bbbb').create(PNG)
    const store = storeAt('2026-09-28T12:00:00')

    expect(store.list().map((c) => c.id)).toEqual([newer.id, older.id])

    // A follow-up on the older one moves it to the top.
    older.updatedAt = new Date('2026-09-28T12:30:00').toISOString()
    store.save(older)
    expect(store.list().map((c) => c.id)).toEqual([older.id, newer.id])
  })

  it('skips folders with a missing or damaged conversation file', () => {
    const store = storeAt('2026-09-28T14:03:22')
    const good = store.create(PNG)
    mkdirSync(join(root, '20260101-000000-dead'))
    mkdirSync(join(root, '20260101-000000-bad1'))
    writeFileSync(join(root, '20260101-000000-bad1', 'conversation.json'), '{ not json')

    expect(store.list().map((c) => c.id)).toEqual([good.id])
  })

  it('removes a conversation folder', () => {
    const store = storeAt('2026-09-28T14:03:22')
    const conversation = store.create(PNG)
    store.remove(conversation.id)

    expect(existsSync(join(root, conversation.id))).toBe(false)
    expect(store.load(conversation.id)).toBeNull()
  })

  it('refuses ids that could escape the history folder', () => {
    const store = storeAt('2026-09-28T14:03:22')
    expect(store.load('../settings')).toBeNull()
    expect(() => store.remove('..\\..')).not.toThrow()
    expect(() => store.capturePath('../x')).toThrow()
  })

  it('picks a new suffix if the id is already taken', () => {
    const suffixes = ['same', 'same', 'next']
    const store = createHistoryStore(root, {
      now: () => new Date('2026-09-28T14:03:22'),
      randomSuffix: () => suffixes.shift() ?? 'last'
    })
    const first = store.create(PNG)
    const second = store.create(PNG)
    expect(first.id).toBe('20260928-140322-same')
    expect(second.id).toBe('20260928-140322-next')
  })
})

describe('extra captures in a conversation', () => {
  it('saves added screenshots as capture-2.png, capture-3.png, …', () => {
    const store = storeAt('2026-09-28T14:03:22')
    const conversation = store.create(PNG)

    const second = store.addCapture(conversation.id, Buffer.from('second'))
    const third = store.addCapture(conversation.id, Buffer.from('third'))

    expect(second).toBe('capture-2.png')
    expect(third).toBe('capture-3.png')
    expect(readFileSync(join(root, conversation.id, 'capture-3.png'), 'utf8')).toBe('third')
    expect(store.hasCapture(conversation.id, 'capture-2.png')).toBe(true)
  })

  it('does not reuse a number after a screenshot is removed', () => {
    const store = storeAt('2026-09-28T14:03:22')
    const conversation = store.create(PNG)
    store.addCapture(conversation.id, PNG)
    const third = store.addCapture(conversation.id, PNG)
    store.removeCapture(conversation.id, 'capture-2.png')

    expect(store.hasCapture(conversation.id, 'capture-2.png')).toBe(false)
    expect(store.addCapture(conversation.id, PNG)).toBe('capture-4.png')
    expect(third).toBe('capture-3.png')
  })

  it('never removes the first capture', () => {
    const store = storeAt('2026-09-28T14:03:22')
    const conversation = store.create(PNG)
    store.removeCapture(conversation.id, 'capture.png')
    expect(store.hasCapture(conversation.id, 'capture.png')).toBe(true)
  })

  it('resolves paths for any capture, and refuses odd file names', () => {
    const store = storeAt('2026-09-28T14:03:22')
    const conversation = store.create(PNG)
    expect(store.capturePath(conversation.id, 'capture-2.png')).toBe(join(root, conversation.id, 'capture-2.png'))
    expect(() => store.capturePath(conversation.id, '../settings.json')).toThrow()
    expect(store.hasCapture(conversation.id, 'conversation.json')).toBe(false)
  })
})

describe('isValidCaptureName', () => {
  it('accepts only capture file names', () => {
    expect(isValidCaptureName('capture.png')).toBe(true)
    expect(isValidCaptureName('capture-12.png')).toBe(true)
    expect(isValidCaptureName('capture-0.png')).toBe(false)
    expect(isValidCaptureName('conversation.json')).toBe(false)
    expect(isValidCaptureName('../capture.png')).toBe(false)
    expect(isValidCaptureName('capture-2.png.exe')).toBe(false)
  })
})

describe('isValidId', () => {
  it('accepts the generated format only', () => {
    expect(isValidId('20260928-140322-ab12')).toBe(true)
    expect(isValidId('20260928-140322-AB12')).toBe(false)
    expect(isValidId('../20260928-140322-ab12')).toBe(false)
    expect(isValidId('')).toBe(false)
  })
})
