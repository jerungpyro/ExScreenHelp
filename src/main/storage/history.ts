import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { NEW_CAPTURE_TITLE } from '../../shared/constants'
import type { Conversation, ConversationSummary } from '../../shared/types'

const CAPTURE_FILE = 'capture.png'
const CONVERSATION_FILE = 'conversation.json'

/** Ids look like 20260928-140322-k3f9. Anything else is rejected, so an id can never point outside the history folder. */
const ID_PATTERN = /^\d{8}-\d{6}-[a-z0-9]{4}$/
/** capture.png (the first screenshot) or capture-2.png, capture-3.png, … (screenshots added later). */
const CAPTURE_NAME_PATTERN = /^capture(-[1-9]\d{0,3})?\.png$/

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id)
}

export function isValidCaptureName(name: string): boolean {
  return CAPTURE_NAME_PATTERN.test(name)
}

export interface HistoryStore {
  create(png: Buffer): Conversation
  save(conversation: Conversation): void
  load(id: string): Conversation | null
  list(): ConversationSummary[]
  remove(id: string): void
  /** Path of one of the conversation's screenshots (the first one by default). */
  capturePath(id: string, captureName?: string): string
  /** Saves another screenshot in the conversation's folder and returns its file name. */
  addCapture(id: string, png: Buffer): string
  hasCapture(id: string, captureName: string): boolean
  /** Deletes a screenshot that was added but never sent. The first screenshot is never removed. */
  removeCapture(id: string, captureName: string): void
}

export interface HistoryOptions {
  now?: () => Date
  randomSuffix?: () => string
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Local-time timestamp for folder names, e.g. 20260928-140322. */
function timestampPart(date: Date): string {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `${day}-${time}`
}

function defaultRandomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0')
}

function looksLikeConversation(value: unknown): value is Conversation {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<Conversation>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    typeof candidate.title === 'string' &&
    Array.isArray(candidate.messages)
  )
}

export function createHistoryStore(rootDir: string, options: HistoryOptions = {}): HistoryStore {
  const now = options.now ?? (() => new Date())
  const randomSuffix = options.randomSuffix ?? defaultRandomSuffix

  function folderFor(id: string): string {
    if (!isValidId(id)) {
      throw new Error(`Invalid conversation id: ${id}`)
    }
    return join(rootDir, id)
  }

  function newId(date: Date): string {
    // Two captures in the same second are possible, so retry until the folder name is free.
    for (let attempt = 0; attempt < 20; attempt++) {
      const id = `${timestampPart(date)}-${randomSuffix()}`
      if (isValidId(id) && !existsSync(join(rootDir, id))) {
        return id
      }
    }
    throw new Error('Could not find a free conversation id')
  }

  function save(conversation: Conversation): void {
    const folder = folderFor(conversation.id)
    const finalPath = join(folder, CONVERSATION_FILE)
    const tempPath = `${finalPath}.tmp`
    // Write to a temp file first, then rename, so a crash never leaves a half-written file.
    writeFileSync(tempPath, JSON.stringify(conversation, null, 2), 'utf8')
    renameSync(tempPath, finalPath)
  }

  function create(png: Buffer): Conversation {
    const date = now()
    const id = newId(date)
    const createdAt = date.toISOString()
    const folder = join(rootDir, id)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, CAPTURE_FILE), png)

    const conversation: Conversation = {
      id,
      createdAt,
      updatedAt: createdAt,
      title: NEW_CAPTURE_TITLE,
      messages: [{ role: 'user', text: '', image: CAPTURE_FILE, createdAt }]
    }
    save(conversation)
    return conversation
  }

  function load(id: string): Conversation | null {
    if (!isValidId(id)) {
      return null
    }
    try {
      const raw = readFileSync(join(rootDir, id, CONVERSATION_FILE), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (looksLikeConversation(parsed)) {
        return parsed
      }
      return null
    } catch {
      return null
    }
  }

  function list(): ConversationSummary[] {
    if (!existsSync(rootDir)) {
      return []
    }
    const summaries: ConversationSummary[] = []
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isValidId(entry.name)) {
        continue
      }
      const conversation = load(entry.name)
      if (conversation === null) {
        continue
      }
      summaries.push({
        id: conversation.id,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        title: conversation.title
      })
    }
    // Most recently updated first.
    summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return summaries
  }

  function remove(id: string): void {
    if (!isValidId(id)) {
      return
    }
    rmSync(join(rootDir, id), { recursive: true, force: true })
  }

  function capturePath(id: string, captureName: string = CAPTURE_FILE): string {
    if (!isValidCaptureName(captureName)) {
      throw new Error(`Invalid capture name: ${captureName}`)
    }
    return join(folderFor(id), captureName)
  }

  /** The next free number: one more than the highest capture-N.png in the folder (the first capture counts as 1). */
  function nextCaptureNumber(id: string): number {
    let highest = 1
    for (const name of readdirSync(folderFor(id))) {
      const match = /^capture-(\d+)\.png$/.exec(name)
      if (match) {
        highest = Math.max(highest, Number(match[1]))
      }
    }
    return highest + 1
  }

  function addCapture(id: string, png: Buffer): string {
    const captureName = `capture-${nextCaptureNumber(id)}.png`
    writeFileSync(capturePath(id, captureName), png)
    return captureName
  }

  function hasCapture(id: string, captureName: string): boolean {
    if (!isValidId(id) || !isValidCaptureName(captureName)) {
      return false
    }
    return existsSync(join(rootDir, id, captureName))
  }

  function removeCapture(id: string, captureName: string): void {
    if (!isValidId(id) || !isValidCaptureName(captureName) || captureName === CAPTURE_FILE) {
      return
    }
    rmSync(join(rootDir, id, captureName), { force: true })
  }

  return { create, save, load, list, remove, capturePath, addCapture, hasCapture, removeCapture }
}
