import { readFileSync } from 'node:fs'
import { NEW_CAPTURE_TITLE } from '../../shared/constants'
import type { ChatChunk, ChatErrorInfo, ChatState, Conversation } from '../../shared/types'
import type { HistoryStore } from '../storage/history'
import { mapError, noKeyError } from './apiErrors'
import { buildMessages } from './buildMessages'
import type { DeepseekClient } from './deepseekClient'
import { makeTitle } from './makeTitle'

export type ChatEvent = { type: 'state'; state: ChatState } | { type: 'chunk'; chunk: ChatChunk }

export interface ChatSessionDeps {
  history: HistoryStore
  /** A client for the current settings, or null when no API key is saved. */
  getClient(): { client: DeepseekClient; model: string } | null
  /** Receives every state change and every streamed chunk (forwarded to the stage window). */
  emit(event: ChatEvent): void
  now?: () => Date
}

export interface ChatSession {
  /** Creates a conversation from a capture and starts the first answer. */
  start(png: Buffer): { conversation: Conversation; finished: Promise<void> }
  /**
   * Adds a follow-up and answers it. `captureName` attaches a screenshot added with
   * history.addCapture; text may then be empty. Resolves when the answer has finished
   * (or immediately if the follow-up was refused).
   */
  followUp(conversationId: string, text: string, captureName?: string): Promise<void>
  retry(conversationId: string): Promise<void>
  stop(conversationId: string): void
  /** Stops any answer and drops the conversation (used when it is deleted), so nothing is saved for it again. */
  forget(conversationId: string): void
  isBusy(conversationId: string): boolean
  getState(conversationId: string): ChatState | null
}

/** An answer that is currently being written. */
interface RunningAnswer {
  controller: AbortController
  text: string
}

export function createChatSession(deps: ChatSessionDeps): ChatSession {
  const now = deps.now ?? (() => new Date())

  // Conversations touched in this session, so every step works on the same object.
  const conversations = new Map<string, Conversation>()
  const running = new Map<string, RunningAnswer>()
  const lastErrors = new Map<string, ChatErrorInfo>()
  const forgotten = new Set<string>()

  function getConversation(id: string): Conversation | null {
    const cached = conversations.get(id)
    if (cached) {
      return cached
    }
    const loaded = deps.history.load(id)
    if (loaded) {
      conversations.set(id, loaded)
    }
    return loaded
  }

  function stateOf(conversation: Conversation): ChatState {
    const answer = running.get(conversation.id)
    return {
      // A copy, so later changes don't alter state that was already sent.
      conversation: structuredClone(conversation),
      busy: answer !== undefined,
      streamingText: answer ? answer.text : null,
      error: lastErrors.get(conversation.id) ?? null
    }
  }

  function emitState(conversation: Conversation): void {
    deps.emit({ type: 'state', state: stateOf(conversation) })
  }

  function imageDataUrl(conversationId: string, captureName: string): string {
    const png = readFileSync(deps.history.capturePath(conversationId, captureName))
    return `data:image/png;base64,${png.toString('base64')}`
  }

  /** Asks DeepSeek to answer the conversation as it stands, streaming and then saving the result. */
  async function answer(conversation: Conversation): Promise<void> {
    const id = conversation.id
    lastErrors.delete(id)

    const setup = deps.getClient()
    if (setup === null) {
      lastErrors.set(id, noKeyError())
      emitState(conversation)
      return
    }

    const current: RunningAnswer = { controller: new AbortController(), text: '' }
    running.set(id, current)
    emitState(conversation)

    let failure: unknown = null
    try {
      const messages = buildMessages(conversation, (captureName) => imageDataUrl(id, captureName))
      for await (const piece of setup.client.streamChat(messages, current.controller.signal)) {
        current.text += piece
        deps.emit({ type: 'chunk', chunk: { conversationId: id, text: current.text } })
      }
    } catch (err) {
      failure = err
    }
    running.delete(id)
    if (forgotten.has(id)) {
      return
    }

    const stoppedByUser = current.controller.signal.aborted
    const finishedNormally = failure === null && !stoppedByUser
    const createdAt = now().toISOString()

    if (finishedNormally) {
      conversation.messages.push({ role: 'assistant', text: current.text, status: 'complete', createdAt })
    } else if (current.text !== '') {
      conversation.messages.push({ role: 'assistant', text: current.text, status: 'incomplete', createdAt })
    }
    if (failure !== null && !stoppedByUser) {
      lastErrors.set(id, mapError(failure, setup.model))
    }

    const isFirstAnswer = conversation.title === NEW_CAPTURE_TITLE
    if (isFirstAnswer && current.text !== '') {
      conversation.title = makeTitle(current.text)
    }
    conversation.updatedAt = createdAt
    deps.history.save(conversation)
    emitState(conversation)
  }

  function start(png: Buffer): { conversation: Conversation; finished: Promise<void> } {
    const conversation = deps.history.create(png)
    conversations.set(conversation.id, conversation)
    const finished = answer(conversation)
    return { conversation: structuredClone(conversation), finished }
  }

  async function followUp(conversationId: string, text: string, captureName?: string): Promise<void> {
    const trimmed = text.trim()
    const conversation = getConversation(conversationId)
    if (conversation === null || running.has(conversationId)) {
      return
    }
    // Only attach screenshots that really were saved in this conversation's folder.
    const hasScreenshot = captureName !== undefined && deps.history.hasCapture(conversationId, captureName)
    if (trimmed === '' && !hasScreenshot) {
      return
    }

    const createdAt = now().toISOString()
    if (hasScreenshot) {
      conversation.messages.push({ role: 'user', text: trimmed, image: captureName, createdAt })
    } else {
      conversation.messages.push({ role: 'user', text: trimmed, createdAt })
    }
    conversation.updatedAt = createdAt
    deps.history.save(conversation)
    await answer(conversation)
  }

  async function retry(conversationId: string): Promise<void> {
    const conversation = getConversation(conversationId)
    if (conversation === null || running.has(conversationId)) {
      return
    }
    // An unfinished answer is replaced by the new one.
    const last = conversation.messages[conversation.messages.length - 1]
    if (last && last.role === 'assistant' && last.status === 'incomplete') {
      conversation.messages.pop()
    }
    // Only retry when the conversation is waiting for an answer.
    const newLast = conversation.messages[conversation.messages.length - 1]
    if (!newLast || newLast.role !== 'user') {
      return
    }
    await answer(conversation)
  }

  function stop(conversationId: string): void {
    running.get(conversationId)?.controller.abort()
  }

  function forget(conversationId: string): void {
    forgotten.add(conversationId)
    stop(conversationId)
    conversations.delete(conversationId)
    lastErrors.delete(conversationId)
  }

  function isBusy(conversationId: string): boolean {
    return running.has(conversationId)
  }

  function getState(conversationId: string): ChatState | null {
    const conversation = getConversation(conversationId)
    if (conversation === null) {
      return null
    }
    return stateOf(conversation)
  }

  return { start, followUp, retry, stop, forget, isBusy, getState }
}
